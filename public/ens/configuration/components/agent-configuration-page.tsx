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
  ENS_NO_TEMPLATE,
  ENS_SYSTEM_TYPES,
  ENS_SYSTEM_TYPE_LABELS,
} from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { parseConfigurationBack } from '../../../routing/configuration-link';
import { useRouterSearch } from '../../../routing/use-router-search';
import { getControlTemplates, getTypeDefaultTemplate } from '../../../../common/ens/configuration/templates';
import {
  ENS_MANAGER_AGENT,
  getAgentLevelValue,
  getAgentSystemType,
  getEffectiveTemplate,
  isUnionParameter,
  resolveControlConfigurationWithOrigins,
} from '../../../../common/ens/configuration/agents/configuration-resolver';
import { getParameterClass } from '../../../../common/ens/configuration/agents/parameter-classes';
import { effectiveSystemType, proposedTemplates } from '../../../../common/ens/configuration/agents/system-detection';
import {
  ENSAgentChangePreview,
  ENSAssignmentPreview,
  clearAgentControlOverrides,
  describeAgentEntryRemoval,
  describeAgentValueSave,
  describeTemplateChoice,
  getAgentCompleteness,
  pendingDetectedTypes,
  previewConfigurationChange,
  previewControlAssignment,
  removeAgentEntry,
  saveDetectedTypes,
  setAgentAliases,
  setAgentParameterValue,
  setAgentTypeOverride,
  setControlTemplateAssignment,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { getAgentControls } from '../../../../common/ens/configuration/agents/agent-controls';
import { validateAgentProfile } from '../../../../common/ens/configuration/agents/agent-configuration-validator';
import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';

import { AgentParameterRow, valueRows } from './agent-parameter-row';
import { ChangePreviewModal } from './change-preview-modal';
import { ConfirmModal, errorMessage } from './confirm-modal';
import { ENSEntryRemoval, RemoveEntryModal } from './remove-entry-modal';
import { agentTypeLabel } from './labels';
import { ENSAgentRow, agentRowLabel } from './use-agents-data';

interface AgentConfigurationPageProps {
  configuration: ENSConfigurationVersion;
  row: ENSAgentRow;
  // The agent exists (scope, inventory or a stored profile).
  known: boolean;
  loading: boolean;
  detectionErrors: string[];
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

// Parameters that describe machines are declared per agent as its contribution to a union.
const isContribution = (controlId: string, parameterId: string): boolean => {
  const control = getENSCatalogControl(controlId);
  if (control?.scopeParameter === parameterId) return true;
  return getParameterClass(controlId, parameterId) === 'system' && (control?.measurementPlanes || []).includes('manager');
};

const BY_TYPE = '__type';

interface PendingChange {
  title: string;
  confirmLabel: string;
  intro: string;
  previews: (ENSAgentChangePreview & Partial<ENSAssignmentPreview>)[];
  build: (latest: ENSConfigurationVersion) => ENSConfigurationVersion;
  reason: string;
}

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
  const storedType = getAgentSystemType(profile);
  const controls = getAgentControls(configuration, agentId, effective.type, getActiveLevel);
  const completeness = getAgentCompleteness(
    configuration,
    agentId,
    controls.filter(control => control.measured).map(control => ({ controlId: control.controlId, level: control.level }))
  );
  const issues = profile ? validateAgentProfile(agentId, profile, configuration) : [];
  const orphans = issues.filter(issue => issue.kind === 'huerfano');
  const otherIssues = issues.filter(issue => issue.kind !== 'huerfano' && issue.severity === 'error');
  const typePending = !loading && pendingDetectedTypes(configuration, [{ agentId, agent: row.agent, detection: row.detection }]).length > 0;
  const typeLabel = agentTypeLabel(profile, row.detection, loading);

  const [choices, setChoices] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingChange | undefined>();
  const [clearing, setClearing] = useState<string | undefined>();
  const [entryRemoval, setEntryRemoval] = useState<ENSEntryRemoval | undefined>();
  const [aliasesText, setAliasesText] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const label = agentRowLabel(row);
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

  // Saves directly when no effective value changes; otherwise asks after a preview.
  const saveWithPreview = (change: Omit<PendingChange, 'previews'>, previews?: PendingChange['previews']) => {
    const shown = previews || previewConfigurationChange(configuration, change.build(configuration), [agentId]);
    if (shown.every(item => !item.changes.length)) {
      save(change.build, change.reason);
      return;
    }
    setPending({ ...change, previews: shown });
  };

  const confirmPending = async () => {
    if (!pending) return undefined;
    const failure = await save(pending.build, pending.reason);
    if (!failure) setPending(undefined);
    return failure;
  };

  const changeType = (type: ENSSystemType | undefined) =>
    saveWithPreview({
      title: `Cambiar el tipo de ${label}`,
      confirmLabel: 'Cambiar el tipo',
      intro: 'Los controles sin plantilla asignada pasan a la plantilla de serie del tipo nuevo.',
      build: latest => setAgentTypeOverride(latest, agentId, type, row.agent),
      reason: type ? `Tipo de ${label} corregido a mano: ${ENS_SYSTEM_TYPE_LABELS[type]}.` : `Tipo de ${label}: vuelve al detectado.`,
    });

  const saveDetected = () =>
    saveWithPreview({
      title: `Guardar el tipo detectado de ${label}`,
      confirmLabel: 'Guardar el tipo',
      intro: 'Los controles sin plantilla asignada pasan a la plantilla de serie de su tipo.',
      build: latest => saveDetectedTypes(latest, [{ agentId, agent: row.agent, detection: row.detection }]),
      reason: `Tipo detectado de ${label} guardado: ${row.detection.type ? ENS_SYSTEM_TYPE_LABELS[row.detection.type] : ''}.`,
    });

  const assign = (controlId: string, choice: string) => {
    const templateId = choice === BY_TYPE ? undefined : choice;
    try {
      const { previews } = previewControlAssignment(configuration, controlId, [agentId], templateId);
      saveWithPreview(
        {
          title: `${controlId}: plantilla ${describeTemplateChoice(configuration, controlId, templateId)} para ${label}`,
          confirmLabel: 'Asignar',
          intro: 'Los ajustes propios siguen ganando.',
          build: latest => setControlTemplateAssignment(latest, controlId, [agentId], templateId, { [agentId]: row.agent }),
          reason: `${controlId}: plantilla ${describeTemplateChoice(configuration, controlId, templateId)} para ${label}.`,
        },
        previews
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  };

  const removeOrphan = (controlId?: string, parameterId?: string) =>
    save(
      latest => removeAgentEntry(latest, agentId, controlId, parameterId),
      `Quitado de ${label} un ajuste que no se aplicaba (${controlId || ''}${parameterId ? ` ${parameterId}` : ''}).`
    );

  const confirmEntryRemoval = async () => {
    if (!entryRemoval) return undefined;
    const failure = await removeOrphan(entryRemoval.controlId);
    if (!failure) setEntryRemoval(undefined);
    return failure;
  };

  const confirmClear = async () => {
    if (!clearing) return undefined;
    const controlId = clearing;
    const failure = await save(latest => clearAgentControlOverrides(latest, agentId, controlId), `${controlId}: ${label} sin ajustes propios.`);
    if (!failure) setClearing(undefined);
    return failure;
  };

  const saveParameter = async (controlId: string, parameterId: string, value: ENSAgentParameterValue | undefined) => {
    const mode = describeAgentValueSave(configuration, agentId, controlId, parameterId, value);
    const failure = await save(
      latest => setAgentParameterValue(latest, agentId, controlId, parameterId, value, row.agent),
      mode === 'propio' ? `${controlId} ${parameterId}: ajuste propio de ${label}.` : `${controlId} ${parameterId}: ${label} vuelve a heredar el valor.`
    );
    if (failure) throw new Error(failure);
  };

  const typeOptions = [
    {
      value: '',
      text: storedType && !profile?.typeOverride
        ? `El detectado: ${ENS_SYSTEM_TYPE_LABELS[storedType]}`
        : row.detection.type
        ? `El detectado: ${ENS_SYSTEM_TYPE_LABELS[row.detection.type]} (sin guardar)`
        : 'Sin detectar (elegir uno)',
    },
    ...ENS_SYSTEM_TYPES.map(type => ({ value: type, text: ENS_SYSTEM_TYPE_LABELS[type] })),
  ];

  // From the control detail, its own «Volver al detalle» replaces this one only on the detail's agent.
  const search = useRouterSearch();
  const fromDetail = Boolean(parseConfigurationBack(search)) && search.agentId === agentId;

  return (
    <EuiPanel paddingSize='l'>
      {!fromDetail && (
        <>
          <EuiButton size='s' onClick={() => onNavigate({ view: 'agents' })}>
            Volver a agentes
          </EuiButton>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiTitle size='m'>
        <h2>{label}</h2>
      </EuiTitle>

      <EuiText size='s' color='subdued'>
        <p>
          {row.inScope ? 'En el alcance ENS.' : 'Fuera del alcance ENS: sus ajustes se conservan pero no se evalúan.'}
          {row.agent.os?.name ? ` ${row.agent.os.name}${row.agent.os.version ? ` ${row.agent.os.version}` : ''}.` : ''}
          {` ${completeness.withValue} de ${completeness.total} parámetros de este agente con valor; ${completeness.ownValues} ajustes propios.`}
        </p>
      </EuiText>

      {loading && (
        <EuiText size='s' color='subdued'>
          <p><EuiLoadingSpinner size='s' /> Detectando el tipo de sistema…</p>
        </EuiText>
      )}

      {!known && !profile && (
        <>
          <EuiSpacer size='s' />
          <EuiCallOut color='warning' iconType='alert' size='s' title={`No hay ningún agente ${agentId} en el inventario ni en la configuración`}>
            <p>Lo que se guarde aquí crea un perfil para un id que no es ningún agente conocido.</p>
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
          <EuiCallOut color='danger' iconType='alert' title='Ajustes de este agente que no se aplican'>
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
          <EuiCallOut color='danger' iconType='alert' title='Ajustes de este agente que hay que corregir'>
            <ul>{otherIssues.map((issue, index) => <li key={`${index}-${issue.message}`}>{issue.message}</li>)}</ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='l' wrap>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFormRow label='Tipo de sistema' helpText={loading && !effective.manual ? 'Detectando…' : effective.description}>
            <EuiSelect
              options={typeOptions}
              value={profile?.typeOverride || ''}
              disabled={saving}
              onChange={event => changeType((event.target.value || undefined) as ENSSystemType | undefined)}
            />
          </EuiFormRow>
          {typePending && (
            <>
              <EuiText size='xs' color='subdued'>
                <p>
                  {storedType
                    ? `Guardado: ${ENS_SYSTEM_TYPE_LABELS[storedType]}; detectado ahora: ${ENS_SYSTEM_TYPE_LABELS[row.detection.type!]}.`
                    : `${typeLabel.text}: la plantilla de serie de su tipo se aplica al guardar el tipo.`}
                </p>
              </EuiText>
              <EuiButton size='s' isDisabled={saving} onClick={saveDetected}>
                Guardar el tipo detectado ({ENS_SYSTEM_TYPE_LABELS[row.detection.type!]})…
              </EuiButton>
            </>
          )}
        </EuiFlexItem>

        <EuiFlexItem style={{ minWidth: 320 }}>
          <EuiFormRow
            label='Otros nombres de este agente'
            helpText='Separados por comas. El reparto por agentes reconoce por ellos las filas que nombran a este agente, además del id, el nombre y el hostname.'
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
                latest => setAgentAliases(latest, agentId, aliases, row.agent),
                `Otros nombres de ${label}: ${aliases.join(', ') || 'ninguno'}.`
              );
              if (!failure) setAliasesText(undefined);
            }}
          >
            Guardar otros nombres
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {pending && (
        <ChangePreviewModal
          title={pending.title}
          confirmLabel={pending.confirmLabel}
          intro={pending.intro}
          configuration={configuration}
          agentLabels={{ [agentId]: label }}
          previews={pending.previews}
          onCancel={() => setPending(undefined)}
          onConfirm={confirmPending}
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

      {clearing && (
        <ConfirmModal
          title={`Quitar los ajustes propios de ${label} en ${clearing}`}
          confirmLabel='Quitar'
          danger
          onCancel={() => setClearing(undefined)}
          onConfirm={confirmClear}
        >
          <EuiText size='s'>
            <p>Vuelven a heredar de su plantilla o del valor común:</p>
            <ul>
              {describeAgentEntryRemoval(configuration, agentId, clearing, undefined, { overridesOnly: true }).map(line => <li key={line}>{line}</li>)}
            </ul>
            <p>La versión anterior queda en el historial.</p>
          </EuiText>
        </ConfirmModal>
      )}

      <EuiSpacer size='l' />

      <EuiTitle size='s'>
        <h3>Controles</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>Por control: su plantilla y sus ajustes propios, con el origen de cada valor.</p>
      </EuiText>

      <EuiSpacer size='m' />

      {controls.map(control => {
        const resolved = resolveControlConfigurationWithOrigins(configuration, control.controlId, agentId);
        if (!resolved) return null;
        const common = configuration.controls.find(item => item.controlId === control.controlId);
        const parameters = resolved.configuration.parameters.filter(parameter => {
          const parameterClass = getParameterClass(control.controlId, parameter.id);
          return parameterClass === 'system' || parameterClass === 'platform';
        });
        const own = Object.keys(profile?.controls?.[control.controlId]?.parameters || {}).length;
        const open = target.controlId === control.controlId;
        const templates = getControlTemplates(configuration, control.controlId);
        const current = getEffectiveTemplate(configuration, agentId, control.controlId);
        const assigned = current.assignedId;
        const value = choices[control.controlId] ?? (assigned === undefined ? BY_TYPE : assigned);
        const typeDefault = getTypeDefaultTemplate(control.controlId, storedType);
        const proposals = proposedTemplates(control.controlId, row.detection);
        const templateLabel = current.template
          ? `${current.template.name}${current.via === 'type' ? ' (de serie)' : ''}`
          : assigned === undefined && !typeLabel.stored
          ? typeLabel.pending ? 'tipo sin guardar: valores comunes' : 'sin tipo: valores comunes'
          : 'sin plantilla';

        return (
          <React.Fragment key={control.controlId}>
            <EuiAccordion
              id={`ens-agent-${agentId}-${control.controlId}`}
              initialIsOpen={open}
              buttonContent={
                <span>
                  <strong>{control.controlId}</strong> · {control.controlName}{' '}
                  <EuiBadge color='hollow'>{templateLabel}</EuiBadge>
                  {own > 0 && <EuiBadge color='primary'>{own} propio(s)</EuiBadge>}
                  {!control.measured && <EuiBadge color='default'>{control.reason}</EuiBadge>}
                </span>
              }
              paddingSize='m'
            >
              <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false} wrap>
                <EuiFlexItem grow={false}>
                  <EuiFormRow label='Plantilla' display='rowCompressed'>
                    <EuiSelect
                      compressed
                      options={[
                        { value: BY_TYPE, text: `La de serie de su tipo${!typeLabel.stored ? (typeLabel.pending ? ' (tipo sin guardar)' : ' (sin tipo)') : typeDefault ? ` («${typeDefault.name}»)` : ' (ninguna para su tipo)'}` },
                        ...templates.map(template => ({
                          value: template.id,
                          text: `${template.name}${template.builtin ? ' (de serie)' : ''}${proposals.includes(template.id) ? ' (propuesta por sus datos)' : ''}`,
                        })),
                        { value: ENS_NO_TEMPLATE, text: 'Sin plantilla (valores comunes)' },
                        ...(assigned && assigned !== ENS_NO_TEMPLATE && !templates.some(template => template.id === assigned)
                          ? [{ value: assigned, text: `«${assigned}» (no existe)` }]
                          : []),
                      ]}
                      value={value}
                      disabled={saving}
                      onChange={event => setChoices(previous => ({ ...previous, [control.controlId]: event.target.value }))}
                    />
                  </EuiFormRow>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    size='s'
                    isDisabled={saving || value === (assigned === undefined ? BY_TYPE : assigned)}
                    onClick={() => assign(control.controlId, value)}
                  >
                    Asignar…
                  </EuiButton>
                </EuiFlexItem>
                {own > 0 && (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty size='s' color='danger' isDisabled={saving} onClick={() => setClearing(control.controlId)}>
                      Quitar ajustes propios
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              <EuiSpacer size='s' />

              {parameters.map(parameter => {
                const contribution = isContribution(control.controlId, parameter.id);
                // In a contribution the agent edits only its rows; the common rows are shown apart and never copied.
                const agentLevel = contribution ? getAgentLevelValue(configuration, agentId, control.controlId, parameter.id) : undefined;
                const shown = contribution ? { ...parameter, value: agentLevel?.value } : parameter;
                const origin = contribution
                  ? agentLevel?.origin || { source: 'organisation' as const }
                  : resolved.origins[parameter.id] || { source: 'organisation' as const };
                const commonValue = common?.parameters.find(item => item.id === parameter.id)?.value;
                const union = isUnionParameter(control.controlId, parameter.id, agentId);
                return (
                  <AgentParameterRow
                    key={parameter.id}
                    agentId={agentId}
                    parameter={shown}
                    parameterClass={getParameterClass(control.controlId, parameter.id) as 'system' | 'platform'}
                    origin={origin}
                    contributionOnly={contribution}
                    organisationRows={contribution ? valueRows(parameter, commonValue) : undefined}
                    effectiveRows={union && (agentId === ENS_MANAGER_AGENT || control.controlId === 'mp.info.6') ? valueRows(parameter, parameter.value) : undefined}
                    note={
                      contribution
                        ? 'Aquí, solo las filas de este agente; se evalúan junto con las comunes y las de los demás agentes.'
                        : undefined
                    }
                    applicable={parameter.levels.includes(control.level)}
                    focused={open && target.parameterId === parameter.id}
                    describeSave={next => describeAgentValueSave(configuration, agentId, control.controlId, parameter.id, next)}
                    onSave={next => saveParameter(control.controlId, parameter.id, next)}
                    onDone={
                      open && target.parameterId === parameter.id
                        ? () => onNavigate({ view: 'agents', agentId, controlId: control.controlId })
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
        <EuiCallOut color='warning' iconType='iInCircle' title={`${target.controlId} no tiene parámetros por agente en esta configuración`}>
          <p>
            O el control no está añadido, o solo tiene ajustes comunes.{' '}
            <EuiButtonEmpty size='xs' onClick={() => onNavigate({ view: 'controls', controlId: target.controlId, parameterId: target.parameterId })}>
              Abrirlo en Controles
            </EuiButtonEmpty>
          </p>
        </EuiCallOut>
      )}
    </EuiPanel>
  );
};
