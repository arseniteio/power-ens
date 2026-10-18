import React, { useState } from 'react';
import {
  EuiButton,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import type { ENSConfigurationVersion } from '../types';
import {
  addMissingControls,
  getMissingCatalogControls,
} from '../agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../services/configuration-state-service';
import { errorMessage } from './confirm-modal';

interface MissingControlsPanelProps {
  configuration: ENSConfigurationVersion;
  highlightControlId?: string;
  onConfigurationSaved: () => void;
}


// Los controles del catálogo que el documento no tiene. Antes solo se añadían
// con `config/inject-control.py`; desde aquí se añaden con la misma semántica:
// la definición del control tal cual y sin valores (salvo los que el bloque
// declara por defecto), sin tocar el resto.
export const MissingControlsPanel = ({
  configuration,
  highlightControlId,
  onConfigurationSaved,
}: MissingControlsPanelProps) => {
  const missing = getMissingCatalogControls(configuration);
  const [saving, setSaving] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (!missing.length) {
    return null;
  }

  const add = async (controlIds: string[], key: string) => {
    setSaving(key);
    setError(undefined);
    try {
      const done = await saveFromLatestConfiguration(latest => {
        const result = addMissingControls(latest, controlIds);
        return result.added.length
          ? {
              configuration: result.configuration,
              reason: `Alta de ${result.added.join(', ')} en la configuración activa (valores por defecto).`,
            }
          : undefined;
      });
      if (done) onConfigurationSaved();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(undefined);
    }
  };

  return (
    <EuiPanel paddingSize='m' color='subdued'>
      <EuiTitle size='s'>
        <h3>Controles del catálogo sin añadir ({missing.length})</h3>
      </EuiTitle>

      <EuiText size='s' color='subdued'>
        <p>
          Estos controles existen en esta versión del plugin pero no están en la
          configuración: no se evalúan hasta que se añaden. Se añaden con su
          definición y sin valores (los que declara el bloque por defecto); los
          parámetros obligatorios sin valor dejan sus evidencias NO_EVALUABLE
          hasta que se rellenan.
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

      {missing.map(control => (
        <EuiFlexGroup
          key={control.controlId}
          alignItems='center'
          gutterSize='s'
          responsive={false}
        >
          <EuiFlexItem>
            <EuiText size='s'>
              <p>
                {control.controlId === highlightControlId ? <strong>{control.controlId}</strong> : control.controlId}
                {' · '}
                {control.controlName} ({control.parameters.length} parámetros)
              </p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              size='s'
              fill={control.controlId === highlightControlId}
              isLoading={saving === control.controlId}
              isDisabled={!!saving}
              onClick={() => add([control.controlId], control.controlId)}
            >
              Añadir con valores por defecto
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      ))}

      {missing.length > 1 && (
        <>
          <EuiSpacer size='m' />
          <EuiButton
            size='s'
            isLoading={saving === '*'}
            isDisabled={!!saving}
            onClick={() => add(missing.map(control => control.controlId), '*')}
          >
            Añadir los {missing.length} con valores por defecto
          </EuiButton>
        </>
      )}
    </EuiPanel>
  );
};
