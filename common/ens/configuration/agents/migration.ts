// MIGRATION TO SYSTEMS, lossless.
// Rows of tables with a system column (`ENS_SYSTEM_KEY_COLUMNS`) that match one agent (by id, name, hostname or
// stored alias) are COPIED to it; rows matching none or several stay in the organization and are reported. `*`
// rows stay in the organization and are also copied to any agent that receives own rows (its own value replaces
// the organization's whole).
// Copied rows are REMOVED from the organization only if no machine is left without a value (optional parameter,
// or every in-scope machine ends with its own, template or union value); otherwise the organization stays as it
// was. `incomplete` checks the result and must be empty.
// Two rows are the same only if identical (spaces around `|` trimmed, case counts).
// Pure: returns the migrated document and the plan. The screen runs it on load (dry) and writes it only on
// "Repartir por agentes" after confirmation; the server keeps the previous document in the history. Idempotent.
// Scope lists (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01) and lists mixing platforms are not touched.
import type {
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlParameter,
} from '../types';
import { normalizeAgentId } from '../../../agent-configuration';
import {
  getParameterColumns,
  isEmptyParameterValue,
  toParameterTableRows,
  toTableRowCells,
} from '../services/parameter-value-validator';
import { getENSCatalogControl } from '../../catalog';
import {
  ENS_MANAGER_AGENT_ID,
  getControlMeasurementPlanes,
} from '../../core/scope/measurement-planes';
import { ENS_SYSTEM_KEY_COLUMNS } from './parameter-classes';
import { resolveControlConfigurationWithOrigins, rowKey } from './configuration-resolver';
import { ENSDetectableAgent, agentAliases } from './system-detection';
import { cloneDocument, profileIdentity } from './profile-identity';

export interface ENSMigrationMove {
  agentId: string;
  agentName?: string;
  controlId: string;
  parameterId: string;
  rows: string[];
  // `movida`: the row leaves the organization. `copiada`: it also stays there, since removing it would leave
  // some machine without a value.
  mode: 'movida' | 'copiada';
}

export interface ENSMigrationWarning {
  controlId: string;
  parameterId: string;
  row: string;
  key: string;
  // `sin-agente`: the row names no known agent. `ambigua`: it names more than one.
  reason: 'sin-agente' | 'ambigua';
  candidates?: string[];
}

export interface ENSMigrationIncomplete {
  agentId: string;
  controlId: string;
  parameterId: string;
}

export interface ENSMigrationPlan {
  configuration: ENSConfigurationVersion;
  moves: ENSMigrationMove[];
  warnings: ENSMigrationWarning[];
  // Required parameters with a value before and none after, per in-scope machine. Empty by construction;
  // otherwise the migration is not offered.
  incomplete: ENSMigrationIncomplete[];
  changed: boolean;
  // Empty scope: nothing is migrated, since no machine can be checked.
  emptyScope?: boolean;
}

export interface ENSMigrationOptions {
  // In-scope (evaluated) machines; without scope, the whole inventory. If none, the migration does nothing
  // (`emptyScope`).
  scopeAgentIds?: string[];
}

const WILDCARD = '*';

// With the configuration, the parameter is named by its label, as the screen shows it.
export const describeMigrationWarning = (warning: ENSMigrationWarning, configuration?: Pick<ENSConfigurationVersion, 'controls'>): string => {
  const label = configuration?.controls.find(control => control.controlId === warning.controlId)?.parameters.find(parameter => parameter.id === warning.parameterId)?.label;
  const where = `${warning.controlId} ${label ? `«${label}»` : warning.parameterId}`;
  return warning.reason === 'ambigua'
    ? `${where}: «${warning.row}» nombra a ${warning.key}, que casa con varios agentes (${(warning.candidates || []).join(', ')}); se queda en el valor común`
    : `${where}: «${warning.row}» nombra a ${warning.key}, que no es ningún agente conocido; se queda en el valor común`;
};

