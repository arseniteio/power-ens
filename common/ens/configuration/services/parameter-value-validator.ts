import { ENSControlParameter, ENSLevel, ENSParameterColumn, ENSParameterValueVerdict } from '../types';
import { ENS_MATCH_MODES } from '../../../agent-configuration';
import { compileParameterPattern } from './parameter-pattern';
import { supportsParameterPattern } from './parameter-input';

// Value validity rules per parameter type. Pure functions; imports only from `../types` and leaf modules (TDZ
// cycle rule).
// Judges a PRESENT value: an empty value is valid here, "not configured" is decided by `hasValue` in
// validation-engine.

const VALID: ENSParameterValueVerdict = { valid: true };

const invalidVerdict = (
  reason: string
): ENSParameterValueVerdict => ({
  valid: false,
  reason,
});

// Short form of the received value for the message.
const describeValue = (
  value: ENSControlParameter['value']
): string => {
  const text = Array.isArray(value)
    ? `[${value.map(item => String(item)).join(', ')}]`
    : String(value);

  return text.length > 60
    ? `'${text.slice(0, 57)}...'`
    : `'${text}'`;
};

const asTrimmedString = (
  value: ENSControlParameter['value']
): string =>
  typeof value === 'string'
    ? value.trim()
    : typeof value === 'number' ||
      typeof value === 'boolean'
    ? String(value)
    : '';

// An absent or empty value is not judged here.
export const isEmptyParameterValue = (
  value: ENSControlParameter['value']
): boolean => {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim().length === 0;
  }

  if (Array.isArray(value)) {
    return (
      value.filter(
        item => String(item).trim().length > 0
      ).length === 0
    );
  }

  return false;
};

// Single split of a list value into items, shared by the form, the "configured" check and the engine policies.
// Separators: newline, comma and semicolon (union of the form and runtime sets). Never `|`: it separates the
// fields of one item.
export const toParameterListItems = (
  value: ENSControlParameter['value']
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/)
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

const NON_NEGATIVE_INTEGER = /^\d+$/;
const NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;

// umask: three or four octal digits.
const OCTAL_UMASK = /^[0-7]{3,4}$/;

// Absolute POSIX path.
const ABSOLUTE_POSIX_PATH = /^\/\S/;

// Windows path with drive: `C:\Backups`, `C:/Backups`, `C:\`.
const ABSOLUTE_WINDOWS_PATH = /^[A-Za-z]:[\\/]/;

// UNC path: `\
// as-dr\backup`.
const UNC_PATH = /^\\\\[^\\/\s]+\\[^\\/\s]/;

// URI with scheme and authority: `s3://bucket/x`, `https://...` (mp.info.6 P-09 accepts them).
const URI_WITH_SCHEME =
  /^[A-Za-z][A-Za-z0-9+.-]*:\/\/\S+$/;

// Boolean forms the product really uses (mp.info.6 P-08 policy: true/'true'/'sí'/'si'/'yes'; sheets write 'sí /
// no').
const TRUE_BOOLEANS = [
  'true',
  'sí',
  'si',
  's',
  'yes',
  '1',
];

const FALSE_BOOLEANS = [
  'false',
  'no',
  'n',
  '0',
];

const durationUnit = (
  type: ENSControlParameter['type']
): string =>
  type === 'duration_hours'
    ? 'horas'
    : 'días';

const durationExample = (
  type: ENSControlParameter['type']
): string =>
  type === 'duration_hours' ? '24' : '30';

// Range declared in the sheet (`minValue` / `maxValue`), applied to a plain integer and to each P-05 threshold.
const validateRange = (
  parameter: ENSControlParameter,
  number: number
): ENSParameterValueVerdict => {
  if (
    parameter.minValue !== undefined &&
    number < parameter.minValue
  ) {
    return invalidVerdict(
      `el mínimo admitido es ${parameter.minValue}; se recibió ${number}`
    );
  }

  if (
    parameter.maxValue !== undefined &&
    number > parameter.maxValue
  ) {
    return invalidVerdict(
      `el máximo admitido es ${parameter.maxValue}; se recibió ${number}`
    );
  }

  return VALID;
};

