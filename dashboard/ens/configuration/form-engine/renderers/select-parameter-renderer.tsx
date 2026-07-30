import React from 'react';
import { EuiFormRow, EuiSelect } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  resolveSelectFieldModel,
  validateParameterValue,
} from '../../services/parameter-value-validator';

// Renderer de parámetros `type: 'select'` con opciones declaradas.
//
// Por qué existe: hasta ahora los tres selects del producto (op.acc.1 P-01
// `fuente_identidad`, op.acc.2 P-05 `modelo_privilegios` y mp.info.6 P-10
// `herramienta_backup`) se editaban como texto libre, y su validación degeneraba
// en "no está vacío" porque ningún bloque declaraba `options`: `herramienta_backup
// = 'cualquier cosa'` se daba por bueno y el control salía evaluable.
//
// Declarar las opciones sin ofrecerlas en el formulario habría sido PEOR que el
// estado anterior: el campo dejaría escribir valores que el guardado rechaza
// después. Las dos cosas van juntas, y por eso este renderer entra en el mismo
// cambio que las `options` de los bloques.
//
// La lista de opciones y la resolución del valor actual vienen de
// `resolveSelectFieldModel` (services/parameter-value-validator), no de aquí: el
// formulario tiene que entender las opciones EXACTAMENTE igual que el validador
// —incluida la tolerancia con mayúsculas y espacios—, o habría valores que el
// desplegable ofrece y el motor rechaza.

export const SelectParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const model = resolveSelectFieldModel(
    parameter,
    value
  );

  const verdict = validateParameterValue(
    parameter,
    value
  );

  // La opción vacía está siempre disponible: dejar un parámetro sin valor es una
  // respuesta legítima —el control se degrada a NO EVALUABLE, que es honesto— y
  // un desplegable que no deja volver atrás obligaría a inventarse un valor.
  const options = [
    {
      value: '',
      text: 'Sin seleccionar',
    },
    ...model.options.map(option => ({
      value: option.value,
      text: option.label,
    })),
  ];

  const helpText = model.legacyValue
    ? `${parameter.description} El valor configurado (${model.legacyValue}) no está entre las opciones admitidas: se conserva hasta que se elija una, no se borra solo.`
    : `${parameter.description} Solo se admiten las opciones de la lista.`;

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={helpText}
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <EuiSelect
        fullWidth
        isInvalid={!verdict.valid}
        options={options}
        value={model.selected}
        onChange={event => {
          const selected =
            event.target.value;

          onChange(
            parameter.name,
            selected === ''
              ? undefined
              : selected
          );
        }}
      />
    </EuiFormRow>
  );
};
