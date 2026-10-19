import { RE2JS } from 're2js';
import type { ENSMatchMode } from '../../../agent-configuration';

export const MAX_PARAMETER_PATTERN_LENGTH = 512;
const MAX_PATTERN_PROGRAM_SIZE = 10000;

// The same engine validates, previews and evaluates; RE2 has no backtracking, so a configured pattern cannot hang the evaluation.
export const compileParameterPattern = (value: unknown): RE2JS => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Escribe una expresión regular.');
  }
  if (value.length > MAX_PARAMETER_PATTERN_LENGTH) {
    throw new Error(`La expresión regular admite hasta ${MAX_PARAMETER_PATTERN_LENGTH} caracteres.`);
  }
  const compiled = RE2JS.compile(value);
  if (compiled.programSize() > MAX_PATTERN_PROGRAM_SIZE) {
    throw new Error('La expresión regular es demasiado compleja.');
  }
  return compiled;
};

// The mode belongs to the level the value comes from: absent means exact, so a value never inherits another level's mode.
export const withMatchMode = <T extends { matchMode?: ENSMatchMode }>(parameter: T, matchMode: ENSMatchMode | undefined): T => {
  const next = { ...parameter };
  if (matchMode === 'regex') next.matchMode = 'regex';
  else delete next.matchMode;
  return next;
};

// Exact names in a full-match pattern, metacharacters escaped; the user can generalise it afterwards.
export const patternFromItems = (items: string[]): string =>
  items.length ? `^(?:${items.map(item => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$` : '';
