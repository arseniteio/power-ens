import React from 'react';
import { EuiFieldText, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import { validateParameterValue } from '../../../../../common/ens/configuration/services/parameter-value-validator';

export const TextParameterRenderer = ({
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
      <EuiFieldText
        fullWidth
        isInvalid={!verdict.valid}
        value={
          typeof value === 'string'
            ? value
            : typeof value === 'number' ||
              typeof value === 'boolean'
            ?
              String(value)
            : ''
        }
        placeholder={parameter.example}
        onChange={event => onChange(parameter.name, event.target.value)}
      />
    </EuiFormRow>
  );
};
