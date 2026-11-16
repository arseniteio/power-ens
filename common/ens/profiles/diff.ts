import type { ENSProfile } from './types';

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]))
      : item
  ) ?? 'undefined';

const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

const keysOf = (...records: Array<object | undefined>): string[] =>
  Array.from(new Set(records.flatMap(record => Object.keys(record || {})))).sort();

// Names the parts that changed, in the words the import screen shows.
export const profileChanges = (before: ENSProfile, after: ENSProfile): string[] => {
  const out: string[] = [];
  if ((before.name || '') !== (after.name || '')) out.push('nombre');
  if ((before.description || '') !== (after.description || '')) out.push('descripción');
  if (before.layer !== after.layer) out.push('capa');
  if (!same(before.match || [], after.match || [])) out.push('condiciones');

  for (const controlId of keysOf(before.values, after.values)) {
    for (const parameterId of keysOf(before.values?.[controlId], after.values?.[controlId])) {
      const had = Object.prototype.hasOwnProperty.call(before.values?.[controlId] || {}, parameterId);
      const has = Object.prototype.hasOwnProperty.call(after.values?.[controlId] || {}, parameterId);
      const name = `${controlId} ${parameterId}`;
      if (!had) out.push(`${name} añadido`);
      else if (!has) out.push(`${name} quitado`);
      else if (!same(before.values[controlId][parameterId], after.values[controlId][parameterId])) out.push(name);
    }
  }
  if (!same(before.match_modes || {}, after.match_modes || {})) out.push('modos de comparación');
  if (!same(before.replace || {}, after.replace || {})) out.push('sustituciones');
  return out;
};

const ALLOWED_PROFILE_KEYS = ['id', 'name', 'description', 'layer', 'match', 'values', 'match_modes', 'replace'];
const ALLOWED_CONDITION_KEYS = ['field', 'op', 'value'];

const isRecord = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);

export interface ENSProfileShape {
  profile: ENSProfile;
  errors: string[];
}

// Like the engine's strict decoder: unknown keys are errors, not silently dropped.
export const toProfileShape = (raw: unknown): ENSProfileShape => {
  if (!isRecord(raw)) return { profile: { id: '', name: '', layer: '', match: [], values: {} }, errors: ['no es un perfil: se esperaba un objeto con id, name, layer, match y values'] };

  const errors: string[] = [];
  Object.keys(raw)
    .filter(key => !ALLOWED_PROFILE_KEYS.includes(key) && key !== 'builtin')
    .forEach(key => errors.push(`la clave «${key}» no existe en un perfil`));

  const match = Array.isArray(raw.match) ? raw.match : [];
  if (raw.match !== undefined && !Array.isArray(raw.match)) errors.push('match debe ser una lista de condiciones');
  match.forEach((condition: unknown, index: number) => {
    if (!isRecord(condition)) {
      errors.push(`condición ${index + 1}: debe tener field, op y value`);
      return;
    }
    Object.keys(condition)
      .filter(key => !ALLOWED_CONDITION_KEYS.includes(key))
      .forEach(key => errors.push(`condición ${index + 1}: la clave «${key}» no existe`));
  });

  if (raw.values !== undefined && !isRecord(raw.values)) errors.push('values debe agrupar los valores por control');
  if (raw.match_modes !== undefined && !isRecord(raw.match_modes)) errors.push('match_modes debe agrupar los modos por control');
  if (raw.replace !== undefined && !isRecord(raw.replace)) errors.push('replace debe agrupar los parámetros por control');

  const text = (value: unknown): string => (value === undefined || value === null ? '' : String(value));
  const profile: ENSProfile = {
    id: text(raw.id),
    name: text(raw.name),
    ...(text(raw.description) ? { description: text(raw.description) } : {}),
    layer: text(raw.layer),
    match: match.filter(isRecord).map((condition: any) => ({ field: text(condition.field), op: text(condition.op), value: text(condition.value) })),
    values: isRecord(raw.values) ? (Object.fromEntries(Object.entries(raw.values).map(([id, params]) => [id, isRecord(params) ? params : {}])) as ENSProfile['values']) : {},
    ...(isRecord(raw.match_modes) && Object.keys(raw.match_modes).length ? { match_modes: raw.match_modes as ENSProfile['match_modes'] } : {}),
    ...(isRecord(raw.replace) && Object.keys(raw.replace).length ? { replace: raw.replace as ENSProfile['replace'] } : {}),
  };
  return { profile, errors };
};
