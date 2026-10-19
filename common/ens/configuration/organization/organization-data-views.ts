// Item rows and what each mapped parameter reads from them; config/ensfacil_organization.py mirrors these rules.
import type { ENSAgentParameterValue, ENSControlParameter } from '../types';
import {
  isEmptyParameterValue,
  toParameterListItems,
  toParameterTableRows,
  toTableRowCells,
} from '../services/parameter-value-validator';
import type { ENSOrganizationDataItem, ENSOrganizationDataView } from './organization-data-items';

// One row of an item by column name; a view's row defines only the columns it fills.
export type ENSOrganizationRow = Record<string, string>;

type ParameterShape = Pick<ENSControlParameter, 'type'>;

const SCALAR_CELL = 'valor';

const cell = (value: unknown): string => String(value ?? '').trim();

const same = (left: unknown, right: unknown): boolean => cell(left).toLowerCase() === cell(right).toLowerCase();

const splitOptions = (value: unknown): string[] =>
  cell(value)
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);

const organizationColumnNames = (item: ENSOrganizationDataItem): string[] =>
  item.type === 'table'
    ? (item.columns || []).map(column => column.name)
    : [item.columns?.[0]?.name || SCALAR_CELL];

const isMultiselect = (item: ENSOrganizationDataItem, column: string): boolean =>
  (item.columns || []).some(candidate => candidate.name === column && candidate.type === 'multiselect');

// A row without the empty cells at its end, so «a | b» and «a | b | » are the same row.
const serializeCells = (cells: string[]): string => {
  const trimmed = cells.map(value => cell(value).replace(/[|\n\r]/g, ' ').trim());
  while (trimmed.length && !trimmed[trimmed.length - 1]) trimmed.pop();
  return trimmed.join(' | ');
};

const normalizeTableRow = (row: string): string => {
  const cells = toTableRowCells(row);
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  return cells.join('|');
};

const shapeOf = (parameter: ParameterShape): 'table' | 'list' | 'scalar' =>
  parameter.type === 'table' ? 'table' : parameter.type === 'list' ? 'list' : 'scalar';

const isNumericType = (parameter: ParameterShape): boolean =>
  ['number', 'duration_hours', 'duration_days'].includes(parameter.type);

// The item value as rows. Cells beyond the item columns are not kept.
export const organizationRows = (
  item: ENSOrganizationDataItem,
  value: ENSAgentParameterValue | undefined
): ENSOrganizationRow[] => {
  if (isEmptyParameterValue(value)) return [];
  const names = organizationColumnNames(item);
  if (item.type === 'table') {
    return toParameterTableRows(value)
      .filter(row => row.trim())
      .map(row => {
        const cells = toTableRowCells(row);
        return Object.fromEntries(names.map((name, index) => [name, cells[index] ?? '']));
      });
  }
  if (item.type === 'list') {
    return toParameterListItems(value).map(entry => ({ [names[0]]: entry }));
  }
  return [{ [names[0]]: cell(value) }];
};

export const organizationValueFromRows = (
  item: ENSOrganizationDataItem,
  rows: ENSOrganizationRow[]
): ENSAgentParameterValue | undefined => {
  const names = organizationColumnNames(item);
  if (item.type === 'table') {
    const serialized = rows.map(row => serializeCells(names.map(name => row[name] ?? ''))).filter(Boolean);
    return serialized.length ? serialized : undefined;
  }
  if (item.type === 'list') {
    const entries = rows.map(row => cell(row[names[0]])).filter(Boolean);
    return entries.length ? entries : undefined;
  }
  const scalar = cell(rows[0]?.[names[0]]);
  return scalar ? scalar : undefined;
};

const matchesView = (
  item: ENSOrganizationDataItem,
  row: ENSOrganizationRow,
  view: Pick<ENSOrganizationDataView, 'where'>
): boolean =>
  Object.entries(view.where || {}).every(([column, expected]) =>
    isMultiselect(item, column)
      ? splitOptions(row[column]).some(option => same(option, expected))
      : same(row[column], expected)
  );

const isIdentityView = (view: ENSOrganizationDataView): boolean => !view.where && !view.columns;

// What the parameter reads from these rows: filtered by `where`, projected to `columns`, without empty rows.
export const projectOrganizationRows = (
  item: ENSOrganizationDataItem,
  view: ENSOrganizationDataView,
  parameter: ParameterShape,
  rows: ENSOrganizationRow[]
): ENSControlParameter['value'] | undefined => {
  const columns = view.columns || organizationColumnNames(item);
  const projected = rows
    .filter(row => matchesView(item, row, view))
    .map(row => columns.map(column => cell(row[column])))
    .filter(cells => cells.some(Boolean));
  const shape = shapeOf(parameter);

  if (shape === 'scalar') {
    const first = projected[0]?.[0];
    if (!first) return undefined;
    return isNumericType(parameter) && /^-?\d+(\.\d+)?$/.test(first) ? Number(first) : first;
  }

  let entries = projected.map(cells => (shape === 'list' && cells.length === 1 ? cells[0] : serializeCells(cells))).filter(Boolean);
  // A projection can repeat a row (one account with two scopes); the identity keeps the value as written.
  if (!isIdentityView(view)) entries = Array.from(new Set(entries));
  return entries.length ? entries : undefined;
};

