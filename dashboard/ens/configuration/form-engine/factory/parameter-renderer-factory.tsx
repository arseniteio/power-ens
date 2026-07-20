import React from 'react';

import { ENSFormFieldProps } from '../types';
import {
  NumberParameterRenderer,
  TextParameterRenderer,
} from '../renderers';

export const ParameterRendererFactory = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  if (
    parameter.type === 'number' ||
    parameter.type === 'duration_hours' ||
    parameter.type === 'duration_days'
  ) {
    return (
      <NumberParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <TextParameterRenderer
      parameter={parameter}
      value={value}
      onChange={onChange}
    />
  );
};
