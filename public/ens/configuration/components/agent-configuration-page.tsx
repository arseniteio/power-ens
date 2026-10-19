import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiLoadingSpinner,
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
} from '../../../../common/ens/configuration/types';
import {
  ENS_SYSTEM_TYPES,
  ENS_SYSTEM_TYPE_LABELS,
} from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { parseConfigurationBack } from '../../../routing/configuration-link';
import { useRouterSearch } from '../../../routing/use-router-search';
import { ENS_CONFIGURATION_TEMPLATES, getConfigurationTemplate } from '../../../../common/ens/configuration/templates';
import {
  ENS_MANAGER_AGENT,
  getAgentLevelValue,
  isUnionParameter,
  resolveControlConfigurationWithOrigins,
} from '../../../../common/ens/configuration/agents/configuration-resolver';
import { getParameterClass } from '../../../../common/ens/configuration/agents/parameter-classes';
import { effectiveSystemType, suggestedTemplates } from '../../../../common/ens/configuration/agents/system-detection';
import {
  ENSTemplatePreview,
  applyTemplateToAgent,
  describeAgentValueSave,
  getAgentCompleteness,
  previewTemplateApplication,
  previewTemplateRemoval,
  removeAgentEntry,
  removeTemplateFromAgent,
  setAgentAliases,
  setAgentParameterValue,
  setAgentTypeOverride,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { getAgentControls } from '../../../../common/ens/configuration/agents/agent-controls';
import { validateAgentProfile } from '../../../../common/ens/configuration/agents/agent-configuration-validator';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';

import { AgentParameterRow, valueRows } from './agent-parameter-row';
import { errorMessage } from './confirm-modal';
import { TemplatePreviewModal } from './template-preview-modal';
import { ENSEntryRemoval, RemoveEntryModal } from './remove-entry-modal';
import type { ENSSystemRow } from './systems-level';

interface AgentConfigurationPageProps {
  configuration: ENSConfigurationVersion;
  row: ENSSystemRow;
  // El agente existe (en el alcance, en el inventario o con perfil guardado).
  known: boolean;
  loading: boolean;
  detectionErrors: string[];
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

// ¿Se declara en cada sistema solo su APORTACIÓN? Los parámetros por sistema
// de un control que se mide en el manager describen otras máquinas y se
// juntan en la fila del manager; el alcance declarado se junta siempre.
const isContribution = (controlId: string, parameterId: string): boolean => {
  const control = getENSCatalogControl(controlId);
  if (control?.scopeParameter === parameterId) return true;
  return getParameterClass(controlId, parameterId) === 'system' && (control?.measurementPlanes || []).includes('manager');
};

// Un sistema: su tipo (detectado y corregible), sus otros nombres, sus
// plantillas y, agrupados por control, sus parámetros por sistema y por
// plataforma con el origen de cada valor. Lo de organización se edita en
// «Organización».
export const AgentConfigurationPage = ({
  configuration,
  row,
  known,
  loading,
  detectionErrors,
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
  const available = ENS_CONFIGURATION_TEMPLATES.filter(template => !applied.includes(template.id));
  const controls = getAgentControls(configuration, agentId, effective.type, getActiveLevel);
  const completeness = getAgentCompleteness(
    configuration,
    agentId,
    controls.filter(control => control.measured).map(control => ({ controlId: control.controlId, level: control.level }))
  );
  const issues = profile ? validateAgentProfile(agentId, profile, configuration) : [];
  const orphans = issues.filter(issue => issue.kind === 'huerfano');
  const otherIssues = issues.filter(issue => issue.kind !== 'huerfano');

  // La plantilla elegida a mano; sin elegir, la propuesta para el tipo efectivo
  // de AHORA (que cambia cuando llega la detección por hechos).
  const [chosen, setChosen] = useState<string | undefined>();
  const selected = chosen && available.some(template => template.id === chosen)
    ? chosen
    : proposed[0] || available[0]?.id || '';
  const [preview, setPreview] = useState<ENSTemplatePreview[] | undefined>();
  // Quitar una plantilla pasa por la misma vista previa que aplicarla.
  const [removalPreview, setRemovalPreview] = useState<ENSTemplatePreview | undefined>();
  // Quitar un control entero que no se aplica: primero, lo que se pierde.
  const [entryRemoval, setEntryRemoval] = useState<ENSEntryRemoval | undefined>();
  const [aliasesText, setAliasesText] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const label = `${agentId}${row.agent.name ? ` · ${row.agent.name}` : ''}`;
  const aliasesValue = aliasesText ?? (profile?.aliases || []).join(', ');

  const save = async (
    build: (latest: ENSConfigurationVersion) => ENSConfigurationVersion,
    reason: string
  ): Promise<string | undefined> => {
    setSaving(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: build(latest), reason }));
      onConfigurationSaved();
      return undefined;
    } catch (failure) {
      const text = errorMessage(failure);
      setError(text);
      return text;
    } finally {
      setSaving(false);
    }
  };

  const openPreview = () => {
    if (!selected) return;
    setPreview([previewTemplateApplication(configuration, agentId, selected, effective.type, row.agent, row.detection)]);
  };

  const applyPreview = async () => {
    const id = selected;
    const failure = await save(latest => {
      const result = applyTemplateToAgent(latest, agentId, id, row.agent, row.detection);
      if (result.error) throw new Error(result.error);
      return result.configuration;
    }, `Plantilla «${getConfigurationTemplate(id)?.label || id}» aplicada a ${label}.`);
    if (!failure) {
      setPreview(undefined);
      setChosen(undefined);
    }
    return failure;
  };

  const confirmTemplateRemoval = async () => {
    if (!removalPreview) return undefined;
    const id = removalPreview.templateId;
    const failure = await save(
      latest => removeTemplateFromAgent(latest, agentId, id),
      `Plantilla «${getConfigurationTemplate(id)?.label || id}» quitada de ${label}.`
    );
    if (!failure) setRemovalPreview(undefined);
    return failure;
  };

  const removeOrphan = (controlId?: string, parameterId?: string) =>
    save(
      latest => removeAgentEntry(latest, agentId, controlId, parameterId),
      `Quitado de ${label} un valor que no se aplicaba (${controlId || ''}${parameterId ? ` ${parameterId}` : ''}).`
    );

  const confirmEntryRemoval = async () => {
    if (!entryRemoval) return undefined;
    const failure = await removeOrphan(entryRemoval.controlId);
    if (!failure) setEntryRemoval(undefined);
    return failure;
  };

  const saveParameter = async (controlId: string, parameterId: string, value: ENSAgentParameterValue | undefined) => {
    const mode = describeAgentValueSave(configuration, agentId, controlId, parameterId, value);
    const failure = await save(
      latest => setAgentParameterValue(latest, agentId, controlId, parameterId, value, row.agent, row.detection),
      mode === 'propio'
        ? `${controlId} ${parameterId}: valor propio de ${label}.`
        : `${controlId} ${parameterId}: ${label} vuelve a heredar el valor.`
    );
    if (failure) throw new Error(failure);
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

  const vieneDelDetalle = Boolean(parseConfigurationBack(useRouterSearch()));

  return (
    <EuiPanel paddingSize='l'>
      {/* Abierta desde el Detalle del control, la única vuelta es «Volver al
          detalle de …», arriba. */}
      {!vieneDelDetalle && (
        <>
          <EuiButton size='s' onClick={() => onNavigate({ view: 'systems' })}>
            Volver a sistemas
          </EuiButton>

          <EuiSpacer size='m' />
        </>
      )}

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

      {loading && (
        <EuiText size='s' color='subdued'>
          <p><EuiLoadingSpinner size='s' /> Detectando el tipo de sistema (inventario y hechos)…</p>
        </EuiText>
      )}

      {!known && !profile && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut color='warning' iconType='alert' size='s' title={`No hay ningún agente ${agentId} en el inventario ni en la configuración`}>
            <p>Lo que se guarde aquí crea un perfil para un id que no es ninguna máquina conocida.</p>
          </EuiCallOut>
        </>
      )}

      {detectionErrors.map(text => (
        <React.Fragment key={text}>
          <EuiSpacer size='s' />
          <EuiCallOut color='warning' iconType='alert' size='s' title='Detección incompleta'>
            <p>{text}</p>
          </EuiCallOut>
        </React.Fragment>
      ))}

      <EuiSpacer size='m' />

      {error && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='No se pudo guardar'>
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {orphans.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='Valores de este sistema que no se aplican'>
            <ul>
              {orphans.map((issue, index) => (
                <li key={`${index}-${issue.controlId}-${issue.parameterId}`}>
                  {issue.message}{' '}
                  <EuiButtonEmpty
                    size='xs'
                    color='danger'
                    isDisabled={saving}
                    onClick={() =>
                      issue.parameterId
                        ? removeOrphan(issue.controlId, issue.parameterId)
                        : setEntryRemoval({ agentKey: agentId, controlId: issue.controlId })
                    }
                  >
                    Quitar
                  </EuiButtonEmpty>
                </li>
              ))}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {otherIssues.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='Valores de este sistema que hay que corregir'>
            <ul>{otherIssues.map((issue, index) => <li key={`${index}-${issue.message}`}>{issue.message}</li>)}</ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='l' wrap>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFormRow label='Tipo de sistema' helpText={loading && !effective.manual ? 'detectando…' : effective.description}>
            <EuiSelect
              options={typeOptions}
              value={profile?.typeOverride || ''}
              disabled={saving}
              onChange={event => {
                const type = (event.target.value || undefined) as ENSSystemType | undefined;
                save(
                  latest => setAgentTypeOverride(latest, agentId, type, row.agent, row.detection),
                  type
                    ? `Tipo de ${label} corregido a mano: ${ENS_SYSTEM_TYPE_LABELS[type]}.`
                    : `Tipo de ${label}: vuelve al detectado.`
                );
              }}
            />
          </EuiFormRow>

          <EuiFormRow
            label='Otros nombres de esta máquina'
            helpText='Separados por comas. La migración a sistemas reconoce por ellos las filas que nombran a esta máquina (además del id, el nombre del agente y su hostname).'
          >
            <EuiFieldText
              value={aliasesValue}
              disabled={saving}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAliasesText(event.target.value)}
            />
          </EuiFormRow>
          <EuiButton
            size='s'
            isDisabled={saving || aliasesText === undefined}
            onClick={async () => {
              const aliases = (aliasesText || '').split(',').map(alias => alias.trim()).filter(Boolean);
              const failure = await save(
                latest => setAgentAliases(latest, agentId, aliases, row.agent, row.detection),
                `Otros nombres de ${label}: ${aliases.join(', ') || 'ninguno'}.`
              );
              if (!failure) setAliasesText(undefined);
            }}
          >
            Guardar otros nombres
          </EuiButton>
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
                    iconOnClick={() => setRemovalPreview(previewTemplateRemoval(configuration, agentId, id))}
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
                options={available.map(template => {
                  const replaces = template.kind === 'base'
                    ? applied.map(id => getConfigurationTemplate(id)).find(other => other?.kind === 'base')
                    : undefined;
                  return {
                    value: template.id,
                    text: `${template.label}${proposed.includes(template.id) ? ' (propuesta)' : ''}${template.kind === 'addon' ? ' · añadido' : ''}${replaces ? ` (sustituye a «${replaces.label}»)` : ''}`,
                  };
                })}
                value={selected}
                onChange={event => setChosen(event.target.value)}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size='s' isLoading={saving} isDisabled={saving || !selected} onClick={openPreview}>
                Aplicar…
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiText size='xs' color='subdued'>
            <p>
              {getConfigurationTemplate(selected)?.description}
              {getConfigurationTemplate(selected)?.onlyControls
                ? ` Solo ${getConfigurationTemplate(selected)!.onlyControls!.join(', ')} tienen recolector en esta plataforma.`
                : ''}
            </p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      {preview && (
        <TemplatePreviewModal
          label={getConfigurationTemplate(selected)?.label || selected}
          previews={preview}
          onCancel={() => setPreview(undefined)}
          onConfirm={applyPreview}
        />
      )}

      {removalPreview && (
        <TemplatePreviewModal
          mode='remove'
          label={removalPreview.label}
          previews={[removalPreview]}
          onCancel={() => setRemovalPreview(undefined)}
          onConfirm={confirmTemplateRemoval}
        />
      )}

      {entryRemoval && (
        <RemoveEntryModal
          configuration={configuration}
          removal={entryRemoval}
          onCancel={() => setEntryRemoval(undefined)}
          onConfirm={confirmEntryRemoval}
        />
      )}

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
        const organisation = configuration.controls.find(item => item.controlId === control.controlId);
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
                const contribution = isContribution(control.controlId, parameter.id);
                // En una aportación se edita lo de ESTE sistema; lo de la
                // organización se enseña aparte y no se copia al editar.
                const agentLevel = contribution ? getAgentLevelValue(profile, control.controlId, parameter.id) : undefined;
                const shown = contribution ? { ...parameter, value: agentLevel?.value } : parameter;
                const origin = contribution
                  ? agentLevel?.origin || { source: 'organisation' as const }
                  : resolved.origins[parameter.id] || { source: 'organisation' as const };
                const orgValue = organisation?.parameters.find(item => item.id === parameter.id)?.value;
                const union = isUnionParameter(control.controlId, parameter.id, agentId);
                return (
                  <AgentParameterRow
                    key={parameter.id}
                    agentId={agentId}
                    parameter={shown}
                    parameterClass={getParameterClass(control.controlId, parameter.id) as 'system' | 'platform'}
                    origin={origin}
                    contributionOnly={contribution}
                    organisationRows={contribution ? valueRows(parameter, orgValue) : undefined}
                    effectiveRows={union && (agentId === ENS_MANAGER_AGENT || control.controlId === 'mp.info.6') ? valueRows(parameter, parameter.value) : undefined}
                    note={
                      contribution
                        ? 'Este parámetro describe máquinas: en la fila del manager (y, para el alcance de mp.info.6, en todas) se evalúan juntas las filas de la organización y las de cada sistema. Aquí se declaran solo las de este sistema.'
                        : undefined
                    }
                    applicable={parameter.levels.includes(control.level)}
                    focused={open && target.parameterId === parameter.id}
                    describeSave={value => describeAgentValueSave(configuration, agentId, control.controlId, parameter.id, value)}
                    onSave={value => saveParameter(control.controlId, parameter.id, value)}
                    onDone={
                      open && target.parameterId === parameter.id
                        ? () => onNavigate({ view: 'systems', agentId, controlId: control.controlId })
                        : undefined
                    }
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
