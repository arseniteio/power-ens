import React, { useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFormRow,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import {
  buildClearedControlConfiguration,
  summarizeControlConfigurationReset,
} from '../../../../common/ens/configuration/services/configuration-reset-service';
import { updateActiveControlConfiguration } from '../../../../common/ens/configuration/services/configuration-state-service';
import type { ENSControlConfiguration } from '../../../../common/ens/configuration/types';

// Borrar la configuración declarada de un control.
//
// EL BOTÓN PIDE ESCRIBIR EL ID DEL CONTROL, y no es celo burocrático. Esta casa
// ya perdió la configuración de op.acc.2 —de 83 % a 17 %— por una operación
// destructiva que «avisaba por pantalla»: un «¿seguro?» se acepta sin leerlo,
// y quien lo acepta suele estar haciendo otra cosa. Tener que teclear
// `op.acc.2` obliga a mirar QUÉ se está borrando.
//
// Y lo que se borra son los VALORES, no el control: si desapareciera el bloque,
// la tarjeta se iría de la pantalla y el control quedaría imposible de
// reconfigurar desde la UI. Ver la cabecera de `configuration-reset-service`.

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

  // Sobre un control que no tiene nada declarado no hay nada que borrar, y
  // ofrecer el botón sugeriría que sí. Se dice en vez de callar: un botón
  // ausente sin explicación es un botón que el operador busca durante un rato.
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
      // El error se ENSEÑA. Un borrado que falla en silencio deja al operador
      // creyendo que borró, y la próxima decisión la toma sobre datos que
      // siguen ahí.
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
        <p>
          El control seguirá en la pantalla y podrás volver a configurarlo.
          Lo que se pierde es <strong>lo que declaró el responsable</strong>,
          y eso no se puede deshacer desde aquí.
        </p>
        <p>
          Mientras esté sin configurar, sus evidencias saldrán{' '}
          <strong>no evaluables</strong> y sus requisitos no cumplirán: es lo
          correcto —una política sin declarar no acredita— pero el índice del
          cliente lo va a notar.
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
