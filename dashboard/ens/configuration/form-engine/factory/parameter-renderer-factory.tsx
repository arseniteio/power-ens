import React from 'react';

import { ENSFormFieldProps } from '../types';
import {
  ListParameterRenderer,
  NumberParameterRenderer,
  SelectParameterRenderer,
  TableParameterRenderer,
  TextParameterRenderer,
} from '../renderers';
import {
  hasParameterColumns,
  hasParameterOptions,
  isPlainNumericParameter,
} from '../../services/parameter-value-validator';

// `boolean`, `path` y `url` siguen cayendo en el renderer de texto: se editan
// como cadena, que es lo que declaran. `list`, `select` y `table` necesitan
// tratamiento propio porque el campo de texto no sabe representar su valor: la
// lista se guardaba como cadena y se perdía, el select admitía cualquier cosa, y
// una tabla escrita a mano en un campo de texto no tiene columnas que validar.
//
// Un `table` SIN columnas declaradas cae en el renderer de lista, por el mismo
// motivo que un `select` sin `options` cae en el de texto: en
// `wazuh-ens-configuration` puede quedar un bloque sembrado antes de que
// existieran, y una rejilla sin columnas no dejaría editar nada. Su validación
// se degrada a la de lista (ver `validarTabla`), así que formulario y motor
// siguen de acuerdo. Se cierra volviendo a sembrar el bloque con
// `inject-control.py`, que conserva los valores ya configurados.
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
// por criticidad ('ALTA=30; MEDIA=90') que implementa su policy: en un
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

  if (hasParameterColumns(parameter)) {
    return (
      <TableParameterRenderer
        parameter={parameter}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (
    parameter.type === 'list' ||
    parameter.type === 'table'
  ) {
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
