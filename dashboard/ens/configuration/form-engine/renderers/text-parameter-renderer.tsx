import React from 'react';
import { EuiFieldText, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import { validateParameterValue } from '../../services/parameter-value-validator';

export const TextParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  // El motivo se enseña mientras se escribe. Aceptar el valor y que el fallo
  // reaparezca luego como un control degradado sin explicación es lo que había
  // que dejar de hacer.
  const verdict = validateParameterValue(
    parameter,
    value
  );

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={parameter.description}
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <EuiFieldText
        fullWidth
        isInvalid={!verdict.valid}
        value={
          typeof value === 'string'
            ? value
            : typeof value === 'number' ||
              typeof value === 'boolean'
            ? // Un valor heredado que no es cadena (un 30 en P-05, un true en un
              // boolean) se enseña tal cual: dejarlo en blanco haría que el
              // siguiente guardado lo borrase sin que nadie lo pidiera.
              String(value)
            : ''
        }
        placeholder={parameter.example}
        onChange={event => onChange(parameter.name, event.target.value)}
      />
    </EuiFormRow>
  );
};
