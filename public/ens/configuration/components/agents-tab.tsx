import React, { useMemo, useState } from 'react';
import { withInventoryTypes } from '../../../../common/ens/configuration/agents/system-detection';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiInMemoryTable,
  EuiLink,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';

import type { ENSConfigurationVersion, ENSLevel } from '../../../../common/ens/configuration/types';
import { ENS_OUT_OF_GROUP_LABEL, describeEvaluableGroups } from '../../../../common/ens/core/scope/evaluable-groups';
import { ENS_NO_TEMPLATE, normalizeAgentId } from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { detectAgentSystem, effectiveSystemType } from '../../../../common/ens/configuration/agents/system-detection';
import {
  ENSAssignmentPreview,
  describeTemplateChoice,
  getAgentCompleteness,
  previewControlAssignment,
  removeAgentEntry,
  setControlTemplateAssignment,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { getAgentControls } from '../../../../common/ens/configuration/agents/agent-controls';
import { validateAgentsConfiguration } from '../../../../common/ens/configuration/agents/agent-configuration-validator';
import { getControlTemplates, hasTemplateParameters } from '../../../../common/ens/configuration/templates';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';

import { AgentConfigurationPage } from './agent-configuration-page';
import { ChangePreviewModal } from './change-preview-modal';
import { errorMessage } from './confirm-modal';
import { agentStatusLabel, agentTypeLabel, plural } from './labels';
import { ENSEntryRemoval, RemoveEntryModal } from './remove-entry-modal';
import { ENSAgentRow, agentRowLabel, buildAgentRows, useAgentsData } from './use-agents-data';

interface AgentsTabProps {
  configuration: ENSConfigurationVersion;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

type Notice = { color: 'success' | 'danger' | 'warning'; text: string } | undefined;

const BY_TYPE = '__type';

interface BulkAssignment {
  controlId: string;
  templateId: string | undefined;
  agentIds: string[];
  previews: ENSAssignmentPreview[];
}

// Profiles of machines out of the scope are listed too, so nothing stored is hidden.
export const AgentsTab = ({ configuration: stored, target, getActiveLevel, onNavigate, onConfigurationSaved }: AgentsTabProps) => {
  const data = useAgentsData();
  const configuration = useMemo(() => withInventoryTypes(stored, data.inventory), [stored, data.inventory]);
  const [removal, setRemoval] = useState<ENSEntryRemoval | undefined>();
  const [notice, setNotice] = useState<Notice>();
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<ENSAgentRow[]>([]);
  const [bulkControl, setBulkControl] = useState('');
  const [bulkTemplate, setBulkTemplate] = useState(BY_TYPE);
  const [bulk, setBulk] = useState<BulkAssignment | undefined>();

  const rows = useMemo<ENSAgentRow[]>(() => buildAgentRows(configuration, data), [data, configuration]);
  const agentLabels = Object.fromEntries(rows.map(row => [row.id, agentRowLabel(row)]));
  const errors = useMemo(() => validateAgentsConfiguration(configuration).filter(issue => issue.severity === 'error'), [configuration]);

  // Once per document, not on every click.
  const completeness = useMemo(() => {
    const byId = new Map<string, ReturnType<typeof getAgentCompleteness>>();
    rows.forEach(row => {
      const type = effectiveSystemType(row.detection, configuration.agents?.[row.id]).type;
      const measured = getAgentControls(configuration, row.id, type, getActiveLevel)
        .filter(control => control.measured)
        .map(control => ({ controlId: control.controlId, level: control.level }));
      byId.set(row.id, getAgentCompleteness(configuration, row.id, measured));
    });
    return byId;
  }, [rows, configuration, getActiveLevel]);

  const templatedControls = configuration.controls.filter(control => hasTemplateParameters(control.controlId));
  const bulkTemplates = bulkControl ? getControlTemplates(configuration, bulkControl) : [];

  const save = async (build: (latest: ENSConfigurationVersion) => ENSConfigurationVersion, reason: string): Promise<string | undefined> => {
    try {
      await saveFromLatestConfiguration(latest => ({ configuration: build(latest), reason }));
      setNotice({ color: 'success', text: reason });
      onConfigurationSaved();
      return undefined;
    } catch (error) {
      const text = errorMessage(error);
      setNotice({ color: 'danger', text });
      return text;
    }
  };

  const askBulk = () => {
    const agentIds = selection.map(row => row.id);
    const templateId = bulkTemplate === BY_TYPE ? undefined : bulkTemplate;
    try {
      setBulk({ controlId: bulkControl, templateId, agentIds, previews: previewControlAssignment(configuration, bulkControl, agentIds, templateId).previews });
    } catch (error) {
      setNotice({ color: 'danger', text: errorMessage(error) });
    }
  };

  const confirmBulk = async () => {
    if (!bulk) return undefined;
    const agents = Object.fromEntries(selection.map(row => [row.id, row.agent]));
    const failure = await save(
      latest => setControlTemplateAssignment(latest, bulk.controlId, bulk.agentIds, bulk.templateId, agents),
      `${bulk.controlId}: ${describeTemplateChoice(configuration, bulk.controlId, bulk.templateId)} para ${plural(bulk.agentIds.length, 'agente', 'agentes')}.`
    );
    if (!failure) {
      setBulk(undefined);
      setSelection([]);
    }
    return failure;
  };

  const removeOrphan = (agentKey: string, controlId?: string, parameterId?: string) =>
    save(
      latest => removeAgentEntry(latest, agentKey, controlId, parameterId),
      controlId ? `${agentKey}: quitado un ajuste sin uso (${controlId}${parameterId ? ` ${parameterId}` : ''}).` : `Quitado el perfil sin uso ${agentKey}.`
    );

  const confirmRemoval = async (): Promise<string | undefined> => {
    if (!removal) return undefined;
    const failure = await removeOrphan(removal.agentKey, removal.controlId);
    if (!failure) setRemoval(undefined);
    return failure;
  };

  const openId = target.agentId ? normalizeAgentId(target.agentId) : undefined;
  const openRow: ENSAgentRow | undefined = openId
    ? rows.find(row => row.id === openId) || {
        id: openId,
        agent: data.inventory.find(agent => normalizeAgentId(agent.id) === openId) || { id: openId, groups: [] },
        inScope: false,
        detection: detectAgentSystem(data.inventory.find(agent => normalizeAgentId(agent.id) === openId) || { id: openId }),
      }
    : undefined;

  const q = query.trim().toLowerCase();
  const listed = rows.filter(row => !q || agentRowLabel(row).toLowerCase().includes(q));

  const columns: EuiBasicTableColumn<ENSAgentRow>[] = [
    {
      field: 'id',
      name: 'Agente',
      sortable: true,
      render: (_id: string, row: ENSAgentRow) => <EuiLink onClick={() => onNavigate({ view: 'agents', agentId: row.id })}>{agentRowLabel(row)}</EuiLink>,
    },
    {
      field: 'detection',
      name: 'Tipo',
      width: '150px',
      render: (_detection: unknown, row: ENSAgentRow) => {
        const type = agentTypeLabel(configuration.agents?.[row.id], row.detection, data.loading);
        return <EuiBadge color={type.color}>{type.text}</EuiBadge>;
      },
    },
    {
      field: 'agent',
      name: 'Plantillas propias',
      width: '150px',
      render: (_agent: unknown, row: ENSAgentRow) => {
        const controls = configuration.agents?.[row.id]?.controls || {};
        const assigned = Object.values(controls).filter(entry => typeof entry?.templateId === 'string' && entry.templateId !== ENS_NO_TEMPLATE).length;
        return assigned || '—';
      },
    },
    {
      field: 'inScope',
      name: 'Configuración',
      width: '170px',
      render: (_inScope: boolean, row: ENSAgentRow) => {
        const value = completeness.get(row.id);
        if (!value) return null;
        return value.missingRequired.length ? (
          <EuiBadge color='danger'>{`Faltan ${value.missingRequired.length}`}</EuiBadge>
        ) : (
          <EuiBadge color='success'>Completa</EuiBadge>
        );
      },
    },
    {
      field: 'agent',
      name: 'Estado',
      width: '210px',
      render: (agent: ENSAgentRow['agent'], row: ENSAgentRow) =>
        row.inScope ? <EuiText size='xs'><span>{agentStatusLabel(agent.status)}</span></EuiText> : <EuiToolTip content={describeEvaluableGroups(configuration.scope)}><EuiBadge color='default'>{ENS_OUT_OF_GROUP_LABEL}</EuiBadge></EuiToolTip>,
    },
  ];

  return (
    <>
      {data.errors.map(error => (
        <React.Fragment key={error}>
          <EuiCallOut color='warning' iconType='alert' size='s' title={error} />
          <EuiSpacer size='s' />
        </React.Fragment>
      ))}

      {notice && (
        <>
          <EuiCallOut color={notice.color} iconType={notice.color === 'success' ? 'check' : 'alert'} size='s' title={notice.text} />
          <EuiSpacer size='m' />
        </>
      )}

      {errors.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' size='s' title={`${plural(errors.length, 'ajuste que corregir', 'ajustes que corregir')}`}>
            <ul>
              {errors.map((issue, index) => (
                <li key={`${index}-${issue.agentId}`}>
                  {agentLabels[issue.agentId] || issue.agentId}: {issue.message}
                  {issue.kind === 'huerfano' && (
                    <EuiButtonEmpty
                      size='xs'
                      color='danger'
                      onClick={() => (issue.parameterId ? removeOrphan(issue.agentId, issue.controlId, issue.parameterId) : setRemoval({ agentKey: issue.agentId, controlId: issue.controlId }))}
                    >
                      Quitar
                    </EuiButtonEmpty>
                  )}
                </li>
              ))}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='s' alignItems='flexEnd' responsive={false} wrap>
        <EuiFlexItem style={{ maxWidth: 360 }}>
          <EuiFieldSearch compressed placeholder='Buscar agente' value={query} onChange={e => setQuery(e.target.value)} isClearable />
        </EuiFlexItem>
        <EuiFlexItem />
        {selection.length > 0 && (
          <>
            <EuiFlexItem grow={false}>
              <EuiFormRow label={`Asignar a ${plural(selection.length, 'agente', 'agentes')}`} display='rowCompressed'>
                <EuiSelect
                  compressed
                  options={[{ value: '', text: 'Control…' }, ...templatedControls.map(control => ({ value: control.controlId, text: `${control.controlId} · ${control.controlName}` }))]}
                  value={bulkControl}
                  onChange={e => {
                    setBulkControl(e.target.value);
                    setBulkTemplate(BY_TYPE);
                  }}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFormRow label='Plantilla' display='rowCompressed'>
                <EuiSelect
                  compressed
                  disabled={!bulkControl}
                  options={[
                    { value: BY_TYPE, text: 'La de serie de su tipo' },
                    ...bulkTemplates.map(template => ({ value: template.id, text: `${template.name}${template.builtin ? ' (de serie)' : ''}` })),
                    { value: ENS_NO_TEMPLATE, text: 'Sin plantilla' },
                  ]}
                  value={bulkTemplate}
                  onChange={e => setBulkTemplate(e.target.value)}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton size='s' fill isDisabled={!bulkControl} onClick={askBulk}>
                Asignar
              </EuiButton>
            </EuiFlexItem>
          </>
        )}
      </EuiFlexGroup>

      <EuiSpacer size='m' />

      <EuiInMemoryTable
        items={listed}
        itemId='id'
        columns={columns}
        loading={data.loading}
        isSelectable
        selection={{ onSelectionChange: setSelection }}
        pagination={{ initialPageSize: 25, pageSizeOptions: [25, 50, 100] }}
        sorting={{ sort: { field: 'id', direction: 'asc' } }}
        message='No hay agentes en el alcance.'
      />

      {bulk && (
        <ChangePreviewModal
          title={`${bulk.controlId}: ${describeTemplateChoice(configuration, bulk.controlId, bulk.templateId)}`}
          confirmLabel='Asignar'
          intro='Los valores personalizados de cada agente se mantienen.'
          configuration={configuration}
          agentLabels={agentLabels}
          previews={bulk.previews}
          onCancel={() => setBulk(undefined)}
          onConfirm={confirmBulk}
        />
      )}

      {removal && (
        <RemoveEntryModal configuration={configuration} removal={removal} onCancel={() => setRemoval(undefined)} onConfirm={confirmRemoval} />
      )}

      {openRow && (
        <EuiFlyout size='l' ownFocus onClose={() => onNavigate({ view: 'agents' })} aria-labelledby='ens-agent-flyout-title'>
          <EuiFlyoutHeader hasBorder>
            <EuiTitle size='s'>
              <h2 id='ens-agent-flyout-title'>{agentRowLabel(openRow)}</h2>
            </EuiTitle>
          </EuiFlyoutHeader>
          <EuiFlyoutBody>
            <AgentConfigurationPage
              key={openRow.id}
              configuration={configuration}
              row={openRow}
              known={rows.some(row => row.id === openRow.id) || data.inventory.some(agent => normalizeAgentId(agent.id) === openRow.id)}
              loading={data.loading}
              detectionErrors={data.errors}
              target={target}
              getActiveLevel={getActiveLevel}
              onNavigate={onNavigate}
              onConfigurationSaved={onConfigurationSaved}
            />
          </EuiFlyoutBody>
        </EuiFlyout>
      )}
    </>
  );
};
