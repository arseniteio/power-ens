// System type of a machine from its inventory platform: the same rule as the engine (`catalog.SystemTypeOf`).
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
  // "detectado por ..." in one sentence.
  evidence: string;
}

// Platforms of the Wazuh inventory behind each system type, from the engine catalog.
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
  // "detectado por ..." or "corregido a mano (detectado: ...)".
  description: string;
}

export const effectiveSystemType = (
  detection: ENSSystemDetection,
  profile?: ENSAgentProfile
): ENSEffectiveSystemType => {
  // Without live data, the type detected last time it was stored.
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

// Machine name in `os.uname` ("Linux |host.domain |...").
export const hostnameFromUname = (uname?: string): string | undefined => {
  const parts = String(uname || '').split('|').map(part => part.trim());
  return /^linux$/i.test(parts[0] || '') && parts[1] ? parts[1] : undefined;
};

// Names a machine is known by in the configuration tables: id, agent name, `os.uname` hostname, the short part
// of both (before the first dot) and stored profile aliases. Lowercase, deduplicated.
export const agentAliases = (
  agent: ENSDetectableAgent,
  profile?: ENSAgentProfile
): string[] => {
  const names = [
    normalizeAgentId(agent.id),
    agent.name,
    hostnameFromUname(agent.os?.uname),
    profile?.name,
    ...(profile?.aliases || []),
  ]
    .map(name => String(name || '').trim().toLowerCase())
    .filter(Boolean);

  const short = names
    .filter(name => !/^\d+$/.test(name) && name.includes('.'))
    .map(name => name.split('.')[0])
    .filter(Boolean);

  return Array.from(new Set([...names, ...short]));
};

// The configuration as the engine reads it: each machine with the type its inventory says, unless corrected by
// hand, so a new machine gets the template of its type without anyone saving it.
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
