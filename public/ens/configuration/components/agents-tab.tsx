import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';

import type { ENSConfigurationVersion, ENSLevel } from '../../../../common/ens/configuration/types';
import { getAgentSystemType } from '../../../../common/ens/configuration/agents/configuration-resolver';
import { ENS_NO_TEMPLATE, ENS_SYSTEM_TYPE_LABELS, normalizeAgentId } from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import type { ENSAgentScope } from '../../../../common/ens/core/scope/types';
import {
  ENSSystemDetection,
  detectAgentSystem,
  effectiveSystemType,
} from '../../../../common/ens/configuration/agents/system-detection';
import {
  getAgentCompleteness,
  removeAgentEntry,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { getAgentControls } from '../../../../common/ens/configuration/agents/agent-controls';
import {
  describeMigrationWarning,
  planMigrationToSystems,
  summarizeMigrationPlan,
} from '../../../../common/ens/configuration/agents/migration';
import { validateAgentsConfiguration } from '../../../../common/ens/configuration/agents/agent-configuration-validator';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';

import { AgentConfigurationPage } from './agent-configuration-page';
import { ConfirmModal, errorMessage } from './confirm-modal';
import { DetectedTypesCallout } from './detected-types-callout';
import { agentStatusLabel, agentTypeLabel, parameterLabel } from './labels';
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

// Profiles of machines out of the scope are listed too, so nothing stored is hidden.
export const AgentsTab = ({
  configuration,
  target,
  getActiveLevel,
  onNavigate,
  onConfigurationSaved,
}: AgentsTabProps) => {
  const data = useAgentsData();
  const [confirmMigration, setConfirmMigration] = useState(false);
  // A whole profile or control is removed only after showing what is lost.
  const [removal, setRemoval] = useState<ENSEntryRemoval | undefined>();
  const [notice, setNotice] = useState<Notice>();

  const rows = useMemo<ENSAgentRow[]>(() => buildAgentRows(configuration, data), [data, configuration]);
  const agentLabels = Object.fromEntries(rows.map(row => [row.id, agentRowLabel(row)]));

  const scopeIds = useMemo(() => data.scopeAgents.map(agent => normalizeAgentId(agent.id)), [data.scopeAgents]);

  const migration = useMemo(
    () => planMigrationToSystems(configuration, data.inventory, { scopeAgentIds: scopeIds }),
    [configuration, data.inventory, scopeIds]
  );

  const issues = useMemo(() => validateAgentsConfiguration(configuration), [configuration]);
  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');

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

  const rowById = (id: string) => rows.find(row => row.id === id);

  const runMigration = async (): Promise<string | undefined> => {
    if (!scopeIds.length) return 'El alcance ENS no tiene ningún agente: no se puede repartir.';
    try {
      const done = await saveFromLatestConfiguration(latest => {
        const plan = planMigrationToSystems(latest, data.inventory, { scopeAgentIds: scopeIds });
        return plan.changed && !plan.incomplete.length
          ? { configuration: plan.configuration, reason: summarizeMigrationPlan(plan) }
          : undefined;
      });
      setConfirmMigration(false);
      setNotice({
        color: done ? 'success' : 'warning',
        text: done
          ? `${summarizeMigrationPlan(migration)} La versión anterior queda en el historial.`
          : 'No había nada que repartir en la versión más reciente del documento.',
      });
      onConfigurationSaved();
      return undefined;
    } catch (error) {
      return errorMessage(error);
    }
  };

  const removeOrphan = async (agentKey: string, controlId?: string, parameterId?: string): Promise<string | undefined> => {
    try {
      await saveFromLatestConfiguration(latest => ({
        configuration: removeAgentEntry(latest, agentKey, controlId, parameterId),
        reason: controlId
          ? `Quitado de ${agentKey} un valor que no se aplicaba (${controlId}${parameterId ? ` ${parameterId}` : ''}).`
          : `Quitado el perfil ${agentKey}, que no se aplicaba a ninguna máquina.`,
      }));
      onConfigurationSaved();
      return undefined;
    } catch (error) {
      const text = errorMessage(error);
      setNotice({ color: 'danger', text });
      return text;
    }
  };

  // A single value goes directly; a whole profile or control after its preview.
  const askRemoval = (agentKey: string, controlId?: string, parameterId?: string) => {
    if (parameterId) {
      removeOrphan(agentKey, controlId, parameterId);
      return;
    }
    setRemoval({ agentKey, controlId });
  };

  const confirmRemoval = async (): Promise<string | undefined> => {
    if (!removal) return undefined;
    const failure = await removeOrphan(removal.agentKey, removal.controlId);
    if (!failure) setRemoval(undefined);
    return failure;
  };

  if (target.agentId) {
    const id = normalizeAgentId(target.agentId);
    const inventoryAgent = data.inventory.find(agent => normalizeAgentId(agent.id) === id);
    const row: ENSAgentRow = rowById(id) || {
      id,
      agent: inventoryAgent || { id, groups: [] },
      inScope: false,
      detection: detectAgentSystem(inventoryAgent || { id }, data.facts[id]),
    };
    return (
      <AgentConfigurationPage
        key={row.id}
        configuration={configuration}
        row={row}
        known={!!rowById(id) || !!inventoryAgent}
        loading={data.loading}
        detectionErrors={data.errors}
        target={target}
        getActiveLevel={getActiveLevel}
        onNavigate={onNavigate}
        onConfigurationSaved={onConfigurationSaved}
      />
    );
  }

  const columns: EuiBasicTableColumn<ENSAgentRow>[] = [
    {
      field: 'id',
      name: 'Agente',
      render: (_id: string, row: ENSAgentRow) => (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => onNavigate({ view: 'agents', agentId: row.id })}>
          {agentRowLabel(row)}
        </EuiButtonEmpty>
      ),
    },
    {
      field: 'detection',
      name: 'Tipo',
      render: (_detection: ENSSystemDetection, row: ENSAgentRow) => {
        const profile = configuration.agents?.[row.id];
        const type = agentTypeLabel(profile, row.detection, data.loading);
        return (
          <div>
            <EuiBadge color={type.color}>{type.text}</EuiBadge>
            <EuiText size='xs' color='subdued'>
              <p>{data.loading && !type.stored ? 'Detectando…' : effectiveSystemType(row.detection, profile).description}</p>
            </EuiText>
          </div>
        );
      },
    },
    {
      field: 'agent',
      name: 'Plantillas',
      render: (_agent: ENSAgentScope, row: ENSAgentRow) => {
        const controls = configuration.agents?.[row.id]?.controls || {};
        const assigned = Object.values(controls).filter(entry => typeof entry?.templateId === 'string' && entry.templateId !== ENS_NO_TEMPLATE).length;
        const type = getAgentSystemType(configuration.agents?.[row.id]);
        return (
          <EuiText size='xs'>
            <p>
              {assigned ? `${assigned} control(es) con plantilla asignada` : 'Ninguna asignada'}
              {type ? `; el resto, la de serie de ${ENS_SYSTEM_TYPE_LABELS[type]}` : row.detection.type ? '; el resto, valores comunes hasta guardar su tipo' : '; el resto, valores comunes (sin tipo)'}
            </p>
          </EuiText>
        );
      },
    },
    {
      field: 'inScope',
      name: 'Completitud',
      render: (_inScope: boolean, row: ENSAgentRow) => {
        const value = completeness.get(row.id);
        return value ? (
          <EuiText size='xs'>
            <p>
              {value.withValue} de {value.total} con valor · {value.ownValues} propios
              {value.missingRequired.length ? ` · ${value.missingRequired.length} obligatorios sin valor` : ''}
            </p>
          </EuiText>
        ) : null;
      },
    },
    {
      field: 'agent',
      name: 'Estado',
      render: (agent: ENSAgentScope, row: ENSAgentRow) =>
        row.inScope ? (
          <EuiText size='xs'><p>{agentStatusLabel(agent.status)}</p></EuiText>
        ) : (
          <EuiBadge color='default'>fuera del alcance</EuiBadge>
        ),
    },
  ];

  const byAgent = Array.from(new Set<string>(migration.moves.map(move => move.agentId))).sort();

  return (
    <>
      <EuiTitle size='s'>
        <h3>Agentes del alcance</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>El tipo de cada agente se detecta solo y se corrige en su página; el alcance se define en la configuración inicial.</p>
      </EuiText>

      <EuiSpacer size='m' />

      <DetectedTypesCallout configuration={configuration} rows={rows} loading={data.loading} onConfigurationSaved={onConfigurationSaved} />

      {data.errors.map(error => (
        <React.Fragment key={error}>
          <EuiCallOut color='warning' iconType='alert' size='s' title='No se pudo leer todo'>
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size='s' />
        </React.Fragment>
      ))}

      {notice && (
        <>
          <EuiCallOut color={notice.color} iconType={notice.color === 'success' ? 'check' : 'alert'} size='s' title={notice.text} />
          <EuiSpacer size='m' />
        </>
      )}

      {migration.emptyScope && !data.loading && (
        <>
          <EuiCallOut color='warning' iconType='alert' size='s' title='«Repartir por agentes» no está disponible: el alcance ENS no tiene ningún agente'>
            <p>Sin agentes en el alcance no se puede comprobar que ninguno se quede sin un parámetro obligatorio.</p>
            <EuiButton fill size='s' isDisabled>
              Repartir por agentes
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {migration.changed && (
        <>
          <EuiCallOut color='primary' iconType='iInCircle' title='Hay filas del valor común que son de un agente concreto'>
            <p>{summarizeMigrationPlan(migration)}</p>
            <p>Copia a cada agente las filas que lo nombran; nada se borra.</p>
            <EuiAccordion id='ens-migration-moves' buttonContent='Ver qué se mueve y qué se copia'>
              <ul>
                {migration.moves.map(move => (
                  <li key={`${move.agentId}-${move.controlId}-${move.parameterId}`}>
                    {agentLabels[move.agentId] || `${move.agentId}${move.agentName ? ` · ${move.agentName}` : ''}`}: {parameterLabel(configuration, `${move.controlId} ${move.parameterId}`)}, {move.rows.length} fila(s) {move.mode === 'movida' ? 'salen del valor común' : 'se copian (se quedan también en el valor común)'}
                  </li>
                ))}
              </ul>
            </EuiAccordion>
            <EuiSpacer size='s' />
            <EuiButton fill size='s' isDisabled={data.loading || migration.incomplete.length > 0 || !scopeIds.length} onClick={() => setConfirmMigration(true)}>
              Repartir por agentes
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {confirmMigration && (
        <ConfirmModal
          title='Repartir por agentes'
          confirmLabel='Repartir'
          typedWord='repartir'
          danger
          onCancel={() => setConfirmMigration(false)}
          onConfirm={runMigration}
        >
          <EuiText size='s'>
            <p>{summarizeMigrationPlan(migration)}</p>
            {byAgent.map(agentId => (
              <React.Fragment key={agentId}>
                <h4>Agente {agentLabels[agentId] || agentId}</h4>
                <ul>
                  {migration.moves.filter(move => move.agentId === agentId).map(move => (
                    <li key={`${move.controlId}-${move.parameterId}`}>
                      {parameterLabel(configuration, `${move.controlId} ${move.parameterId}`)}: {move.rows.length} fila(s) {move.mode === 'movida' ? 'movidas' : 'copiadas'}
                    </li>
                  ))}
                </ul>
              </React.Fragment>
            ))}
            <p>
              Parámetros que se quedarían sin valor en algún agente del alcance:{' '}
              {migration.incomplete.length ? migration.incomplete.map(item => `${agentLabels[item.agentId] || item.agentId}: ${parameterLabel(configuration, `${item.controlId} ${item.parameterId}`)}`).join(', ') : 'ninguno'}.
            </p>
            <p>
              <strong>Los veredictos de estos agentes pueden cambiar</strong>: cada uno pasa a evaluarse con sus filas.
            </p>
            <p>La versión anterior queda en el historial.</p>
          </EuiText>
        </ConfirmModal>
      )}

      {migration.warnings.length > 0 && (
        <>
          <EuiCallOut color='warning' iconType='iInCircle' title={`${migration.warnings.length} fila(s) sin agente se quedan en el valor común`}>
            <p>Si una nombra a un agente con otro nombre, se añade en su página, en «Otros nombres de este agente».</p>
            <ul>
              {migration.warnings.map((warning, index) => (
                <li key={`${index}-${warning.controlId}-${warning.parameterId}`}>{describeMigrationWarning(warning, configuration)}</li>
              ))}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {errors.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='Ajustes de agentes que hay que corregir'>
            <ul>
              {errors.map((issue, index) => (
                <li key={`${index}-${issue.agentId}`}>
                  {agentLabels[issue.agentId] || issue.agentId}: {issue.message}
                  {issue.kind === 'huerfano' && (
                    <EuiButtonEmpty size='xs' color='danger' onClick={() => askRemoval(issue.agentId, issue.controlId, issue.parameterId)}>
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

      {removal && (
        <RemoveEntryModal
          configuration={configuration}
          removal={removal}
          onCancel={() => setRemoval(undefined)}
          onConfirm={confirmRemoval}
        />
      )}

      {warnings.length > 0 && (
        <>
          <EuiCallOut color='primary' iconType='iInCircle' size='s' title='Datos de otra versión del plugin (se ignoran)'>
            <ul>
              {warnings.map((issue, index) => <li key={`${index}-${issue.agentId}`}>{issue.message}</li>)}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiBasicTable
        items={rows}
        itemId='id'
        columns={columns}
        loading={data.loading}
        noItemsMessage='No hay agentes en el alcance.'
      />
    </>
  );
};
