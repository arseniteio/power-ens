// The item as a form field, whether a value is valid for every parameter that reads it, and its warnings.
import type {
  ENSAgentParameterValue,
  ENSConfigurationVersion,
  ENSControlParameter,
} from '../types';
import {
  isEmptyParameterValue,
  toParameterTableRows,
  toTableRowCells,
  validateParameterValue,
} from '../services/parameter-value-validator';
import type { ENSOrganizationDataItem } from './organization-data-items';
import { organizationViewValue, singleValueExtraRows } from './organization-data-views';

const ORGANIZATION_FIELD_ID = 'Dato común';

type ENSDocument = Pick<ENSConfigurationVersion, 'controls'>;

// Not a control parameter: no control id the refinements or the regex mode would recognise.
export const organizationDataParameter = (item: ENSOrganizationDataItem): ENSControlParameter => ({
  id: ORGANIZATION_FIELD_ID,
  controlId: 'organizacion',
  name: item.id,
  label: item.label,
  description: item.description,
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  requirements: [],
  type: item.type,
  ...(item.columns ? { columns: item.columns } : {}),
  ...(item.options ? { options: item.options } : {}),
  required: false,
  wazuhUsage: '',
  powerEnsUsage: '',
  evidenceIds: [],
  ruleIds: [],
  ifNotConfigured: '',
});

interface ENSOrganizationValueIssue {
  // The item label, or the parameter that would read an invalid value («op.acc.1 P-11»).
  source: string;
  reason: string;
}

const parameterOf = (configuration: ENSDocument, controlId: string, parameterId: string): ENSControlParameter | undefined =>
  configuration.controls.find(control => control.controlId === controlId)?.parameters.find(candidate => candidate.id === parameterId);

// A parameter that reads one value and finds several rows of its use: the order of the rows would decide.
export const organizationSingleValueIssues = (
  configuration: ENSDocument,
  item: ENSOrganizationDataItem,
  value: ENSAgentParameterValue | undefined
): ENSOrganizationValueIssue[] =>
  item.views
    .filter(view => {
      const parameter = parameterOf(configuration, view.controlId, view.parameterId);
      return !!parameter && singleValueExtraRows(item, view, parameter, value) > 0;
    })
    .map(view => ({
      source: `${view.controlId} ${view.parameterId}`,
      reason: `lee un solo valor: dejar una sola fila con uso «${Object.values(view.where || {}).join(', ')}» en «${item.label}»`,
    }));

export const validateOrganizationValue = (
  configuration: ENSDocument,
  item: ENSOrganizationDataItem,
  value: ENSAgentParameterValue | undefined
): ENSOrganizationValueIssue[] => {
  const issues: ENSOrganizationValueIssue[] = [];
  const own = validateParameterValue(organizationDataParameter(item), value);
  if (!own.valid) issues.push({ source: item.label, reason: own.reason || 'valor no válido' });
  const single = organizationSingleValueIssues(configuration, item, value);
  issues.push(...single);
  item.views.forEach(view => {
    const parameter = parameterOf(configuration, view.controlId, view.parameterId);
    const source = `${view.controlId} ${view.parameterId}`;
    if (!parameter || single.some(issue => issue.source === source)) return;
    const verdict = validateParameterValue(parameter, organizationViewValue(item, view, parameter, value));
    if (!verdict.valid) issues.push({ source, reason: verdict.reason || 'valor no válido' });
  });
  return issues;
};

const cellsOf = (item: ENSOrganizationDataItem, value: ENSAgentParameterValue | undefined): Record<string, string>[] => {
  if (item.type !== 'table' || isEmptyParameterValue(value)) return [];
  const names = (item.columns || []).map(column => column.name);
  return toParameterTableRows(value)
    .filter(row => row.trim())
    .map(row => {
      const cells = toTableRowCells(row);
      return Object.fromEntries(names.map((name, index) => [name, cells[index] ?? '']));
    });
};

// Not blocking: a row with several uses gives the same «Ámbito» or «Detalle» to each, and their meaning differs.
export const organizationValueWarnings = (item: ENSOrganizationDataItem, value: ENSAgentParameterValue | undefined): string[] => {
  const perUse = item.perUseColumns || [];
  const useColumn = (item.columns || []).find(column => column.type === 'multiselect')?.name;
  if (!perUse.length || !useColumn) return [];
  return cellsOf(item, value)
    .filter(row => row[useColumn].split(',').map(option => option.trim()).filter(Boolean).length > 1 && perUse.some(column => row[column]))
    .map(row => {
      const labels = perUse.filter(column => row[column]).map(column => (item.columns || []).find(candidate => candidate.name === column)?.label || column);
      return `La fila de «${row[(item.columns || [])[0].name]}» tiene varios usos (${row[useColumn]}) y comparte ${labels.join(' y ')}: cada uso lo lee con su significado. Si difiere, una fila por uso.`;
    });
};

const POWER_ENS_INCIDENT_REGISTER = /incident-register\.tsv|registro Power ENS/i;

// Data that should agree with an item but stays in its control: said in General when it does not.
export const organizationCrossChecks = (configuration: ENSDocument, itemId: string): string[] => {
  if (itemId !== 'herramientas_gestion') return [];
  const selector = parameterOf(configuration, 'op.exp.9', 'P-01');
  const incidents = parameterOf(configuration, 'op.exp.7', 'P-03');
  if (!selector || isEmptyParameterValue(selector.value) || !incidents || isEmptyParameterValue(incidents.value)) return [];
  const register = POWER_ENS_INCIDENT_REGISTER.test(String(selector.value));
  const declared = toParameterTableRows(incidents.value).some(row => POWER_ENS_INCIDENT_REGISTER.test(row));
  return register === declared
    ? []
    : [`op.exp.9 P-01 dice «${String(selector.value)}» y la fila de incidentes de este dato ${declared ? 'nombra' : 'no nombra'} el registro de Power ENS: comprobar que sean la misma herramienta.`];
};

interface ENSOrganizationChoiceChange {
  parameter: string;
  // Rows the parameter loses (ports, origins, entries), rows it gains and what it ends with.
  removed: string[];
  added: string[];
  after: string[];
}

const comparable = (line: string): string => {
  const cells = toTableRowCells(line);
  while (cells.length && !cells[cells.length - 1]) cells.pop();
  return cells.join('|');
};

// What each parameter that reads the item becomes with this value: shown before choosing it.
export const describeOrganizationChoice = (
  configuration: ENSDocument,
  item: ENSOrganizationDataItem,
  value: ENSAgentParameterValue | undefined
): ENSOrganizationChoiceChange[] =>
  item.views.flatMap(view => {
    const parameter = parameterOf(configuration, view.controlId, view.parameterId);
    if (!parameter) return [];
    const before = organizationValueLines(parameter.value);
    const after = organizationValueLines(organizationViewValue(item, view, parameter, value));
    const removed = before.filter(line => !after.some(other => comparable(other) === comparable(line)));
    const added = after.filter(line => !before.some(other => comparable(other) === comparable(line)));
    return removed.length || added.length ? [{ parameter: `${view.controlId} ${view.parameterId}`, removed, added, after }] : [];
  });

// One line per list item or table row, for reading.
export const organizationValueLines = (value: ENSControlParameter['value'] | undefined): string[] =>
  Array.isArray(value)
    ? value.map(entry => String(entry).trim()).filter(Boolean)
    : value === undefined || value === null || String(value).trim() === ''
      ? []
      : [String(value)];
