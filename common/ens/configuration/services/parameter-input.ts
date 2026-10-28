import type { ENSControlParameter } from '../types';
import { engineCatalogEntry } from '../../catalog/engine-catalog';

// Patterns only where the engine compares whole values with a flat list; its catalog declares them (`pattern`).
export const supportsParameterPattern = (parameter: Pick<ENSControlParameter, 'controlId' | 'id' | 'type' | 'columns'>): boolean =>
  ['list', 'string'].includes(parameter.type) &&
  !parameter.columns?.length &&
  engineCatalogEntry(parameter.controlId)?.parameters[parameter.id]?.pattern === true;

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
