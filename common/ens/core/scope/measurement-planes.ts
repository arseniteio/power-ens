import type {
  ENSControlDefinition,
  ENSMeasurementPlane,
} from '../../catalog/types';
import type { ENSControlConfiguration } from '../../configuration/types';
// Del fichero, no del barrel `configuration/services`: ese re-exporta el
// cliente HTTP, que arrastra `kibana-services` al grafo del motor.
import {
  toParameterListItems,
  toTableRowCells,
} from '../../configuration/services/parameter-value-validator';
import type { ENSEvidenceResolved } from '../evidence/types';
import type { ENSPolicyRuntimeResult } from '../policy-runtime/types';
import { ENSAgentScope } from './types';

// Planos de medida: dónde se mide cada control.
//
// El alcance ENS se resuelve por el grupo `ens`, y el manager de Wazuh (agente
// 000) no puede estar en un grupo. Hasta que existieron op.exp.7, op.exp.8 y
// op.exp.9 daba igual: ningún control se medía allí. Ahora hay controles que se
// miden SOLO en el manager (op.exp.7, op.exp.9) y uno en los dos planos
// (op.exp.8), así que el manager entra en el alcance cuando algún control
// ACTIVE lo pide, y cada fila evalúa solo los controles de su plano:
//
//   - fila del manager: los controles con plano `manager`;
//   - fila de cualquier otra máquina: los controles con plano `agent`.
//
// Un control que no se mide en una fila NO produce resultado en ella (ni un
// NO_APLICA inventado): la consolidación ya salta las filas sin resultado.

// El id del manager en Wazuh. Es fijo: el manager es siempre el agente 000.
export const ENS_MANAGER_AGENT_ID = '000';

// Nombre del manager cuando el inventario de agentes no lo trae. El que traigan
// sus propios eventos no lo sustituye: la identidad sale del alcance.
export const ENS_MANAGER_FALLBACK_NAME = 'Manager de Wazuh';

const DEFAULT_MEASUREMENT_PLANES: ENSMeasurementPlane[] = ['agent'];

type ENSMeasuredControl = Pick<ENSControlDefinition, 'measurementPlanes'>;

export const getControlMeasurementPlanes = (
  control: ENSMeasuredControl
): ENSMeasurementPlane[] =>
  control.measurementPlanes && control.measurementPlanes.length > 0
    ? control.measurementPlanes
    : DEFAULT_MEASUREMENT_PLANES;

export const isManagerAgentId = (agentId?: string): boolean =>
  typeof agentId === 'string' && agentId.trim() === ENS_MANAGER_AGENT_ID;

export const getAgentMeasurementPlane = (
  agentId: string
): ENSMeasurementPlane =>
  isManagerAgentId(agentId) ? 'manager' : 'agent';

export const isControlMeasuredOnPlane = (
  control: ENSMeasuredControl,
  plane: ENSMeasurementPlane
): boolean => getControlMeasurementPlanes(control).includes(plane);

// ¿Se evalúa este control en la fila de esta máquina?
export const isControlMeasuredOnAgent = (
  control: ENSMeasuredControl,
  agentId: string
): boolean =>
  isControlMeasuredOnPlane(control, getAgentMeasurementPlane(agentId));

// --- alcance declarado -----------------------------------------------------
//
// Además del plano, un control puede medirse solo en las máquinas que la
// organización nombra en un parámetro de su configuración (`scopeParameter`
// del catálogo; P-04 en mp.info.6). Es la misma regla que la del plano: en la
// fila de una máquina no declarada el control no produce resultado —no suma ni
// resta—, y en la de una declarada que no ha enviado nada sale «sin datos»,
// que es lo que el motor ya produce para cualquier control sin hechos.

type ENSScopedControl = Pick<ENSControlDefinition, 'scopeParameter'>;

// Los nombres de las máquinas declaradas, en minúsculas. Cada entrada es una
// máquina y, tras una barra vertical, lo que el parámetro añada (la
// criticidad en P-04: `srv-bd01 | ALTA`); solo cuenta el nombre. `undefined`
// si el control no declara parámetro de alcance: se mide en todas.
export const getDeclaredScopeAgentNames = (
  control: ENSScopedControl,
  configuration: ENSControlConfiguration | undefined
): string[] | undefined => {
  if (!control.scopeParameter) {
    return undefined;
  }

  const value = configuration?.parameters.find(
    parameter => parameter.id === control.scopeParameter
  )?.value;

  // Un número o un booleano sueltos no nombran ninguna máquina.
  if (!Array.isArray(value) && typeof value !== 'string') {
    return [];
  }

  return Array.from(
    new Set(
      toParameterListItems(value)
        .map(entry => (toTableRowCells(entry)[0] || '').toLowerCase())
        .filter(Boolean)
    )
  );
};