// `duration_days` / `duration_hours`: non-negative integer; a numeric string ('30') is tolerated.
const validateDuration = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const unit = durationUnit(parameter.type);

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return invalidVerdict(
        `se esperaba un número entero de ${unit}; se recibió ${describeValue(value)}`
      );
    }

    if (!Number.isInteger(value)) {
      return invalidVerdict(
        `se esperaba un número entero de ${unit}, sin decimales; se recibió ${describeValue(value)}`
      );
    }

    if (value < 0) {
      return invalidVerdict(
        `se esperaba un número de ${unit} no negativo; se recibió ${describeValue(value)}`
      );
    }

    return validateRange(parameter, value);
  }

  const text = asTrimmedString(value);

  if (!NON_NEGATIVE_INTEGER.test(text)) {
    return invalidVerdict(
      `se esperaba un número entero de ${unit} no negativo (por ejemplo ${durationExample(
        parameter.type
      )}); se recibió ${describeValue(value)}`
    );
  }

  return validateRange(parameter, Number(text));
};

const validateNumber = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return invalidVerdict(
        `se esperaba un número; se recibió ${describeValue(value)}`
      );
    }

    return validateRange(parameter, value);
  }

  const text = asTrimmedString(value);

  if (!NUMBER_PATTERN.test(text)) {
    return invalidVerdict(
      `se esperaba un número; se recibió ${describeValue(value)}`
    );
  }

  return validateRange(parameter, Number(text));
};

const validateBoolean = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (typeof value === 'boolean') {
    return VALID;
  }

  const text = asTrimmedString(value).toLowerCase();

  if (
    TRUE_BOOLEANS.includes(text) ||
    FALSE_BOOLEANS.includes(text)
  ) {
    return VALID;
  }

  return invalidVerdict(
    `se esperaba sí o no; se recibió ${describeValue(value)}`
  );
};

// `path`: absolute path (POSIX, Windows drive, UNC or URI with scheme). Rejects relative paths, `~/...` and bare
// names.
const validatePath = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const text = asTrimmedString(value);

  // A `path` is one path: `|` or a newline means a pasted example menu.
  if (/[|\n]/.test(text)) {
    return invalidVerdict(
      `se esperaba UNA ruta absoluta, no una lista de alternativas; se recibió ${describeValue(value)}`
    );
  }

  if (
    ABSOLUTE_POSIX_PATH.test(text) ||
    ABSOLUTE_WINDOWS_PATH.test(text) ||
    UNC_PATH.test(text) ||
    URI_WITH_SCHEME.test(text)
  ) {
    return VALID;
  }

  return invalidVerdict(
    `se esperaba una ruta absoluta (/backup, C:\\Backups, \\\\nas-dr\\backup o esquema://destino); se recibió ${describeValue(value)}`
  );
};

const validateUrl = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const text = asTrimmedString(value);

  if (URI_WITH_SCHEME.test(text)) {
    return VALID;
  }

  return invalidVerdict(
    `se esperaba una URL con esquema (https://...); se recibió ${describeValue(value)}`
  );
};

// --- `table`: rows with declared columns ---
// Stored as `string[]`: one row per element, fields separated by `|` (same format as multi-field list items). A
// cell cannot contain `|` or newlines.

const TABLE_FIELD_SEPARATOR = ' | ';

export const getParameterColumns = (
  parameter: ENSControlParameter
): ENSParameterColumn[] =>
  (parameter.columns || []).filter(
    column =>
      !!column &&
      String(column.name || '').trim().length >
        0
  );

/** Whether the parameter is edited as a row grid. A `table` without declared columns keeps the list renderer. */
export const hasParameterColumns = (
  parameter: ENSControlParameter
): boolean =>
  parameter.type === 'table' &&
  getParameterColumns(parameter).length > 0;

/** Splits into rows by newline only (not `toParameterListItems`: a comma is legitimate inside a cell). Blank rows are kept; validation skips them. */
export const toParameterTableRows = (
  value: ENSControlParameter['value']
): string[] => {
  if (Array.isArray(value)) {
    return value.map(row => String(row));
  }

  if (typeof value === 'string') {
    return value.split('\n');
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [String(value)];
  }

  return [];
};

export const toTableRowCells = (
  row: string
): string[] =>
  String(row)
    .split('|')
    .map(cell => cell.trim());

const isBlankRow = (row: string): boolean =>
  toTableRowCells(row).every(
    cell => cell.length === 0
  );

