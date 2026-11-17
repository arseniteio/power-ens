import { ENGINE_CATALOG } from '../catalog/engine-catalog';
import type { ENSAgentParameterValue, ENSMatchMode, ENSSystemType } from '../../agent-configuration';
import { ENS_NO_TEMPLATE, knownSystemType, normalizeAgentId } from '../../agent-configuration';
import type { ENSConfigurationVersion } from '../configuration/types';
import { findControlTemplate, getTypeDefaultTemplate } from '../configuration/templates';
import { isAgentLevelParameter } from '../configuration/agents/parameter-classes';
import type { ENSProfile } from './types';

export type ENSValueSourceKind = 'agent' | 'template' | 'profile' | 'type-template' | 'organisation';

export interface ENSValueSource {
  kind: ENSValueSourceKind;
  id?: string;
  name?: string;
}

export interface ENSResolvedParameter {
  controlId: string;
  parameterId: string;
  label: string;
  type: string;
  value?: ENSAgentParameterValue;
  matchMode?: ENSMatchMode;
  sources: ENSValueSource[];
}

type Resolvable = Pick<ENSConfigurationVersion, 'controls' | 'agents' | 'templates'>;

export interface ENSHostResolutionInput {
  configuration: Resolvable;
  agentId: string;
  matched: ENSProfile[];
  inventoryType?: ENSSystemType;
}

const hasOwn = (record: object | undefined, key: string): boolean => !!record && Object.prototype.hasOwnProperty.call(record, key);

const isListLike = (type: string): boolean => type === 'list' || type === 'table';

const listItems = (value: unknown): string[] | undefined => {
  let raw: string[];
  if (Array.isArray(value)) {
    if (value.some(item => typeof item !== 'string')) return undefined;
    raw = value as string[];
  } else if (typeof value === 'string') {
    raw = value.split('\n');
  } else {
    return undefined;
  }
  const items = raw.map(item => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
};

const regexMode = (mode: unknown): { matchMode?: ENSMatchMode } => (mode === 'regex' ? { matchMode: 'regex' } : {});

// Mirrors fromProfiles in the engine: lists add up from the most specific layer
// down until a profile replaces them; any other value comes from the most specific profile.
const fromProfiles = (matched: ENSProfile[], controlId: string, parameterId: string, type: string) => {
  const union: string[] = [];
  const seen = new Set<string>();
  const sources: ENSValueSource[] = [];

  for (const profile of matched) {
    if (!hasOwn(profile.values?.[controlId], parameterId)) continue;
    const value = profile.values[controlId][parameterId];
    const mode = profile.match_modes?.[controlId]?.[parameterId];
    const source: ENSValueSource = { kind: 'profile', id: profile.id, name: profile.name };

    if (!isListLike(type) || mode === 'regex') {
      if (sources.length === 0) return { value, ...regexMode(mode), sources: [source] };
      continue;
    }

    const items = listItems(value);
    if (!items) continue;
    items.forEach(item => {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        union.push(item);
      }
    });
    sources.push(source);
    if ((profile.replace?.[controlId] || []).includes(parameterId)) break;
  }

  return sources.length ? { value: union, sources } : undefined;
};

const systemTypeOf = (configuration: Resolvable, agentId: string, inventoryType?: ENSSystemType): ENSSystemType | undefined => {
  const stored = configuration.agents?.[agentId];
  if (stored?.typeOverride === ENS_NO_TEMPLATE) return undefined;
  return knownSystemType(stored?.typeOverride) || inventoryType || knownSystemType(stored?.detectedType);
};

const resolveAgentLevel = (
  model: Resolvable,
  input: ENSHostResolutionInput,
  agentId: string,
  controlId: string,
  parameterId: string,
  type: string
): Omit<ENSResolvedParameter, 'controlId' | 'parameterId' | 'label' | 'type'> | undefined => {
  const stored = model.agents?.[agentId];
  const entry = stored?.controls?.[controlId];

  if (stored && hasOwn(entry?.parameters, parameterId)) {
    return { value: entry!.parameters![parameterId], ...regexMode(entry?.matchModes?.[parameterId]), sources: [{ kind: 'agent', id: agentId }] };
  }

  const assignedId = entry?.templateId;
  const assigned = assignedId && assignedId !== ENS_NO_TEMPLATE ? findControlTemplate(model, controlId, assignedId) : undefined;
  if (assigned) {
    if (hasOwn(assigned.values, parameterId)) {
      return {
        value: assigned.values[parameterId],
        ...regexMode(assigned.matchModes?.[parameterId]),
        sources: [{ kind: 'template', id: assigned.id, name: assigned.name }],
      };
    }
  }

  if (assignedId === ENS_NO_TEMPLATE) return undefined;

  const profiled = fromProfiles(input.matched, controlId, parameterId, type);
  if (profiled) return profiled;

  // As in the engine, an assigned template hides the type default even where it has no value.
  if (assigned) return undefined;

  const byType = getTypeDefaultTemplate(controlId, systemTypeOf(model, agentId, input.inventoryType));
  if (byType && hasOwn(byType.values, parameterId)) {
    return {
      value: byType.values[parameterId],
      ...regexMode(byType.matchModes?.[parameterId]),
      sources: [{ kind: 'type-template', id: byType.id, name: byType.name }],
    };
  }
  return undefined;
};

export const resolveHostParameters = (input: ENSHostResolutionInput): ENSResolvedParameter[] => {
  const model = input.configuration;
  const agentId = normalizeAgentId(input.agentId);
  const out: ENSResolvedParameter[] = [];

  for (const entry of ENGINE_CATALOG) {
    const controlId: string = entry.control;
    for (const [parameterId, parameter] of Object.entries<any>(entry.parameters)) {
      if (!isAgentLevelParameter(controlId, parameterId)) continue;
      const base = { controlId, parameterId, label: parameter.label || parameter.name || parameterId, type: parameter.type };
      const resolved = resolveAgentLevel(model, input, agentId, controlId, parameterId, parameter.type);
      if (resolved) {
        out.push({ ...base, ...resolved });
        continue;
      }
      const common = model.controls?.find(control => control.controlId === controlId)?.parameters.find(p => p.id === parameterId);
      out.push(
        common && common.value !== undefined
          ? { ...base, value: common.value as ENSAgentParameterValue, ...regexMode(common.matchMode), sources: [{ kind: 'organisation' }] }
          : { ...base, sources: [] }
      );
    }
  }
  return out;
};

export const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === 'string' && !value.trim()) ||
  (Array.isArray(value) && value.every(item => typeof item === 'string' && !item.trim()));
