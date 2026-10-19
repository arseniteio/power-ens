import React, { useState } from 'react';
import {
  EuiBadge,
  EuiBasicTable,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import type {
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSLevel,
} from '../../../../common/ens/configuration/types';
import { ENSConfigurationRegistry, getENSControlConfiguration } from '../../../../common/ens/configuration/registry';
import { resolveControlConfigurationState } from '../../../../common/ens/configuration/services/validation-engine';
import { getBuiltinTemplates, getCustomTemplates } from '../../../../common/ens/configuration/templates';
import { addMissingControls, getMissingCatalogControls } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import type { ENSConfigurationTarget } from '../../../routing/configuration-link';
import { errorMessage } from './confirm-modal';
import { ControlPage, commonView } from './control-page';

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

// «Controles»: the 23 catalog controls with their state, and each control's page.
export const ControlsTab = ({ configuration, target, getActiveLevel, onNavigate, onConfigurationSaved }: ControlsTabProps) => {
  const [adding, setAdding] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const selected = target.controlId ? configuration.controls.find(control => control.controlId === target.controlId) : undefined;

  if (selected) {
    return (
      <ControlPage
        key={selected.controlId}
        configuration={configuration}
        control={selected}
        activeLevel={getActiveLevel(selected.controlId)}
        focusParameterId={target.parameterId}
        onNavigate={onNavigate}
        onConfigurationSaved={onConfigurationSaved}
      />
    );
  }

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

  const rows: ControlRow[] = ENSConfigurationRegistry.map(catalog => ({
    id: catalog.controlId,
    catalog,
    control: configuration.controls.find(control => control.controlId === catalog.controlId),
  }));

  const stateOf = (row: ControlRow) => {
    if (!row.control) return { key: 'MISSING', detail: 'no se evalúa hasta añadirlo' };
    const state = resolveControlConfigurationState(commonView(row.control), getActiveLevel(row.id));
    const detail =
      state.status === 'INCOMPLETE'
        ? `faltan ${state.validation.missingRequired.map(parameter => parameter.id).join(', ')}`
        : state.status === 'INVALID'
        ? `inválidos ${state.validation.issues.map(issue => issue.parameterId).join(', ')}`
        : '';
    return { key: state.status, detail };
  };

  const columns = [
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
            {state.detail && <EuiText size='xs' color='subdued'><p>{state.detail}</p></EuiText>}
          </div>
        );
      },
    },
    {
      field: 'control',
      name: 'Plantillas',
      render: (_control: unknown, row: ControlRow) => {
        const builtins = getBuiltinTemplates(row.id).length;
        if (!builtins) return <EuiText size='xs' color='subdued'><p>solo ajustes comunes</p></EuiText>;
        const own = getCustomTemplates(configuration, row.id).length;
        const assigned = Object.values(configuration.agents || {}).filter(profile => typeof profile?.controls?.[row.id]?.templateId === 'string').length;
        return (
          <EuiText size='xs'>
            <p>{builtins} de serie · {own} propia(s) · {assigned} agente(s) con plantilla asignada</p>
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
      {target.controlId && !selected && (
        <>
          <EuiCallOut color='warning' iconType='iInCircle' title={`${target.controlId} no está en la configuración`}>
            <p>
              {getENSControlConfiguration(target.controlId)
                ? 'El enlace pide un control que todavía no se ha añadido: se añade en la lista con «Añadir con valores por defecto».'
                : `${target.controlId} no es ningún control del catálogo de esta versión.`}
            </p>
          </EuiCallOut>
          <EuiSpacer size='m' />
        </>
      )}

      <EuiText size='s' color='subdued'>
        <p>
          Cada control tiene sus ajustes comunes, sus plantillas y la asignación de plantilla a cada agente. Un control
          sin añadir se añade con la definición del catálogo y sin valores, salvo los que declara por defecto.
        </p>
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

      <EuiBasicTable items={rows} itemId='id' columns={columns as any} />

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
