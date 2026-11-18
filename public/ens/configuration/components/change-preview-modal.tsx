import React from 'react';
import { EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';

import type { ENSConfigurationVersion } from '../../../../common/ens/configuration/types';
import type {
  ENSAgentChangePreview,
  ENSAssignmentPreview,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { ConfirmModal } from './confirm-modal';
import { parameterLabel } from './labels';

interface ChangePreviewModalProps {
  title: string;
  confirmLabel: string;
  intro: string;
  configuration: ENSConfigurationVersion;
  agentLabels?: Record<string, string>;
  previews: (ENSAgentChangePreview & Partial<ENSAssignmentPreview>)[];
  onCancel: () => void;
  onConfirm: () => Promise<string | undefined>;
}

export const ChangePreviewModal = ({ title, confirmLabel, intro, configuration, agentLabels = {}, previews, onCancel, onConfirm }: ChangePreviewModalProps) => {
  const warned = previews.some(preview => preview.leftEmpty.length > 0 || preview.mismatch);
  const names = (keys: string[], empty: string) => (keys.length ? keys.map(key => parameterLabel(configuration, key)).join(', ') : empty);

  return (
    <ConfirmModal
      title={title}
      confirmLabel={confirmLabel}
      danger={warned}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <EuiText size='s'>
        <p>{intro} Versión anterior disponible en el historial.</p>
      </EuiText>

      {previews.map(preview => (
        <React.Fragment key={preview.agentId}>
          <EuiSpacer size='m' />
          <EuiText size='s'>
            <h4>{agentLabels[preview.agentId] || preview.agentId}</h4>
          </EuiText>
          {preview.mismatch && <EuiCallOut color='warning' iconType='alert' size='s' title={`Tipo distinto: ${preview.mismatch}`} />}
          {preview.leftEmpty.length > 0 && (
            <EuiCallOut color='warning' iconType='alert' size='s' title={`Obligatorios sin valor: ${names(preview.leftEmpty, '')}`} />
          )}
          <EuiText size='xs'>
            <ul>
              {preview.from !== undefined && <li>Plantilla: {preview.from} → {preview.to}.</li>}
              <li>Parámetros con valor nuevo ({preview.changes.length}): {names(preview.changes, 'ninguno')}</li>
              {preview.ownWins !== undefined && <li>Valores propios conservados: {names(preview.ownWins, 'ninguno')}</li>}
            </ul>
          </EuiText>
        </React.Fragment>
      ))}
    </ConfirmModal>
  );
};
