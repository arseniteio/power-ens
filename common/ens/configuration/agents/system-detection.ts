// Detección del tipo de sistema de cada agente. Pura: recibe lo que el
// inventario (`wazuh-monitoring`) y los hechos (una agregación de 30 días) dicen
// de la máquina y devuelve el tipo con su EVIDENCIA, para que la pantalla diga
// «detectado por …» y el responsable pueda corregirlo.
//
// Orden (la primera regla que acierta da el tipo):
//   1. id 000                                 → Manager
//   2. os.platform = windows                  → Windows
//   3. hechos con data.plano = directorio     → LDAP (Zimbra)
//      (un servidor LDAP es un Ubuntu más en el inventario: solo lo delatan
//      los hechos de su recolector; recién instalado y sin hechos, sale Linux
//      y se corrige a mano)
//   4. os.platform de la familia Linux, u os.uname que empieza por «Linux»
//                                             → Linux
//   5. sin os                                  → sin detectar
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
  // «detectado por …», en una frase.
  evidence: string;
  // Añadidos que proponen los hechos, con su evidencia.
  addons: { templateId: string; evidence: string }[];
}

const LINUX_PLATFORMS = [
  'ubuntu', 'debian', 'centos', 'rhel', 'redhat', 'rocky', 'almalinux', 'sles',
  'opensuse', 'opensuse-leap', 'opensuse-tumbleweed', 'fedora', 'amzn', 'ol',
  'arch', 'linux',
];

const miles = (n: number): string => n.toLocaleString('es-ES');

// `data.plano` puede venir compuesto (`sistema,directorio`, `sistema+directorio`).
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
    addons.push({ templateId: 'pbs-backup', evidence: `${miles(origins.pbs)} datos de copias con PBS en 30 días` });
  }

  if (origins['zimbra-ne']) {
    addons.push({ templateId: 'zimbra-ne-backup', evidence: `${miles(origins['zimbra-ne'])} datos de copias con Zimbra NE en 30 días` });
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
      evidence: `${miles(directory)} datos del directorio LDAP en 30 días`,
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
  // «detectado por …» o «corregido a mano (detectado: …)».
  description: string;
}

export const effectiveSystemType = (
  detection: ENSSystemDetection,
  profile?: ENSAgentProfile
): ENSEffectiveSystemType => {
  // Sin datos vivos, el tipo detectado que se guardó la última vez.
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

// El nombre de la máquina en `os.uname` («Linux |host.dominio |…»).
export const hostnameFromUname = (uname?: string): string | undefined => {
  const parts = String(uname || '').split('|').map(part => part.trim());
  return /^linux$/i.test(parts[0] || '') && parts[1] ? parts[1] : undefined;
};

// Los nombres por los que se conoce a una máquina en las tablas de la
// configuración: el id, el nombre del agente, el hostname de `os.uname`, la
// parte corta de los dos (antes del primer punto) y los alias guardados en su
// perfil. En minúsculas y sin repetir. La misma máquina aparece hoy con su
// nombre de agente, su hostname completo y su hostname corto.
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
