import { parseAllDocuments, stringify } from 'yaml';
import type { ENSProfile } from '../../../common/ens/profiles/types';

export class ENSProfileFileError extends Error {}

// Accepts what oscompliance-policy reads (one YAML document per profile) and also
// JSON, a list of profiles in one document, or an object with a "profiles" list.
export const parseProfileFile = (text: string): unknown[] => {
  const documents = parseAllDocuments(text, { uniqueKeys: true });
  const list = Array.isArray(documents) ? documents : [documents];
  const out: unknown[] = [];
  list.forEach((document, index) => {
    if (document.errors.length) {
      throw new ENSProfileFileError(`documento ${index + 1}: ${document.errors[0].message.split('\n')[0]}`);
    }
    const value = document.toJS();
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) out.push(...value);
    else if (value && typeof value === 'object' && Array.isArray((value as any).profiles) && !('id' in value)) out.push(...(value as any).profiles);
    else out.push(value);
  });
  if (!out.length) throw new ENSProfileFileError('el fichero no contiene ningún perfil');
  return out;
};

const sortedRecord = <T>(record: Record<string, T> | undefined, map: (value: T) => unknown = value => value) =>
  Object.fromEntries(
    Object.keys(record || {})
      .sort()
      .map(key => [key, map(record![key])])
  );

const ordered = (profile: ENSProfile) => ({
  id: profile.id,
  name: profile.name,
  ...(profile.description ? { description: profile.description } : {}),
  layer: profile.layer,
  match: (profile.match || []).map(({ field, op, value }) => ({ field, op, value })),
  values: sortedRecord(profile.values, params => sortedRecord(params)),
  ...(profile.match_modes && Object.keys(profile.match_modes).length ? { match_modes: sortedRecord(profile.match_modes, modes => sortedRecord(modes)) } : {}),
  ...(profile.replace && Object.keys(profile.replace).length ? { replace: sortedRecord(profile.replace) } : {}),
});

// Same layout as oscompliance-policy export: one document per profile, fields in the engine's order.
export const profilesToYaml = (profiles: ENSProfile[]): string =>
  profiles.map(profile => stringify(ordered(profile), { indent: 2, lineWidth: 0 })).join('---\n');
