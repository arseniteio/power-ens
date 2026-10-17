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
// LO ÚNICO QUE UN CONTROL LEE DE LOS DEMÁS es de quién son los hechos: op.mon.3
// sabe en qué fila está por el `agent.id` de los hechos que recibe, de
// cualquier control (ver su policy). Repartidos por control, una máquina sin
// hechos de op.mon.3 pero con hechos de otros controles dejaría de «existir».
// Para eso van los hechos de PRESENCIA: uno por máquina, con el día de su
// primer hecho en la ventana y un control que no es ninguno del catálogo, así
// que el resto del motor los ignora (ni resuelven evidencias, ni cuentan como
// hechos del control, ni entran en la trazabilidad). El día, y no el instante,
// para que la serie diaria vea a la máquina desde el día en que empezó a
// informar y para que el hecho no cambie cada vez que la ventana avanza.
import { ENSCatalog } from '../catalog';
import type { ENSLevel } from '../configuration/types';
import { buildComplianceState } from './compliance-state';
import type { ENSComplianceState } from './compliance-state/types';
import type { ENSNormalizedEvent } from './data-source/types';
import {
  getAgentIdentities,
  getENSComplianceResultByControl,
  getENSComplianceResults,
  getENSControlEvaluation,
} from './ens-engine';
import type { ENSComplianceResult } from './evaluation/types';
import { isControlMeasuredOnAgent } from './scope/measurement-planes';
import type { ENSAgentScope } from './scope/types';
import { startOfDayIn } from './timeline/timeline-cuts';

export const ENS_PRESENCE_CONTROL_ID = '__ensfacil_presence__';
export const ENS_PRESENCE_EVENT_TYPE = 'agent_presence';

export interface ENSAgentPresence {
  agentId: string;
  agentName?: string;
  // El primer hecho de la máquina en la ventana (de cualquier control).
  earliest: string;
}

export const buildENSPresenceEvents = (
  presence: ENSAgentPresence[],
  timeZone?: string
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
      timestamp: startOfDayIn(new Date(entry.earliest), timeZone).toISOString(),
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