/** Serializes a row. An all-empty row is stored as an empty string so it still counts as absent. */
const tableRowFromCells = (
  cells: string[]
): string => {
  const cleanOnes = cells.map(cell =>
    String(cell)
      .replace(/[|\n\r]/g, ' ')
      .trim()
  );

  return cleanOnes.every(cell => !cell)
    ? ''
    : cleanOnes.join(TABLE_FIELD_SEPARATOR);
};

// Case- and whitespace-tolerant comparison, shared by `select` options and column options.
const normalizeOption = (
  text: string
): string => text.trim().toLowerCase();

const matchOption = (
  options: string[],
  text: string
): string | undefined => {
  const searched = normalizeOption(text);

  if (!searched) {
    return undefined;
  }

  return options.find(
    option =>
      normalizeOption(option) === searched
  );
};

const IDENTIFIER = /^[^\s|,]+$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A real calendar date: the regex only checks the shape (2026-02-31 passes it).
const isRealDate = (text: string): boolean => {
  const parts = text.match(ISO_DATE);

  if (!parts) {
    return false;
  }

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);

  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const date = new Date(
    Date.UTC(year, month - 1, day)
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

/** Validity of ONE cell for ITS column. A numeric column inherits the parameter range. An empty cell is decided by `validateTable` from the column's required flag. */
const validateCell = (
  column: ENSParameterColumn,
  parameter: ENSControlParameter,
  cell: string
): ENSParameterValueVerdict => {
  const options = (column.options || [])
    .map(option => String(option).trim())
    .filter(Boolean);

  switch (column.type) {
    case 'identifier':
      return IDENTIFIER.test(cell)
        ? VALID
        : invalidVerdict(
            `se esperaba un identificador sin espacios ni comas; se recibió ${describeValue(
              cell
            )}`
          );

    case 'path':
      return validatePath(cell);

    case 'octal':
      return OCTAL_UMASK.test(cell)
        ? VALID
        : invalidVerdict(
            `se esperaban tres o cuatro dígitos octales (750, 0750, 2770); se recibió ${describeValue(
              cell
            )}`
          );

    case 'number':
      return validateNumber(parameter, cell);

    case 'date':
      return isRealDate(cell)
        ? VALID
        : invalidVerdict(
            `se esperaba una fecha AAAA-MM-DD que exista (2026-03-31); se recibió ${describeValue(
              cell
            )}`
          );

    case 'select':
      if (options.length === 0) {
        return VALID;
      }

      return matchOption(options, cell)
        ? VALID
        : invalidVerdict(
            `se esperaba una de las opciones declaradas (${options.join(
              ', '
            )}); se recibió ${describeValue(cell)}`
          );

    case 'multiselect': {
      // The comma separates the values inside the cell.
      const elements = cell
        .split(',')
        .map(element => element.trim())
        .filter(Boolean);

      if (elements.length === 0) {
        return invalidVerdict(
          `se esperaba al menos un valor; se recibió ${describeValue(cell)}`
        );
      }

      if (options.length === 0) {
        return VALID;
      }

      const outside = elements.filter(
        element =>
          !matchOption(options, element)
      );

      return outside.length === 0
        ? VALID
        : invalidVerdict(
            `se esperaban valores de la lista (${options.join(
              ', '
            )}); no lo son: ${outside
              .map(element => `'${element}'`)
              .join(', ')}`
          );
    }

    case 'string':
    default:
      return cell.length > 0
        ? VALID
        : invalidVerdict(
            `se esperaba un texto; se recibió ${describeValue(cell)}`
          );
  }
};

// A verdict carries one reason: the first three problems are listed and the rest counted.
const MAX_LISTED_PROBLEMS = 3;

const summarizeProblems = (
  problems: string[]
): ENSParameterValueVerdict => {
  if (problems.length === 0) {
    return VALID;
  }

  const listed = problems
    .slice(0, MAX_LISTED_PROBLEMS)
    .join('; ');

  return invalidVerdict(
    problems.length > MAX_LISTED_PROBLEMS
      ? `${listed}; y ${problems.length -
          MAX_LISTED_PROBLEMS} problema(s) más`
      : listed
  );
};

// `list`: at least one non-empty item; if `columns[0]` is declared, each item must also be valid for it.
const validateList = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const elements = toParameterListItems(value);

  if (elements.length === 0) {
    return invalidVerdict(
      `se esperaba al menos un elemento; se recibió ${describeValue(value)}`
    );
  }

  const column =
    getParameterColumns(parameter)[0];

  if (!column) {
    return VALID;
  }

  const problems: string[] = [];

  elements.forEach(element => {
    const verdictValue = validateCell(
      column,
      parameter,
      element
    );

    if (!verdictValue.valid) {
      problems.push(
        `'${element}': ${verdictValue.reason}`
      );
    }
  });

  return summarizeProblems(problems);
};

