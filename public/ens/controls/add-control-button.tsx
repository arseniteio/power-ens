// Adds a catalogue control with default values, saving over the latest configuration document.
import React, { useState } from 'react';
import { EuiButton, EuiText } from '@elastic/eui';
import { addMissingControls } from '../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../common/ens/configuration/services/configuration-state-service';

export const NOT_IN_CONFIGURATION_TEXT = 'No está en la configuración activa';

const addControlWithDefaults = (controlId: string) =>
  saveFromLatestConfiguration(latest => {
    const result = addMissingControls(latest, [controlId]);
    return result.added.length
      ? {
          configuration: result.configuration,
          reason: `Alta de ${result.added.join(', ')} en la configuración activa (valores por defecto).`,
        }
      : undefined;
  });

export const AddControlWithDefaultsButton = ({ controlId, onAdded, size = 's' }: { controlId: string; onAdded?: () => void; size?: 's' | 'xs' }) => {
  const [status, setStatus] = useState<{ saving?: boolean; error?: string; done?: boolean }>({});

  if (status.done) {
    return (
      <EuiText size='xs' color='secondary'>
        <p>{controlId} añadido a la configuración activa. Se evalúa en la próxima actualización.</p>
      </EuiText>
    );
  }

  return (
    <>
      <EuiButton
        size={size === 'xs' ? 's' : size}
        iconType='plusInCircle'
        isLoading={status.saving}
        onClick={async () => {
          setStatus({ saving: true });
          try {
            await addControlWithDefaults(controlId);
            setStatus({ done: true });
            onAdded?.();
          } catch (failure) {
            setStatus({ error: String((failure as any)?.message || failure) });
          }
        }}
      >
        Añadir con valores por defecto
      </EuiButton>
      {status.error && (
        <EuiText size='xs' color='danger'>
          <p>No se pudo añadir: {status.error}</p>
        </EuiText>
      )}
    </>
  );
};
