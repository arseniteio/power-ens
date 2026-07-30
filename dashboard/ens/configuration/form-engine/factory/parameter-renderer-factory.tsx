import React from 'react';

import { ENSFormFieldProps } from '../types';
import {
  ListParameterRenderer,
  NumberParameterRenderer,
  SelectParameterRenderer,
  TextParameterRenderer,
} from '../renderers';
import {
  hasParameterOptions,
  isPlainNumericParameter,
} from '../../services/parameter-value-validator';

// `boolean`, `path` y `url` siguen cayendo en el renderer de texto: se editan
// como cadena, que es lo que declaran. `list` y `select` necesitan tratamiento
// propio porque el campo de texto no sabe representar su valor: la lista se
// guardaba como cadena y se perdía, y el select admitía cualquier cosa.
//
// Un `select` SIN opciones declaradas se queda en el renderer de texto, y es
// deliberado: en `wazuh-ens-configuration` puede haber todavía un bloque sembrado
// antes de que existieran las `options`, y un desplegable vacío no dejaría editar
// nada. Su validación sigue siendo "no está vacío" (ver `validarSeleccion`), así
// que formulario y motor siguen de acuerdo. La regla es la misma en los dos
// sentidos: nunca ofrecer un campo que acepte lo que el motor rechaza, ni
// rechazar lo que el campo deja escribir.
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

  if (hasParameterOptions(parameter)) {
    return (
      <SelectParameterRenderer
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