/**
 * `table`: at least one row; a started row needs all its required columns.
 * A fully blank row is not judged. A row with more fields than declared is rejected.
 */
const validateTable = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const columns =
    getParameterColumns(parameter);

  // No declared columns: degrades to the list rule, like a `select` without `options`.
  if (columns.length === 0) {
    return validateList(parameter, value);
  }

  const rows = toParameterTableRows(
    value
  ).filter(row => !isBlankRow(row));

  if (rows.length === 0) {
    return invalidVerdict(
      `se esperaba al menos una fila con ${columns
        .map(column => column.label)
        .join(', ')}; se recibió ${describeValue(value)}`
    );
  }

  const problems: string[] = [];

  rows.forEach((row, index) => {
    const number = index + 1;
    const cells = toTableRowCells(row);

    // A last `variadic` column absorbs the extra cells (op.acc.3 P-03 is `function | indicator | indicator |
    // ...`).
    const last = columns[columns.length - 1];
    const allowsMore = Boolean(last && last.variadic);

    if (cells.length > columns.length && !allowsMore) {
      problems.push(
        `la fila ${number} trae ${cells.length} campos y la tabla declara ${columns.length} (${columns
          .map(column => column.label)
          .join(', ')})`
      );
      return;
    }

    columns.forEach((column, position) => {
      const cell = (
        cells[position] || ''
      ).trim();

      if (!cell) {
        if (column.required) {
          problems.push(
            `falta «${column.label}» en la fila ${number}`
          );
        }
        return;
      }

      const verdictValue = validateCell(
        column,
        parameter,
        cell
      );

      if (!verdictValue.valid) {
        problems.push(
          `«${column.label}» de la fila ${number}: ${verdictValue.reason}`
        );
      }
    });
  });

  return summarizeProblems(problems);
};

// --- `select`: declared options ---
// Single criterion shared by the form and the validator. A `select` without `options` accepts any text (blocks
// seeded before options existed).

const getParameterOptions = (
  parameter: ENSControlParameter
): string[] =>
  (parameter.options || [])
    .map(option => String(option).trim())
    .filter(Boolean);

/** The options offered at a level: `optionsByLevel` where it narrows them, every option otherwise. */
const getParameterOptionsAtLevel = (
  parameter: ENSControlParameter,
  level?: ENSLevel
): string[] => {
  const all = getParameterOptions(parameter);
  const narrowed = level ? parameter.optionsByLevel?.[level] : undefined;

  return narrowed ? all.filter(option => narrowed.includes(option)) : all;
};

/** The parameter as the form offers it at a level: only the options the ENS admits there. */
export const parameterAtLevel = (
  parameter: ENSControlParameter,
  level?: ENSLevel
): ENSControlParameter =>
  parameter.optionsByLevel && level && parameter.optionsByLevel[level]
    ? { ...parameter, options: getParameterOptionsAtLevel(parameter, level) }
    : parameter;

/** Whether the parameter is edited as a dropdown. */
export const hasParameterOptions = (
  parameter: ENSControlParameter
): boolean =>
  parameter.type === 'select' &&
  getParameterOptions(parameter).length > 0;

/** Declared option matching the received value in canonical form, or `undefined`. Case- and whitespace-tolerant (shared with column options via `matchOption`). */
const matchParameterOption = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): string | undefined =>
  matchOption(
    getParameterOptions(parameter),
    asTrimmedString(value)
  );

const validateSelection = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const options =
    getParameterOptions(parameter);

  if (options.length === 0) {
    return VALID;
  }

  if (matchParameterOption(parameter, value)) {
    return VALID;
  }

  return invalidVerdict(
    `se esperaba una de las opciones declaradas (${options.join(', ')}); se recibió ${describeValue(value)}`
  );
};

const validateString = (
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (asTrimmedString(value).length > 0) {
    return VALID;
  }

  return invalidVerdict(
    `se esperaba un texto; se recibió ${describeValue(value)}`
  );
};

