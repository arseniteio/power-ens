import React from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSelect,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import { ENSFormFieldProps } from '../types';
import {
  addTableRow,
  ENSTableCellModel,
  removeTableRow,
  resolveTableFieldModel,
  setTableCell,
  validateParameterValue,
} from '../../../../../common/ens/configuration/services/parameter-value-validator';

// Renderer de parámetros `type: 'table'`.
//
// Por qué existe: hay política de cumplimiento que no cabe en un escalar ni en
// una lista de valores sueltos. Los derechos de acceso por recurso
// (`opacc2-acl.tsv`: ruta, modo, propietario, ACL), los privilegios por usuario
// (`opacc2-privilegios.tsv`) y los tipos de acceso por perfil
// (`opacc2-accesos.tsv`) son TABLAS, y hasta ahora vivían como ficheros que el
// operador escribía a mano en la máquina, por SSH. El auditor no las veía en
// ningún sitio: la pantalla enseñaba una ruta a un fichero, o nada.
//
// Por qué editor y no subir un fichero: un fichero subido crea un segundo
// original —el Excel del cliente— que se desincroniza de lo declarado en la
// pantalla en cuanto alguien edita uno de los dos, y entonces hay dos políticas
// y ninguna manda. Editar aquí deja una sola.
//
// Lo que se ve y lo que se guarda lo decide `resolveTableFieldModel`
// (services/parameter-value-validator), no este fichero: el formulario tiene que
// entender las filas EXACTAMENTE igual que el validador —dónde acaba una celda,
// qué es una fila en blanco, qué se hace con una fila heredada que trae campos
// de más—, o habría tablas que la pantalla acepta y el motor rechaza. Aquí solo
// queda el EUI.
//
// SIN VALORES DE FÁBRICA. Una tabla sin configurar se pinta con CERO filas y lo
// dice con todas las letras. No se siembra una fila de ejemplo: una fila
// prerrellenada se lee como una decisión tomada, y la política de acceso de un
// cliente no la decide el que escribió la ficha del parámetro.

const CELDA_MINIMA = 140;

const columnaObligatoria = (
  celda: ENSTableCellModel
): boolean => celda.column.required;

// El campo que le toca a cada tipo de columna. `select` y `multiselect` ofrecen
// solo lo declarado; el resto es texto, con su validación propia.
const CeldaEditable = ({
  celda,
  invalida,
  onCellChange,
}: {
  celda: ENSTableCellModel;
  invalida: boolean;
  onCellChange: (valor: string) => void;
}) => {
  if (celda.column.type === 'select') {
    return (
      <EuiSelect
        fullWidth
        compressed
        isInvalid={invalida}
        aria-label={celda.column.label}
        options={[
          {
            value: '',
            text: 'Sin seleccionar',
          },
          ...celda.options.map(option => ({
            value: option.value,
            text: option.label,
          })),
        ]}
        value={celda.value}
        onChange={event =>
          onCellChange(event.target.value)
        }
      />
    );
  }

  if (celda.column.type === 'multiselect') {
    const declaradas = celda.options.map(
      option => ({ label: option.value })
    );

    return (
      <EuiComboBox
        fullWidth
        compressed
        isInvalid={invalida}
        aria-label={celda.column.label}
        placeholder={celda.placeholder}
        // Sin opciones declaradas el auditor escribe libremente; con opciones,
        // solo se ofrecen esas. Nunca se ofrece lo que el validador rechaza.
        noSuggestions={declaradas.length === 0}
        options={declaradas}
        selectedOptions={celda.items.map(
          item => ({ label: item })
        )}
        onCreateOption={
          declaradas.length === 0
            ? valorEscrito => {
                const item = String(
                  valorEscrito
                ).trim();

                if (
                  !item ||
                  celda.items.includes(item)
                ) {
                  return;
                }

                onCellChange(
                  [...celda.items, item].join(',')
                );
              }
            : undefined
        }
        onChange={seleccionadas =>
          onCellChange(
            seleccionadas
              .map(option =>
                String(option.label).trim()
              )
              .join(',')
          )
        }
      />
    );
  }

  return (
    <EuiFieldText
      fullWidth
      compressed
      isInvalid={invalida}
      aria-label={celda.column.label}
      placeholder={celda.placeholder}
      value={celda.value}
      onChange={event =>
        onCellChange(event.target.value)
      }
    />
  );
};

