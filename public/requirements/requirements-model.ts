// Columna de controles y columna de requisitos de la vista clásica, a partir
// de las descripciones (ens-requirements.ts) y de los recuentos.

export interface ENSRequirementRow { id: string; control: string; description: string; count: number }
export interface ENSControlRow { id: string; count: number }
export interface ENSRequirementsModel { controls: ENSControlRow[]; requirements: ENSRequirementRow[] }

export const controlOf = (requirementId: string): string => requirementId.split('.').slice(0, 3).join('.');

export const buildRequirementsModel = (
  descriptions: Record<string, string>,
  counts: { key: string; doc_count: number }[],
  { search, hideEmpty, selected }: { search: string; hideEmpty: boolean; selected?: string }
): ENSRequirementsModel => {
  const cuenta = new Map(counts.map(c => [c.key, c.doc_count]));
  const todos = Object.keys(descriptions).map(id => ({
    id,
    control: controlOf(id),
    description: descriptions[id],
    count: cuenta.get(id) || 0,
  }));

  // Solo cuentan los requisitos: un recuento a nivel de control (hechos
  // antiguos con `data.control: op.acc.1`) no tiene descripción y no se suma.
  const porControl = new Map<string, number>();
  for (const r of todos) porControl.set(r.control, (porControl.get(r.control) || 0) + r.count);
  const controls = [...porControl].map(([id, count]) => ({ id, count }));

  const texto = search.trim().toLowerCase();
  const requirements = todos
    .filter(r => !selected || r.control === selected)
    .filter(r => !texto || r.id.toLowerCase().includes(texto) || r.description.toLowerCase().includes(texto))
    .filter(r => !hideEmpty || r.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return { controls, requirements };
};
