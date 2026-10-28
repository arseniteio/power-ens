import type {
  ENSControlDefinition,
  ENSMeasurementPlane,
} from '../../catalog/types';
import type { ENSControlConfiguration } from '../../configuration/types';
// From the file, not the `configuration/services` barrel (it drags `kibana-services` into the engine graph).
import {
  toParameterListItems,
  toTableRowCells,
} from '../../configuration/services/parameter-value-validator';
import { ENSAgentScope } from './types';

// Measurement planes: where each control is measured. The ENS scope is resolved by the `ens` group, and the Wazuh manager (agent 000) cannot be in a group. Some controls are measured ONLY on the manager (op.exp.7, op.exp.9) and one on both planes (op.exp.8),
// so the manager enters the scope when an ACTIVE control asks, and each row evaluates only the controls of its plane: the manager row those with plane `manager`, any other machine those with plane `agent`.
// A control not measured on a row produces no result there (no invented NO_APLICA): consolidation already skips rows without result.

// The manager's id in Wazuh: fixed, always agent 000.
export const ENS_MANAGER_AGENT_ID = '000';

// Manager name when the agent inventory lacks it. The name its own events carry does not replace it: identity comes from the scope.
const ENS_MANAGER_FALLBACK_NAME = 'Manager de Wazuh';

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

const isControlMeasuredOnPlane = (
  control: ENSMeasuredControl,
  plane: ENSMeasurementPlane
): boolean => getControlMeasurementPlanes(control).includes(plane);

// Is this control evaluated on this machine's row?
const isControlMeasuredOnAgent = (
  control: ENSMeasuredControl,
  agentId: string
): boolean =>
  isControlMeasuredOnPlane(control, getAgentMeasurementPlane(agentId));

// Declared scope. A control may be measured only on the machines the organisation names in a configuration parameter (`scopeParameter` of the catalog; P-04 in mp.info.6). Same rule as the plane:
// on an undeclared machine's row the control produces no result (neither adds nor subtracts), and on a declared one that sent nothing it comes out "sin datos".

type ENSScopedControl = Pick<ENSControlDefinition, 'scopeParameter'>;

// Lowercase names of the declared machines. Each entry is a machine and, after a vertical bar, whatever the parameter adds (criticality in P-04: `srv-bd01 | ALTA`); only the name counts.
// `undefined` if the control declares no scope parameter: measured everywhere.
const getDeclaredScopeAgentNames = (
  control: ENSScopedControl,
  configuration: ENSControlConfiguration | undefined
): string[] | undefined => {
  if (!control.scopeParameter) {
    return undefined;
  }

  const value = configuration?.parameters.find(
    parameter => parameter.id === control.scopeParameter
  )?.value;

  // A bare number or boolean names no machine.
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

// Is this machine one of the declared? The Wazuh agent name, case-insensitive, as the owner writes it on screen.
const isAgentNameDeclared = (
  agentName: string | undefined,
  declared: string[]
): boolean => {
  const name = String(agentName || '').trim().toLowerCase();

  return name !== '' && declared.includes(name);
};

// A manager-ONLY control belongs to the organisation, not a machine: in an agent's view it shows with the manager row's result.
export const isManagerOnlyControl = (
  control: ENSMeasuredControl
): boolean =>
  isControlMeasuredOnPlane(control, 'manager') &&
  !isControlMeasuredOnPlane(control, 'agent');

// The manager enters the scope if some ACTIVE control is measured on its plane. A DRAFT control does not count.
export const isManagerPlaneActive = (
  catalog: Array<Pick<ENSControlDefinition, 'status' | 'measurementPlanes'>>
): boolean =>
  catalog.some(
    control =>
      control.status === 'ACTIVE' &&
      isControlMeasuredOnPlane(control, 'manager')
  );

// Applies the manager plane to the agents already resolved by the scope mode (global, group or agent). The manager is in no group, so no mode brings it; and if one does (global mode with an inventory that includes it, or a hand-written 000),
// without an active `manager` plane it is removed: its row would have no control to evaluate.
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

// "Not measured on this machine". With a chosen machine, a control may have no result on it for two reasons, and the screen must say which:
// - PLANE           the control is not measured on that machine's plane: `agent`-plane controls on the manager (000);
// - DECLARED_SCOPE  the control declares the machines it is measured on (P-04 of mp.info.6) and this one is not listed.
// A manager-only control in another machine's view DOES have a result (the manager row's): here it returns nothing. Same rule as the server's `deriveForAgent`.
export type ENSNotMeasuredCause = 'PLANE' | 'DECLARED_SCOPE';

export interface ENSNotMeasuredReason {
  cause: ENSNotMeasuredCause;
  text: string;
  // Only with DECLARED_SCOPE: the parameter declaring the machines and the ones it names (lowercase, as the engine compares them).
  parameterId?: string;
  declared?: string[];
}

const machineLabel = (agentId: string, agentName?: string): string =>
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
        : `${control.id} se mide solo en el manager de Wazuh (${ENS_MANAGER_AGENT_ID}), no en ${machineLabel(agentId, agentName)}.`,
    };
  }

  // A control with declared scope that is not in the configuration: not that its parameter fails to name the machine, there is no parameter.
  if (control.scopeParameter && !configuration) {
    return {
      cause: 'DECLARED_SCOPE',
      parameterId: control.scopeParameter,
      declared: [],
      text: `${control.id} no está en la configuración activa: sin ${control.scopeParameter} no hay máquinas declaradas en que medirlo.`,
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
      ? `${control.id} solo se mide en las máquinas que declara ${parameterId} (${declared.join(', ')}); ${machineLabel(agentId, agentName)} no está entre ellas.`
      : `${control.id} solo se mide en las máquinas que declara ${parameterId}, y ${parameterId} no declara ninguna: ${machineLabel(agentId, agentName)} no está entre ellas.`,
  };
};
