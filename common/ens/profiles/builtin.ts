import managerWazuh from '../catalog/profiles/manager-wazuh.json';
import ubuntu from '../catalog/profiles/ubuntu.json';
import windows from '../catalog/profiles/windows.json';
import type { ENSProfile, ENSProfileEntry } from './types';
import { validateProfile } from './validate';

export const ENS_BUILTIN_PROFILES: ENSProfile[] = [managerWazuh, ubuntu, windows] as ENSProfile[];

export const isBuiltinProfileId = (id: string): boolean => ENS_BUILTIN_PROFILES.some(profile => profile.id === id);

export interface ENSStoredProfile {
  profile: ENSProfile;
  version?: ENSProfileEntry['version'];
  updatedAt?: string;
  updatedBy?: string;
}

export interface ENSListedProfile extends ENSProfileEntry {
  errors: string[];
}

// Same rule as the engine: a stored profile replaces the built-in one with its id,
// and a stored profile that does not validate is left out.
export const listProfiles = (stored: ENSStoredProfile[]): ENSListedProfile[] => {
  const listedStored: ENSListedProfile[] = stored.map(entry => ({
    ...entry,
    origin: isBuiltinProfileId(entry.profile.id) ? 'override' : 'stored',
    errors: validateProfile(entry.profile),
  }));
  const replaced = new Set(listedStored.filter(entry => entry.errors.length === 0).map(entry => entry.profile.id));
  const builtins: ENSListedProfile[] = ENS_BUILTIN_PROFILES.filter(profile => !replaced.has(profile.id)).map(profile => ({
    profile,
    origin: 'builtin',
    errors: [],
  }));
  return [...builtins, ...listedStored];
};

export const effectiveProfiles = (listed: ENSListedProfile[]): ENSProfile[] =>
  listed.filter(entry => entry.errors.length === 0).map(entry => entry.profile);
