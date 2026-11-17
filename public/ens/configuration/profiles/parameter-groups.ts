import { ENGINE_CATALOG } from '../../../../common/ens/catalog/engine-catalog';
import { isAgentLevelParameter } from '../../../../common/ens/configuration/agents/parameter-classes';

export interface ENSParameterGroup {
  controlId: string;
  parameters: Array<{ parameterId: string; label: string; type: string }>;
}

// The parameters a group or a machine can set: the per-machine ones of every control.
export const PARAMETER_GROUPS: ENSParameterGroup[] = ENGINE_CATALOG.map(entry => ({
  controlId: entry.control as string,
  parameters: Object.entries<any>(entry.parameters)
    .filter(([parameterId]) => isAgentLevelParameter(entry.control, parameterId))
    .map(([parameterId, parameter]) => ({ parameterId, label: (parameter.label || parameterId) as string, type: parameter.type as string })),
})).filter(group => group.parameters.length);
