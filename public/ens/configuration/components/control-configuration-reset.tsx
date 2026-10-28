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

// Deletes the declared configuration of a control.
// The button asks to type the control id: a "¿seguro?" is accepted without reading. Only the VALUES are deleted,
// not the control (see `configuration-reset-service`).

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

  // A control with nothing declared has nothing to delete; this is stated instead of hiding the button.
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
      // The error is shown: a silent failure would leave the operator believing it was deleted.
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
        <p>Los Datos de la organización que lee este control no se borran: se editan en General.</p>
        <p>
          No se puede deshacer.
        </p>
        <p>
          Mientras esté sin configurar, sus requisitos no cumplirán.
        </p>
      </EuiText>

      <EuiSpacer size='m' />

      <EuiFormRow
        label={`Escribe «${control.controlId}» para confirmar`}
        helpText='Tener que teclearlo es deliberado: obliga a mirar qué se está borrando.'
      >
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
