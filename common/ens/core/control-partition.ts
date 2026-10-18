// El motor, control a control: lo que usa el servidor para evaluar la ventana
// entera sin tener todos los hechos a la vez.
//
// POR QUÉ ASÍ. Un control se juzga con sus hechos. El servidor lee los de un
// control, lo evalúa con el motor de siempre, se queda con el resultado y
// suelta los hechos antes de leer los del siguiente. El estado del panel se
// arma después con esos resultados, igual que lo arma `getENSComplianceState`
// sobre todos los hechos: mismas filas por máquina, misma consolidación, mismo
// orden del catálogo. La prueba (`tests/control-partition.test.ts` y la
// comprobación sobre los datos del laboratorio) es que los dos caminos dan el
// mismo estado.
//
// LO QUE UN CONTROL LEE DE OTROS CONTROLES (y que el servidor, que lee los
// hechos de un control y de una máquina a la vez, tiene que darle aparte).
// Se buscó en el motor y en las 23 policies todo `context.events` sin filtro
// de control; quedan tres lecturas, y las tres se cubren sin cargar hechos de
// otros controles:
//
//   1. op.mon.3 sabe en qué fila está por el `agent.id` de los hechos que
//      recibe, de CUALQUIER control (ver su policy). Una máquina sin hechos de
//      op.mon.3 pero con hechos de otros dejaría de «existir». Va un hecho de
//      PRESENCIA por máquina, con el instante de su primer hecho en la ventana
//      y un control que no es ninguno del catálogo, así que el resto del motor
//      lo ignora (no resuelve evidencias, no cuenta como hecho del control, no
//      entra en la trazabilidad).
//   2. op.acc.3 da por «mirado» un periodo sin acciones si hay un
//      `collector_run` de la máquina en las últimas 24 h, de CUALQUIER control
//      (`op-acc-3.policy.ts`, `hayLatido`). Van LATIDOS sintéticos con el mismo
//      control ajeno: el último de cada día de la máquina, sacados de una
//      agregación. Para «hay un latido en las 24 h antes del corte» basta el
//      último de cada día (ver `buildENSHeartbeatEvents`).
//   3. op.acc.3 lee también `account_action`, `critical_task_run` y
//      `security_info_access` de cualquier control: esos tipos se leen de la
//      máquina con los hechos del control (`ENS_CROSS_CONTROL_EVENT_TYPES`).
//
// Los hechos que no nombran ningún control los aceptan las evidencias y algunas
// policies como propios de cualquier control: el servidor los lee con los de
// cada máquina.
import { ENSCatalog } from '../catalog';
import type { ENSLevel } from '../configuration/types';
import { buildComplianceState } from './compliance-state';
import type { ENSComplianceState } from './compliance-state/types';
import type { ENSNormalizedEvent } from './data-source/types';
import {
  buildOutOfScopeDeclaredRows,
  getAgentIdentities,
  getENSComplianceResultByControl,
  getENSComplianceResults,
  getENSControlEvaluation,
  isControlEvaluatedOnAgent,
} from './ens-engine';
import { consolidateAgentComplianceResultByControl } from './compliance-state';
import type { ENSComplianceResult } from './evaluation/types';
import { isControlMeasuredOnAgent } from './scope/measurement-planes';
import type { ENSAgentScope } from './scope/types';

export const ENS_PRESENCE_CONTROL_ID = '__ensfacil_presence__';
export const ENS_PRESENCE_EVENT_TYPE = 'agent_presence';

// Lecturas de otros controles que el motor hace por control (ver la cabecera).
export const ENS_CROSS_CONTROL_EVENT_TYPES: Record<string, string[]> = {
  'op.acc.3': ['account_action', 'critical_task_run', 'security_info_access'],
};
export const ENS_CROSS_CONTROL_HEARTBEAT: string[] = ['op.acc.3'];

// Los latidos de una máquina, de cualquier control: el último de cada día.
export const buildENSHeartbeatEvents = (
  heartbeats: { agentId: string; times: string[] }[]
): ENSNormalizedEvent[] =>
  heartbeats.flatMap(entry =>
    entry.times
      .filter(time => Number.isFinite(Date.parse(time)))
      .map((time, index) => ({
        id: `heartbeat:${entry.agentId}:${index}`,
        agentId: entry.agentId,
        controlId: ENS_PRESENCE_CONTROL_ID,
        status: 'NO_EVALUABLE',
        eventType: 'collector_run',
        sourceType: 'WAZUH_ALERT' as const,
        source: 'ensfacil-heartbeat',
        timestamp: new Date(time).toISOString(),
        attributes: {},
        isSynthetic: false,
      }))
  );

