import React from 'react';

import { ENSFormFieldProps } from '../types';
import {
  ListParameterRenderer,
  NumberParameterRenderer,
  TextParameterRenderer,
} from '../renderers';

// `boolean`, `select`, `path` y `url` siguen cayendo en el renderer de texto:
// se editan como cadena, que es lo que declaran. Solo `list` necesitaba
// tratamiento propio porque su valor declarado es `string[]` y el campo de texto
// lo guardaba como cadena, perdiendo la lista.
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

  if (parameter.type === 'list') {
    return (
      <ListParameterRenderer
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
