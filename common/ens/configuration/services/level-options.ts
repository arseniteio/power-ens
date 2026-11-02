import type { ENSConfigurationVersion, ENSLevel } from '../types';
import { getENSControlConfiguration } from '../registry';
import { getENSCatalogControl } from '../../catalog';
import { resolveControlLevel } from '../../core/control-level';

type LevelDocument = { global?: Partial<ENSConfigurationVersion['global']>; controls?: ENSConfigurationVersion['controls'] };

export const controlLevelIn = (document: LevelDocument, controlId: string): ENSLevel =>
  resolveControlLevel(getENSCatalogControl(controlId) || {}, (document.global?.ensLevel || 'BAJO') as ENSLevel, document.global);

const describeLevelOptionIssues = (document: LevelDocument): string[] =>
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

export const describeNewLevelOptionIssues = (next: LevelDocument, previous?: LevelDocument): string[] => {
  const before = new Set(previous ? describeLevelOptionIssues(previous) : []);
  return describeLevelOptionIssues(next).filter(issue => !before.has(issue));
};
