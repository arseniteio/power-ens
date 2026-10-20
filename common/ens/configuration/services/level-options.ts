// Selects whose options depend on the level (`optionsByLevel`: a reinforcement the index offers only at some
// levels). A stored value the control's level does not admit is refused when saving, on the screen and on the
// server: by a change of the value or by a change of the level.
import type { ENSConfigurationVersion, ENSLevel } from '../types';
import { getENSControlConfiguration } from '../registry';
import { getENSCatalogControl } from '../../catalog';
import { resolveControlLevel } from '../../core/control-level';

type LevelDocument = { global?: Partial<ENSConfigurationVersion['global']>; controls?: ENSConfigurationVersion['controls'] };

// The level a control is evaluated at in this document: its dimension's or the ENS level.
export const controlLevelIn = (document: LevelDocument, controlId: string): ENSLevel =>
  resolveControlLevel(getENSCatalogControl(controlId) || {}, (document.global?.ensLevel || 'BAJO') as ENSLevel, document.global);

export const describeLevelOptionIssues = (document: LevelDocument): string[] =>
  (document.controls || []).flatMap(control =>
    (control.parameters || []).flatMap(parameter => {
      const declared = getENSControlConfiguration(control.controlId)?.parameters.find(item => item.id === parameter.id);
      const byLevel = declared?.optionsByLevel || parameter.optionsByLevel;
      const value = typeof parameter.value === 'string' ? parameter.value.trim() : '';
      if (!byLevel || !value) return [];
      const level = controlLevelIn(document, control.controlId);
      const admitted = byLevel[level];
      if (!admitted || admitted.some(option => option.trim().toLowerCase() === value.toLowerCase())) return [];
      return [`${control.controlId} ${parameter.id}: «${value}» no se admite en nivel ${level} (admite: ${admitted.join(', ')})`];
    })
  );

// The issues a save would introduce: those of the new document that the previous one did not have. A value left
// over from before does not block saving something else; changing a value or the level into one is refused.
export const describeNewLevelOptionIssues = (next: LevelDocument, previous?: LevelDocument): string[] => {
  const before = new Set(previous ? describeLevelOptionIssues(previous) : []);
  return describeLevelOptionIssues(next).filter(issue => !before.has(issue));
};
