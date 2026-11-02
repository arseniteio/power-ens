import React from 'react';
import { EuiFormRow, EuiSelect } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import { resolveBooleanFieldModel, validateParameterValue } from '../../../../../common/ens/configuration/services/parameter-value-validator';

export const BooleanParameterRenderer = ({ parameter, value, onChange }: ENSFormFieldProps) => {
  const model = resolveBooleanFieldModel(value);
  const verdict = validateParameterValue(parameter, value);

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={parameter.description}
      isInvalid={!verdict.valid}
      error={verdict.reason ? [verdict.reason] : undefined}
      fullWidth
    >
      <EuiSelect
        fullWidth
        isInvalid={!verdict.valid}
        options={[
          { value: '', text: 'Sin seleccionar' },
          { value: 'sí', text: 'Sí' },
          { value: 'no', text: 'No' },
        ]}
        value={model}
        onChange={event => onChange(parameter.name, event.target.value === '' ? undefined : event.target.value)}
      />
    </EuiFormRow>
  );
};
