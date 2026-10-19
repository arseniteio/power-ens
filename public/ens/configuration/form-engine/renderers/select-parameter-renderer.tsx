import React from 'react';
import { EuiFormRow, EuiSelect } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  resolveSelectFieldModel,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';

// Renderer of `type: 'select'` parameters with declared options. Options and current value come from
// `resolveSelectFieldModel` (services/parameter-value-validator), so the dropdown and the validator understand
// options identically (including case and whitespace tolerance).

export const SelectParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const model = resolveSelectFieldModel(
    parameter,
    value
  );

  const verdict = validateParameterValue(
    parameter,
    value
  );

  // The empty option is always available: leaving a parameter unset is legitimate (the control degrades to NO
  // EVALUABLE).
  const options = [
    {
      value: '',
      text: 'Sin seleccionar',
    },
    ...model.options.map(option => ({
      value: option.value,
      text: option.label,
    })),
  ];

  const helpText = model.legacyValue
    ? `${parameter.description} El valor configurado (${model.legacyValue}) no está entre las opciones admitidas: se conserva hasta que se elija una, no se borra solo.`
    : `${parameter.description} Solo se admiten las opciones de la lista.`;

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={helpText}
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <EuiSelect
        fullWidth
        isInvalid={!verdict.valid}
        options={options}
        value={model.selected}
        onChange={event => {
          const selected =
            event.target.value;

          onChange(
            parameter.name,
            selected === ''
              ? undefined
              : selected
          );
        }}
      />
    </EuiFormRow>
  );
};
