import type { ENSControlParameter } from '../types';
import { ENSEvidenceCatalog } from '../../core/evidence/catalog';

const PATTERN_PRIMITIVES = ['NINGUNO_EN_LISTA', 'TODOS_EN_LISTA', 'NINGUNO_FUERA_DE_LISTA'];

const flatListJudgments = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>) =>
  ENSEvidenceCatalog.filter(
    evidence =>
      evidence.controlId === parameter.controlId &&
      evidence.judgment?.parameterId === parameter.id &&
      !evidence.judgment.parameterColumn &&
      PATTERN_PRIMITIVES.includes(evidence.judgment.primitive)
  );

// Patterns only where the engine compares whole values with a flat list; a table, a threshold or a document has another contract.
export const supportsParameterPattern = (parameter: Pick<ENSControlParameter, 'controlId' | 'id' | 'type' | 'columns'>): boolean =>
  ['list', 'string'].includes(parameter.type) && !parameter.columns?.length && flatListJudgments(parameter).length > 0;

// «Texto exacto» on a forbidden list ignores case (judgment.ts, normalizeForComparison); its regex proposal must too.
export const ignoresCaseInExactMode = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>): boolean => {
  const judgments = flatListJudgments(parameter);
  return judgments.length > 0 && judgments.every(evidence => evidence.judgment!.primitive === 'NINGUNO_EN_LISTA');
};

export const splitsParameterOnSpaces = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>): boolean =>
  parameter.controlId === 'op.acc.1' && ['P-03', 'P-04'].includes(parameter.id);

// Splits only new input: stored arrays are never re-split, an existing name may contain a comma.
export const parseParameterInput = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>, input: string): string[] =>
  Array.from(
    new Set(
      input
        .split(splitsParameterOnSpaces(parameter) ? /[\s,;]+/ : /[\n,;]+/)
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
