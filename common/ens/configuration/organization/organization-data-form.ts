// The item as a form field, and whether a value is valid for the item and for every parameter that reads it.
import type {
  ENSAgentParameterValue,
  ENSConfigurationVersion,
  ENSControlParameter,
} from '../types';
import { validateParameterValue } from '../services/parameter-value-validator';
import type { ENSOrganizationDataItem } from './organization-data-items';
import { organizationViewValue } from './organization-data-views';

export const ORGANIZATION_FIELD_ID = 'Dato común';

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
  ensfacilUsage: '',
  evidenceIds: [],
  ruleIds: [],
  ifNotConfigured: '',
});

export interface ENSOrganizationValueIssue {
  // The item label, or the parameter that would read an invalid value («op.acc.1 P-11»).
  source: string;
  reason: string;
}

export const validateOrganizationValue = (
  configuration: Pick<ENSConfigurationVersion, 'controls'>,
  item: ENSOrganizationDataItem,
  value: ENSAgentParameterValue | undefined
): ENSOrganizationValueIssue[] => {
  const issues: ENSOrganizationValueIssue[] = [];
  const own = validateParameterValue(organizationDataParameter(item), value);
  if (!own.valid) issues.push({ source: item.label, reason: own.reason || 'valor no válido' });
  item.views.forEach(view => {
    const parameter = configuration.controls
      .find(control => control.controlId === view.controlId)
      ?.parameters.find(candidate => candidate.id === view.parameterId);
    if (!parameter) return;
    const { matchMode: _mode, ...exact } = parameter;
    const verdict = validateParameterValue(exact, organizationViewValue(item, view, parameter, value));
    if (!verdict.valid) issues.push({ source: `${view.controlId} ${view.parameterId}`, reason: verdict.reason || 'valor no válido' });
  });
  return issues;
};

// One line per list item or table row, for reading.
export const organizationValueLines = (value: ENSControlParameter['value'] | undefined): string[] =>
  Array.isArray(value)
    ? value.map(entry => String(entry).trim()).filter(Boolean)
    : value === undefined || value === null || String(value).trim() === ''
      ? []
      : [String(value)];