export const TableParameterRenderer = ({
  parameter,
  value,
  onChange,
}: ENSFormFieldProps) => {
  const model = resolveTableFieldModel(
    parameter,
    value
  );

  const verdict = validateParameterValue(
    parameter,
    value
  );

  const publish = (
    siguiente: string[] | undefined
  ) => onChange(parameter.name, siguiente);

  const columnasObligatorias = model.columns
    .filter(columna => columna.required)
    .map(columna => columna.label)
    .join(', ');

  const ayuda = [
    parameter.description,
    columnasObligatorias
      ? `Columnas obligatorias: ${columnasObligatorias}.`
      : '',
    'Una fila por entrada. Las columnas que no se declaren se dejan vacías.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={ayuda}
      isInvalid={!verdict.valid}
      error={
        verdict.reason
          ? [verdict.reason]
          : undefined
      }
      fullWidth
    >
      <div>
        <EuiFlexGroup
          gutterSize="s"
          responsive={false}
          alignItems="center"
        >
          {model.columns.map(columna => (
            <EuiFlexItem
              key={columna.name}
              style={{
                minWidth: CELDA_MINIMA,
              }}
            >
              <EuiText size="xs">
                <strong>
                  {columna.required
                    ? `${columna.label} *`
                    : columna.label}
                </strong>
              </EuiText>
            </EuiFlexItem>
          ))}
          <EuiFlexItem
            grow={false}
            style={{ width: 32 }}
          />
        </EuiFlexGroup>

        <EuiSpacer size="xs" />

        {model.rows.length === 0 && (
          <EuiText size="s" color="subdued">
            <p>
              Sin filas: esta política no está
              declarada todavía.
            </p>
          </EuiText>
        )}

        {model.rows.map((fila, indiceFila) => (
          <React.Fragment
            key={`fila-${indiceFila}`}
          >
            <EuiFlexGroup
              gutterSize="s"
              responsive={false}
              alignItems="flexStart"
            >
              {fila.cells.map(
                (celda, indiceCelda) => (
                  <EuiFlexItem
                    key={celda.column.name}
                    style={{
                      minWidth: CELDA_MINIMA,
                    }}
                  >
                    <CeldaEditable
                      celda={celda}
                      invalida={
                        !!celda.reason ||
                        (fila.overflow > 0 &&
                          indiceCelda ===
                            fila.cells.length -
                              1) ||
                        (columnaObligatoria(
                          celda
                        ) &&
                          !celda.value)
                      }
                      onCellChange={valor =>
                        publish(
                          setTableCell(
                            value,
                            parameter,
                            indiceFila,
                            indiceCelda,
                            valor
                          )
                        )
                      }
                    />
                  </EuiFlexItem>
                )
              )}
              <EuiFlexItem
                grow={false}
                style={{ width: 32 }}
              >
                <EuiButtonIcon
                  iconType="trash"
                  color="danger"
                  aria-label={`Quitar la fila ${indiceFila +
                    1}`}
                  onClick={() =>
                    publish(
                      removeTableRow(
                        value,
                        indiceFila
                      )
                    )
                  }
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
          </React.Fragment>
        ))}

        <EuiButtonEmpty
          size="s"
          iconType="plusInCircle"
          onClick={() =>
            publish(addTableRow(value))
          }
        >
          Añadir fila
        </EuiButtonEmpty>
      </div>
    </EuiFormRow>
  );
};
