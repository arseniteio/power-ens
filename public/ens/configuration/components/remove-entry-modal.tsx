import React from 'react';
import { EuiText } from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { describeAgentEntryRemoval } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { ConfirmModal } from './confirm-modal';

export interface ENSEntryRemoval {
  // La clave del perfil TAL CUAL está en el documento (puede ser un nombre).
  agentKey: string;
  controlId?: string;
}

interface RemoveEntryModalProps {
  configuration: ENSConfigurationVersion;
  removal: ENSEntryRemoval;
  onCancel: () => void;
  onConfirm: () => Promise<string | undefined>;
}

// Quitar un perfil entero, o un control entero de un perfil: antes, lo que se
// pierde, valor a valor. Un perfil entero pide teclear «quitar»: son datos del
// responsable y solo se recuperan desde el historial.
export const RemoveEntryModal = ({ configuration, removal, onCancel, onConfirm }: RemoveEntryModalProps) => {
  const lines = describeAgentEntryRemoval(configuration, removal.agentKey, removal.controlId);
  const whole = !removal.controlId;

  return (
    <ConfirmModal
      title={whole ? `Quitar el perfil «${removal.agentKey}»` : `Quitar ${removal.controlId} del perfil «${removal.agentKey}»`}
      confirmLabel='Quitar'
      typedWord={whole ? 'quitar' : undefined}
      danger
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <EuiText size='s'>
        <p>Se borra todo esto del documento:</p>
        <ul>
          {lines.length ? lines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>) : <li>nada guardado</li>}
        </ul>
        <p>
          Hoy no se aplica a ninguna máquina. La versión anterior del documento
          queda en el historial y se restaura desde allí (guía 09, apartado 12).
        </p>
      </EuiText>
    </ConfirmModal>
  );
};
