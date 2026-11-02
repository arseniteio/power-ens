import React, { useState } from 'react';
import { EuiButton, EuiButtonEmpty, EuiCallOut, EuiFieldText, EuiFormRow, EuiSpacer, EuiText } from '@elastic/eui';

import {
  buildClearedControlConfiguration,
  summarizeControlConfigurationReset,
} from '../../../../common/ens/configuration/services/configuration-reset-service';
import {
  updateActiveControlConfiguration,
} from '../../../../common/ens/configuration/services/configuration-state-service';
import type { ENSControlConfiguration } from '../../../../common/ens/configuration/types';


interface ControlConfigurationResetProps {
  control: ENSControlConfiguration;
  onConfigurationSaved: () => void;
}

export const ControlConfigurationReset = ({
  control,
  onConfigurationSaved,
}: ControlConfigurationResetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = summarizeControlConfigurationReset(control);

  const close = () => {
    setIsOpen(false);
    setConfirmation('');
    setError(null);
  };

  if (summary.clearedParameters === 0) {
    return (
      <EuiText size='s' color='subdued'>
        <p>
          {control.controlId} no tiene ningún parámetro con valor declarado:
          no hay configuración que borrar.
        </p>
      </EuiText>
    );
  }

  if (!isOpen) {
    return (
      <EuiButtonEmpty
        color='danger'
        size='s'
        onClick={() => setIsOpen(true)}
      >
        Borrar la configuración de {control.controlId}
      </EuiButtonEmpty>
    );
  }

  const canDelete =
    confirmation.trim() === control.controlId && !isDeleting;

  const remove = async () => {
    setIsDeleting(true);
    setError(null);

    try {
      const cleared = buildClearedControlConfiguration(
        control,
        confirmation
      );

      await updateActiveControlConfiguration(cleared);

      close();
      onConfigurationSaved();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se ha podido borrar la configuración.'
      );
      setIsDeleting(false);
    }
  };

  return (
    <EuiCallOut
      title={`Vas a borrar la configuración de ${control.controlId}`}
      color='danger'
      iconType='trash'
    >
      <EuiText size='s'>
        <p>
          Se borrarán los <strong>{summary.clearedParameters}</strong>{' '}
          parámetro(s) con valor declarado:{' '}
          {summary.parameterIds.join(', ')}.
        </p>
        <p>Los datos de la organización no se borran.</p>
        <p>
          No se puede deshacer.
        </p>
        <p>
          Mientras esté sin configurar, sus requisitos no cumplirán.
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      <EuiFormRow label={`Escribe «${control.controlId}» para confirmar`}>
        <EuiFieldText
          value={confirmation}
          onChange={(
            event: React.ChangeEvent<HTMLInputElement>
          ) => setConfirmation(event.target.value)}
          placeholder={control.controlId}
          disabled={isDeleting}
          aria-label={`Confirmar el borrado de ${control.controlId}`}
        />
      </EuiFormRow>

      {error && (
        <>
          <EuiSpacer size='s' />
          <EuiText size='s' color='danger'>
            <p>{error}</p>
          </EuiText>
        </>
      )}

      <EuiSpacer size='m' />

      <EuiButton
        color='danger'
        fill
        size='s'
        disabled={!canDelete}
        isLoading={isDeleting}
        onClick={remove}
      >
        Borrar la configuración
      </EuiButton>

      <EuiButtonEmpty
        size='s'
        disabled={isDeleting}
        onClick={close}
      >
        Cancelar
      </EuiButtonEmpty>
    </EuiCallOut>
  );
};
