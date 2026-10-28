// Override -> assigned template, or else the type's built-in -> common value; the two templates never mix, for 1.2.0 parity.
import type {
  ENSAgentParameterValue,
  ENSAgentProfile,
  ENSConfigurationVersion,
  ENSControlConfiguration,
  ENSControlParameter,
  ENSMatchMode,
  ENSSystemType,
} from '../types';
import { ENS_NO_TEMPLATE, knownSystemType, normalizeAgentId } from '../../../agent-configuration';
import { toParameterListItems, toParameterTableRows, toTableRowCells } from '../services/parameter-value-validator';
import { withMatchMode } from '../services/parameter-pattern';
import { getENSCatalogControl } from '../../catalog';
import type { ENSControlDefinition } from '../../catalog/types';
import { ENSControlTemplate, findControlTemplate, getTypeDefaultTemplate } from '../templates';
import { getParameterClass, isAgentLevelParameter } from './parameter-classes';
import { needsTemplateMigration, planTemplateMigration } from './template-migration';
import { ENS_MANAGER_AGENT_ID } from '../../core/scope/measurement-planes';

export const ENS_MANAGER_AGENT = ENS_MANAGER_AGENT_ID;

type ENSResolvable = Pick<ENSConfigurationVersion, 'controls' | 'agents' | 'templates'>;

export type ENSValueSource = 'agent' | 'template' | 'organisation' | 'union';

export interface ENSResolvedValueOrigin {
  source: ENSValueSource;
  templateId?: string;
  templateName?: string;
  // `assigned` in the control, or the built-in of the agent's `type`.
  via?: 'assigned' | 'type';
  // Agents that add rows to a union.
  contributors?: string[];
}

interface ENSEffectiveTemplate {
  template?: ENSControlTemplate;
  via: 'assigned' | 'type' | 'none';
  // The stored assignment, even when it names a template that no longer exists.
  assignedId?: string;
}

type CatalogLookup = (controlId: string) => Pick<ENSControlDefinition, 'measurementPlanes' | 'scopeParameter'> | undefined;

const defaultCatalogLookup: CatalogLookup = controlId => getENSCatalogControl(controlId);

const hasOwn = (record: object | undefined, key: string): boolean =>
  !!record && Object.prototype.hasOwnProperty.call(record, key);

// Not memoised: callers such as the distribution by agents mutate their working copy between calls.
export const toTemplateModel = <T extends ENSResolvable>(configuration: T): T =>
  needsTemplateMigration(configuration) ? planTemplateMigration(configuration).configuration : configuration;

export const getAgentSystemType = (profile: ENSAgentProfile | undefined): ENSSystemType | undefined =>
  knownSystemType(profile?.typeOverride) || knownSystemType(profile?.detectedType);

const profileOf = (configuration: ENSResolvable, agentId: string | undefined): ENSAgentProfile | undefined =>
  agentId === undefined ? undefined : configuration.agents?.[normalizeAgentId(agentId)];

const effectiveTemplateOf = (
  configuration: ENSResolvable,
  profile: ENSAgentProfile | undefined,
  controlId: string
): ENSEffectiveTemplate => {
  const assignedId = profile?.controls?.[controlId]?.templateId;
  if (assignedId === ENS_NO_TEMPLATE) {
    return { via: 'none', assignedId };
  }
  const assigned = findControlTemplate(configuration, controlId, assignedId);
  if (assigned) {
    return { template: assigned, via: 'assigned', assignedId };
  }
  const byType = getTypeDefaultTemplate(controlId, getAgentSystemType(profile));
  return byType ? { template: byType, via: 'type', assignedId } : { via: 'none', assignedId };
};

export const getEffectiveTemplate = (
  configuration: ENSResolvable,
  agentId: string,
  controlId: string
): ENSEffectiveTemplate => {
  const model = toTemplateModel(configuration);
  return effectiveTemplateOf(model, profileOf(model, agentId), controlId);
};

