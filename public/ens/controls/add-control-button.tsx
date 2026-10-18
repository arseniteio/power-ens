// «Añadir con valores por defecto» desde la lista y el detalle: la misma
// acción que «Controles del catálogo sin añadir» de Configuración (Task 3), un
// control que existe en el catálogo pero no en la configuración activa. Se
// guarda sobre el documento más reciente; guardar exige el rol de siempre.
import React, { useState } from 'react';
import { EuiButton, EuiText } from '@elastic/eui';
import { addMissingControls } from '../../../common/ens/configuration/agents/agent-configuration-actions';
import { saveFromLatestConfiguration } from '../../../common/ens/configuration/services/configuration-state-service';

export const NOT_IN_CONFIGURATION_TEXT = 'No está en la configuración activa';

export const addControlWithDefaults = (controlId: string) =>
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
  const [estado, setEstado] = useState<{ saving?: boolean; error?: string; done?: boolean }>({});

  if (estado.done) {
    return (
      <EuiText size='xs' color='success'>
        <p>{controlId} añadido a la configuración activa. Se evalúa en la próxima actualización.</p>
      </EuiText>
    );
  }

  return (
    <>
      <EuiButton
        size={size === 'xs' ? 's' : size}
        iconType='plusInCircle'
        isLoading={estado.saving}
        onClick={async () => {
          setEstado({ saving: true });
          try {
            await addControlWithDefaults(controlId);
            setEstado({ done: true });
            onAdded?.();
          } catch (failure) {
            setEstado({ error: String((failure as any)?.message || failure) });
          }
        }}
      >
        Añadir con valores por defecto
      </EuiButton>
      {estado.error && (
        <EuiText size='xs' color='danger'>
          <p>No se pudo añadir: {estado.error}</p>
        </EuiText>
      )}
    </>
  );
};