export const summarizeMigrationPlan = (plan: Pick<ENSMigrationPlan, 'moves' | 'warnings'>): string => {
  const rows = plan.moves.reduce((total, move) => total + move.rows.length, 0);
  const moved = plan.moves.filter(move => move.mode === 'movida').reduce((total, move) => total + move.rows.length, 0);
  const agents = new Set(plan.moves.map(move => move.agentId)).size;
  const parameters = new Set(plan.moves.map(move => `${move.controlId} ${move.parameterId}`)).size;

  return rows
    ? `Reparto por agentes: ${rows} fila(s) de ${parameters} parámetro(s) a ${agents} agente(s) (${moved} salen del valor común, ${rows - moved} se copian y se quedan también en él); ${plan.warnings.length} fila(s) sin agente se quedan en el valor común.`
    : `Nada que repartir; ${plan.warnings.length} fila(s) sin agente se quedan en el valor común.`;
};

// Whether this machine evaluates this control, by its measurement plane.
const evaluates = (agentId: string, controlId: string): boolean => {
  const planes = getControlMeasurementPlanes(getENSCatalogControl(controlId) || {});
  return planes.includes(normalizeAgentId(agentId) === ENS_MANAGER_AGENT_ID ? 'manager' : 'agent');
};

const resolvedIsEmpty = (
  configuration: ENSConfigurationVersion,
  controlId: string,
  parameterId: string,
  agentId: string
): boolean =>
  isEmptyParameterValue(
    resolveControlConfigurationWithOrigins(configuration, controlId, agentId)
      ?.configuration.parameters.find(parameter => parameter.id === parameterId)?.value
  );