// ¿Es esta máquina una de las declaradas? El nombre es el del agente de
// Wazuh, sin distinguir mayúsculas: es como lo escribe el responsable en la
// pantalla.
export const isAgentNameDeclared = (
  agentName: string | undefined,
  declared: string[]
): boolean => {
  const name = String(agentName || '').trim().toLowerCase();

  return name !== '' && declared.includes(name);
};

// ¿Figura esta máquina en el alcance declarado del control? Un control sin
// parámetro de alcance está en todas; con el parámetro vacío, en ninguna.
export const isControlInDeclaredScope = (
  control: ENSScopedControl,
  agentName: string | undefined,
  configuration: ENSControlConfiguration | undefined
): boolean => {
  const declared = getDeclaredScopeAgentNames(control, configuration);

  return declared === undefined || isAgentNameDeclared(agentName, declared);
};

// Sin fila, un control cuyo alcance declarado no nombra a NINGUNA máquina
// conocida (vacío, o con nombres que no coinciden con ningún agente, una
// errata) no tiene de quién esperar hechos: lo que no se ha podido medir es de
// CONFIGURACIÓN, no de recogida. Estas dos marcan el resultado así, igual que
// `stale-collector.ts` marca el de un recolector parado.
export const describeUnmatchedDeclaredScope = (
  parameterId: string,
  declared: string[]
): string =>
  declared.length
    ? `Ninguna de las máquinas que declara ${parameterId} (${declared.join(', ')}) coincide con un agente del alcance ENS: ninguna máquina declarada envía datos. Revisa los nombres en la pantalla de Configuración.`
    : `${parameterId} no declara ninguna máquina: el control solo se mide en las máquinas declaradas, y sin ninguna no hay qué medir.`;

// Una máquina declarada que no es ninguna del alcance ENS: cuenta como una
// máquina declarada sin datos, y el motivo dice por qué puede pasar.
export const describeOutOfScopeDeclaredMachine = (
  parameterId: string,
  name: string
): string =>
  `${parameterId} declara ${name}, que no es ninguna máquina del alcance ENS: nombre mal escrito o máquina fuera del grupo ens. Cuenta como una máquina declarada sin datos.`;

export const markEvidencesUnmatchedScope = (
  evidences: ENSEvidenceResolved[],
  reason: string
): ENSEvidenceResolved[] =>
  evidences.map(evidence => {
    if (evidence.status === 'NO_APLICA') {
      return evidence;
    }

    const {
      resolvedEventId,
      resolvedEventType,
      resolvedSourceType,
      resolvedSource,
      resolvedRuleId,
      resolvedRuleDescription,
      resolvedAttributes,
      latestSuccessfulEventId,
      latestSuccessfulAttributes,
      ...rest
    } = evidence;

    return {
      ...rest,
      status: 'NO_EVALUABLE',
      gapCause: 'CONFIGURATION',
      resolvedAttributes: { motivo: reason, causa: 'CONFIGURATION' },
      observations: [
        `${evidence.id} NO_EVALUABLE: ${reason}`,
        `Pregunta de auditoría: ${evidence.auditQuestion}`,
      ],
    };
  });

// Las decisiones `documental` salen de la configuración, no de las máquinas
// declaradas: se conservan, como el NO_APLICA (ver `markPolicyRuntimeStale`).
export const markPolicyRuntimeUnmatchedScope = (
  policyRuntime: ENSPolicyRuntimeResult | undefined,
  reason: string
): ENSPolicyRuntimeResult | undefined =>
  policyRuntime && {
    ...policyRuntime,
    decisions: policyRuntime.decisions.map(decision =>
      decision.status === 'NO_APLICA' || decision.documental
        ? decision
        : {
            ...decision,
            status: 'NO_EVALUABLE',
            cause: 'CONFIGURATION',
            reason,
          }
    ),
  };

// Un control SOLO de manager es de la organización, no de una máquina: en la
// vista de un agente se muestra con el resultado de la fila del manager.
export const isManagerOnlyControl = (
  control: ENSMeasuredControl
): boolean =>
  isControlMeasuredOnPlane(control, 'manager') &&
  !isControlMeasuredOnPlane(control, 'agent');

