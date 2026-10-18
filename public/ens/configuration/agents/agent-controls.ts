// Qué controles se miden en una máquina, para la pantalla de un sistema y su
// completitud: los de su plano de medida (el manager, los de plano `manager`;
// las demás, los de plano `agent`) y, si su plataforma solo tiene recolector
// para algunos (Windows: op.acc.1-4), solo esos. Los demás se enseñan aparte
// como «sin recolector en esta plataforma», que no es lo mismo que no cumplir.
import type { ENSConfigurationVersion, ENSLevel, ENSSystemType } from '../types';
import { normalizeAgentId } from '../../../../common/agent-configuration';
import { getENSCatalogControl } from '../../catalog';
import { getBaseTemplateForSystemType } from '../templates';
import { isAgentLevelParameter } from './parameter-classes';
import { ENS_MANAGER_AGENT_ID } from '../../core/scope/measurement-planes';

export interface ENSAgentControl {
  controlId: string;
  controlName: string;
  level: ENSLevel;
  measured: boolean;
  // Por qué no se mide en esta máquina, si no se mide.
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
  const only = getBaseTemplateForSystemType(type)?.onlyControls;

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
            ? 'se mide en las máquinas, no en el manager'
            : 'se mide en el manager: sus valores por sistema de esta máquina se juntan en la fila del manager'
          : !collected
          ? 'sin recolector en esta plataforma: el motor lo sigue evaluando y, sin hechos, no lo da por demostrado'
          : undefined,
      };
    });
};
