// System type detection per agent. Pure: takes what the inventory (`wazuh-monitoring`) and the facts (30-day
// aggregation) say and returns the type with its EVIDENCE.
// Order (first matching rule wins):
//   1. id 000 -> Manager
//   2. os.platform = windows -> Windows
//   3. facts with data.plano = directorio -> LDAP (Zimbra); only its collector's facts reveal it, so a fresh
// install without facts is Linux until corrected by hand
//   4. Linux-family os.platform, or os.uname starting with "Linux" -> Linux
//   5. no os -> undetected
// mp.info.6 backup facts (data.origen = pbs or zimbra-ne) only propose a template there, never apply it.
import {
  ENSAgentProfile,
  ENSSystemType,
  ENS_SYSTEM_TYPE_LABELS,
  knownSystemType,
  normalizeAgentId,
} from '../../../agent-configuration';
import type { ENSAgentOS } from '../../core/scope/types';
import { getBuiltinTemplate } from '../templates';
import { ENS_MANAGER_AGENT_ID } from '../../core/scope/measurement-planes';

export const ENS_MANAGER_ID = ENS_MANAGER_AGENT_ID;

export interface ENSDetectableAgent {
  id: string;
  name?: string;
  groups?: string[];
  os?: ENSAgentOS;
}

export interface ENSDetectionFacts {
  planes?: Record<string, number>;
  backupOrigins?: Record<string, number>;
}

export interface ENSSystemDetection {
  type?: ENSSystemType;
  source: 'id' | 'inventario' | 'hechos' | 'ninguna';
  // "detectado por ..." in one sentence.
  evidence: string;
  // Additions proposed by the facts, with their evidence.
  addons: { templateId: string; evidence: string }[];
}

const LINUX_PLATFORMS = [
  'ubuntu', 'debian', 'centos', 'rhel', 'redhat', 'rocky', 'almalinux', 'sles',
  'opensuse', 'opensuse-leap', 'opensuse-tumbleweed', 'fedora', 'amzn', 'ol',
  'arch', 'linux',
];

const thousands = (n: number): string => n.toLocaleString('es-ES');

// `data.plano` may be composite (`sistema,directorio`, `sistema+directorio`).
const factsWithPlane = (planes: Record<string, number> | undefined, plane: string): number =>
  Object.entries(planes || {})
    .filter(([value]) => value.toLowerCase().split(/[,+\s]+/).includes(plane))
    .reduce((total, [, count]) => total + count, 0);

export const detectAgentSystem = (
  agent: ENSDetectableAgent,
  facts?: ENSDetectionFacts
): ENSSystemDetection => {
  const addons: ENSSystemDetection['addons'] = [];
  const origins = facts?.backupOrigins || {};

  if (origins.pbs) {
    addons.push({ templateId: 'pbs-backup', evidence: `${thousands(origins.pbs)} datos de copias con PBS en 30 días` });
  }

  if (origins['zimbra-ne']) {
    addons.push({ templateId: 'zimbra-ne-backup', evidence: `${thousands(origins['zimbra-ne'])} datos de copias con Zimbra NE en 30 días` });
  }

  if (normalizeAgentId(agent.id) === ENS_MANAGER_ID) {
    return { type: 'manager', source: 'id', evidence: 'ser el manager de Wazuh', addons };
  }

  const platform = String(agent.os?.platform || '').trim().toLowerCase();
  const uname = String(agent.os?.uname || '').trim();

  if (platform === 'windows') {
    return { type: 'windows', source: 'inventario', evidence: 'el inventario de agentes (Windows)', addons };
  }

  const directory = factsWithPlane(facts?.planes, 'directorio');

  if (directory > 0) {
    return {
      type: 'zimbra-ldap',
      source: 'hechos',
      evidence: `${thousands(directory)} datos del directorio LDAP en 30 días`,
      addons,
    };
  }

  if (LINUX_PLATFORMS.includes(platform)) {
    return { type: 'linux', source: 'inventario', evidence: `el inventario de agentes (${platform.charAt(0).toUpperCase()}${platform.slice(1)})`, addons };
  }

  if (/^linux\b/i.test(uname)) {
    return { type: 'linux', source: 'inventario', evidence: 'el inventario de agentes (Linux)', addons };
  }

  if (platform) {
    return { type: undefined, source: 'ninguna', evidence: `el sistema «${platform}» no es un tipo previsto; se elige a mano`, addons };
  }

  return {
    type: undefined,
    source: 'ninguna',
    evidence: 'el inventario no trae su sistema operativo (agente sin conectar o sin datos); se elige a mano',
    addons,
  };
};

export interface ENSEffectiveSystemType {
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

// Built-in alternatives the facts point to in a control (mp.info.6 backups): a proposal, never applied by itself.
export const proposedTemplates = (controlId: string, detection: ENSSystemDetection): string[] =>
  detection.addons.map(addon => addon.templateId).filter(id => Boolean(getBuiltinTemplate(controlId, id)));

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
