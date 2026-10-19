import type { ENSControlParameter } from '../types';
import { ENSEvidenceCatalog } from '../../core/evidence/catalog';

const PATTERN_PRIMITIVES = ['NINGUNO_EN_LISTA', 'TODOS_EN_LISTA', 'NINGUNO_FUERA_DE_LISTA'];

// Patterns only where the engine compares whole values with a flat list; a table, a threshold or a document has another contract.
export const supportsParameterPattern = (parameter: Pick<ENSControlParameter, 'controlId' | 'id' | 'type' | 'columns'>): boolean =>
  ['list', 'string'].includes(parameter.type) &&
  !parameter.columns?.length &&
  ENSEvidenceCatalog.some(
    evidence =>
      evidence.controlId === parameter.controlId &&
      evidence.judgment?.parameterId === parameter.id &&
      !evidence.judgment.parameterColumn &&
      PATTERN_PRIMITIVES.includes(evidence.judgment.primitive)
  );

export const splitsParameterOnSpaces = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>): boolean =>
  (parameter.controlId === 'op.acc.1' && ['P-03', 'P-04'].includes(parameter.id)) ||
  (parameter.controlId === 'op.exp.2' && parameter.id === 'P-03');

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
