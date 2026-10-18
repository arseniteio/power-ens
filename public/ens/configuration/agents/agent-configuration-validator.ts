// Validación de SIGNIFICADO de `configuration.agents`: la forma la comprueba
// `common/agent-configuration.ts` (y con ella el validador estructural); aquí
// se comprueba que lo que dice cada perfil exista y valga.
//
// La usan `config/validate-configuration.ts` (antes de sembrar), la pantalla
// (avisos) y las pruebas. NO la usa la hidratación: un valor mal escrito en un
// agente no puede impedir cargar el entorno ENS; en la evaluación, la
// validación del control de esa máquina lo da por inválido y degrada SU fila.
import type {
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlParameter,
} from '../types';
import { validateParameterValue } from '../services/parameter-value-validator';
import { getParameterClass } from './parameter-classes';
import {
  checkAgentsConfigurationKeys,
  describeNonIdAgentKey,
  isNormalisedAgentId,
  knownSystemType,
} from '../../../../common/agent-configuration';
import {
  getConfigurationTemplate,
  templateConflict,
} from '../templates';

export interface ENSAgentConfigurationIssue {
  agentId: string;
  controlId?: string;
  parameterId?: string;
  // `error`: algo que hay que corregir. `warning`: algo que esta versión no
  // conoce y se ignora (una versión posterior puede añadir campos).
  severity: 'error' | 'warning';
  // `huerfano`: un valor que no se aplica (el perfil no es de un id, el
  // control o el parámetro no existen, o es de organización); se quita con
  // «Quitar». `valor`: un valor que sí se aplica y no es válido: esa máquina
  // se evalúa con una configuración inválida. `plantilla`: una plantilla
  // desconocida o incompatible. `desconocido`: una clave de otra versión.
  kind: 'huerfano' | 'valor' | 'plantilla' | 'desconocido';
  message: string;
}

export const validateAgentProfile = (
  agentId: string,
  profile: ENSAgentProfile,
  configuration: Pick<ENSConfigurationVersion, 'controls'>
): ENSAgentConfigurationIssue[] => {
  const issues: ENSAgentConfigurationIssue[] = [];
  const error = (kind: ENSAgentConfigurationIssue['kind'], message: string, controlId?: string, parameterId?: string) =>
    issues.push({ agentId, controlId, parameterId, severity: 'error', kind, message });

  if (!isNormalisedAgentId(agentId)) {
    error('huerfano', `${describeNonIdAgentKey(agentId)}: sus valores no se aplican a ninguna máquina`);
  }

  const templates = Array.isArray(profile.templates) ? profile.templates : [];

  templates.forEach((templateId, index) => {
    if (!getConfigurationTemplate(templateId)) {
      error('plantilla', `la plantilla «${templateId}» no existe en esta versión del plugin`);
      return;
    }

    const conflict = templateConflict(templateId, templates.slice(0, index));

    if (conflict) {
      error('plantilla', conflict);
    }
  });

  Object.entries(profile.controls || {}).forEach(([controlId, overrides]) => {
    const control = configuration.controls.find(item => item.controlId === controlId);
    const values = overrides?.parameters || {};

    if (!control) {
      if (Object.keys(values).length) {
        error(
          'huerfano',
          `${controlId} no está en la configuración: sus ${Object.keys(values).length} valor(es) no se aplican (se quitan, o se añade antes el control)`,
          controlId
        );
      }
      return;
    }

    Object.entries(values).forEach(([parameterId, value]) => {
      const parameter: ENSControlParameter | undefined = control.parameters.find(item => item.id === parameterId);

      if (!parameter) {
        error('huerfano', `${controlId} no declara el parámetro ${parameterId}: el valor no se aplica`, controlId, parameterId);
        return;
      }

      const parameterClass = getParameterClass(controlId, parameterId);

      if (parameterClass !== 'system' && parameterClass !== 'platform') {
        error(
          'huerfano',
          `${controlId} ${parameterId} es un parámetro de organización: vale para todas las máquinas, no admite valor por agente y este no se aplica`,
          controlId,
          parameterId
        );
        return;
      }

      const verdict = validateParameterValue(parameter, value);

      if (!verdict.valid) {
        error(
          'valor',
          `${controlId} ${parameterId} (${parameter.label}) ${verdict.reason || 'tiene un valor inválido'}: esta máquina se evalúa con una configuración inválida`,
          controlId,
          parameterId
        );
      }
    });
  });

  return issues;
};

export const validateAgentsConfiguration = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents'>
): ENSAgentConfigurationIssue[] => {
  const agents = configuration.agents && typeof configuration.agents === 'object' ? configuration.agents : {};
  const warnings = checkAgentsConfigurationKeys(agents).warnings.map(message => ({
    agentId: message.split(':')[0].replace(/^configuration\.agents\./, '').split('.')[0],
    severity: 'warning' as const,
    kind: 'desconocido' as const,
    message,
  }));

  return [
    ...Object.entries(agents).flatMap(([agentId, profile]) =>
      validateAgentProfile(agentId, (profile || {}) as ENSAgentProfile, configuration)
    ),
    ...warnings,
  ];
};

export interface ENSAgentConfigurationSummary {
  agentId: string;
  name?: string;
  type?: string;
  typeSource: 'manual' | 'detectado' | 'sin tipo';
  templates: string[];
  ownValues: number;
}

// Una línea por agente: tipo (y de dónde sale), plantillas y valores propios.
export const summarizeAgentsConfiguration = (
  configuration: Pick<ENSConfigurationVersion, 'agents'>
): ENSAgentConfigurationSummary[] =>
  Object.entries(configuration.agents || {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([agentId, profile]) => ({
      agentId,
      name: profile?.name,
      type: knownSystemType(profile?.typeOverride) || knownSystemType(profile?.detectedType),
      typeSource: knownSystemType(profile?.typeOverride) ? 'manual' : knownSystemType(profile?.detectedType) ? 'detectado' : 'sin tipo',
      templates: profile?.templates || [],
      ownValues: Object.values(profile?.controls || {}).reduce(
        (total, control) => total + Object.keys(control?.parameters || {}).length,
        0
      ),
    }));
