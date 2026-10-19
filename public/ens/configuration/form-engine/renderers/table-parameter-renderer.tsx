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

// Renderer of `type: 'table'` parameters: grids of policy rows (`opacc2-acl.tsv`, `opacc2-privilegios.tsv`, `opacc2-accesos.tsv`) edited in the screen instead of uploading a file, so there is a single original.
// What is shown and stored is decided by `resolveTableFieldModel` (services/parameter-value-validator); only the EUI is here.
// No factory values: an unset table shows ZERO rows and says so; a prefilled row would read as a decision taken.

const MIN_CELL = 140;

const requiredColumn = (
  cell: ENSTableCellModel
): boolean => cell.column.required;

// Field for each column type: `select` and `multiselect` offer only what is declared; the rest is text with its own validation.
const EditableCell = ({
  celda: cell,
  invalida: invalidOne,
  onCellChange,
}: {
  celda: ENSTableCellModel;
  invalida: boolean;
  onCellChange: (value: string) => void;
}) => {
  if (cell.column.type === 'select') {
    return (
      <EuiSelect
        fullWidth
        compressed
        isInvalid={invalidOne}
        aria-label={cell.column.label}
        options={[
          {
            value: '',
            text: 'Sin seleccionar',
          },
          ...cell.options.map(option => ({
            value: option.value,
            text: option.label,
          })),
        ]}
        value={cell.value}
        onChange={event =>
          onCellChange(event.target.value)
        }
      />
    );
  }

  if (cell.column.type === 'multiselect') {
    const declared = cell.options.map(
      option => ({ label: option.value })
    );

    return (
      <EuiComboBox
        fullWidth
        compressed
        isInvalid={invalidOne}
        aria-label={cell.column.label}
        placeholder={cell.placeholder}
        // Without declared options the auditor writes freely; with options, only those are offered.
        noSuggestions={declared.length === 0}
        options={declared}
        selectedOptions={cell.items.map(
          item => ({ label: item })
        )}
        onCreateOption={
          declared.length === 0
            ? typedValue => {
                const item = String(
                  typedValue
                ).trim();

                if (
                  !item ||
                  cell.items.includes(item)
                ) {
                  return;
                }

                onCellChange(
                  [...cell.items, item].join(',')
                );
              }
            : undefined
        }
        onChange={selectedOnes =>
          onCellChange(
            selectedOnes
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
      isInvalid={invalidOne}
      aria-label={cell.column.label}
      placeholder={cell.placeholder}
      value={cell.value}
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
    nextItem: string[] | undefined
  ) => onChange(parameter.name, nextItem);

  const requiredColumns = model.columns
    .filter(column => column.required)
    .map(column => column.label)
    .join(', ');

  const help = [
    parameter.description,
    requiredColumns
      ? `Columnas obligatorias: ${requiredColumns}.`
      : '',
    'Una fila por entrada. Las columnas que no se declaren se dejan vacías.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <EuiFormRow
      label={`${parameter.id} · ${parameter.label}`}
      helpText={help}
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
          {model.columns.map(column => (
            <EuiFlexItem
              key={column.name}
              style={{
                minWidth: MIN_CELL,
              }}
            >
              <EuiText size="xs">
                <strong>
                  {column.required
                    ? `${column.label} *`
                    : column.label}
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

        {model.rows.map((row, rowIndex) => (
          <React.Fragment
            key={`fila-${rowIndex}`}
          >
            <EuiFlexGroup
              gutterSize="s"
              responsive={false}
              alignItems="flexStart"
            >
              {row.cells.map(
                (cell, cellIndex) => (
                  <EuiFlexItem
                    key={cell.column.name}
                    style={{
                      minWidth: MIN_CELL,
                    }}
                  >
                    <EditableCell
                      celda={cell}
                      invalida={
                        !!cell.reason ||
                        (row.overflow > 0 &&
                          cellIndex ===
                            row.cells.length -
                              1) ||
                        (requiredColumn(
                          cell
                        ) &&
                          !cell.value)
                      }
                      onCellChange={newCellValue =>
                        publish(
                          setTableCell(
                            value,
                            parameter,
                            rowIndex,
                            cellIndex,
                            newCellValue
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
                  aria-label={`Quitar la fila ${rowIndex +
                    1}`}
                  onClick={() =>
                    publish(
                      removeTableRow(
                        value,
                        rowIndex
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
