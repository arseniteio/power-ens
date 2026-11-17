import type { ENSAgentParameterValue } from '../../agent-configuration';
import { listOf } from './match';
import type { ENSProfile } from './types';

// A group of machines chosen by hand is a profile whose only condition lists host names.
export const isHandPicked = (profile: Pick<ENSProfile, 'match'>): boolean =>
  profile.match.length === 1 && profile.match[0].field === 'hostname' && profile.match[0].op === 'in';

export const handPickedHosts = (profile: Pick<ENSProfile, 'match'>): string[] => (isHandPicked(profile) ? listOf(profile.match[0].value) : []);

export const withHosts = (profile: ENSProfile, hostnames: string[]): ENSProfile => {
  const hosts = Array.from(new Set([...handPickedHosts(profile), ...hostnames.map(host => host.trim()).filter(Boolean)]));
  return { ...profile, match: [{ field: 'hostname', op: 'in', value: hosts.join(', ') }] };
};

export const withoutHosts = (profile: ENSProfile, hostnames: string[]): ENSProfile => {
  const drop = new Set(hostnames.map(host => host.trim().toLowerCase()));
  const hosts = handPickedHosts(profile).filter(host => !drop.has(host.toLowerCase()));
  return { ...profile, match: [{ field: 'hostname', op: 'in', value: hosts.join(', ') }] };
};

export const newHandPickedGroup = (id: string, name: string, hostnames: string[]): ENSProfile =>
  withHosts({ id, name, layer: 'site', match: [], values: {} }, hostnames);

// Loading a template copies its values into the group; a value the template also sets is replaced.
export const loadTemplate = (group: ENSProfile, template: Pick<ENSProfile, 'values' | 'match_modes'>): ENSProfile => {
  const values: ENSProfile['values'] = {};
  Object.entries(group.values || {}).forEach(([controlId, params]) => (values[controlId] = { ...params }));
  const modes: NonNullable<ENSProfile['match_modes']> = {};
  Object.entries(group.match_modes || {}).forEach(([controlId, params]) => (modes[controlId] = { ...params }));
  Object.entries(template.values || {}).forEach(([controlId, params]) =>
    Object.entries(params || {}).forEach(([parameterId, value]) => {
      (values[controlId] = values[controlId] || {})[parameterId] = value as ENSAgentParameterValue;
      const mode = template.match_modes?.[controlId]?.[parameterId];
      if (mode) (modes[controlId] = modes[controlId] || {})[parameterId] = mode;
      else if (modes[controlId]) delete modes[controlId][parameterId];
    })
  );
  Object.keys(modes).forEach(controlId => !Object.keys(modes[controlId]).length && delete modes[controlId]);
  const { match_modes: _dropped, ...rest } = group;
  return { ...rest, values, ...(Object.keys(modes).length ? { match_modes: modes } : {}) };
};

export const setGroupValue = (
  group: ENSProfile,
  controlId: string,
  parameterId: string,
  value: ENSAgentParameterValue | undefined
): ENSProfile => {
  const params = { ...(group.values?.[controlId] || {}) };
  if (value === undefined) delete params[parameterId];
  else params[parameterId] = value;
  const values = { ...(group.values || {}), [controlId]: params };
  if (!Object.keys(params).length) delete values[controlId];
  return { ...group, values };
};
