import React from 'react';
import { EuiText } from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import { describeAgentEntryRemoval } from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { ConfirmModal } from './confirm-modal';

export interface ENSEntryRemoval {
  // The profile key AS stored in the document (may be a name).
  agentKey: string;
  controlId?: string;
}

interface RemoveEntryModalProps {
  configuration: ENSConfigurationVersion;
  removal: ENSEntryRemoval;
  onCancel: () => void;
  onConfirm: () => Promise<string | undefined>;
}

// Removes a whole profile, or a whole control of a profile, showing what is lost value by value first. A whole
// profile requires typing «quitar»: it is owner data, recoverable only from the history.
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
        <p>No se aplica a ninguna máquina. La versión anterior queda en el historial.</p>
      </EuiText>
    </ConfirmModal>
  );
};
