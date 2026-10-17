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
  getConfigurationTemplate,
  templateConflict,
} from '../templates';

export interface ENSAgentConfigurationIssue {
  agentId: string;
  controlId?: string;
  parameterId?: string;
  message: string;
}

export const validateAgentProfile = (
  agentId: string,
  profile: ENSAgentProfile,
  configuration: Pick<ENSConfigurationVersion, 'controls'>
): ENSAgentConfigurationIssue[] => {
  const issues: ENSAgentConfigurationIssue[] = [];
  const templates = profile.templates || [];

  templates.forEach((templateId, index) => {
    if (!getConfigurationTemplate(templateId)) {
      issues.push({ agentId, message: `la plantilla «${templateId}» no existe en esta versión del plugin` });
      return;
    }

    const conflict = templateConflict(templateId, templates.slice(0, index));

    if (conflict) {
      issues.push({ agentId, message: conflict });
    }
  });

  Object.entries(profile.controls || {}).forEach(([controlId, overrides]) => {
    const control = configuration.controls.find(item => item.controlId === controlId);

    if (!control) {
      issues.push({
        agentId,
        controlId,
        message: `${controlId} no está en la configuración: se añade antes («Añadir con valores por defecto» o inject-control.py)`,
      });
      return;
    }

    Object.entries(overrides?.parameters || {}).forEach(([parameterId, value]) => {
      const parameter: ENSControlParameter | undefined = control.parameters.find(item => item.id === parameterId);

      if (!parameter) {
        issues.push({
          agentId,
          controlId,
          parameterId,
          message: `${controlId} no declara el parámetro ${parameterId}`,
        });
        return;
      }

      const parameterClass = getParameterClass(controlId, parameterId);

      if (parameterClass !== 'system' && parameterClass !== 'platform') {
        issues.push({
          agentId,
          controlId,
          parameterId,
          message: `${controlId} ${parameterId} es un parámetro de organización: vale para todas las máquinas y no admite valor por agente`,
        });
        return;
      }

      const verdict = validateParameterValue(parameter, value);

      if (!verdict.valid) {
        issues.push({
          agentId,
          controlId,
          parameterId,
          message: `${controlId} ${parameterId} (${parameter.label}) ${verdict.reason || 'tiene un valor inválido'}`,
        });
      }
    });
  });

  return issues;
};

export const validateAgentsConfiguration = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents'>
): ENSAgentConfigurationIssue[] =>
  Object.entries(configuration.agents || {}).flatMap(([agentId, profile]) =>
    validateAgentProfile(agentId, profile || {}, configuration)
  );

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
      type: profile?.typeOverride || profile?.detectedType,
      typeSource: profile?.typeOverride ? 'manual' : profile?.detectedType ? 'detectado' : 'sin tipo',
      templates: profile?.templates || [],
      ownValues: Object.values(profile?.controls || {}).reduce(
        (total, control) => total + Object.keys(control?.parameters || {}).length,
        0
      ),
    }));