interface ENSAgentLevelValue {
  value: ENSAgentParameterValue;
  origin: ENSResolvedValueOrigin;
  // The mode stored with this value at its level; absent is exact.
  matchMode?: ENSMatchMode;
}

const agentLevelValueOf = (
  configuration: ENSResolvable,
  profile: ENSAgentProfile | undefined,
  controlId: string,
  parameterId: string,
  includeOverride: boolean
): ENSAgentLevelValue | undefined => {
  if (!isAgentLevelParameter(controlId, parameterId)) {
    return undefined;
  }
  const entry = profile?.controls?.[controlId];
  if (includeOverride && hasOwn(entry?.parameters, parameterId)) {
    return { value: entry!.parameters![parameterId], origin: { source: 'agent' }, ...modeOf(entry!.matchModes, parameterId) };
  }
  const effective = effectiveTemplateOf(configuration, profile, controlId);
  const template = effective.template;
  return template && hasOwn(template.values, parameterId)
    ? {
        value: template.values[parameterId],
        origin: { source: 'template', templateId: template.id, templateName: template.name, via: effective.via as 'assigned' | 'type' },
        ...modeOf(template.matchModes, parameterId),
      }
    : undefined;
};

const modeOf = (modes: Record<string, ENSMatchMode> | undefined, parameterId: string): { matchMode?: ENSMatchMode } =>
  modes?.[parameterId] === 'regex' ? { matchMode: 'regex' } : {};

// The agent-level value (override or template), without falling back to the common value.
export const getAgentLevelValue = (
  configuration: ENSResolvable,
  agentId: string,
  controlId: string,
  parameterId: string
): ENSAgentLevelValue | undefined => {
  const model = toTemplateModel(configuration);
  return agentLevelValueOf(model, profileOf(model, agentId), controlId, parameterId, true);
};

// What the agent would get without its override: template value, or the common value, each with its own mode.
export const getInheritedSetting = (
  configuration: ENSResolvable,
  agentId: string,
  controlId: string,
  parameterId: string
): { value?: ENSAgentParameterValue; matchMode?: ENSMatchMode } => {
  const model = toTemplateModel(configuration);
  const agentLevel = agentLevelValueOf(model, profileOf(model, agentId), controlId, parameterId, false);
  if (agentLevel) {
    return { value: agentLevel.value, ...(agentLevel.matchMode ? { matchMode: agentLevel.matchMode } : {}) };
  }
  const common = model.controls.find(control => control.controlId === controlId)?.parameters.find(parameter => parameter.id === parameterId);
  return { value: common?.value, ...(common?.matchMode === 'regex' ? { matchMode: 'regex' as const } : {}) };
};

const isManagerRow = (agentId?: string): boolean =>
  agentId === undefined || normalizeAgentId(agentId) === ENS_MANAGER_AGENT;

// Parameters that describe other machines are read whole by the manager row, so they resolve by union. The
// OSCompliance engine judges the manager as one more machine: its controls never union.
export const isUnionParameter = (
  controlId: string,
  parameterId: string,
  agentId?: string,
  catalogLookup: CatalogLookup = defaultCatalogLookup
): boolean => {
  const control = catalogLookup(controlId);

  if (control?.scopeParameter === parameterId) {
    return true;
  }

  return false;
};

const rowsOf = (parameter: ENSControlParameter, value: unknown): string[] =>
  (parameter.type === 'table'
    ? toParameterTableRows(value as ENSControlParameter['value'])
    : toParameterListItems(value as ENSControlParameter['value'])
  )
    .map(row => String(row))
    .filter(row => row.trim().length > 0);

// Same row only if identical cell by cell, ignoring spaces around `|`; case counts (`Ana` and `ana` are two accounts).
export const rowKey = (row: string): string =>
  toTableRowCells(row).join('|');

