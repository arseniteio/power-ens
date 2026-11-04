import type { ENSControlParameter } from '../types';
import { engineCatalogEntry } from '../../catalog/engine-catalog';

export const supportsParameterPattern = (parameter: Pick<ENSControlParameter, 'controlId' | 'id' | 'type' | 'columns'>): boolean =>
  ['list', 'string'].includes(parameter.type) &&
  !parameter.columns?.length &&
  engineCatalogEntry(parameter.controlId)?.parameters[parameter.id]?.pattern === true;

export const splitsParameterOnSpaces = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>): boolean =>
  parameter.controlId === 'op.acc.1' && ['P-03', 'P-04'].includes(parameter.id);

const separatorClass = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>): string =>
  splitsParameterOnSpaces(parameter) ? '[\\s,;]' : '[\\n,;]';

export const hasParameterSeparator = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>, input: string): boolean =>
  new RegExp(separatorClass(parameter)).test(input);

export const parseParameterInput = (parameter: Pick<ENSControlParameter, 'controlId' | 'id'>, input: string): string[] =>
  Array.from(
    new Set(
      input
        .split(new RegExp(`${separatorClass(parameter)}+`))
        .map(item => item.trim())
        .filter(Boolean)
    )
  );
