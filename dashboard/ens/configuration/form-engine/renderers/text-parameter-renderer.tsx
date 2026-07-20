import React from 'react';
import { EuiFieldText, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';

export const TextParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => (
  <EuiFormRow
    label={`${parameter.id} · ${parameter.label}`}
    helpText={parameter.description}
    fullWidth
  >
    <EuiFieldText
      fullWidth
      value={typeof value === 'string' ? value : ''}
      placeholder={parameter.example}
      onChange={event => onChange(parameter.name, event.target.value)}
    />
  </EuiFormRow>
);