export const planMigrationToSystems = (
  configuration: ENSConfigurationVersion,
  inventory: ENSDetectableAgent[],
  options: ENSMigrationOptions = {}
): ENSMigrationPlan => {
  const scope = (options.scopeAgentIds || inventory.map(agent => agent.id)).map(normalizeAgentId);

  if (!scope.length) {
    return { configuration, moves: [], warnings: [], incomplete: [], changed: false, emptyScope: true };
  }

  const migrated = cloneDocument(configuration);
  const agents: Record<string, ENSAgentProfile> = migrated.agents ? migrated.agents : {};
  migrated.agents = agents;
  const moves: ENSMigrationMove[] = [];
  const warnings: ENSMigrationWarning[] = [];

  // Who is who: inventory agents and stored profiles (a removed agent is still recognised by its aliases).
  const known = new Map<string, ENSDetectableAgent>();
  inventory.forEach(agent => known.set(normalizeAgentId(agent.id), { ...agent, id: normalizeAgentId(agent.id) }));
  Object.entries(agents).forEach(([id, profile]) => {
    if (!known.has(id)) known.set(id, { id, name: profile?.name });
  });

  const byAlias = new Map<string, Set<string>>();
  known.forEach((agent, id) => {
    agentAliases(agent, agents[id]).forEach(alias => {
      if (!byAlias.has(alias)) byAlias.set(alias, new Set());
      byAlias.get(alias)!.add(id);
    });
  });

  const profileFor = (agentId: string): ENSAgentProfile => {
    if (!agents[agentId]) {
      agents[agentId] = profileIdentity(known.get(agentId));
    }
    return agents[agentId];
  };

  migrated.controls.forEach(control => {
    const keyColumns = ENS_SYSTEM_KEY_COLUMNS[control.controlId] || {};

    control.parameters.forEach((parameter: ENSControlParameter) => {
      const keyColumn = keyColumns[parameter.id];

      if (!keyColumn || parameter.type !== 'table' || parameter.value === undefined) {
        return;
      }

      // A block seeded before declaring columns does not say which cell is the machine: not distributed.
      const index = getParameterColumns(parameter).findIndex(column => column.name === keyColumn);

      if (index < 0) {
        return;
      }

      const rows = toParameterTableRows(parameter.value).filter(row => row.trim().length > 0);
      const stay: string[] = [];
      const wildcards: string[] = [];
      const byAgent = new Map<string, string[]>();

      rows.forEach(row => {
        const key = (toTableRowCells(row)[index] || '').trim();
        const alias = key.toLowerCase();

        if (key === WILDCARD) {
          wildcards.push(row);
          stay.push(row);
          return;
        }

        const candidates = alias ? Array.from(byAlias.get(alias) || []) : [];

        if (candidates.length === 1) {
          byAgent.set(candidates[0], [...(byAgent.get(candidates[0]) || []), row]);
          return;
        }

        stay.push(row);

        if (key) {
          warnings.push({
            controlId: control.controlId,
            parameterId: parameter.id,
            row,
            key,
            reason: candidates.length > 1 ? 'ambigua' : 'sin-agente',
            ...(candidates.length > 1 ? { candidates: candidates.sort() } : {}),
          });
        }
      });

      // Only what the agent does not have yet counts: an already copied row is not moved again (idempotence).
      Array.from(byAgent.keys()).forEach(agentId => {
        const already = agents[agentId]?.controls?.[control.controlId]?.parameters?.[parameter.id];
        const have = new Set(already === undefined ? [] : toParameterTableRows(already).map(rowKey));
        const pending = byAgent.get(agentId)!.filter(row => !have.has(rowKey(row)));
        if (pending.length) byAgent.set(agentId, pending);
        else byAgent.delete(agentId);
      });

      if (byAgent.size === 0) {
        return;
      }

      const recipients = Array.from(byAgent.keys()).sort();

      recipients.forEach(agentId => {
        const profile = profileFor(agentId);
        const controls = (profile.controls = profile.controls || {});
        const overrides = (controls[control.controlId] = controls[control.controlId] || { parameters: {} });
        const parameters = (overrides.parameters = overrides.parameters || {});
        const previous = parameters[parameter.id];
        const merged: string[] = previous === undefined ? [] : toParameterTableRows(previous).filter(row => row.trim());
        const seen = new Set(merged.map(rowKey));
        const append = (row: string) => {
          if (!seen.has(rowKey(row))) {
            seen.add(rowKey(row));
            merged.push(row);
          }
        };

        byAgent.get(agentId)!.forEach(append);
        wildcards.forEach(append);
        parameters[parameter.id] = merged;
      });

      // Can they be removed from the organization? Tested by removing them and checking whether an in-scope
      // machine loses a value.
      const original = parameter.value;
      if (stay.length) parameter.value = stay;
      else delete parameter.value;

      const leavesSomeoneEmpty =
        parameter.required &&
        scope
          .filter(agentId => evaluates(agentId, control.controlId))
          .some(agentId => resolvedIsEmpty(migrated, control.controlId, parameter.id, agentId));

      if (leavesSomeoneEmpty) {
        parameter.value = original;
      }

      recipients.forEach(agentId => {
        moves.push({
          agentId,
          agentName: known.get(agentId)?.name,
          controlId: control.controlId,
          parameterId: parameter.id,
          rows: byAgent.get(agentId)!,
          mode: leavesSomeoneEmpty ? 'copiada' : 'movida',
        });
      });
    });
  });

  if (!Object.keys(agents).length) {
    delete migrated.agents;
  }

  // Final check on the result: no required parameter that had a value on an in-scope machine may lose it.
  const incomplete: ENSMigrationIncomplete[] = [];
  if (moves.length) {
    const touched = Array.from(new Set(moves.map(move => `${move.controlId}|${move.parameterId}`)));
    scope.forEach(agentId => {
      touched.forEach(key => {
        const [controlId, parameterId] = key.split('|');
        const required = configuration.controls
          .find(control => control.controlId === controlId)
          ?.parameters.find(parameter => parameter.id === parameterId)?.required;
        if (!required || !evaluates(agentId, controlId)) return;
        if (!resolvedIsEmpty(configuration, controlId, parameterId, agentId) && resolvedIsEmpty(migrated, controlId, parameterId, agentId)) {
          incomplete.push({ agentId, controlId, parameterId });
        }
      });
    });
  }

  return {
    configuration: moves.length ? migrated : configuration,
    moves,
    warnings,
    incomplete,
    changed: moves.length > 0,
  };
};
