import React from 'react';

import { ENSFormFieldProps } from '../types';
import {
  ListParameterRenderer,
  NumberParameterRenderer,
  TextParameterRenderer,
} from '../renderers';
import { isPlainNumericParameter } from '../../services/parameter-value-validator';

// `boolean`, `select`, `path` y `url` siguen cayendo en el renderer de texto:
// se editan como cadena, que es lo que declaran. Solo `list` necesitaba
// tratamiento propio porque su valor declarado es `string[]` y el campo de texto
// lo guardaba como cadena, perdiendo la lista.
//
// El campo numérico se reserva a los parámetros cuyo valor legítimo es SOLO un
// número. mp.info.6 P-05 está declarado `duration_days` pero admite el contrato
// por criticidad ('ALTA=30; MEDIA=90') que implementa el policy-runtime: en un
// EuiFieldNumber ese valor no se puede teclear y el que ya hubiera en el índice
// se enseñaría en blanco. Va al renderer de texto, con su validación propia.
export const ParameterRendererFactory = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  if (isPlainNumericParameter(parameter)) {
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
