// System type detection per agent.
import {
  ENSAgentProfile,
  ENSSystemType,
  ENS_SYSTEM_TYPE_LABELS,
  knownSystemType,
  normalizeAgentId,
} from '../../../agent-configuration';
import type { ENSAgentOS } from '../../core/scope/types';
import { ENS_MANAGER_AGENT_ID } from '../../core/scope/measurement-planes';

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

const LINUX_PLATFORMS = [
  'ubuntu', 'debian', 'centos', 'rhel', 'redhat', 'rocky', 'almalinux', 'sles',
  'opensuse', 'opensuse-leap', 'opensuse-tumbleweed', 'fedora', 'amzn', 'ol',
  'arch', 'linux',
];

export const detectAgentSystem = (agent: ENSDetectableAgent): ENSSystemDetection => {
  if (normalizeAgentId(agent.id) === ENS_MANAGER_ID) {
    return { type: 'manager', source: 'id', evidence: 'ser el manager de Wazuh' };
  }

  const platform = String(agent.os?.platform || '').trim().toLowerCase();
  const uname = String(agent.os?.uname || '').trim();

  if (platform === 'windows') {
    return { type: 'windows', source: 'inventario', evidence: 'el inventario de agentes (Windows)' };
  }

  if (LINUX_PLATFORMS.includes(platform)) {
    return { type: 'linux', source: 'inventario', evidence: `el inventario de agentes (${platform.charAt(0).toUpperCase()}${platform.slice(1)})` };
  }

  if (/^linux\b/i.test(uname)) {
    return { type: 'linux', source: 'inventario', evidence: 'el inventario de agentes (Linux)' };
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
