import type { ENSListedProfile } from './builtin';
import { profileChanges, toProfileShape } from './diff';
import type { ENSProfile, ENSProfileVersion } from './types';
import { validateProfile } from './validate';

export type ENSImportStatus = 'new' | 'changed' | 'same' | 'invalid';

export interface ENSImportItem {
  id: string;
  name: string;
  layer: string;
  status: ENSImportStatus;
  changes: string[];
  errors: string[];
  replacesBuiltin: boolean;
  profile: ENSProfile;
  expectedVersion: ENSProfileVersion | null;
}

export const planProfileImport = (raw: unknown[], listed: ENSListedProfile[]): ENSImportItem[] => {
  const shapes = raw.map(toProfileShape);
  const seen = new Map<string, number>();
  shapes.forEach(({ profile }) => seen.set(profile.id, (seen.get(profile.id) || 0) + 1));

  return shapes.map(({ profile, errors: shapeErrors }) => {
    const errors = [...shapeErrors, ...validateProfile(profile)];
    if (profile.id && (seen.get(profile.id) || 0) > 1) errors.push('aparece más de una vez en el fichero');

    const stored = listed.find(entry => entry.profile.id === profile.id && entry.origin !== 'builtin');
    const builtin = listed.find(entry => entry.profile.id === profile.id && entry.origin === 'builtin');
    const current = stored && stored.errors.length === 0 ? stored : builtin || stored;
    const changes = current ? profileChanges(current.profile, profile) : [];

    let status: ENSImportStatus;
    if (errors.length) status = 'invalid';
    else if (!current) status = 'new';
    else if (changes.length === 0 && (stored || current.origin === 'builtin')) status = 'same';
    else status = stored ? 'changed' : 'new';

    return {
      id: profile.id,
      name: profile.name,
      layer: profile.layer,
      status,
      changes: status === 'changed' || (status === 'new' && builtin && !stored) ? changes : [],
      errors,
      replacesBuiltin: Boolean(builtin) && !stored,
      profile,
      expectedVersion: stored?.version ?? null,
    };
  });
};
