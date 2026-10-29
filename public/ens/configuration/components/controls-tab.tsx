import React, { useMemo, useState } from 'react';
import { withInventoryTypes } from '../../../../common/ens/configuration/agents/system-detection';
import { EuiBadge, EuiBasicTable, EuiButton, EuiButtonEmpty, EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';

import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import { ENS_NO_TEMPLATE } from '../../../../common/agent-configuration';
import { ENSConfigurationRegistry, getENSControlConfiguration } from '../../../../common/ens/configuration/registry';
import { resolveControlConfigurationState } from '../../../../common/ens/configuration/services/validation-engine';
import { getBuiltinTemplates, getCustomTemplates } from '../../../../common/ens/configuration/templates';
import { effectiveSystemType } from '../../../../common/ens/configuration/agents/system-detection';
import {
  addMissingControls,
  getAgentGaps,
  getMissingCatalogControls,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { errorMessage } from './confirm-modal';
import { ControlPage, commonView } from './control-page';
import { plural } from './labels';
import { ENSAgentsData, buildAgentRows, useAgentsData } from './use-agents-data';

interface ControlsTabProps {
  configuration: ENSConfigurationVersion;
  target: ENSConfigurationTarget;
  getActiveLevel: (controlId: string) => ENSLevel;
  onNavigate: (target: Partial<ENSConfigurationTarget>) => void;
  onConfigurationSaved: () => void;
}

interface ControlRow {
  id: string;
  catalog: ENSControlConfiguration;
  control?: ENSControlConfiguration;
}

const STATES: Record<string, { label: string; color: 'success' | 'danger' | 'warning' | 'default' }> = {
  CONFIGURED: { label: 'Configurado', color: 'success' },
  INCOMPLETE: { label: 'Incompleto', color: 'danger' },
  INVALID: { label: 'Inválido', color: 'danger' },
  NOT_CONFIGURED: { label: 'Sin configurar', color: 'warning' },
  MISSING: { label: 'Sin añadir', color: 'default' },
};

const MAX_LINES = 3;

export const ControlsTab = (props: ControlsTabProps) => {
  // Loaded once for the list and the control page.
  const data = useAgentsData();
  const { target, getActiveLevel, onNavigate, onConfigurationSaved } = props;
  const configuration = useMemo(() => withInventoryTypes(props.configuration, data.inventory), [props.configuration, data.inventory]);
  const selected = target.controlId ? configuration.controls.find(control => control.controlId === target.controlId) : undefined;

  if (selected) {
    return (
      <ControlPage
        key={selected.controlId}
        configuration={configuration}
        control={selected}
        activeLevel={getActiveLevel(selected.controlId)}
        focusParameterId={target.parameterId}
        data={data}
        onNavigate={onNavigate}
        onConfigurationSaved={onConfigurationSaved}
      />
    );
  }

  return <ControlsList {...props} data={data} />;
};

const ControlsList = ({ configuration, target, getActiveLevel, onNavigate, onConfigurationSaved, data }: ControlsTabProps & { data: ENSAgentsData }) => {
  const [adding, setAdding] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const rows = useMemo(() => buildAgentRows(configuration, data).filter(row => row.inScope), [configuration, data]);
  const gaps: Record<string, Record<string, number>> = useMemo(
    () =>
      data.loading
        ? {}
        : getAgentGaps(
            configuration,
            rows.map(row => ({ agentId: row.id, type: effectiveSystemType(row.detection, configuration.agents?.[row.id]).type })),
            getActiveLevel
          ),
    [configuration, rows, data.loading, getActiveLevel]
  );
  const missing = getMissingCatalogControls(configuration);

  const add = async (controlIds: string[], key: string) => {
    setAdding(key);
    setError(undefined);
    try {
      const done = await saveFromLatestConfiguration(latest => {
        const result = addMissingControls(latest, controlIds);
        return result.added.length
          ? { configuration: result.configuration, reason: `Alta de ${result.added.join(', ')} con valores por defecto.` }
          : undefined;
      });
      if (done) onConfigurationSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setAdding(undefined);
    }
  };

  const items: ControlRow[] = ENSConfigurationRegistry.map(catalog => ({
    id: catalog.controlId,
    catalog,
    control: configuration.controls.find(control => control.controlId === catalog.controlId),
  }));

  const nameOf = (control: ENSControlConfiguration, parameterId: string) =>
    control.parameters.find(parameter => parameter.id === parameterId)?.label || parameterId;

  const stateOf = (row: ControlRow): { key: string; lines: string[] } => {
    if (!row.control) return { key: 'MISSING', lines: ['No se evalúa hasta añadirlo.'] };
    const control = row.control;
    const state = resolveControlConfigurationState(commonView(control), getActiveLevel(row.id));
    const lines =
      state.status === 'INCOMPLETE'
        ? state.validation.missingRequired.map(parameter => `Falta «${parameter.label}».`)
        : state.status === 'INVALID'
        ? state.validation.issues.map(issue => `«${issue.label}» no es válido.`)
        : [];
    const perAgent = Object.entries(gaps[row.id] || {}).map(([parameterId, count]) => `Falta «${nameOf(control, parameterId)}» en ${plural(count, 'agente', 'agentes')}.`);
    const key = perAgent.length && (state.status === 'CONFIGURED' || state.status === 'NOT_CONFIGURED') ? 'INCOMPLETE' : state.status;
    const all = [...lines, ...perAgent, ...(data.loading ? ['Comprobando los agentes…'] : [])];
    return { key, lines: all.length > MAX_LINES ? [...all.slice(0, MAX_LINES), `Y ${all.length - MAX_LINES} más.`] : all };
  };

  const columns: EuiBasicTableColumn<ControlRow>[] = [
    {
      field: 'id',
      name: 'Control',
      render: (id: string, row: ControlRow) =>
        row.control ? (
          <EuiButtonEmpty size='xs' flush='left' onClick={() => onNavigate({ view: 'controls', controlId: id })}>
            {id} · {row.catalog.controlName}
          </EuiButtonEmpty>
        ) : (
          <EuiText size='s'><p>{id} · {row.catalog.controlName}</p></EuiText>
        ),
    },
    {
      field: 'catalog',
      name: 'Estado',
      render: (_catalog: unknown, row: ControlRow) => {
        const state = stateOf(row);
        return (
          <div>
            <EuiBadge color={STATES[state.key].color}>{STATES[state.key].label}</EuiBadge>
            {state.lines.map(line => (
              <EuiText key={line} size='xs' color='subdued'><p>{line}</p></EuiText>
            ))}
          </div>
        );
      },
    },
    {
      field: 'control',
      name: 'Plantillas',
      render: (_control: unknown, row: ControlRow) => {
        const builtins = getBuiltinTemplates(row.id).length;
        if (!builtins) return <EuiText size='xs' color='subdued'><p>Solo ajustes comunes</p></EuiText>;
        const own = getCustomTemplates(configuration, row.id).length;
        const assigned = rows.filter(agent => {
          const templateId = configuration.agents?.[agent.id]?.controls?.[row.id]?.templateId;
          return typeof templateId === 'string' && templateId !== ENS_NO_TEMPLATE;
        }).length;
        return (
          <EuiText size='xs'>
            <p>{builtins} de serie · {own} propia(s) · {plural(assigned, 'agente', 'agentes')} con plantilla asignada</p>
          </EuiText>
        );
      },
    },
    {
      field: 'id',
      name: '',
      render: (id: string, row: ControlRow) =>
        row.control ? (
          <EuiButton size='s' onClick={() => onNavigate({ view: 'controls', controlId: id })}>Abrir</EuiButton>
        ) : (
          <EuiButton size='s' fill={id === target.controlId} isLoading={adding === id} isDisabled={!!adding} onClick={() => add([id], id)}>
            Añadir con valores por defecto
          </EuiButton>
        ),
    },
  ];

  return (
    <>
      {target.controlId && (
        <>
          <EuiCallOut color='warning' iconType='iInCircle' title={`${target.controlId} no está en la configuración`}>
            <p>
              {getENSControlConfiguration(target.controlId)
                ? 'Se añade en la lista con «Añadir con valores por defecto».'
                : `${target.controlId} no es ningún control del catálogo de esta versión.`}
            </p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiText size='s' color='subdued'>
        <p>Ajustes comunes, plantillas y asignación de cada control.</p>
      </EuiText>

      <EuiSpacer size='m' />

      {error && (
        <>
          <EuiCallOut color='danger' iconType='alert' title='No se pudo añadir'>
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiBasicTable items={items} itemId='id' columns={columns} />

      {missing.length > 1 && (
        <>
          <EuiSpacer size='m' />
          <EuiButton size='s' isLoading={adding === '*'} isDisabled={!!adding} onClick={() => add(missing.map(control => control.controlId), '*')}>
            Añadir los {missing.length} que faltan con valores por defecto
          </EuiButton>
        </>
      )}
    </>
  );
};
