import React from 'react';
import { EuiComboBox, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  toParameterListItems,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';

// Renderer de parámetros `type: 'list'`.
//
// Por qué existe: hasta ahora el form-engine solo tenía renderer de número y de
// texto, y todo lo demás caía en el de texto. Es decir, el formulario NO SABÍA
// editar listas: los nueve parámetros de tipo lista del producto se escribían
// como texto libre y se guardaban como cadena. De ahí salió el incidente de
// P-04 de op.acc.1 (`cuentas_genericas_prohibidas`), donde se escribió "si" en
// un parámetro que debía contener nombres de cuenta y se perdió la lista.
//
// Con un combo de pastillas el valor guardado es siempre `string[]`, que es lo
// que declaran `ENSControlParameter['value']` y el validador de estructura, y
// escribir "si" produce `['si']` —una lista de un elemento, revisable— en vez de
// un escalar que el motor pueda confundir con un booleano.

// La conversión del valor almacenado a la lista de elementos vive en
// `toParameterListItems` (services/parameter-value-validator), no aquí: el
// validador tiene que contar los elementos EXACTAMENTE igual que los cuenta el
// formulario, o habría valores que el formulario acepta y el motor rechaza.
// Tolera el valor legacy en forma de cadena partiendo por saltos de línea y por
// comas, pero NUNCA por `|`, que en este producto separa los campos de un mismo
// elemento ('srv-dc01 | Windows').

export const ListParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const items = toParameterListItems(value);

  const verdict = validateParameterValue(
    parameter,
    value
  );

  const publish = (nextItems: string[]) =>
    onChange(
      parameter.name,
      nextItems.length ? nextItems : undefined
    );

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={
        parameter.example
          ? `${parameter.description} Un elemento por entrada. Ejemplo: ${parameter.example}`
          : `${parameter.description} Un elemento por entrada.`
      }
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <EuiComboBox
        fullWidth
        noSuggestions
        isInvalid={!verdict.valid}
        placeholder={parameter.example}
        selectedOptions={items.map(label => ({ label }))}
        onCreateOption={searchValue => {
          const item = String(searchValue).trim();

          if (!item || items.includes(item)) {
            return;
          }

          publish([...items, item]);
        }}
        onChange={selectedOptions =>
          publish(
            selectedOptions.map(option =>
              String(option.label).trim()
            )
          )
        }
      />
    </EuiFormRow>
  );
};
