import React from 'react';
import { EuiComboBox, EuiFormRow } from '@elastic/eui';

import { ENSFormFieldProps } from '../types';

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

// Convierte el valor almacenado en la lista de elementos a mostrar.
// Tolera el valor legacy en forma de cadena: lo que hay hoy en el índice para
// estos parámetros son cadenas escritas a mano, y hay que poder editarlas sin
// perderlas. Se parte por saltos de línea y por comas (los ejemplos de la ficha
// usan ambos), pero NUNCA por `|`, que en este producto separa los campos de un
// mismo elemento ('srv-dc01 | Windows').
const toItems = (
  value: ENSFormFieldProps['value']
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [String(value)];
  }

  return [];
};

export const ListParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const items = toItems(value);

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
      fullWidth
    >
      <EuiComboBox
        fullWidth
        noSuggestions
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