// Rows of its use beyond the first, for a parameter that reads one value: the order would decide its threshold.
export const singleValueExtraRows = (
  item: ENSOrganizationDataItem,
  view: ENSOrganizationDataView,
  parameter: ParameterShape,
  value: ENSAgentParameterValue | undefined
): number => {
  if (shapeOf(parameter) !== 'scalar') return 0;
  const columns = view.columns || organizationColumnNames(item);
  const rows = organizationRows(item, value).filter(row => matchesView(item, row, view) && columns.some(column => cell(row[column])));
  return Math.max(0, rows.length - 1);
};

export const organizationViewValue = (
  item: ENSOrganizationDataItem,
  view: ENSOrganizationDataView,
  parameter: ParameterShape,
  value: ENSAgentParameterValue | undefined
): ENSControlParameter['value'] | undefined => projectOrganizationRows(item, view, parameter, organizationRows(item, value));

// The parameter value as item rows: its cells under the view columns, plus the `where` cells.
export const organizationViewRows = (
  item: ENSOrganizationDataItem,
  view: ENSOrganizationDataView,
  parameter: ParameterShape,
  value: ENSControlParameter['value']
): ENSOrganizationRow[] => {
  if (isEmptyParameterValue(value)) return [];
  const columns = view.columns || organizationColumnNames(item);
  const shape = shapeOf(parameter);
  const rows: string[][] =
    shape === 'table'
      ? toParameterTableRows(value).filter(row => row.trim()).map(toTableRowCells)
      : shape === 'list'
        ? toParameterListItems(value).map(entry => (columns.length === 1 ? [entry] : toTableRowCells(entry)))
        : [[cell(value)]];
  return rows.map(cells => {
    const row: ENSOrganizationRow = { ...(view.where || {}) };
    // A cell beyond the view columns is kept so the comparison sees the loss.
    columns.forEach((column, index) => {
      row[column] = cells[index] ?? '';
    });
    if (cells.length > columns.length && cells.slice(columns.length).some(Boolean)) {
      row[columns[columns.length - 1]] = cells.slice(columns.length - 1).join(' | ');
    }
    return row;
  });
};

// Same value for the engine: the same rows in any order (a table compares cell by cell, case counts).
export const sameParameterValue = (
  parameter: ParameterShape,
  left: ENSControlParameter['value'] | undefined,
  right: ENSControlParameter['value'] | undefined
): boolean => {
  const shape = shapeOf(parameter);
  if (shape === 'scalar') return cell(left) === cell(right);
  const normalize = (value: ENSControlParameter['value'] | undefined): string[] =>
    Array.from(
      new Set(
        shape === 'table'
          ? toParameterTableRows(value).filter(row => row.trim()).map(normalizeTableRow)
          : toParameterListItems(value)
      )
    ).sort();
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
};

const sameColumns = (left: ENSOrganizationRow, right: ENSOrganizationRow): boolean => {
  const a = Object.keys(left).sort();
  const b = Object.keys(right).sort();
  return a.length === b.length && a.every((column, index) => column === b[index]);
};

// With `key`, into the row with that key (existing cells win); else into an identical row, joining multiselects.
export const mergeOrganizationRow = (
  item: ENSOrganizationDataItem,
  rows: ENSOrganizationRow[],
  row: ENSOrganizationRow
): ENSOrganizationRow[] => {
  const key = item.key || [];
  const keyed = key.length > 0 && key.every(column => cell(row[column]));
  const index = keyed
    ? rows.findIndex(existing => key.every(column => same(existing[column], row[column])))
    : rows.findIndex(
        existing =>
          sameColumns(existing, row) &&
          Object.keys(row).every(column => isMultiselect(item, column) || cell(existing[column]) === cell(row[column]))
      );

  if (index < 0) return [...rows, { ...row }];

  const merged: ENSOrganizationRow = { ...rows[index] };
  Object.entries(row).forEach(([column, value]) => {
    if (isMultiselect(item, column)) {
      const options = splitOptions(merged[column]);
      splitOptions(value).forEach(option => {
        if (!options.some(existing => same(existing, option))) options.push(option);
      });
      merged[column] = options.join(', ');
    } else if (!cell(merged[column])) {
      merged[column] = value;
    }
  });
  return rows.map((existing, position) => (position === index ? merged : existing));
};
