// MIGRACIÓN A SISTEMAS, sin pérdida.
//
// Lo que había queda como valor de la organización. Las filas de las tablas
// con columna de sistema (ver `ENS_SYSTEM_KEY_COLUMNS`) que casan con un agente
// —por su id, su nombre, su hostname o un alias guardado— pasan a ese agente;
// las que no casan (o casan con más de uno) se quedan en la organización y se
// avisan. Las filas `*` valen para todas las máquinas: se quedan en la
// organización y se copian también al agente que recibe filas propias, porque
// su valor propio sustituye al de la organización entero y sin ellas perdería
// lo que hoy le aplica.
//
// Es una función PURA: devuelve el documento migrado y el plan. La pantalla la
// ejecuta al cargar para enseñar el plan y los avisos (en seco), y la escribe
// solo con «Migrar a sistemas»; el servidor guarda el documento anterior en el
// historial. Es idempotente: sobre un documento ya migrado no cambia nada.
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
import { normalizeAgentId } from '../../../../common/agent-configuration';
import {
  getParameterColumns,
  toParameterTableRows,
  toTableRowCells,
} from '../services/parameter-value-validator';
import { ENS_SYSTEM_KEY_COLUMNS } from './parameter-classes';
import { rowKey } from './configuration-resolver';
import {
  ENSDetectableAgent,
  agentAliases,
  hostnameFromUname,
} from './system-detection';

export interface ENSMigrationMove {
  agentId: string;
  agentName?: string;
  controlId: string;
  parameterId: string;
  rows: string[];
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

export interface ENSMigrationPlan {
  configuration: ENSConfigurationVersion;
  moves: ENSMigrationMove[];
  warnings: ENSMigrationWarning[];
  changed: boolean;
}

const WILDCARD = '*';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const describeMigrationWarning = (warning: ENSMigrationWarning): string =>
  warning.reason === 'ambigua'
    ? `${warning.controlId} ${warning.parameterId}: «${warning.row}» nombra a ${warning.key}, que casa con varios agentes (${(warning.candidates || []).join(', ')}); se queda en la organización`
    : `${warning.controlId} ${warning.parameterId}: «${warning.row}» nombra a ${warning.key}, que no es ningún agente conocido; se queda en la organización`;

export const summarizeMigrationPlan = (plan: Pick<ENSMigrationPlan, 'moves' | 'warnings'>): string => {
  const rows = plan.moves.reduce((total, move) => total + move.rows.length, 0);
  const agents = new Set(plan.moves.map(move => move.agentId)).size;
  const parameters = new Set(plan.moves.map(move => `${move.controlId} ${move.parameterId}`)).size;

  return rows
    ? `Migración a sistemas: ${rows} fila(s) de ${parameters} parámetro(s) pasan a ${agents} agente(s); ${plan.warnings.length} fila(s) sin agente se quedan en la organización.`
    : `Nada que migrar; ${plan.warnings.length} fila(s) sin agente se quedan en la organización.`;
};

export const planMigrationToSystems = (
  configuration: ENSConfigurationVersion,
  inventory: ENSDetectableAgent[]
): ENSMigrationPlan => {
  const migrated = clone(configuration);
  const agents: Record<string, ENSAgentProfile> = migrated.agents ? migrated.agents : {};
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
      const agent = known.get(agentId);
      const hostname = hostnameFromUname(agent?.os?.uname);
      agents[agentId] = {
        ...(agent?.name ? { name: agent.name } : {}),
        ...(hostname && hostname.toLowerCase() !== String(agent?.name || '').toLowerCase() ? { aliases: [hostname] } : {}),
      };
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

      if (byAgent.size === 0) {
        return;
      }

      Array.from(byAgent.keys())
        .sort()
        .forEach(agentId => {
          const profile = profileFor(agentId);
          const controls = (profile.controls = profile.controls || {});
          const overrides = (controls[control.controlId] = controls[control.controlId] || { parameters: {} });
          const previous = overrides.parameters[parameter.id];
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
          overrides.parameters[parameter.id] = merged;
          moves.push({
            agentId,
            agentName: known.get(agentId)?.name,
            controlId: control.controlId,
            parameterId: parameter.id,
            rows: byAgent.get(agentId)!,
          });
        });

      // Lo que se queda en la organización. Vacía, la clave `value` se quita:
      // un parámetro sin valor es la clave AUSENTE, nunca `null` ni `[]`.
      if (stay.length) {
        parameter.value = stay;
      } else {
        delete parameter.value;
      }
    });
  });

  if (moves.length && Object.keys(agents).length) {
    migrated.agents = agents;
  }

  return {
    configuration: moves.length ? migrated : configuration,
    moves,
    warnings,
    changed: moves.length > 0,
  };
};
