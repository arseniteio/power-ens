import React, { useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion, ENSLevel } from '../../../../common/ens/configuration/types';
import { ENS_SYSTEM_TYPE_LABELS, normalizeAgentId } from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import type { ENSAgentScope } from '../../../../common/ens/core/scope/types';
import { ENS_CONFIGURATION_TEMPLATES, getConfigurationTemplate } from '../../../../common/ens/configuration/templates';
import {
  ENSSystemDetection,
  detectAgentSystem,
  effectiveSystemType,
} from '../../../../common/ens/configuration/agents/system-detection';
import {
  ENSTemplatePreview,
  applyTemplateToAgent,
  getAgentCompleteness,
  previewTemplateApplication,
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
import { ENSEntryRemoval, RemoveEntryModal } from './remove-entry-modal';
import { TemplatePreviewModal } from './template-preview-modal';
import { useSystemsData } from './use-systems-data';

interface SystemsLevelProps {
  configuration: ENSConfigurationVersion;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

export interface ENSSystemRow {
  id: string;
  agent: ENSAgentScope;
  inScope: boolean;
  detection: ENSSystemDetection;
}

type Notice = { color: 'success' | 'danger' | 'warning'; text: string } | undefined;

// «Sistemas»: los agentes del alcance con su tipo detectado (y corregible),
// sus plantillas y cuánto tienen declarado. Los perfiles de máquinas que ya no
// están en el alcance se enseñan también, para que nada guardado quede oculto.
export const SystemsLevel = ({
  configuration,
  target,
  getActiveLevel,
  onNavigate,
  onConfigurationSaved,
}: SystemsLevelProps) => {
  const data = useSystemsData();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // Sin plantilla elegida de antemano: elegirla es una decisión.
  const [templateId, setTemplateId] = useState<string>('');
  const [preview, setPreview] = useState<ENSTemplatePreview[] | undefined>();
  const [confirmMigration, setConfirmMigration] = useState(false);
  // Quitar un perfil o un control enteros: primero, lo que se pierde.
  const [removal, setRemoval] = useState<ENSEntryRemoval | undefined>();
  const [notice, setNotice] = useState<Notice>();
  // La selección de EuiBasicTable no se controla desde fuera: tras aplicar, la
  // tabla se monta de nuevo para que las casillas se vacíen de verdad.
  const [tableKey, setTableKey] = useState(0);

  const rows = useMemo<ENSSystemRow[]>(() => {
    const byId = new Map<string, ENSSystemRow>();
    const fromInventory = new Map(data.inventory.map(agent => [normalizeAgentId(agent.id), agent]));

    data.scopeAgents.forEach(agent => {
      const id = normalizeAgentId(agent.id);
      const full = { ...(fromInventory.get(id) || {}), ...agent, os: agent.os || fromInventory.get(id)?.os };
      byId.set(id, { id, agent: full, inScope: true, detection: detectAgentSystem(full, data.facts[id]) });
    });

    Object.entries(configuration.agents || {}).forEach(([id, profile]) => {
      if (byId.has(id)) return;
      const agent = fromInventory.get(id) || { id, name: profile?.name, groups: [] };
      byId.set(id, { id, agent, inScope: false, detection: detectAgentSystem(agent, data.facts[id]) });
    });

    return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
  }, [data, configuration]);

  const scopeIds = useMemo(() => data.scopeAgents.map(agent => normalizeAgentId(agent.id)), [data.scopeAgents]);

  const migration = useMemo(
    () => planMigrationToSystems(configuration, data.inventory, { scopeAgentIds: scopeIds }),
    [configuration, data.inventory, scopeIds]
  );

  const issues = useMemo(() => validateAgentsConfiguration(configuration), [configuration]);
  const errors = issues.filter(issue => issue.severity === 'error');
  const warnings = issues.filter(issue => issue.severity === 'warning');

  // Una vez por documento, no en cada clic.
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
    // Sin máquinas en el alcance no se migra (ver `emptyScope`).
    if (!scopeIds.length) return 'El alcance ENS no tiene ninguna máquina: no se puede migrar.';
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
          : 'No había nada que migrar en la versión más reciente del documento.',
      });
      onConfigurationSaved();
      return undefined;
    } catch (error) {
      return errorMessage(error);
    }
  };

  const openPreview = () => {
    if (!templateId || !selectedIds.length) return;
    setPreview(
      selectedIds.map(id => {
        const row = rowById(id);
        const type = row ? effectiveSystemType(row.detection, configuration.agents?.[id]).type : undefined;
        return previewTemplateApplication(configuration, id, templateId, type, row?.agent, row?.detection);
      })
    );
  };

  const applyPreview = async (): Promise<string | undefined> => {
    const template = getConfigurationTemplate(templateId);
    const ids = (preview || []).filter(item => !item.error).map(item => item.agentId);
    try {
      await saveFromLatestConfiguration(latest => {
        let candidate = latest;
        ids.forEach(id => {
          const row = rowById(id);
          const result = applyTemplateToAgent(candidate, id, templateId, row?.agent, row?.detection);
          if (!result.error) candidate = result.configuration;
        });
        return ids.length ? { configuration: candidate, reason: `Plantilla «${template?.label}» aplicada a ${ids.join(', ')}.` } : undefined;
      });
      const skipped = (preview || []).filter(item => item.error);
      setNotice({
        color: skipped.length ? 'warning' : 'success',
        text: [
          ids.length ? `«${template?.label}» aplicada a ${ids.join(', ')}.` : '',
          skipped.length ? `No se aplicó a: ${skipped.map(item => `${item.agentId} (${item.error})`).join('; ')}.` : '',
        ].filter(Boolean).join(' '),
      });
      setPreview(undefined);
      setSelectedIds([]);
      setTableKey(key => key + 1);
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

  // Un valor suelto se quita directamente; un perfil o un control enteros,
  // tras enseñar lo que se pierde.
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
    const row: ENSSystemRow = rowById(id) || {
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

  const columns = [
    {
      field: 'id',
      name: 'Agente',
      render: (_id: string, row: ENSSystemRow) => (
        <EuiButtonEmpty size='xs' flush='left' onClick={() => onNavigate({ view: 'systems', agentId: row.id })}>
          {row.id} · {row.agent.name || 'sin nombre'}
        </EuiButtonEmpty>
      ),
    },
    {
      field: 'detection',
      name: 'Tipo',
      render: (_detection: ENSSystemDetection, row: ENSSystemRow) => {
        const effective = effectiveSystemType(row.detection, configuration.agents?.[row.id]);
        return (
          <div>
            <EuiBadge color={effective.type ? (effective.manual ? 'accent' : 'hollow') : 'warning'}>
              {effective.type ? ENS_SYSTEM_TYPE_LABELS[effective.type] : 'Sin detectar'}
            </EuiBadge>
            <EuiText size='xs' color='subdued'>
              <p>{data.loading && !effective.manual ? 'detectando…' : effective.description}</p>
            </EuiText>
          </div>
        );
      },
    },
    {
      field: 'agent',
      name: 'Plantillas',
      render: (_agent: ENSAgentScope, row: ENSSystemRow) => {
        const applied = configuration.agents?.[row.id]?.templates || [];
        return applied.length ? (
          applied.map(id => (
            <EuiBadge key={id} color='primary'>{getConfigurationTemplate(id)?.label || id}</EuiBadge>
          ))
        ) : (
          <EuiText size='xs' color='subdued'><p>ninguna</p></EuiText>
        );
      },
    },
    {
      field: 'inScope',
      name: 'Completitud',
      render: (_inScope: boolean, row: ENSSystemRow) => {
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
      render: (agent: ENSAgentScope, row: ENSSystemRow) =>
        row.inScope ? (
          <EuiText size='xs'><p>{agent.status || '—'}</p></EuiText>
        ) : (
          <EuiBadge color='default'>fuera del alcance</EuiBadge>
        ),
    },
  ];

  const byAgent = Array.from(new Set(migration.moves.map(move => move.agentId))).sort();

  return (
    <>
      <EuiTitle size='s'>
        <h3>Sistemas del alcance</h3>
      </EuiTitle>
      <EuiText size='s' color='subdued'>
        <p>
          El tipo se detecta del inventario (Windows, Linux), del id 000 (el
          manager) y de los hechos del recolector LDAP; se corrige dentro de cada
          sistema. El alcance no se edita aquí: se define en initial-setup.
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      {data.errors.map(error => (
        <React.Fragment key={error}>
          <EuiCallOut color='warning' iconType='alert' size='s' title='Detección incompleta'>
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
          <EuiCallOut color='warning' iconType='alert' size='s' title='«Migrar a sistemas» no está disponible: el alcance ENS no tiene ninguna máquina'>
            <p>
              Sin máquinas en el alcance no se puede comprobar que ninguna se
              quede sin un parámetro obligatorio. El alcance se define en
              initial-setup.
            </p>
            <EuiButton fill size='s' isDisabled>
              Migrar a sistemas
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {migration.changed && (
        <>
          <EuiCallOut color='primary' iconType='iInCircle' title='Hay valores de organización que son de un sistema concreto'>
            <p>{summarizeMigrationPlan(migration)}</p>
            <p>
              «Migrar a sistemas» copia a cada agente las filas de las tablas con
              columna de sistema que lo nombran (por su id, su nombre, su hostname
              o sus otros nombres). Una fila sale de la organización solo si
              ninguna máquina del alcance se queda con ello sin valor; si no, se
              copia y se queda también en la organización. Las filas «*» se
              copian; las que no nombran a ningún agente se quedan. No se borra
              nada: la versión anterior queda en el historial.
            </p>
            <EuiAccordion id='ens-migration-moves' buttonContent='Ver qué se mueve y qué se copia'>
              <ul>
                {migration.moves.map(move => (
                  <li key={`${move.agentId}-${move.controlId}-${move.parameterId}`}>
                    {move.agentId}{move.agentName ? ` · ${move.agentName}` : ''}: {move.controlId} {move.parameterId}, {move.rows.length} fila(s) {move.mode === 'movida' ? 'salen de la organización' : 'se copian (se quedan también en la organización)'}
                  </li>
                ))}
              </ul>
            </EuiAccordion>
            <EuiSpacer size='s' />
            <EuiButton fill size='s' isDisabled={data.loading || migration.incomplete.length > 0 || !scopeIds.length} onClick={() => setConfirmMigration(true)}>
              Migrar a sistemas
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {confirmMigration && (
        <ConfirmModal
          title='Migrar a sistemas'
          confirmLabel='Migrar'
          typedWord='migrar'
          danger
          onCancel={() => setConfirmMigration(false)}
          onConfirm={runMigration}
        >
          <EuiText size='s'>
            <p>{summarizeMigrationPlan(migration)}</p>
            {byAgent.map(agentId => (
              <React.Fragment key={agentId}>
                <h4>Sistema {agentId}</h4>
                <ul>
                  {migration.moves.filter(move => move.agentId === agentId).map(move => (
                    <li key={`${move.controlId}-${move.parameterId}`}>
                      {move.controlId} {move.parameterId}: {move.rows.length} fila(s) {move.mode === 'movida' ? 'movidas' : 'copiadas'}
                    </li>
                  ))}
                </ul>
              </React.Fragment>
            ))}
            <p>
              Parámetros que se quedarían sin valor en alguna máquina del alcance:{' '}
              {migration.incomplete.length ? migration.incomplete.map(item => `${item.agentId} ${item.controlId} ${item.parameterId}`).join(', ') : 'ninguno'}.
            </p>
            <p>
              <strong>Los veredictos de estas máquinas pueden cambiar</strong>: cada
              una pasa a evaluarse con sus filas, no con las de las demás.
            </p>
            <p>
              Un plugin 1.1.0 no lee los valores por sistema: si se vuelve a la
              1.1.0, deja de ver las filas que salen de la organización.
            </p>
            <p>
              La versión anterior del documento queda en el historial. Antes,
              guardar además una copia (guía 09, apartado 8.1).
            </p>
          </EuiText>
        </ConfirmModal>
      )}

      {migration.warnings.length > 0 && (
        <>
          <EuiCallOut color='warning' iconType='iInCircle' title={`${migration.warnings.length} fila(s) sin agente se quedan en la organización`}>
            <p>
              Lo heredan las máquinas sin valor propio. Si una nombra a una
              máquina del alcance con otro nombre, ese nombre se añade en la
              página de la máquina, en «Otros nombres de esta máquina», y la
              migración la reconoce.
            </p>
            <ul>
              {migration.warnings.map((warning, index) => (
                <li key={`${index}-${warning.controlId}-${warning.parameterId}`}>{describeMigrationWarning(warning)}</li>
              ))}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {errors.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='Valores por sistema que hay que corregir'>
            <ul>
              {errors.map((issue, index) => (
                <li key={`${index}-${issue.agentId}`}>
                  {issue.agentId}: {issue.message}
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
          <EuiCallOut color='primary' iconType='iInCircle' size='s' title='Claves que esta versión no conoce (se ignoran)'>
            <ul>
              {warnings.map((issue, index) => <li key={`${index}-${issue.agentId}`}>{issue.message}</li>)}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiFlexGroup gutterSize='s' alignItems='center' responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiSelect
            compressed
            aria-label='Plantilla'
            options={[
              { value: '', text: 'Elegir plantilla…' },
              ...ENS_CONFIGURATION_TEMPLATES.map(template => ({
                value: template.id,
                text: `${template.label}${template.kind === 'addon' ? ' (añadido)' : ''}`,
              })),
            ]}
            value={templateId}
            onChange={event => setTemplateId(event.target.value)}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size='s' isDisabled={!templateId || !selectedIds.length} onClick={openPreview}>
            Aplicar a {selectedIds.length} sistema(s) seleccionado(s)…
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      {templateId && (
        <EuiText size='xs' color='subdued'>
          <p>{getConfigurationTemplate(templateId)?.description}</p>
        </EuiText>
      )}

      {preview && (
        <TemplatePreviewModal
          label={getConfigurationTemplate(templateId)?.label || templateId}
          previews={preview}
          onCancel={() => setPreview(undefined)}
          onConfirm={applyPreview}
        />
      )}

      <EuiSpacer size='m' />

      <EuiBasicTable
        key={tableKey}
        items={rows}
        itemId='id'
        columns={columns as any}
        loading={data.loading}
        isSelectable
        selection={{ onSelectionChange: (items: ENSSystemRow[]) => setSelectedIds(items.map(item => item.id)) }}
        noItemsMessage='No hay agentes en el alcance.'
      />
    </>
  );
};
