import React from 'react';
import { EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';

import type {
  ENSAgentChangePreview,
  ENSAssignmentPreview,
} from '../../../../common/ens/configuration/agents/agent-configuration-actions';
import { ConfirmModal } from './confirm-modal';

interface ChangePreviewModalProps {
  title: string;
  confirmLabel: string;
  intro: string;
  previews: (ENSAgentChangePreview & Partial<ENSAssignmentPreview>)[];
  onCancel: () => void;
  onConfirm: () => Promise<string | undefined>;
}

const list = (items: string[], empty: string) => (items.length ? items.join(', ') : empty);

// Before a change that alters effective values: per agent, what changes. A required value left empty or a template
// for another system type asks to type «aplicar».
export const ChangePreviewModal = ({ title, confirmLabel, intro, previews, onCancel, onConfirm }: ChangePreviewModalProps) => {
  const warned = previews.some(preview => preview.leftEmpty.length > 0 || preview.mismatch);

  return (
    <ConfirmModal
      title={title}
      confirmLabel={confirmLabel}
      typedWord={warned ? 'aplicar' : undefined}
      danger={warned}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <EuiText size='s'>
        <p>{intro} Los veredictos de estos agentes pueden cambiar. La versión anterior queda en el historial.</p>
      </EuiText>

      {previews.map(preview => (
        <React.Fragment key={preview.agentId}>
          <EuiSpacer size='m' />
          <EuiText size='s'>
            <h4>Agente {preview.agentId}</h4>
          </EuiText>
          {preview.mismatch && <EuiCallOut color='warning' iconType='alert' size='s' title={`Tipo distinto: ${preview.mismatch}`} />}
          {preview.leftEmpty.length > 0 && (
            <EuiCallOut color='warning' iconType='alert' size='s' title={`Se quedan sin valor parámetros obligatorios: ${preview.leftEmpty.join(', ')}`} />
          )}
          <EuiText size='xs'>
            <ul>
              {preview.from !== undefined && <li>Plantilla: {preview.from} → {preview.to}.</li>}
              <li>Cambia el valor de {preview.changes.length} parámetro(s): {list(preview.changes, 'ninguno')}.</li>
              {preview.ownWins !== undefined && <li>Siguen ganando sus ajustes propios: {list(preview.ownWins, 'ninguno')}.</li>}
            </ul>
          </EuiText>
        </React.Fragment>
      ))}
    </ConfirmModal>
  );
};
