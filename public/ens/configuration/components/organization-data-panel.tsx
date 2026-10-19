import React, { useEffect, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type {
  ENSAgentParameterValue,
  ENSConfigurationVersion,
  ENSControlParameter,
} from '../../../../common/ens/configuration/types';
import {
  getPendingOrganizationMigration,
  saveFromLatestConfiguration,
} from '../../../../common/ens/configuration/services/configuration-state-service';
import {
  ORGANIZATION_SOURCE,
  describeOrganizationData,
  describeOrganizationFills,
  setOrganizationValue,
  summarizeOrganizationMigration,
} from '../../../../common/ens/configuration/organization/organization-data-migration';
import type {
  ENSOrganizationCandidate,
  ENSOrganizationItemState,
} from '../../../../common/ens/configuration/organization/organization-data-migration';
import { describeOrganizationDataView } from '../../../../common/ens/configuration/organization/organization-data-items';
import {
  organizationCrossChecks,
  organizationDataParameter,
  organizationValueLines,
  organizationValueWarnings,
  validateOrganizationValue,
} from '../../../../common/ens/configuration/organization/organization-data-form';
import { ParameterRendererFactory } from '../form-engine';
import { useRouterSearch } from '../../../routing/use-router-search';
import { errorMessage } from './confirm-modal';

interface OrganizationDataPanelProps {
  configuration: ENSConfigurationVersion;
  onConfigurationSaved: () => void;
}

export const organizationItemAnchorId = (itemId: string): string => `ens-org-${itemId}`.replace(/[^A-Za-z0-9_-]/g, '_');

const MAX_LINES = 8;

const ValueLines = ({ value }: { value?: ENSControlParameter['value'] }) => {
  const lines = organizationValueLines(value);
  if (!lines.length) {
    return (
      <EuiText size='s' color='subdued'>
        <p>Sin valor</p>
      </EuiText>
    );
  }
  return (
    <EuiText size='s'>
      <ul>
        {lines.slice(0, MAX_LINES).map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
        {lines.length > MAX_LINES && <li>{`… y ${lines.length - MAX_LINES} más`}</li>}
      </ul>
    </EuiText>
  );
};

const usedBy = (state: ENSOrganizationItemState): string =>
  state.views
    .filter(view => view.parameter)
    .map(view => describeOrganizationDataView(view.view))
    .join(', ') || 'ningún control en la configuración';

const statusBadge = (state: ENSOrganizationItemState) =>
  state.status === 'conflict' ? (
    <EuiBadge color='warning'>Valores distintos</EuiBadge>
  ) : state.status === 'value' ? (
    <EuiBadge color='success'>Con valor</EuiBadge>
  ) : (
    <EuiBadge color='hollow'>Sin valor</EuiBadge>
  );

const candidateSource = (candidate: ENSOrganizationCandidate): string =>
  candidate.from === ORGANIZATION_SOURCE ? 'Valor guardado en Datos de la organización' : `Valor de ${candidate.from}`;

// Configuración > General > «Datos de la organización»: each shared item once, its conflicts first.
export const OrganizationDataPanel = ({ configuration, onConfigurationSaved }: OrganizationDataPanelProps) => {
  const focusItemId = useRouterSearch().configItem;
  const states = describeOrganizationData(configuration);
  const editable = states.filter(state => state.status !== 'informative');
  const informative = states.filter(state => state.status === 'informative');
  const conflicts = states.filter(state => state.status === 'conflict');
  const pending = getPendingOrganizationMigration();
  const pendingSave = pending && (pending.moved.length > 0 || pending.written.length > 0);

  const [editing, setEditing] = useState<string | undefined>();
  const [draft, setDraft] = useState<ENSAgentParameterValue | undefined>();
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!focusItemId || typeof document === 'undefined') return;
    document.getElementById(organizationItemAnchorId(focusItemId))?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [focusItemId]);

  const save = async (itemId: string, value: ENSAgentParameterValue | undefined, reason: string) => {
    setBusy(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: setOrganizationValue(latest, itemId, value), reason }));
      setEditing(undefined);
      setIssues([]);
      onConfigurationSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const savePending = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: latest, reason: summarizeOrganizationMigration({ ...pending!, conflicts: [] }) }));
      onConfigurationSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const startEditing = (state: ENSOrganizationItemState) => {
    setEditing(state.item.id);
    setDraft(state.value);
    setIssues([]);
    setError(undefined);
  };

  const saveDraft = (state: ENSOrganizationItemState) => {
    const found = validateOrganizationValue(configuration, state.item, draft);
    if (found.length) {
      setIssues(found.map(issue => `${issue.source}: ${issue.reason}.`));
      return;
    }
    return save(state.item.id, draft, `Datos de la organización: «${state.item.label}» actualizado.`);
  };

  return (
    <EuiPanel paddingSize='m'>
      <EuiTitle size='s'>
        <h3>Datos de la organización</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>Datos que piden varios controles. Se escriben aquí una vez y cada control lee su parte.</p>
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

      {pendingSave && (
        <>
          <EuiCallOut color='primary' iconType='iInCircle' title='Valores de los controles pasados a Datos de la organización'>
            <p>{summarizeOrganizationMigration({ ...pending!, conflicts: [] })}</p>
            {pending!.filled.length ? (
              <ul>
                {describeOrganizationFills(pending!.filled).map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : (
              <p>Ningún control cambia de valor.</p>
            )}
            <p>Se guarda con el próximo cambio.</p>
            <EuiButton size='s' onClick={savePending} isLoading={busy}>
              Guardar ahora
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {conflicts.length > 0 && (
        <>
          <EuiCallOut color='warning' iconType='alert' title='Valores distintos entre controles'>
            <p>Elegir el valor que pasa a ser el de la organización. Mientras tanto, cada control sigue con el suyo. La versión anterior queda en el historial.</p>
          </EuiCallOut>
          <EuiSpacer size='s' />
          {conflicts.map(state => (
            <EuiPanel key={`conflict-${state.item.id}`} color='warning' paddingSize='s'>
              <EuiTitle size='xxs'>
                <h4>{state.item.label}</h4>
              </EuiTitle>
              {state.candidates.map(candidate => {
                const refused = validateOrganizationValue(configuration, state.item, candidate.value);
                return (
                <div key={`${state.item.id}-${candidate.from}`}>
                  <EuiSpacer size='s' />
                  <EuiText size='s'>
                    <p>
                      <strong>{candidateSource(candidate)}</strong>
                      {candidate.keeps.length ? ` · Lo mantienen: ${candidate.keeps.join(', ')}` : ''}
                    </p>
                  </EuiText>
                  <ValueLines value={candidate.value} />
                  {refused.length > 0 && (
                    <EuiText size='xs' color='danger'>
                      <p>{`No se puede elegir tal cual: ${refused.map(issue => `${issue.source}: ${issue.reason}`).join('; ')}. Escribir el valor en «Editar».`}</p>
                    </EuiText>
                  )}
                  <EuiButton
                    size='s'
                    isDisabled={busy || refused.length > 0}
                    onClick={() =>
                      save(
                        state.item.id,
                        candidate.value,
                        `Datos de la organización: «${state.item.label}» con ${candidate.from === ORGANIZATION_SOURCE ? 'el valor guardado' : `el valor de ${candidate.from}`}.`
                      )
                    }
                  >
                    Elegir este valor
                  </EuiButton>
                </div>
                );
              })}
              {state.views.some(view => view.parameter && !view.configured) && (
                <EuiText size='xs' color='subdued'>
                  <p>{`Sin valor: ${state.views.filter(view => view.parameter && !view.configured).map(view => view.key).join(', ')}.`}</p>
                </EuiText>
              )}
              {state.unrepresentable.length > 0 && (
                <EuiText size='xs' color='subdued'>
                  <p>{`No cabe en el dato común tal como está: ${state.unrepresentable.join(', ')}. Escribir el valor en «Editar».`}</p>
                </EuiText>
              )}
              <EuiSpacer size='s' />
            </EuiPanel>
          ))}
          <EuiSpacer size='m' />
        </>
      )}

      {editable.map(state => (
        <div key={state.item.id} id={organizationItemAnchorId(state.item.id)}>
          <EuiPanel color={focusItemId === state.item.id ? 'primary' : 'subdued'} paddingSize='m'>
            <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiTitle size='xs'>
                  <h4>{state.item.label}</h4>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>{statusBadge(state)}</EuiFlexItem>
            </EuiFlexGroup>
            <EuiText size='s' color='subdued'>
              <p>{state.item.description}</p>
              <p>{`Lo usan: ${usedBy(state)}.`}</p>
            </EuiText>
            {[...organizationCrossChecks(configuration, state.item.id), ...organizationValueWarnings(state.item, editing === state.item.id ? draft : state.value)].map(warning => (
              <EuiText key={warning} size='xs' color='warning'>
                <p>{warning}</p>
              </EuiText>
            ))}
            <EuiSpacer size='s' />

            {editing === state.item.id ? (
              <>
                <ParameterRendererFactory
                  parameter={organizationDataParameter(state.item)}
                  value={draft}
                  onChange={(_name, value) => setDraft(value as ENSAgentParameterValue | undefined)}
                />
                {issues.length > 0 && (
                  <>
                    <EuiSpacer size='s' />
                    <EuiCallOut color='danger' iconType='alert' title='Hay valores que no se pueden guardar'>
                      <ul>
                        {issues.map(issue => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    </EuiCallOut>
                  </>
                )}
                <EuiSpacer size='s' />
                <EuiFlexGroup gutterSize='s' responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiButton fill size='s' isLoading={busy} onClick={() => saveDraft(state)}>
                      Guardar
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty size='s' onClick={() => setEditing(undefined)}>
                      Cancelar
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            ) : (
              <>
                {state.status === 'conflict' && !state.stored ? (
                  <EuiText size='s' color='subdued'>
                    <p>Pendiente de elegir arriba, o de escribir aquí.</p>
                  </EuiText>
                ) : (
                  <ValueLines value={state.value} />
                )}
                <EuiButton size='s' onClick={() => startEditing(state)}>
                  Editar
                </EuiButton>
              </>
            )}

            {state.item.unmapped.length > 0 && (
              <>
                <EuiSpacer size='s' />
                <EuiAccordion id={`ens-org-unmapped-${state.item.id}`} buttonContent='Parámetros relacionados que siguen en su control' paddingSize='s'>
                  <EuiText size='xs'>
                    <ul>
                      {state.item.unmapped.map(entry => (
                        <li key={`${entry.controlId}-${entry.parameterId}`}>{`${entry.controlId} ${entry.parameterId}: ${entry.reason}`}</li>
                      ))}
                    </ul>
                  </EuiText>
                </EuiAccordion>
              </>
            )}
          </EuiPanel>
          <EuiSpacer size='s' />
        </div>
      ))}

      {informative.map(state => (
        <EuiPanel key={state.item.id} color='transparent' hasBorder paddingSize='m'>
          <EuiTitle size='xs'>
            <h4>{state.item.label}</h4>
          </EuiTitle>
          <EuiText size='s' color='subdued'>
            <p>{state.item.description}</p>
            <ul>
              {state.item.unmapped.map(entry => (
                <li key={`${entry.controlId}-${entry.parameterId}`}>{`${entry.controlId} ${entry.parameterId}: ${entry.reason}`}</li>
              ))}
            </ul>
          </EuiText>
        </EuiPanel>
      ))}
    </EuiPanel>
  );
};

interface OrganizationDataNoticeProps {
  configuration: ENSConfigurationVersion;
  onOpen: () => void;
}

// Outside General: says there is something to save or to choose, and takes there.
export const OrganizationDataNotice = ({ configuration, onOpen }: OrganizationDataNoticeProps) => {
  const pending = getPendingOrganizationMigration();
  const conflicts = describeOrganizationData(configuration).filter(state => state.status === 'conflict');
  const pendingSave = pending && (pending.moved.length > 0 || pending.written.length > 0);
  if (!pendingSave && !conflicts.length) return null;
  return (
    <>
      <EuiCallOut color={conflicts.length ? 'warning' : 'primary'} iconType={conflicts.length ? 'alert' : 'iInCircle'} title='Datos de la organización'>
        {pendingSave && <p>{summarizeOrganizationMigration({ ...pending!, conflicts: [] })} Se guarda con el próximo cambio.</p>}
        {pendingSave && describeOrganizationFills(pending!.filled).map(line => <p key={line}>{line}</p>)}
        {conflicts.length > 0 && <p>{`Valores distintos entre controles: ${conflicts.map(state => `«${state.item.label}»`).join(', ')}. Cada control sigue con el suyo hasta elegir.`}</p>}
        <EuiButton size='s' onClick={onOpen}>
          Ver Datos de la organización
        </EuiButton>
      </EuiCallOut>
      <EuiSpacer size='m' />
    </>
  );
};
