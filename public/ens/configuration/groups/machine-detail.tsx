import React, { useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiHorizontalRule,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { ENS_NO_TEMPLATE, ENS_SYSTEM_TYPE_LABELS, ENSSystemType, knownSystemType } from '../../../../common/agent-configuration';
import { setAgentTypeOverride } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { detectAgentSystem } from '../../../../common/ens/configuration/agents/system-detection';
import { getActiveENSConfiguration, saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import type { ENSResolvedParameter } from '../../../../common/ens/profiles/resolve';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { controlTitle } from '../profiles/parameter-titles';
import { hostLabel } from '../profiles/profile-labels';
import { ENSHostDetail, profilesClient } from '../profiles/profiles-client';
import { TYPE_TEMPLATE_OPTIONS } from './bulk-actions';
import { OsIcon, osKindOf } from './os-icon';
import { Choice } from '../../ui/choice';

interface MachineDetailProps {
  agentId: string;
  groupName?: string;
  revision: string;
  onBack: () => void;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

interface ControlRow {
  controlId: string;
  total: number;
  withValue: number;
  own: number;
}

const controlRows = (parameters: ENSResolvedParameter[]): ControlRow[] => {
  const rows = new Map<string, ControlRow>();
  parameters.forEach(parameter => {
    const row = rows.get(parameter.controlId) || { controlId: parameter.controlId, total: 0, withValue: 0, own: 0 };
    row.total++;
    if (parameter.sources.length) row.withValue++;
    if (parameter.sources.some(source => source.kind === 'agent')) row.own++;
    rows.set(parameter.controlId, row);
  });
  return Array.from(rows.values());
};

const stateOf = (row: ControlRow): { text: string; color: string } => {
  const missing = row.total - row.withValue;
  if (missing > 0) return { text: missing === 1 ? 'Falta 1 valor' : `Faltan ${missing} valores`, color: 'warning' };
  if (row.own > 0) return { text: row.own === 1 ? '1 valor propio' : `${row.own} valores propios`, color: 'primary' };
  return { text: 'Completo', color: 'success' };
};

const templateText = (stored: string | undefined, detected?: ENSSystemType): string => {
  if (stored === ENS_NO_TEMPLATE) return 'Sin plantilla';
  const manual = knownSystemType(stored);
  if (manual) return `${ENS_SYSTEM_TYPE_LABELS[manual]} (elegida a mano)`;
  return detected ? `${ENS_SYSTEM_TYPE_LABELS[detected]} (la de su tipo detectado)` : 'Ninguna: su tipo no se ha detectado';
};

export const MachineDetail = ({ agentId, groupName, revision, onBack, onNavigate, onConfigurationSaved }: MachineDetailProps) => {
  const [detail, setDetail] = useState<ENSHostDetail | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [configured, setConfigured] = useState(0);

  useEffect(() => {
    let current = true;
    setDetail(undefined);
    profilesClient
      .host(agentId)
      .then(result => current && (setDetail(result), setError(undefined)))
      .catch(failure => current && setError(failure?.message || String(failure)));
    return () => {
      current = false;
    };
  }, [agentId, revision, configured]);

  const stored = getActiveENSConfiguration().agents?.[agentId];
  const rows = useMemo(() => controlRows(detail?.parameters || []), [detail]);

  const changeTemplate = async (value: string) => {
    setSaving(true);
    setSaveError(undefined);
    const label = TYPE_TEMPLATE_OPTIONS.find(option => option.value === value)?.text || value;
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: setAgentTypeOverride(latest, agentId, (value || undefined) as ENSSystemType | typeof ENS_NO_TEMPLATE | undefined, {
          id: agentId,
          name: detail?.host.name,
          os: detail?.host.os,
        }),
        reason: `Plantilla de ${detail ? hostLabel(detail.host) : agentId}: ${label}.`,
      }));
      onConfigurationSaved();
      setConfigured(count => count + 1);
    } catch (failure: any) {
      setSaveError(failure?.message || String(failure));
    } finally {
      setSaving(false);
    }
  };

  if (error) return <EuiCallOut color='danger' iconType='alert' title={error} />;
  if (!detail) return <EuiLoadingSpinner size='l' />;

  const host = detail.host;
  const detected = detectAgentSystem({ id: host.agentId, name: host.name, os: host.os }).type || knownSystemType(stored?.detectedType);

  return (
    <EuiPanel hasBorder>
      <EuiButtonEmpty iconType='arrowLeft' flush='left' size='s' onClick={onBack}>
        {groupName ? `Volver a ${groupName}` : 'Volver'}
      </EuiButtonEmpty>
      <EuiSpacer size='s' />
      <EuiFlexGroup alignItems='center' gutterSize='m' responsive={false}>
        <EuiFlexItem grow={false}>
          <OsIcon kind={osKindOf(host)} size={32} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size='s'>
            <h2>{hostLabel(host)}</h2>
          </EuiTitle>
          <EuiText size='s' color='subdued'>
            <p>{[host.agentId, host.os?.name && `${host.os.name}${host.os.version ? ` ${host.os.version}` : ''}`, host.role].filter(Boolean).join(' · ')}</p>
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size='m' />
      <EuiFlexGroup gutterSize='l' wrap>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFormRow label='Plantilla' helpText={`En uso: ${templateText(stored?.typeOverride, detected)}`}>
            <Choice
              legend='Plantilla'
              options={TYPE_TEMPLATE_OPTIONS}
              value={stored?.typeOverride || ''}
              onChange={(value: string) => changeTemplate(value)}
              disabled={saving}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem style={{ minWidth: 280 }}>
          <EuiFormRow label='Grupos'>
            <EuiFlexGroup gutterSize='xs' wrap responsive={false}>
              {detail.matched.length ? (
                detail.matched.map(group => (
                  <EuiFlexItem grow={false} key={group.id}>
                    <EuiBadge color='hollow' onClick={() => onNavigate({ view: 'groups', profileId: group.id })} onClickAriaLabel={`Abrir el grupo ${group.name}`}>
                      {group.name}
                    </EuiBadge>
                  </EuiFlexItem>
                ))
              ) : (
                <EuiText size='s' color='subdued'>
                  <p>Ninguno</p>
                </EuiText>
              )}
            </EuiFlexGroup>
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
      {saveError && <EuiCallOut size='s' color='danger' iconType='alert' title={saveError} />}

      <EuiHorizontalRule margin='m' />
      <EuiSpacer size='s' />
      {rows.map(row => {
        const state = stateOf(row);
        return (
          <EuiFlexGroup key={row.controlId} alignItems='center' gutterSize='m' responsive={false} style={{ borderBottom: '1px solid #eef1f5', padding: '6px 0' }}>
            <EuiFlexItem grow={false} style={{ width: 90 }}>
              <EuiText size='s'>
                <code>{row.controlId}</code>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size='s'>{controlTitle(row.controlId)}</EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={state.color}>{state.text}</EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size='s' onClick={() => onNavigate({ view: 'agents', agentId, controlId: row.controlId })}>
                Configurar
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        );
      })}
    </EuiPanel>
  );
};