export interface ENSAgentPresence {
  agentId: string;
  agentName?: string;
  // El primer hecho de la máquina en la ventana (de cualquier control).
  earliest: string;
}

export const buildENSPresenceEvents = (
  presence: ENSAgentPresence[]
): ENSNormalizedEvent[] =>
  presence
    .filter(entry => entry.agentId && Number.isFinite(Date.parse(entry.earliest)))
    .map(entry => ({
      id: `presence:${entry.agentId}`,
      agentId: entry.agentId,
      agentName: entry.agentName,
      controlId: ENS_PRESENCE_CONTROL_ID,
      status: 'NO_EVALUABLE',
      eventType: ENS_PRESENCE_EVENT_TYPE,
      sourceType: 'WAZUH_ALERT' as const,
      source: 'ensfacil-presence',
      // El instante exacto: a fecha de cualquier corte, la máquina «existe»
      // si ya tenía algún hecho.
      timestamp: new Date(entry.earliest).toISOString(),
      attributes: {},
      isSynthetic: false,
    }));

export interface ENSControlPartitionRow {
  agentId: string;
  result: ENSComplianceResult;
}

export interface ENSControlPartition {
  controlId: string;
  // El resultado de la vista: el del conjunto, sin máquina, o el de la máquina
  // seleccionada (con el del manager para los controles de organización).
  result?: ENSComplianceResult;
  // Las filas de las máquinas que miden el control: las del panel.
  rows: ENSControlPartitionRow[];
}

// Evalúa UN control con sus hechos (y los de presencia) para la vista de una
// máquina o del conjunto.
export const evaluateENSControlPartition = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  agentId: string | undefined,
  scopeAgents: ENSAgentScope[] | undefined,
  now: Date
): ENSControlPartition => {
  if (agentId === undefined) {
    // Sin ninguna máquina conocida, el panel evalúa el catálogo sobre todos
    // los hechos sin fila (rama final de `getENSComplianceState`).
    if (!getAgentIdentities(events, undefined, scopeAgents).length) {
      return {
        controlId,
        result: getENSComplianceResults(level, events, undefined, scopeAgents, now).find(
          result => result.control.id === controlId
        ),
        rows: [],
      };
    }

    const { result, agents } = getENSControlEvaluation(controlId, level, events, scopeAgents, now);

    return {
      controlId,
      result,
      rows: agents.flatMap(agent =>
        agent.results.map(agentResult => ({ agentId: agent.agentId, result: agentResult }))
      ),
    };
  }

  const control = ENSCatalog.find(entry => entry.id === controlId);
  const result = getENSComplianceResultByControl(controlId, level, events, agentId, scopeAgents, now);
  // La fila de la máquina solo lleva los controles que se miden en ella; los
  // de organización salen en la vista con el resultado del manager, pero no
  // son de su fila (`withOrganizationControls`).
  const measured = Boolean(result && control && isControlMeasuredOnAgent(control, agentId));

  return { controlId, result, rows: measured && result ? [{ agentId, result }] : [] };
};

const catalogOrder = new Map(ENSCatalog.map((control, index) => [control.id, index]));
const byCatalog = (left: { controlId: string }, right: { controlId: string }) =>
  (catalogOrder.get(left.controlId) ?? Number.MAX_SAFE_INTEGER) -
  (catalogOrder.get(right.controlId) ?? Number.MAX_SAFE_INTEGER);

