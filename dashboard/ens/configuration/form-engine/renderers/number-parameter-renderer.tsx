import React from 'react';
import { EuiFieldNumber, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';

export const NumberParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => (
  <EuiFormRow
    label={`${parameter.id} · ${parameter.label}`}
    helpText={parameter.description}
    fullWidth
  >
    <EuiFieldNumber
      fullWidth
      min={parameter.minValue}
      max={parameter.maxValue}
      value={typeof value === 'number' ? value : ''}
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