// --- Per-parameter refinements ---
// Refined by `name` instead of adding a type: the entry stops matching if the parameter is renamed, and the base
// type keeps validating.

interface ParameterRefinement {
  controlId: string;
  name: string;
  criterio: string;
  validar: (
    parameter: ENSControlParameter,
    value: ENSControlParameter['value']
  ) => ENSParameterValueVerdict;
}

// op.acc.2 P-07 `umask_minimo` is a `string`.
const validateUmask = (
  _parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const text = asTrimmedString(value);

  if (OCTAL_UMASK.test(text)) {
    return VALID;
  }

  return invalidVerdict(
    `se esperaba un umask de tres o cuatro dígitos octales (022, 027, 0027); se recibió ${describeValue(value)}`
  );
};

// mp.info.6 P-05 `periodo_max_sin_prueba_dias` is `duration_days` but also accepts the contract form 'ALTA=30;
// MEDIA=90' (criticality per machine from P-04).
const validateRestoreThreshold = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const text = asTrimmedString(value);

  // Simple form: one integer for all systems.
  if (
    typeof value === 'number' ||
    NON_NEGATIVE_INTEGER.test(text)
  ) {
    return validateDuration(parameter, value);
  }

  // Contract form: entries split like any other list; each threshold is validated.
  const entries = toParameterListItems(
    Array.isArray(value) ? value : text
  );

  if (entries.length === 0) {
    return invalidVerdict(
      `se esperaba un número entero de días o un contrato por criticidad (ALTA=30; MEDIA=90); se recibió ${describeValue(value)}`
    );
  }

  const invalidOnes: string[] = [];

  entries.forEach(entry => {
    const pair = entry.match(
      /^(ALTA|MEDIA|BAJA)\s*=\s*(\d+)$/i
    );

    if (!pair) {
      invalidOnes.push(entry);
      return;
    }

    const range = validateRange(
      parameter,
      Number(pair[2])
    );

    if (!range.valid) {
      invalidOnes.push(entry);
    }
  });

  if (invalidOnes.length > 0) {
    return invalidVerdict(
      `se esperaba un número entero de días o un contrato por criticidad (ALTA=30; MEDIA=90); no se entienden estas entradas: ${invalidOnes
        .map(entry => `'${entry}'`)
        .join(', ')}`
    );
  }

  return VALID;
};

// op.mon.2 P-01: a valid table and one row per measure (two rows of the same measure would count it twice).
const validateStatementOfApplicability = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  const typed = validateTable(parameter, value);

  if (!typed.valid) {
    return typed;
  }

  const rows = new Map<string, number[]>();

  toParameterTableRows(value)
    .filter(row => !isBlankRow(row))
    .forEach((row, index) => {
      const measure = (toTableRowCells(row)[0] || '').trim().toLowerCase();

      if (measure) {
        rows.set(measure, [...(rows.get(measure) || []), index + 1]);
      }
    });

  const repeated = Array.from(rows.entries()).filter(([, lines]) => lines.length > 1);

  return repeated.length
    ? invalidVerdict(
        `una sola fila por medida: ${repeated.map(([measure, lines]) => `«${measure}» está en las filas ${lines.join(', ')}`).join('; ')}`
      )
    : VALID;
};

const PARAMETER_REFINEMENTS: ParameterRefinement[] = [
  {
    controlId: 'op.mon.2',
    name: 'declaracion_aplicabilidad',
    criterio: 'una fila por medida',
    validar: validateStatementOfApplicability,
  },
  {
    controlId: 'op.acc.2',
    name: 'umask_minimo',
    criterio:
      'tres o cuatro dígitos octales',
    validar: validateUmask,
  },
  {
    controlId: 'mp.info.6',
    name: 'periodo_max_sin_prueba_dias',
    criterio:
      'entero de días o contrato por criticidad (ALTA=30; MEDIA=90)',
    validar: validateRestoreThreshold,
  },
];

const findRefinement = (
  parameter: ENSControlParameter
): ParameterRefinement | undefined =>
  PARAMETER_REFINEMENTS.find(
    refinement =>
      refinement.name === parameter.name &&
      refinement.controlId ===
        parameter.controlId
  );

