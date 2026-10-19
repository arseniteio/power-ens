import React from 'react';
import { EuiFieldText, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import { validateParameterValue } from '../../../../../common/ens/configuration/services/parameter-value-validator';

export const TextParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  // The reason is shown while typing, so a failure does not reappear later as an unexplained degraded control.
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
            ?  // A legacy non-string value (30 in P-05, true in a
              // boolean) is shown as is: a blank field would make the next save erase it.
              String(value)
            : ''
        }
        placeholder={parameter.example}
        onChange={event => onChange(parameter.name, event.target.value)}
      />
    </EuiFormRow>
  );
};
