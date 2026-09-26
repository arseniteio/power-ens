import type {
  ENSControlDefinition,
  ENSMeasurementPlane,
} from '../../catalog/types';
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
  };

  return [...agents, manager];
};