const validateByType = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  switch (parameter.type) {
    case 'duration_days':
    case 'duration_hours':
      return validateDuration(parameter, value);

    case 'number':
      return validateNumber(parameter, value);

    case 'boolean':
      return validateBoolean(value);

    case 'path':
      return validatePath(value);

    case 'url':
      return validateUrl(value);

    case 'list':
      return validateList(parameter, value);

    case 'table':
      return validateTable(parameter, value);

    case 'select':
      return validateSelection(parameter, value);

    case 'string':
      return validateString(value);

    default:
      // Unhandled type: not judged invalid, only "has something written".
      return validateString(value);
  }
};

/** Whether the parameter admits only a number. mp.info.6 P-05 is `duration_days` but accepts 'ALTA=30; MEDIA=90', which a numeric field cannot hold. */
export const isPlainNumericParameter = (
  parameter: ENSControlParameter
): boolean =>
  (parameter.type === 'number' ||
    parameter.type === 'duration_hours' ||
    parameter.type === 'duration_days') &&
  !findRefinement(parameter);

// Text used to DISPLAY a non-string legacy value; nothing is rewritten in the index until the field is edited.
const asDisplayText = (
  value: ENSControlParameter['value']
): string => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean)
      .join(', ');
  }

  return asTrimmedString(value);
};

export interface ENSSelectOption {
  value: string;
  label: string;
  // Value already stored that matches no declared option: offered as marked option so it does not vanish.
  legacy: boolean;
}

interface ENSSelectFieldModel {
  options: ENSSelectOption[];
  selected: string;
  legacyValue?: string;
}

/**
 * Options and selection the form draws for a `select`.
 * A stored value outside the options is kept as a marked, selected option and the field turns red (save rejects it); it is never replaced by the closest option. Matching ignores case and surrounding whitespace.
 */
export const resolveSelectFieldModel = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSSelectFieldModel => {
  const options: ENSSelectOption[] =
    getParameterOptions(parameter).map(
      option => ({
        value: option,
        label: option,
        legacy: false,
      })
    );

  if (isEmptyParameterValue(value)) {
    return { options, selected: '' };
  }

  const canonical = matchParameterOption(
    parameter,
    value
  );

  if (canonical) {
    return { options, selected: canonical };
  }

  const inheritedValue = asDisplayText(value);

  if (!inheritedValue) {
    return { options, selected: '' };
  }

  return {
    options: [
      ...options,
      {
        value: inheritedValue,
        label: `${inheritedValue} (valor actual, fuera de la lista)`,
        legacy: true,
      },
    ],
    selected: inheritedValue,
    legacyValue: inheritedValue,
  };
};

// --- form model for `table` ---
// Lives here so the form and the validator read rows identically.

export interface ENSTableCellModel {
  column: ENSParameterColumn;
  value: string;
  // Reason why THIS cell is invalid (empty if valid or blank).
  reason?: string;
  // Only for `select` / `multiselect` columns.
  options: ENSSelectOption[];
  // Only for `multiselect`: the cell split into its values.
  items: string[];
  // Hint from the parameter `example`; placeholder only, never stored.
  placeholder?: string;
}

interface ENSTableRowModel {
  cells: ENSTableCellModel[];
  // Extra fields the row carries beyond the declared columns; kept and shown joined to the last cell.
  overflow: number;
}

interface ENSTableFieldModel {
  columns: ENSParameterColumn[];
  rows: ENSTableRowModel[];
}

// Per-column placeholder: the matching cell of the parameter `example`.
const examplePlaceholders = (
  parameter: ENSControlParameter,
  columns: ENSParameterColumn[]
): string[] => {
  const cells = parameter.example
    ? toTableRowCells(parameter.example)
    : [];

  return columns.map(
    (_column, position) =>
      cells[position] || ''
  );
};

const cellOptions = (
  column: ENSParameterColumn,
  cell: string
): ENSSelectOption[] => {
  const declared = (column.options || [])
    .map(option => String(option).trim())
    .filter(Boolean);

  const options: ENSSelectOption[] =
    declared.map(option => ({
      value: option,
      label: option,
      legacy: false,
    }));

  // Same rule as `resolveSelectFieldModel`: a stored value outside the options is offered marked and selected,
  // never replaced.
  if (
    column.type === 'select' &&
    declared.length > 0 &&
    cell &&
    !matchOption(declared, cell)
  ) {
    options.push({
      value: cell,
      label: `${cell} (valor actual, fuera de la lista)`,
      legacy: true,
    });
  }

  return options;
};

