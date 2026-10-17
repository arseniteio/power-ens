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

import type { ENSConfigurationVersion, ENSLevel } from '../types';
import { ENS_SYSTEM_TYPE_LABELS, normalizeAgentId } from '../../../../common/agent-configuration';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import type { ENSAgentScope } from '../../core/scope/types';
import { ENS_CONFIGURATION_TEMPLATES, getConfigurationTemplate } from '../templates';
import {
  ENSSystemDetection,
  detectAgentSystem,
  effectiveSystemType,
} from '../agents/system-detection';
import {
  applyTemplateToAgent,
  getAgentCompleteness,
} from '../agents/agent-configuration-actions';
import { getAgentControls } from '../agents/agent-controls';
import {
  describeMigrationWarning,
  planMigrationToSystems,
  summarizeMigrationPlan,
} from '../agents/migration';
import { validateAgentsConfiguration } from '../agents/agent-configuration-validator';
import { saveActiveENSConfiguration } from '../services/configuration-state-service';

import { AgentConfigurationPage } from './agent-configuration-page';
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

const message = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : 'No se pudo guardar la configuración ENS.';

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
  const [selected, setSelected] = useState<ENSSystemRow[]>([]);
  const [templateId, setTemplateId] = useState<string>(ENS_CONFIGURATION_TEMPLATES[0].id);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ color: 'success' | 'danger' | 'warning'; text: string } | undefined>();

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

  const migration = useMemo(
    () => planMigrationToSystems(configuration, data.inventory),
    [configuration, data.inventory]
  );

  const issues = useMemo(() => validateAgentsConfiguration(configuration), [configuration]);

  const save = async (candidate: ENSConfigurationVersion, reason: string) => {
    await saveActiveENSConfiguration(candidate, reason);
    onConfigurationSaved();
  };

  const runMigration = async () => {
    setSaving(true);
    setNotice(undefined);
    try {
      await save(migration.configuration, summarizeMigrationPlan(migration));
      setNotice({ color: 'success', text: `${summarizeMigrationPlan(migration)} La versión anterior queda en el historial.` });
    } catch (error) {
      setNotice({ color: 'danger', text: message(error) });
    } finally {
      setSaving(false);
    }
  };

  const applyToSelected = async () => {
    const template = getConfigurationTemplate(templateId);
    if (!template || !selected.length) return;
    setSaving(true);
    setNotice(undefined);
    let candidate = configuration;
    const skipped: string[] = [];
    const applied: string[] = [];
    selected.forEach(row => {
      const result = applyTemplateToAgent(candidate, row.id, templateId, row.agent, row.detection);
      if (result.error) skipped.push(`${row.id} (${result.error})`);
      else {
        candidate = result.configuration;
        applied.push(row.id);
      }
    });
    try {
      if (applied.length) {
        await save(candidate, `Plantilla «${template.label}» aplicada a ${applied.join(', ')}.`);
      }
      setNotice({
        color: skipped.length ? 'warning' : 'success',
        text: [
          applied.length ? `«${template.label}» aplicada a ${applied.join(', ')}.` : '',
          skipped.length ? `No se aplicó a: ${skipped.join('; ')}.` : '',
        ].filter(Boolean).join(' '),
      });
      setSelected([]);
    } catch (error) {
      setNotice({ color: 'danger', text: message(error) });
    } finally {
      setSaving(false);
    }
  };

  const selectedRow = target.agentId
    ? rows.find(row => row.id === normalizeAgentId(target.agentId))
    : undefined;

  if (target.agentId) {
    const row: ENSSystemRow = selectedRow || {
      id: normalizeAgentId(target.agentId),
      agent: { id: normalizeAgentId(target.agentId), groups: [] },
      inScope: false,
      detection: detectAgentSystem({ id: normalizeAgentId(target.agentId) }),
    };
    return (
      <AgentConfigurationPage
        configuration={configuration}
        row={row}
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
              <p>{effective.description}</p>
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
        const type = effectiveSystemType(row.detection, configuration.agents?.[row.id]).type;
        const measured = getAgentControls(configuration, row.id, type, getActiveLevel)
          .filter(control => control.measured)
          .map(control => ({ controlId: control.controlId, level: control.level }));
        const completeness = getAgentCompleteness(configuration, row.id, measured);
        return (
          <EuiText size='xs'>
            <p>
              {completeness.withValue} de {completeness.total} con valor · {completeness.ownValues} propios
              {completeness.missingRequired.length ? ` · ${completeness.missingRequired.length} obligatorios sin valor` : ''}
            </p>
          </EuiText>
        );
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

      {migration.changed && (
        <>
          <EuiCallOut color='primary' iconType='iInCircle' title='Hay valores de organización que son de un sistema concreto'>
            <p>{summarizeMigrationPlan(migration)}</p>
            <p>
              «Migrar a sistemas» pasa a cada agente las filas de las tablas con
              columna de sistema que lo nombran (por su id, su nombre o su
              hostname). Las filas «*» se quedan en la organización y se copian
              al agente; las que no nombran a ningún agente se quedan en la
              organización. No se borra nada: la versión anterior queda en el
              historial.
            </p>
            <EuiAccordion id='ens-migration-moves' buttonContent='Ver qué se mueve'>
              <ul>
                {migration.moves.map(move => (
                  <li key={`${move.agentId}-${move.controlId}-${move.parameterId}`}>
                    {move.controlId} {move.parameterId} → {move.agentId}
                    {move.agentName ? ` · ${move.agentName}` : ''}: {move.rows.length} fila(s)
                  </li>
                ))}
              </ul>
            </EuiAccordion>
            <EuiSpacer size='s' />
            <EuiButton fill size='s' isLoading={saving} isDisabled={saving || data.loading} onClick={runMigration}>
              Migrar a sistemas
            </EuiButton>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {migration.warnings.length > 0 && (
        <>
          <EuiCallOut color='warning' iconType='iInCircle' title={`${migration.warnings.length} fila(s) sin agente se quedan en la organización`}>
            <p>
              Lo heredan las máquinas sin valor propio. Si nombran una máquina
              del alcance con otro nombre, se añade ese nombre como alias del
              agente o se mueve la fila a mano.
            </p>
            <ul>
              {migration.warnings.map(warning => (
                <li key={`${warning.controlId}-${warning.parameterId}-${warning.row}`}>{describeMigrationWarning(warning)}</li>
              ))}
            </ul>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      {issues.length > 0 && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='Valores por sistema que no se pueden aplicar'>
            <ul>
              {issues.map(issue => (
                <li key={`${issue.agentId}-${issue.message}`}>{issue.agentId}: {issue.message}</li>
              ))}
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
            options={ENS_CONFIGURATION_TEMPLATES.map(template => ({
              value: template.id,
              text: `${template.label}${template.kind === 'addon' ? ' (añadido)' : ''}`,
            }))}
            value={templateId}
            onChange={event => setTemplateId(event.target.value)}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton size='s' isDisabled={!selected.length || saving} isLoading={saving} onClick={applyToSelected}>
            Aplicar a {selected.length} sistema(s) seleccionado(s)
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiText size='xs' color='subdued'>
        <p>{getConfigurationTemplate(templateId)?.description}</p>
      </EuiText>

      <EuiSpacer size='m' />

      <EuiBasicTable
        items={rows}
        itemId='id'
        columns={columns as any}
        loading={data.loading}
        isSelectable
        selection={{ onSelectionChange: (items: ENSSystemRow[]) => setSelected(items) }}
        noItemsMessage='No hay agentes en el alcance.'
      />
    </>
  );
};
