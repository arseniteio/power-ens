// Spanish labels for codes the configuration screen must never show raw (owner: «comprensible»).
import type {
  ENSAgentProfile,
  ENSConfigurationLifecycleStatus,
  ENSConfigurationScopeMode,
  ENSConfigurationVersion,
} from '../../../../common/ens/configuration/types';
import { ENS_SYSTEM_TYPE_LABELS, knownSystemType } from '../../../../common/agent-configuration';
import type { ENSSystemDetection } from '../../../../common/ens/configuration/agents/system-detection';

interface ENSAgentTypeLabel {
  text: string;
  color: 'hollow' | 'accent' | 'warning';
  // The type the built-in template follows is stored in the profile.
  stored: boolean;
  // A detected type waits to be stored; without one there is nothing to save.
  pending: boolean;
}

export const agentTypeLabel = (
  profile: ENSAgentProfile | undefined,
  detection: ENSSystemDetection,
  loading = false
): ENSAgentTypeLabel => {
  const manual = knownSystemType(profile?.typeOverride);
  if (manual) return { text: `${ENS_SYSTEM_TYPE_LABELS[manual]} (corregido a mano)`, color: 'accent', stored: true, pending: false };
  if (detection.type) return { text: ENS_SYSTEM_TYPE_LABELS[detection.type], color: 'hollow', stored: true, pending: false };
  const stored = knownSystemType(profile?.detectedType);
  if (stored) return { text: ENS_SYSTEM_TYPE_LABELS[stored], color: 'hollow', stored: true, pending: false };
  return { text: loading ? 'Detectando…' : 'Sin detectar', color: 'warning', stored: false, pending: false };
};

const MODES: Record<ENSConfigurationScopeMode, string> = {
  global: 'Todos los agentes del inventario',
  agent: 'Los agentes de la lista',
  group: 'Los agentes de los grupos',
};

export const scopeModeLabel = (mode: ENSConfigurationScopeMode): string => MODES[mode] || mode;

const LIFECYCLE: Record<ENSConfigurationLifecycleStatus, string> = {
  DRAFT: 'Borrador',
  CONFIGURED: 'Configurada',
  INCOMPLETE: 'Incompleta',
  INVALID: 'Inválida',
  ACTIVE: 'Activa',
  ARCHIVED: 'Archivada',
};

export const lifecycleLabel = (status: ENSConfigurationLifecycleStatus): string => LIFECYCLE[status] || status;

const AGENT_STATUS: Record<string, string> = {
  active: 'Conectado',
  disconnected: 'Desconectado',
  pending: 'Pendiente',
  never_connected: 'Nunca conectado',
};

export const agentStatusLabel = (status?: string): string => (status ? AGENT_STATUS[status] || status : '—');

// «op.acc.1 P-07» as the parameter's name; with `withControl`, prefixed by the control id.
export const parameterLabel = (
  configuration: Pick<ENSConfigurationVersion, 'controls'>,
  key: string,
  withControl = true
): string => {
  const [controlId, parameterId] = key.split(' ');
  const label = configuration.controls.find(control => control.controlId === controlId)?.parameters.find(parameter => parameter.id === parameterId)?.label;
  const name = label ? `«${label}»` : parameterId;
  return withControl ? `${controlId} ${name}` : name;
};

export const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
