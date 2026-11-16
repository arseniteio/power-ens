import type { ENSHostFilters } from './profiles-client';

// Same value the server uses for "matches no profile".
export const NO_PROFILE_FILTER = '__none__';

const KEYS: Array<keyof ENSHostFilters> = ['distro', 'role', 'service', 'group', 'profile'];

export const parseMachineFilter = (text: string | undefined): ENSHostFilters => {
  if (!text) return {};
  const at = text.indexOf(':');
  const key = text.slice(0, at) as keyof ENSHostFilters;
  const value = text.slice(at + 1);
  return at > 0 && KEYS.includes(key) && value ? { [key]: value } : {};
};