// El estado del panel a partir de los controles evaluados por separado. Es el
// mismo que `getENSComplianceState` sobre todos los hechos: las máquinas son
// las del alcance (con el nombre del hecho más reciente si el inventario no lo
// trae: `nameEvents`), cada una con los controles de su fila, y los
// resultados en el orden del catálogo.
export const assembleENSComplianceState = (
  partitions: ENSControlPartition[],
  agentId: string | undefined,
  scopeAgents: ENSAgentScope[] | undefined,
  nameEvents: ENSNormalizedEvent[] = []
): ENSComplianceState => {
  const ordered = [...partitions].sort(byCatalog);
  const agents = getAgentIdentities(nameEvents, agentId, scopeAgents).map(identity => {
    const results = ordered.flatMap(partition =>
      partition.rows
        .filter(row => row.agentId === identity.agentId)
        .map(row => row.result)
    );

    return {
      agentId: identity.agentId,
      agentName: identity.agentName,
      results,
      summary: buildComplianceState(results).controlSummary,
    };
  });

  return buildComplianceState(
    ordered
      .map(partition => partition.result)
      .filter((result): result is ENSComplianceResult => Boolean(result)),
    agents
  );
};

// --- control a control Y máquina a máquina ----------------------------------
//
// Lo que usa el servidor para no tener nunca los hechos de todas las máquinas
// a la vez: las filas que mide un control (`listENSControlRowAgents`), cada
// una evaluada con los hechos de SU máquina (`evaluateENSControlRow`), y la
// vista de conjunto consolidada con la consolidación del motor
// (`consolidateENSControlRows`). Es lo que hace `getENSControlEvaluation` con
// todos los hechos a la vez (lo prueban `tests/control-partition.test.ts` y
// `tests/evaluation-server.test.ts`).

// Las máquinas del alcance en cuya fila se evalúa el control (su plano y, si
// lo declara, su alcance), en el orden del motor.
export const listENSControlRowAgents = (
  controlId: string,
  scopeAgents: ENSAgentScope[] | undefined,
  identityEvents: ENSNormalizedEvent[] = []
): { agentId: string; agentName?: string }[] => {
  const control = ENSCatalog.find(entry => entry.id === controlId);
  return getAgentIdentities(identityEvents, undefined, scopeAgents).filter(
    identity => !control || isControlEvaluatedOnAgent(control, identity.agentId, identity.agentName)
  );
};

// La fila de UNA máquina con los hechos de esa máquina.
export const evaluateENSControlRow = (
  controlId: string,
  level: ENSLevel,
  agentEvents: ENSNormalizedEvent[],
  agentId: string,
  scopeAgents: ENSAgentScope[] | undefined,
  now: Date
): ENSComplianceResult | undefined =>
  getENSComplianceResultByControl(controlId, level, agentEvents, agentId, scopeAgents, now);

// La vista de conjunto a partir de las filas: las máquinas que lo miden y las
// declaradas que no están en el alcance (sin hechos). `undefined` si no hay
// ninguna fila: entonces el motor evalúa el control sin fila sobre todos sus
// hechos (`getENSControlEvaluation`), y el servidor hace lo mismo.
export const consolidateENSControlRows = (
  controlId: string,
  level: ENSLevel,
  rows: { agentId: string; agentName?: string; result: ENSComplianceResult }[],
  identityEvents: ENSNormalizedEvent[],
  scopeAgents: ENSAgentScope[] | undefined,
  now: Date
): ENSComplianceResult | undefined => {
  const agents = [
    ...rows.map(row => ({
      agentId: row.agentId,
      agentName: row.agentName,
      results: [row.result],
      summary: buildComplianceState([row.result]).controlSummary,
    })),
    ...buildOutOfScopeDeclaredRows(
      ENSCatalog.filter(control => control.id === controlId),
      level,
      identityEvents,
      scopeAgents,
      now
    ),
  ];
  return agents.length ? consolidateAgentComplianceResultByControl(agents, controlId) : undefined;
};

// Un resultado reducido a lo que la consolidación usa para el estado y el
// número (para los días pasados de la serie, donde no hace falta el detalle).
export const resultStatusStub = (
  controlId: string,
  status: string,
  score: number | undefined
): ENSComplianceResult =>
  ({
    control: { id: controlId, name: controlId, family: '', category: '', description: '' },
    level: 'BAJO',
    status,
    score,
    coverage: 0,
    applicableRequirements: 0,
    measuredRequirements: 0,
    unmeasuredRequirements: [],
    evaluatedAt: '',
    requirements: [],
    parameters: [],
    evidences: [],
    missingParameters: [],
    missingEvidences: [],
    relatedRules: [],
    nonConformities: [],
    observations: [],
    traceability: [],
  } as unknown as ENSComplianceResult);
