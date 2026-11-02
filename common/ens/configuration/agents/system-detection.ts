import {
  ENSAgentProfile,
  ENSSystemType,
  ENS_SYSTEM_TYPE_LABELS,
  knownSystemType,
  normalizeAgentId,
} from '../../../agent-configuration';
import type { ENSAgentOS } from '../../core/scope/types';
import { ENS_MANAGER_AGENT_ID } from '../../core/scope/measurement-planes';
import systemTypes from '../../catalog/system-types.json';

const ENS_MANAGER_ID = ENS_MANAGER_AGENT_ID;

export interface ENSDetectableAgent {
  id: string;
  name?: string;
  groups?: string[];
  os?: ENSAgentOS;
}

export interface ENSSystemDetection {
  type?: ENSSystemType;
  source: 'id' | 'inventario' | 'ninguna';
  evidence: string;
}

const PLATFORM_TYPES = new Map<string, ENSSystemType>(
  Object.entries(systemTypes as Record<string, string[]>).flatMap(([type, platforms]) => platforms.map(platform => [platform, type as ENSSystemType]))
);

export const detectAgentSystem = (agent: ENSDetectableAgent): ENSSystemDetection => {
  if (normalizeAgentId(agent.id) === ENS_MANAGER_ID) {
    return { type: 'manager', source: 'id', evidence: 'ser el manager de Wazuh' };
  }

  const platform = String(agent.os?.platform || '').trim().toLowerCase();
  const type = PLATFORM_TYPES.get(platform);

  if (type) {
    return { type, source: 'inventario', evidence: `el inventario de agentes (${platform.charAt(0).toUpperCase()}${platform.slice(1)})` };
  }

  if (platform) {
    return { type: undefined, source: 'ninguna', evidence: `el sistema «${platform}» no es un tipo previsto; se elige a mano` };
  }

  return {
    type: undefined,
    source: 'ninguna',
    evidence: 'el inventario no trae su sistema operativo (agente sin conectar o sin datos); se elige a mano'
  };
};

interface ENSEffectiveSystemType {
  type?: ENSSystemType;
  manual: boolean;
  description: string;
}

export const effectiveSystemType = (
  detection: ENSSystemDetection,
  profile?: ENSAgentProfile
): ENSEffectiveSystemType => {
  const detectedType = detection.type || knownSystemType(profile?.detectedType);
  const detectedBy = detection.type ? detection.evidence : profile?.detectedBy || detection.evidence;
  const override = knownSystemType(profile?.typeOverride);

  if (override) {
    return {
      type: override,
      manual: true,
      description: `corregido a mano${detectedType ? ` (detectado: ${ENS_SYSTEM_TYPE_LABELS[detectedType]}, por ${detectedBy})` : ''}`,
    };
  }

  return {
    type: detectedType,
    manual: false,
    description: detectedType ? `detectado por ${detectedBy}` : `sin detectar: ${detectedBy}`,
  };
};

export const hostnameFromUname = (uname?: string): string | undefined => {
  const parts = String(uname || '').split('|').map(part => part.trim());
  return /^linux$/i.test(parts[0] || '') && parts[1] ? parts[1] : undefined;
};

export const withInventoryTypes = <T extends { agents?: Record<string, ENSAgentProfile> }>(configuration: T, inventory: ENSDetectableAgent[]): T => {
  const agents = { ...(configuration.agents || {}) };
  let changed = false;
  for (const agent of inventory) {
    const type = detectAgentSystem(agent).type;
    const id = normalizeAgentId(agent.id);
    if (!type || agents[id]?.detectedType === type) continue;
    agents[id] = { ...(agents[id] || {}), detectedType: type };
    changed = true;
  }
  return changed ? { ...configuration, agents } : configuration;
};
