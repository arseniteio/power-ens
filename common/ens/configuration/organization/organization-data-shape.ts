import { isAgentParameterValue } from '../../../agent-configuration';
import { ENS_ORGANIZATION_DATA_ITEMS } from './organization-data-items';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const validateOrganizationDataShape = (
  value: unknown,
  path: string = 'configuration.organizationData'
): string[] => {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${path} must be an object.`];
  if (!isRecord(value.values)) return [`${path}.values must be an object keyed by item id.`];
  return Object.entries(value.values)
    .filter(([, itemValue]) => !isAgentParameterValue(itemValue))
    .map(
      ([itemId]) =>
        `${path}.values.${itemId} has an invalid value (a string, a number, a boolean or a string array; to clear it, remove the key, never null).`
    );
};

const EDITABLE_ITEMS = ENS_ORGANIZATION_DATA_ITEMS.filter(item => item.views.length).map(item => item.id);

export const checkOrganizationDataKeys = (
  value: unknown,
  path: string = 'configuration.organizationData'
): string[] => {
  if (!isRecord(value)) return [];
  const warnings = Object.keys(value)
    .filter(key => key !== 'values')
    .map(key => `${path}.${key}: unknown to this version, kept and not used.`);
  if (isRecord(value.values)) {
    Object.keys(value.values)
      .filter(itemId => !EDITABLE_ITEMS.includes(itemId))
      .forEach(itemId => warnings.push(`${path}.values.${itemId}: item unknown to this version, kept and not used.`));
  }
  return warnings;
};