// El manager entra en el alcance si algún control ACTIVE se mide en su plano.
// Un control DRAFT no cuenta: no entra en el índice y no puede arrastrar al
// manager con él.
export const isManagerPlaneActive = (
  catalog: Array<Pick<ENSControlDefinition, 'status' | 'measurementPlanes'>>
): boolean =>
  catalog.some(
    control =>
      control.status === 'ACTIVE' &&
      isControlMeasuredOnPlane(control, 'manager')
  );

// Aplica el plano del manager a los agentes ya resueltos por el modo de alcance
// (global, grupo o agente). El manager no está en ningún grupo, así que ningún
// modo lo trae por sí solo; y si alguno lo trae (el modo global con un
// inventario que lo incluye, o un 000 escrito a mano), sin plano `manager`
// activo se quita: su fila no tendría ningún control que evaluar.
export const applyManagerPlaneToScope = (
  resolvedAgents: ENSAgentScope[],
  inventory: ENSAgentScope[],
  managerPlaneActive: boolean
): ENSAgentScope[] => {
  const agents = resolvedAgents.filter(agent => !isManagerAgentId(agent.id));

  if (!managerPlaneActive) {
    return agents;
  }

  const inventoryManager = inventory.find(agent => isManagerAgentId(agent.id));

  const manager: ENSAgentScope = {
    id: ENS_MANAGER_AGENT_ID,
    name: inventoryManager?.name || ENS_MANAGER_FALLBACK_NAME,
    groups: inventoryManager ? [...inventoryManager.groups] : [],
    isManager: true,
    ...(inventoryManager?.status ? { status: inventoryManager.status } : {}),
  };

  return [...agents, manager];
};

// --- «no se mide en esta máquina» -----------------------------------------
//
// Con una máquina elegida, un control puede no tener resultado en ella por dos
// razones, y la pantalla tiene que decir cuál en vez de quedarse en blanco (o,
// peor, afirmar que todo es conforme):
//
//   - PLANE           el control no se mide en el plano de esa máquina: los de
//                     plano `agent` en el manager (000);
//   - DECLARED_SCOPE  el control declara las máquinas en que se mide (P-04 de
//                     mp.info.6) y esta no figura.
//
// Un control solo de manager en la vista de otra máquina SÍ tiene resultado
// (el de la fila del manager): aquí no devuelve nada. Es la misma regla que
// aplica el servidor al derivar la vista de una máquina (`deriveForAgent`).
export type ENSNotMeasuredCause = 'PLANE' | 'DECLARED_SCOPE';

export interface ENSNotMeasuredReason {
  cause: ENSNotMeasuredCause;
  text: string;
  // Solo con DECLARED_SCOPE: el parámetro que declara las máquinas y las que
  // nombra (en minúsculas, como las compara el motor).
  parameterId?: string;
  declared?: string[];
}

const etiquetaDeMaquina = (agentId: string, agentName?: string): string =>
  agentName ? `${agentId} · ${agentName}` : agentId;

export const describeNotMeasuredOnAgent = (
  control: Pick<ENSControlDefinition, 'id' | 'measurementPlanes' | 'scopeParameter'>,
  agentId: string,
  agentName: string | undefined,
  configuration: ENSControlConfiguration | undefined
): ENSNotMeasuredReason | undefined => {
  if (!isControlMeasuredOnAgent(control, agentId)) {
    if (isManagerOnlyControl(control) && !isManagerAgentId(agentId)) {
      return undefined;
    }

    return {
      cause: 'PLANE',
      text: isManagerAgentId(agentId)
        ? `${control.id} se mide en cada máquina del alcance ENS, no en el manager de Wazuh (${ENS_MANAGER_AGENT_ID}): el manager no tiene fila para este control.`
        : `${control.id} se mide solo en el manager de Wazuh (${ENS_MANAGER_AGENT_ID}), no en ${etiquetaDeMaquina(agentId, agentName)}.`,
    };
  }

  const declared = getDeclaredScopeAgentNames(control, configuration);

  if (declared === undefined || isAgentNameDeclared(agentName, declared)) {
    return undefined;
  }

  const parameterId = control.scopeParameter as string;

  return {
    cause: 'DECLARED_SCOPE',
    parameterId,
    declared,
    text: declared.length
      ? `${control.id} solo se mide en las máquinas que declara ${parameterId} (${declared.join(', ')}); ${etiquetaDeMaquina(agentId, agentName)} no está entre ellas.`
      : `${control.id} solo se mide en las máquinas que declara ${parameterId}, y ${parameterId} no declara ninguna: ${etiquetaDeMaquina(agentId, agentName)} no está entre ellas.`,
  };
};