const resolveUnion = (
  configuration: ENSResolvable,
  controlId: string,
  parameter: ENSControlParameter
): { value: string[]; contributors: string[] } | undefined => {
  const seen = new Set<string>();
  const rows: string[] = [];
  const add = (row: string): boolean => {
    const key = rowKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    rows.push(row);
    return true;
  };

  rowsOf(parameter, parameter.value).forEach(add);

  const contributors: string[] = [];

  Object.keys(configuration.agents || {})
    .sort()
    .forEach(agentId => {
      const agentValue = agentLevelValueOf(configuration, configuration.agents![agentId], controlId, parameter.id, true);
      if (!agentValue) return;
      const added = rowsOf(parameter, agentValue.value).map(add).some(Boolean);
      if (added) contributors.push(agentId);
    });

  return contributors.length ? { value: rows, contributors } : undefined;
};

interface ENSResolvedControlConfiguration {
  configuration: ENSControlConfiguration;
  origins: Record<string, ENSResolvedValueOrigin>;
}

const resolveInModel = (
  model: ENSResolvable,
  controlId: string,
  agentId: string | undefined,
  catalogLookup: CatalogLookup
): ENSResolvedControlConfiguration | undefined => {
  const base = model.controls.find(control => control.controlId === controlId);

  if (!base) {
    return undefined;
  }

  const origins: Record<string, ENSResolvedValueOrigin> = {};
  base.parameters.forEach(parameter => {
    origins[parameter.id] = { source: 'organisation' };
  });

  if (!model.agents || Object.keys(model.agents).length === 0) {
    return { configuration: base, origins };
  }

  const profile = profileOf(model, agentId);

  let changed = false;

  const parameters = base.parameters.map(parameter => {
    if (!isAgentLevelParameter(controlId, parameter.id)) {
      return parameter;
    }

    if (isUnionParameter(controlId, parameter.id, agentId, catalogLookup)) {
      const union = resolveUnion(model, controlId, parameter);
      if (!union) return parameter;
      changed = true;
      origins[parameter.id] = { source: 'union', contributors: union.contributors };
      return { ...parameter, value: union.value };
    }

    const agentValue = agentId === undefined ? undefined : agentLevelValueOf(model, profile, controlId, parameter.id, true);

    if (!agentValue) {
      return parameter;
    }

    changed = true;
    origins[parameter.id] = agentValue.origin;
    return withMatchMode({ ...parameter, value: agentValue.value }, agentValue.matchMode);
  });

  return {
    configuration: changed ? { ...base, parameters } : base,
    origins,
  };
};

export const resolveControlConfigurationWithOrigins = (
  configuration: ENSResolvable,
  controlId: string,
  agentId?: string,
  catalogLookup: CatalogLookup = defaultCatalogLookup
): ENSResolvedControlConfiguration | undefined =>
  resolveInModel(toTemplateModel(configuration), controlId, agentId, catalogLookup);

// Per-document memo for the engine: the repository replaces the object on every save, so a key never goes stale.
const cache = new WeakMap<object, { model: ENSResolvable; byKey: Map<string, ENSControlConfiguration | undefined> }>();

export const resolveControlConfigurationForAgent = (
  configuration: ENSResolvable,
  controlId: string,
  agentId?: string
): ENSControlConfiguration | undefined => {
  if (!configuration.agents || Object.keys(configuration.agents).length === 0) {
    return configuration.controls.find(control => control.controlId === controlId);
  }

  let entry = cache.get(configuration);

  if (!entry) {
    entry = { model: toTemplateModel(configuration), byKey: new Map() };
    cache.set(configuration, entry);
  }

  const key = `${controlId}|${agentId === undefined ? '' : normalizeAgentId(agentId)}`;

  if (!entry.byKey.has(key)) {
    entry.byKey.set(key, resolveInModel(entry.model, controlId, agentId, defaultCatalogLookup)?.configuration);
  }

  return entry.byKey.get(key);
};
