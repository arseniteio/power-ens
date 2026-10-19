// Controls measured on a machine, for its system screen and completeness: those of its measurement plane (`manager` plane for the manager, `agent` for the rest) and, if its platform has a collector for only some (Windows: op.acc.1-4), only those. The others are shown apart as "sin recolector en esta plataforma", which is not a failure.
import type { ENSConfigurationVersion, ENSLevel, ENSSystemType } from '../types';
import { normalizeAgentId } from '../../../agent-configuration';
import { getENSCatalogControl } from '../../catalog';
import { getCollectedControls } from '../templates';
import { isAgentLevelParameter } from './parameter-classes';
import { ENS_MANAGER_AGENT_ID } from '../../core/scope/measurement-planes';

export interface ENSAgentControl {
  controlId: string;
  controlName: string;
  level: ENSLevel;
  measured: boolean;
  // Why it is not measured on this machine, if it is not.
  reason?: string;
}

export const getAgentControls = (
  configuration: Pick<ENSConfigurationVersion, 'controls'>,
  agentId: string,
  type: ENSSystemType | undefined,
  getLevel: (controlId: string) => ENSLevel
): ENSAgentControl[] => {
  const manager = normalizeAgentId(agentId) === ENS_MANAGER_AGENT_ID;
  const plane = manager ? 'manager' : 'agent';
  const only = getCollectedControls(type);

  return configuration.controls
    .filter(control => control.parameters.some(parameter => isAgentLevelParameter(control.controlId, parameter.id)))
    .map(control => {
      const planes = getENSCatalogControl(control.controlId)?.measurementPlanes;
      const onPlane = (planes && planes.length ? planes : ['agent']).includes(plane);
      const collected = !only || only.includes(control.controlId);
      return {
        controlId: control.controlId,
        controlName: control.controlName,
        level: getLevel(control.controlId),
        measured: onPlane && collected,
        reason: !onPlane
          ? manager
            ? 'se evalúa en los agentes, no en el manager'
            : 'se evalúa en el manager, con las filas de todos'
          : !collected
          ? 'sin recolector para su sistema'
          : undefined,
      };
    });
};