/** Rows and cells the form draws for a `table`. A row with fewer fields than declared is padded with empty cells. */
export const resolveTableFieldModel = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSTableFieldModel => {
  const columns =
    getParameterColumns(parameter);

  if (columns.length === 0) {
    return { columns, rows: [] };
  }

  const placeholders = examplePlaceholders(
    parameter,
    columns
  );

  const rows = toParameterTableRows(value).map(
    row => {
      const allCells = toTableRowCells(row);
      const surplus = Math.max(
        0,
        allCells.length - columns.length
      );

      const cells = columns.map(
        (column, position) => {
          // Extra fields are joined to the last cell so they stay visible and are kept on save.
          const raw =
            surplus > 0 &&
            position === columns.length - 1
              ? allCells
                  .slice(position)
                  .join(TABLE_FIELD_SEPARATOR)
              : allCells[position] || '';

          const cell = raw.trim();

          const verdictValue = cell
            ? validateCell(
                column,
                parameter,
                cell
              )
            : VALID;

          return {
            column,
            value: cell,
            reason: verdictValue.valid
              ? undefined
              : verdictValue.reason,
            options: cellOptions(
              column,
              cell
            ),
            items: cell
              .split(',')
              .map(item => item.trim())
              .filter(Boolean),
            placeholder:
              placeholders[position] ||
              undefined,
          };
        }
      );

      return { cells, overflow: surplus };
    }
  );

  return { columns, rows };
};

// The three pure form operations: take the stored value, return the next. `undefined` means "not configured"
// (last row deleted).
const rowsAsValue = (
  rows: string[]
): string[] | undefined =>
  rows.length === 0 ? undefined : rows;

export const setTableCell = (
  value: ENSControlParameter['value'],
  parameter: ENSControlParameter,
  rowIndex: number,
  cellIndex: number,
  cellValue: string
): string[] | undefined => {
  const columns =
    getParameterColumns(parameter);
  const rows = toParameterTableRows(value);

  // Guard on the INDEX, not on row content: a blank row is stored as an empty string (falsy). Covered by
  // `config/test_control_blocks.py`, case "write in a cell".
  if (
    rowIndex < 0 ||
    rowIndex >= rows.length
  ) {
    return rowsAsValue(rows);
  }

  const allCells = toTableRowCells(rows[rowIndex]);

  const nextOnes = columns.map(
    (_column, position) =>
      position === cellIndex
        ? cellValue
        : allCells[position] || ''
  );

  // Extra fields of a legacy row live in the last cell; keep them when another cell is edited.
  if (
    allCells.length > columns.length &&
    cellIndex !== columns.length - 1
  ) {
    nextOnes[columns.length - 1] = allCells
      .slice(columns.length - 1)
      .join(TABLE_FIELD_SEPARATOR);
  }

  const following = [...rows];
  following[rowIndex] =
    tableRowFromCells(nextOnes);

  return rowsAsValue(following);
};

export const addTableRow = (
  value: ENSControlParameter['value']
): string[] => [
  ...toParameterTableRows(value),
  '',
];

export const removeTableRow = (
  value: ENSControlParameter['value'],
  rowIndex: number
): string[] | undefined =>
  rowsAsValue(
    toParameterTableRows(value).filter(
      (_row, index) => index !== rowIndex
    )
  );

/** Judges whether a value is valid for its parameter. An empty value is valid here ("not configured" is a different fix). */
export const validateParameterValue = (
  parameter: ENSControlParameter,
  value: ENSControlParameter['value']
): ENSParameterValueVerdict => {
  if (parameter.matchMode !== undefined && !ENS_MATCH_MODES.includes(parameter.matchMode)) {
    return invalidVerdict('El modo de comparación debe ser texto exacto o expresión regular');
  }

  // Before the empty check: choosing «Expresión regular» means a pattern has to be written.
  if (parameter.matchMode === 'regex') {
    if (!supportsParameterPattern(parameter)) {
      return invalidVerdict('Este parámetro no admite expresiones regulares');
    }
    try {
      compileParameterPattern(value);
      return VALID;
    } catch (error) {
      return invalidVerdict(`Expresión regular inválida: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (isEmptyParameterValue(value)) {
    return VALID;
  }

  const refinement =
    findRefinement(parameter);

  if (refinement) {
    return refinement.validar(
      parameter,
      value
    );
  }

  return validateByType(parameter, value);
};
