import React from 'react';
import { EuiCallOut, EuiSpacer, EuiText } from '@elastic/eui';

import type { ENSTemplatePreview } from '../agents/agent-configuration-actions';
import { ConfirmModal } from './confirm-modal';

interface TemplatePreviewModalProps {
  label: string;
  previews: ENSTemplatePreview[];
  onCancel: () => void;
  onConfirm: () => Promise<string | undefined>;
}

const list = (items: string[], empty: string) => (items.length ? items.join(', ') : empty);

// Antes de aplicar una plantilla, por sistema: qué fija, qué cambia de verdad,
// qué valores propios siguen ganando y, si no es para su tipo o sustituye a
// otra plantilla de plataforma, el aviso. Con un aviso hay que teclear
// «aplicar»: cambiar la plataforma de una máquina cambia sus veredictos.
export const TemplatePreviewModal = ({ label, previews, onCancel, onConfirm }: TemplatePreviewModalProps) => {
  const applicable = previews.filter(preview => !preview.error);
  const warned = applicable.some(preview => preview.mismatch || preview.replaces);

  return (
    <ConfirmModal
      title={`Aplicar «${label}» a ${applicable.length} sistema(s)`}
      confirmLabel='Aplicar la plantilla'
      typedWord={warned ? 'aplicar' : undefined}
      danger={warned}
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <EuiText size='s'>
        <p>
          Los valores de la plantilla los heredan los parámetros sin valor
          propio; los valores propios siguen ganando. Los veredictos de estas
          máquinas pueden cambiar. La versión anterior del documento queda en el
          historial.
        </p>
      </EuiText>

      {previews.map(preview => (
        <React.Fragment key={preview.agentId}>
          <EuiSpacer size='m' />
          <EuiText size='s'>
            <h4>Sistema {preview.agentId}</h4>
          </EuiText>
          {preview.error ? (
            <EuiCallOut color='danger' iconType='alert' size='s' title={`No se aplica: ${preview.error}`} />
          ) : (
            <>
              {preview.replaces && (
                <EuiCallOut color='warning' iconType='alert' size='s' title={`Sustituye a la plantilla «${preview.replaces}»`} />
              )}
              {preview.mismatch && (
                <EuiCallOut color='warning' iconType='alert' size='s' title={`Tipo distinto: ${preview.mismatch}`} />
              )}
              <EuiText size='xs'>
                <ul>
                  <li>Cambia el valor efectivo de {preview.changes.length} parámetro(s): {list(preview.changes, 'ninguno')}.</li>
                  <li>La plantilla fija: {list(preview.sets, 'nada en los controles añadidos')}.</li>
                  <li>Siguen ganando sus valores propios: {list(preview.ownWins, 'ninguno')}.</li>
                </ul>
              </EuiText>
            </>
          )}
        </React.Fragment>
      ))}
    </ConfirmModal>
  );
};
