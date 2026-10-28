import React, { useState } from 'react';
import { EuiCallOut, EuiConfirmModal, EuiFieldText, EuiFormRow, EuiSpacer } from '@elastic/eui';

interface ConfirmModalProps {
  title: string;
  confirmLabel: string;
  // If given, it must be typed to confirm (house rule for bulk rewrites; see `control-configuration-reset.tsx`).
  typedWord?: string;
  danger?: boolean;
  onCancel: () => void;
  // Returns an error to show, or nothing on success.
  onConfirm: () => Promise<string | undefined>;
  children: React.ReactNode;
}

export const ConfirmModal = ({
  title,
  confirmLabel,
  typedWord,
  danger = false,
  onCancel,
  onConfirm,
  children,
}: ConfirmModalProps) => {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const ready = !busy && (!typedWord || typed.trim() === typedWord);

  const confirm = async () => {
    if (!ready) return;
    setBusy(true);
    setError(undefined);
    const failure = await onConfirm();
    // On success the caller closes the modal; state of an unmounted component is not touched.
    if (failure) {
      setBusy(false);
      setError(failure);
    }
  };

  return (
    <EuiConfirmModal
      title={title}
      onCancel={onCancel}
      onConfirm={confirm}
      cancelButtonText='Cancelar'
      confirmButtonText={confirmLabel}
      confirmButtonDisabled={!ready}
      buttonColor={danger ? 'danger' : 'primary'}
      isLoading={busy}
    >
      {children}

      {typedWord && (
        <>
          <EuiSpacer size='m' />
          <EuiFormRow
            label={`Escribir «${typedWord}» para confirmar`}
            helpText='Tener que teclearlo es deliberado: obliga a leer lo que se va a escribir.'
          >
            <EuiFieldText
              value={typed}
              placeholder={typedWord}
              disabled={busy}
              aria-label={`Confirmar escribiendo ${typedWord}`}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => setTyped(event.target.value)}
            />
          </EuiFormRow>
        </>
      )}

      {error && (
        <>
          <EuiSpacer size='m' />
          <EuiCallOut color='danger' iconType='alert' size='s' title='No se pudo guardar'>
            <p>{error}</p>
          </EuiCallOut>
        </>
      )}
    </EuiConfirmModal>
  );
};

export const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message.trim() ? error.message.trim() : 'No se pudo guardar la configuración ENS.';
