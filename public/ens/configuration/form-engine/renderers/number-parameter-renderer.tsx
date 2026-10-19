import React from 'react';
import { EuiFieldNumber, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import { validateParameterValue } from '../../../../../common/ens/configuration/services/parameter-value-validator';

// Un valor heredado en forma de cadena numérica ('24') se enseña en el campo en
// vez de dejarlo en blanco. Si se dejara en blanco, el auditor abriría el
// formulario, vería un obligatorio vacío, guardaría, y el 24 que había en el
// índice se perdería sin que nadie lo pidiera.
const toFieldValue = (
  value: ENSFormFieldProps['value']
): number | '' => {
  if (typeof value === 'number') {
    return value;
  }

  if (
    typeof value === 'string' &&
    /^-?\d+(?:\.\d+)?$/.test(value.trim())
  ) {
    return Number(value.trim());
  }

  return '';
};

export const NumberParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
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
      <EuiFieldNumber
        fullWidth
        isInvalid={!verdict.valid}
        min={parameter.minValue}
        max={parameter.maxValue}
        value={toFieldValue(value)}
        placeholder={parameter.example}
        onChange={event => {
          const rawValue = event.target.value;

          onChange(
            parameter.name,
            rawValue.trim() === ''
              ? undefined
              : Number(rawValue)
          );
        }}
      />
    </EuiFormRow>
  );
};
