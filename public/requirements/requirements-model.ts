// Controls column and requirements column of the classic view, from the descriptions (ens-requirements.ts) and the counts.
import { ENSCatalog, compareENSControlIdsByAnnex } from '../../common/ens/catalog';
import {
  ENSProvenancedText,
  describeRequirementTexts,
  describeUncatalogedText,
} from '../../common/ens/catalog/support/provenance';

export interface ENSRequirementRow { id: string; control: string; description: string; count: number }
interface ENSControlRow { id: string; count: number }
interface ENSRequirementsModel { controls: ENSControlRow[]; requirements: ENSRequirementRow[] }

export const controlOf = (requirementId: string): string => requirementId.split('.').slice(0, 3).join('.');

export const buildRequirementsModel = (
  descriptions: Record<string, string>,
  counts: { key: string; doc_count: number }[],
  { search, hideEmpty, selected }: { search: string; hideEmpty: boolean; selected?: string }
): ENSRequirementsModel => {
  const countBuckets = new Map(counts.map(c => [c.key, c.doc_count]));
  const all = Object.keys(descriptions).map(id => ({
    id,
    control: controlOf(id),
    description: descriptions[id],
    count: countBuckets.get(id) || 0,
  }));

  // Only requirements count: a control-level count (old facts with `data.control: op.acc.1`) has no description and is not added.
  const byControl = new Map<string, number>();
  for (const r of all) byControl.set(r.control, (byControl.get(r.control) || 0) + r.count);
  const controls = [...byControl].map(([id, count]) => ({ id, count })).sort((a, b) => compareENSControlIdsByAnnex(a.id, b.id));

  const text = search.trim().toLowerCase();
  const requirements = all
    .filter(r => !selected || r.control === selected)
    .filter(r => !text || r.id.toLowerCase().includes(text) || r.description.toLowerCase().includes(text))
    .filter(r => !hideEmpty || r.count > 0)
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));

  return { controls, requirements };
};

// Texts of a requirement with their provenance: the catalog's BOE literal and its interpretation; outside the catalog the source is unknown, so the file's text after its title is criterion, never norm.
export const requirementTextsOf = (requirementId: string, description: string): ENSProvenancedText[] => {
  const requirement = ENSCatalog.flatMap(control => control.requirements).find(item => item.id === requirementId);
  const separator = description.indexOf(' - ');

  return requirement
    ? describeRequirementTexts(requirement)
    : [describeUncatalogedText(separator >= 0 ? description.slice(separator + 3) : description)];
};
