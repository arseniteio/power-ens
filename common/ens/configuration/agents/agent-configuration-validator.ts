// Meaning of `configuration.agents` and `configuration.templates`; the fatal shape is checked in
// `common/agent-configuration.ts`. Never used on hydration: a bad value degrades its own row, not the whole environment.
import type {
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlConfiguration,
} from '../types';
import { validateParameterValue } from '../services/parameter-value-validator';
import { getParameterClass } from './parameter-classes';
import {
  ENS_NO_TEMPLATE,
  checkAgentsConfigurationKeys,
  checkCustomTemplatesKeys,
  describeNonIdAgentKey,
  isNormalisedAgentId,
  knownSystemType,
} from '../../../agent-configuration';
import {
  findControlTemplate,
  getCustomTemplates,
  hasTemplateParameters,
  isReservedTemplateId,
} from '../templates';

export interface ENSAgentConfigurationIssue {
  agentId: string;
  controlId?: string;
  parameterId?: string;
  // `error`: to be fixed. `warning`: unknown to this version, or converted on load; ignored.
  severity: 'error' | 'warning';
  // `huerfano`: not applied, removable. `valor`: applied but invalid. `plantilla`: unknown assignment or 1.2.0
  // templates. `desconocido`: a key from another version.
  kind: 'huerfano' | 'valor' | 'plantilla' | 'desconocido';
  message: string;
}

export interface ENSTemplateIssue {
  templateId: string;
  controlId?: string;
  parameterId?: string;
  severity: 'error' | 'warning';
  message: string;
}

// Problems of one value for a control parameter: undefined if it is applied and valid.
export const describeAgentLevelValueIssue = (
  control: ENSControlConfiguration,
  parameterId: string,
  value: ENSAgentParameterValue
): { kind: 'huerfano' | 'valor'; message: string } | undefined => {
  const parameter = control.parameters.find(item => item.id === parameterId);

  if (!parameter) {
    return { kind: 'huerfano', message: `${control.controlId} no declara el parámetro ${parameterId}: el valor no se aplica` };
  }

  const parameterClass = getParameterClass(control.controlId, parameterId);

  if (parameterClass !== 'system' && parameterClass !== 'platform') {
    return {
      kind: 'huerfano',
      message: `${control.controlId} ${parameterId} es un ajuste común del control: no admite valor por agente ni por plantilla y este no se aplica`,
    };
  }

  const verdict = validateParameterValue(parameter, value);

  return verdict.valid
    ? undefined
    : { kind: 'valor', message: `${control.controlId} ${parameterId} (${parameter.label}) ${verdict.reason || 'tiene un valor inválido'}` };
};

export const validateAgentProfile = (
  agentId: string,
  profile: ENSAgentProfile,
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'templates'>
): ENSAgentConfigurationIssue[] => {
  const issues: ENSAgentConfigurationIssue[] = [];
  const add = (
    severity: ENSAgentConfigurationIssue['severity'],
    kind: ENSAgentConfigurationIssue['kind'],
    message: string,
    controlId?: string,
    parameterId?: string
  ) => issues.push({ agentId, controlId, parameterId, severity, kind, message });

  if (!isNormalisedAgentId(agentId)) {
    add('error', 'huerfano', `${describeNonIdAgentKey(agentId)}: sus valores no se aplican a ninguna máquina`);
  }

  if (Array.isArray(profile.templates) && profile.templates.length) {
    add('warning', 'plantilla', `plantillas de la 1.2.0 (${profile.templates.join(', ')}): se convierten en asignaciones por control al cargar`);
  }

  Object.entries(profile.controls || {}).forEach(([controlId, entry]) => {
    const control = configuration.controls.find(item => item.controlId === controlId);
    const values = entry?.parameters || {};
    const templateId = entry?.templateId;

    // An assignment alone on a control not yet added is harmless: it applies once the control is added.
    if (!control) {
      if (Object.keys(values).length) {
        add(
          'error',
          'huerfano',
          `${controlId} no está en la configuración: sus ${Object.keys(values).length} ajuste(s) propio(s) no se aplican (se quitan, o se añade antes el control)`,
          controlId
        );
      }
      return;
    }

    if (templateId && templateId !== ENS_NO_TEMPLATE && !findControlTemplate(configuration, controlId, templateId)) {
      add('error', 'plantilla', `${controlId}: la plantilla asignada «${templateId}» no existe; se aplica la de serie de su tipo`, controlId);
    }

    Object.entries(values).forEach(([parameterId, value]) => {
      const issue = describeAgentLevelValueIssue(control, parameterId, value);
      if (issue) {
        add(
          'error',
          issue.kind,
          issue.kind === 'valor' ? `${issue.message}: esta máquina se evalúa con una configuración inválida` : issue.message,
          controlId,
          parameterId
        );
      }
    });
  });

  return issues;
};

export const validateAgentsConfiguration = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'agents' | 'templates'>
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

export const validateCustomTemplates = (
  configuration: Pick<ENSConfigurationVersion, 'controls' | 'templates'>
): ENSTemplateIssue[] => {
  const issues: ENSTemplateIssue[] = [];
  const seen = new Set<string>();
  const names = new Set<string>();

  getCustomTemplates(configuration).forEach(template => {
    const add = (severity: ENSTemplateIssue['severity'], message: string, parameterId?: string) =>
      issues.push({ templateId: template.id, controlId: template.controlId, parameterId, severity, message });

    if (isReservedTemplateId(template.id)) {
      add('error', `el id «${template.id}» es de una plantilla de serie: la propia no se aplica`);
    }
    if (seen.has(template.id)) {
      add('error', `el id «${template.id}» está repetido: solo se aplica la primera plantilla con ese id`);
    }
    seen.add(template.id);

    const nameKey = `${template.controlId}|${template.name.trim().toLowerCase()}`;
    if (names.has(nameKey)) {
      add('warning', `${template.controlId}: hay otra plantilla llamada «${template.name}»`);
    }
    names.add(nameKey);

    const control = configuration.controls.find(item => item.controlId === template.controlId);
    if (!control) {
      add('error', `${template.controlId} no está en la configuración: la plantilla «${template.name}» no se aplica`);
      return;
    }
    if (!hasTemplateParameters(template.controlId)) {
      add('error', `${template.controlId} solo tiene ajustes comunes: la plantilla «${template.name}» no se aplica`);
      return;
    }

    Object.entries(template.values).forEach(([parameterId, value]) => {
      const issue = describeAgentLevelValueIssue(control, parameterId, value);
      if (issue) add('error', `plantilla «${template.name}»: ${issue.message}`, parameterId);
    });
  });

  checkCustomTemplatesKeys(configuration.templates).forEach(message =>
    issues.push({ templateId: '', severity: 'warning', message })
  );

  return issues;
};

export interface ENSAgentConfigurationSummary {
  agentId: string;
  name?: string;
  type?: string;
  typeSource: 'manual' | 'detectado' | 'sin tipo';
  assignments: Record<string, string>;
  ownValues: number;
}

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
      assignments: Object.fromEntries(
        Object.entries(profile?.controls || {})
          .filter(([, entry]) => typeof entry?.templateId === 'string')
          .map(([controlId, entry]) => [controlId, entry!.templateId as string])
      ),
      ownValues: Object.values(profile?.controls || {}).reduce(
        (total, control) => total + Object.keys(control?.parameters || {}).length,
        0
      ),
    }));
