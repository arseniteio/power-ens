import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type {
  ENSAgentParameterValue,
  ENSConfigurationVersion,
  ENSLevel,
  ENSSystemType,
} from '../types';
import {
  ENS_SYSTEM_TYPES,
  ENS_SYSTEM_TYPE_LABELS,
} from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { ENS_CONFIGURATION_TEMPLATES, getConfigurationTemplate } from '../templates';
import {
  ENS_MANAGER_AGENT,
  getAgentLevelValue,
  isUnionParameter,
  resolveControlConfigurationWithOrigins,
} from '../agents/configuration-resolver';
import { getParameterClass } from '../agents/parameter-classes';
import {
  effectiveSystemType,
  suggestedTemplates,
} from '../agents/system-detection';
import {
  applyTemplateToAgent,
  getAgentCompleteness,
  removeTemplateFromAgent,
  setAgentParameterValue,
  setAgentTypeOverride,
} from '../agents/agent-configuration-actions';
import { getAgentControls } from '../agents/agent-controls';
import { validateAgentProfile } from '../agents/agent-configuration-validator';
import { saveActiveENSConfiguration } from '../services/configuration-state-service';

import { AgentParameterRow } from './agent-parameter-row';
import type { ENSSystemRow } from './systems-level';

interface AgentConfigurationPageProps {
  configuration: ENSConfigurationVersion;
  row: ENSSystemRow;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

const message = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : 'No se pudo guardar la configuración ENS.';

// Un sistema: su tipo (detectado y corregible), sus plantillas y, agrupados por
// control, sus parámetros por sistema y por plataforma con el origen de cada
// valor. Lo de organización no se ve aquí: se edita en «Organización».
export const AgentConfigurationPage = ({
  configuration,
  row,
  target,
  getActiveLevel,
  onNavigate,
  onConfigurationSaved,
}: AgentConfigurationPageProps) => {
  const agentId = row.id;
  const profile = configuration.agents?.[agentId];
  const effective = effectiveSystemType(row.detection, profile);
  const applied = profile?.templates || [];
  const proposed = suggestedTemplates(effective.type, row.detection).filter(id => !applied.includes(id));
  const controls = getAgentControls(configuration, agentId, effective.type, getActiveLevel);
  const completeness = getAgentCompleteness(
    configuration,
    agentId,
    controls.filter(control => control.measured).map(control => ({ controlId: control.controlId, level: control.level }))
  );
  const issues = profile ? validateAgentProfile(agentId, profile, configuration) : [];

  const [templateId, setTemplateId] = useState<string>(
    proposed[0] || ENS_CONFIGURATION_TEMPLATES.find(template => !applied.includes(template.id))?.id || ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const save = async (candidate: ENSConfigurationVersion, reason: string) => {
    setSaving(true);
    setError(undefined);
    try {
      await saveActiveENSConfiguration(candidate, reason);
      onConfigurationSaved();
    } catch (failure) {
      setError(message(failure));
    } finally {
      setSaving(false);
    }
  };

  const label = `${agentId}${row.agent.name ? ` · ${row.agent.name}` : ''}`;

  const applyTemplate = (id: string) => {
    const result = applyTemplateToAgent(configuration, agentId, id, row.agent, row.detection);
    if (result.error) {
      setError(result.error);
      return;
    }
    save(result.configuration, `Plantilla «${getConfigurationTemplate(id)?.label || id}» aplicada a ${label}.`);
  };

  const saveParameter = async (controlId: string, parameterId: string, value: ENSAgentParameterValue | undefined) => {
    const candidate = setAgentParameterValue(configuration, agentId, controlId, parameterId, value, row.agent, row.detection);
    await saveActiveENSConfiguration(
      candidate,
      value === undefined
        ? `${controlId} ${parameterId}: ${label} vuelve a heredar el valor.`
        : `${controlId} ${parameterId}: valor propio de ${label}.`
    );
    onConfigurationSaved();
  };

  const typeOptions = [
    {
      value: '',
      text: row.detection.type
        ? `El detectado: ${ENS_SYSTEM_TYPE_LABELS[row.detection.type]}`
        : 'Sin detectar (elegir uno)',
    },
    ...ENS_SYSTEM_TYPES.map(type => ({ value: type, text: ENS_SYSTEM_TYPE_LABELS[type] })),
  ];

  return (
    <EuiPanel paddingSize='l'>
      <EuiButton size='s' onClick={() => onNavigate({ view: 'systems' })}>
        Volver a sistemas
      </EuiButton>

      <EuiSpacer size='m' />

      <EuiTitle size='m'>
        <h2>{label}</h2>
      </EuiTitle>

      <EuiText size='s' color='subdued'>
        <p>
          {row.inScope ? 'En el alcance ENS.' : 'Fuera del alcance ENS: sus valores se conservan pero no se evalúan.'}
          {row.agent.os?.name ? ` ${row.agent.os.name}${row.agent.os.version ? ` ${row.agent.os.version}` : ''}.` : ''}
          {` ${completeness.withValue} de ${completeness.total} parámetros por sistema y por plataforma con valor, ${completeness.ownValues} propios.`}
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      {error && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='No se pudo guardar'>
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {issues.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='Valores de este sistema que no se pueden aplicar'>
            <ul>{issues.map(issue => <li key={issue.message}>{issue.message}</li>)}</ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='l' wrap>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFormRow label='Tipo de sistema' helpText={effective.description}>
            <EuiSelect
              options={typeOptions}
              value={profile?.typeOverride || ''}
              disabled={saving}
              onChange={event =>
                save(
                  setAgentTypeOverride(configuration, agentId, (event.target.value || undefined) as ENSSystemType | undefined, row.agent, row.detection),
                  event.target.value
                    ? `Tipo de ${label} corregido a mano: ${ENS_SYSTEM_TYPE_LABELS[event.target.value as ENSSystemType]}.`
                    : `Tipo de ${label}: vuelve al detectado.`
                )
              }
            />
          </EuiFormRow>
        </EuiFlexItem>

        <EuiFlexItem style={{ minWidth: 320 }}>
          <EuiFormRow label='Plantillas aplicadas (en orden: gana la primera que fija cada valor)'>
            <div>
              {applied.length ? (
                applied.map(id => (
                  <EuiBadge
                    key={id}
                    color='primary'
                    iconType='cross'
                    iconSide='right'
                    iconOnClick={() => save(removeTemplateFromAgent(configuration, agentId, id), `Plantilla «${getConfigurationTemplate(id)?.label || id}» quitada de ${label}.`)}
                    iconOnClickAriaLabel='Quitar la plantilla'
                  >
                    {getConfigurationTemplate(id)?.label || id}
                  </EuiBadge>
                ))
              ) : (
                <EuiText size='s' color='subdued'><p>Ninguna.</p></EuiText>
              )}
            </div>
          </EuiFormRow>
          <EuiFlexGroup gutterSize='s' responsive={false}>
            <EuiFlexItem>
              <EuiSelect
                compressed
                aria-label='Plantilla'
                options={ENS_CONFIGURATION_TEMPLATES.filter(template => !applied.includes(template.id)).map(template => ({
                  value: template.id,
                  text: `${template.label}${proposed.includes(template.id) ? ' (propuesta)' : ''}${template.kind === 'addon' ? ' · añadido' : ''}`,
                }))}
                value={templateId}
                onChange={event => setTemplateId(event.target.value)}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size='s' isLoading={saving} isDisabled={saving || applied.includes(templateId)} onClick={() => applyTemplate(templateId)}>
                Aplicar
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiText size='xs' color='subdued'>
            <p>
              {getConfigurationTemplate(templateId)?.description}
              {getConfigurationTemplate(templateId)?.onlyControls
                ? ` Solo ${getConfigurationTemplate(templateId)!.onlyControls!.join(', ')} tienen recolector en esta plataforma.`
                : ''}
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      {row.detection.addons.length > 0 && (
        <EuiText size='xs' color='subdued'>
          <p>Añadidos propuestos: {row.detection.addons.map(addon => `${getConfigurationTemplate(addon.templateId)?.label} (${addon.evidence})`).join('; ')}.</p>
        </EuiText>
      )}

      <EuiSpacer size='l' />

      <EuiTitle size='s'>
        <h3>Parámetros de este sistema, por control</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>
          Cada valor dice de dónde sale: propio del sistema, heredado de una
          plantilla o heredado de la organización. Al quitar un valor propio,
          el sistema vuelve a heredar.
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      {controls.map(control => {
        const resolved = resolveControlConfigurationWithOrigins(configuration, control.controlId, agentId);
        if (!resolved) return null;
        const parameters = resolved.configuration.parameters.filter(parameter => {
          const parameterClass = getParameterClass(control.controlId, parameter.id);
          return parameterClass === 'system' || parameterClass === 'platform';
        });
        const own = parameters.filter(parameter => resolved.origins[parameter.id]?.source === 'agent').length;
        const open = target.controlId === control.controlId;

        return (
          <React.Fragment key={control.controlId}>
            <EuiAccordion
              id={`ens-agent-${agentId}-${control.controlId}`}
              initialIsOpen={open}
              buttonContent={
                <span>
                  <strong>{control.controlId}</strong> · {control.controlName}{' '}
                  {own > 0 && <EuiBadge color='primary'>{own} propio(s)</EuiBadge>}
                  {!control.measured && <EuiBadge color='default'>{control.reason}</EuiBadge>}
                </span>
              }
              paddingSize='m'
            >
              {parameters.map(parameter => {
                const union = isUnionParameter(control.controlId, parameter.id, agentId);
                // En una unión se edita lo que aporta ESTE sistema, no la unión.
                const contribution = union ? getAgentLevelValue(profile, control.controlId, parameter.id) : undefined;
                const shown = union ? { ...parameter, value: contribution?.value } : parameter;
                const origin = union
                  ? contribution?.origin || { source: 'organisation' as const }
                  : resolved.origins[parameter.id] || { source: 'organisation' as const };
                return (
                  <AgentParameterRow
                    key={`${parameter.id}-${JSON.stringify(shown.value ?? null)}`}
                    agentId={agentId}
                    parameter={shown}
                    parameterClass={getParameterClass(control.controlId, parameter.id) as 'system' | 'platform'}
                    origin={origin}
                    contributionOnly={union}
                    unionNote={
                      union
                        ? agentId === ENS_MANAGER_AGENT || control.controlId === 'mp.info.6'
                          ? 'Se evalúa como UNIÓN: las filas de la organización más las de cada sistema. Aquí se declaran las de este sistema.'
                          : undefined
                        : !control.measured && control.reason?.startsWith('se mide en el manager')
                        ? 'Este control se mide en el manager: las filas de este sistema se juntan allí con las de los demás.'
                        : undefined
                    }
                    applicable={parameter.levels.includes(control.level)}
                    focused={open && target.parameterId === parameter.id}
                    onSave={value => saveParameter(control.controlId, parameter.id, value)}
                  />
                );
              })}
            </EuiAccordion>
            <EuiSpacer size='s' />
          </React.Fragment>
        );
      })}

      {target.controlId && !controls.some(control => control.controlId === target.controlId) && (
        <EuiCallOut color='warning' iconType='iInCircle' title={`${target.controlId} no tiene parámetros por sistema en esta configuración`}>
          <p>
            O el control no está añadido, o todos sus parámetros son de
            organización.{' '}
            <EuiButtonEmpty size='xs' onClick={() => onNavigate({ view: 'organisation', controlId: target.controlId, parameterId: target.parameterId })}>
              Abrirlo en Organización
            </EuiButtonEmpty>
          </p>
        </EuiCallOut>
      )}
    </EuiPanel>
  );
};
