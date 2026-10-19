// MIGRACIÓN A SISTEMAS, sin pérdida y sin huecos ocultos.
//
// Lo que había queda como valor de la organización. Las filas de las tablas
// con columna de sistema (ver `ENS_SYSTEM_KEY_COLUMNS`) que casan con un agente
// —por su id, su nombre, su hostname o un alias guardado— se COPIAN a ese
// agente; las que no casan (o casan con más de uno) se quedan en la
// organización y se avisan. Las filas `*` valen para todas las máquinas: se
// quedan en la organización y se copian también al agente que recibe filas
// propias, porque su valor propio sustituye al de la organización entero.
//
// Las filas copiadas se QUITAN de la organización solo si con eso ninguna
// máquina se queda sin valor: si el parámetro es opcional, o si cada máquina
// del alcance que evalúa el control termina con valor sin contar el de la
// organización (propio, de plantilla o de la unión). Si no, la organización se
// queda como estaba y las máquinas sin filas propias siguen heredando la tabla
// de hoy. Así la migración no crea un «faltan P-xx» nuevo en ninguna máquina;
// `incomplete` lo comprueba sobre el resultado y tiene que salir vacío.
//
// Dos filas son la misma solo si son idénticas (con los espacios alrededor de
// `|` recortados): las mayúsculas cuentan.
//
// Es una función PURA: devuelve el documento migrado y el plan. La pantalla la
// ejecuta al cargar para enseñar el plan (en seco) y la escribe solo con
// «Migrar a sistemas», tras confirmarlo; el servidor guarda el documento
// anterior en el historial. Es idempotente: sobre un documento ya migrado no
// cambia nada.
//
// Las listas de alcance (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01) no se
// tocan: el motor las lee enteras para saber en qué máquinas se mide el
// control. Tampoco las listas que mezclan plataformas: repartirlas es una
// decisión del responsable, que la toma en cada agente o con una plantilla.
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
  // `movida`: la fila sale de la organización. `copiada`: se queda también en
  // la organización, porque quitarla dejaría sin valor a alguna máquina.
  mode: 'movida' | 'copiada';
}

export interface ENSMigrationWarning {
  controlId: string;
  parameterId: string;
  row: string;
  key: string;
  // `sin-agente`: lo que nombra la fila no es ningún agente conocido.
  // `ambigua`: nombra a más de uno (dos máquinas con el mismo nombre corto).
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
  // Parámetros obligatorios con valor antes y sin valor después, por máquina
  // del alcance. Por construcción, vacío; si no, la migración no se ofrece.
  incomplete: ENSMigrationIncomplete[];
  changed: boolean;
  // El alcance no tiene ninguna máquina: no se migra nada. Sin máquinas no se
  // puede comprobar que ninguna se quede sin un obligatorio, y la migración
  // podría sacar filas obligatorias de la organización.
  emptyScope?: boolean;
}

export interface ENSMigrationOptions {
  // Las máquinas del alcance (las que se evalúan). Sin ellas, todas las del
  // inventario. Si no queda ninguna, la migración no hace nada (`emptyScope`).
  scopeAgentIds?: string[];
}

const WILDCARD = '*';

export const describeMigrationWarning = (warning: ENSMigrationWarning): string =>
  warning.reason === 'ambigua'
    ? `${warning.controlId} ${warning.parameterId}: «${warning.row}» nombra a ${warning.key}, que casa con varios agentes (${(warning.candidates || []).join(', ')}); se queda en el valor común`
    : `${warning.controlId} ${warning.parameterId}: «${warning.row}» nombra a ${warning.key}, que no es ningún agente conocido; se queda en el valor común. Si es otro nombre de un agente del alcance, se añade en su página, en «Otros nombres de este agente»`;

export const summarizeMigrationPlan = (plan: Pick<ENSMigrationPlan, 'moves' | 'warnings'>): string => {
  const rows = plan.moves.reduce((total, move) => total + move.rows.length, 0);
  const moved = plan.moves.filter(move => move.mode === 'movida').reduce((total, move) => total + move.rows.length, 0);
  const agents = new Set(plan.moves.map(move => move.agentId)).size;
  const parameters = new Set(plan.moves.map(move => `${move.controlId} ${move.parameterId}`)).size;

  return rows
    ? `Reparto por agentes: ${rows} fila(s) de ${parameters} parámetro(s) a ${agents} agente(s) (${moved} salen del valor común, ${rows - moved} se copian y se quedan también en él); ${plan.warnings.length} fila(s) sin agente se quedan en el valor común.`
    : `Nada que repartir; ${plan.warnings.length} fila(s) sin agente se quedan en el valor común.`;
};

// ¿Evalúa esta máquina este control? Por su plano de medida.
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

  // Quién es quién: los agentes del inventario y los perfiles ya guardados
  // (un agente dado de baja sigue reconociéndose por sus alias).
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

      // Un bloque sembrado antes de declarar columnas no dice qué celda es la
      // máquina: no se reparte.
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

      // Solo cuenta lo que el agente todavía no tiene: una fila ya copiada en
      // una pasada anterior no se vuelve a mover (idempotencia).
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

      // ¿Se pueden quitar de la organización? Se prueba quitándolas y viendo si
      // alguna máquina del alcance que evalúa el control se queda sin valor.
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

  // La comprobación final, sobre el resultado: ningún obligatorio que tenía
  // valor en una máquina del alcance puede quedarse sin él.
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
