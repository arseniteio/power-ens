import { ENSControlDefinition, ENSLevelDimension } from '../catalog/types';
import {
  ENSGlobalConfiguration,
  ENSLevel,
} from '../configuration/types';

export type ENSDimensionLevelKey =
  | 'confidentialityLevel'
  | 'integrityLevel'
  | 'traceabilityLevel'
  | 'authenticityLevel'
  | 'availabilityLevel';

export const ENS_DIMENSIONS: ENSLevelDimension[] = ['C', 'I', 'T', 'A', 'D'];

// Key holding each dimension's level in the global configuration.
export const ENS_DIMENSION_LEVEL_KEYS: Record<ENSLevelDimension, ENSDimensionLevelKey> = {
  C: 'confidentialityLevel',
  I: 'integrityLevel',
  T: 'traceabilityLevel',
  A: 'authenticityLevel',
  D: 'availabilityLevel',
};

export const ENS_DIMENSION_NAMES: Record<ENSLevelDimension, string> = {
  C: 'Confidencialidad',
  I: 'Integridad',
  T: 'Trazabilidad',
  A: 'Autenticidad',
  D: 'Disponibilidad',
};

const LEVEL_RANK: Record<ENSLevel, number> = { BAJO: 1, MEDIO: 2, ALTO: 3 };

const isENSLevel = (value: unknown): value is ENSLevel =>
  typeof value === 'string' && value in LEVEL_RANK;

export const compareENSLevels = (a: ENSLevel, b: ENSLevel): number => LEVEL_RANK[a] - LEVEL_RANK[b];

// The dimensions a control declares, always as a list (the catalog accepts one or several).
export const listControlDimensions = (
  control: Pick<ENSControlDefinition, 'levelDimension'>
): ENSLevelDimension[] => {
  const declared = control.levelDimension;

  if (declared === undefined) {
    return [];
  }

  return Array.isArray(declared) ? declared : [declared];
};

// Level of one dimension: the declared one or, with the key absent, `level`.
export const resolveDimensionLevel = (
  dimension: ENSLevelDimension,
  level: ENSLevel,
  global?: Partial<ENSGlobalConfiguration>
): ENSLevel => {
  const declared = global?.[ENS_DIMENSION_LEVEL_KEYS[dimension]];

  return isENSLevel(declared) ? declared : level;
};

// Level with which ONE control is evaluated: the global level, unless the catalog says the control follows the level of one or more dimensions (`levelDimension`); then the highest of those dimensions' levels.
// With no dimension declared in the global configuration every dimension is `level`, so nothing changes.
export const resolveControlLevel = (
  control: Pick<ENSControlDefinition, 'levelDimension'>,
  level: ENSLevel,
  global?: Partial<ENSGlobalConfiguration>
): ENSLevel =>
  listControlDimensions(control)
    .map(dimension => resolveDimensionLevel(dimension, level, global))
    .reduce<ENSLevel | undefined>(
      (highest, current) => (highest === undefined || compareENSLevels(current, highest) > 0 ? current : highest),
      undefined
    ) || level;

// Dimensions whose declared level is above the ENS level. The category is the highest dimension level (Annex I), so this list must be empty.
export const findDimensionsAboveENSLevel = (
  global?: Partial<ENSGlobalConfiguration>
): ENSLevelDimension[] => {
  if (!global || !isENSLevel(global.ensLevel)) {
    return [];
  }

  const ensLevel = global.ensLevel;

  return ENS_DIMENSIONS.filter(dimension => {
    const declared = global[ENS_DIMENSION_LEVEL_KEYS[dimension]];

    return isENSLevel(declared) && compareENSLevels(declared, ensLevel) > 0;
  });
};

// Screen message for `findDimensionsAboveENSLevel`; `undefined` when the levels are coherent.
export const describeDimensionsAboveENSLevel = (
  global?: Partial<ENSGlobalConfiguration>
): string | undefined => {
  const above = findDimensionsAboveENSLevel(global);

  if (!above.length || !global) {
    return undefined;
  }

  const list = above
    .map(dimension => `${ENS_DIMENSION_NAMES[dimension]} (${dimension}) ${global[ENS_DIMENSION_LEVEL_KEYS[dimension]]}`)
    .join(', ');

  return `El nivel ENS (${global.ensLevel}) es la categoría del sistema y no puede ser inferior al de ninguna dimensión: ${list}. Subir el nivel ENS o bajar el de la dimensión.`;
};

// How the control is applied, for the detail header and the report: by category or by the level of its dimensions.
export const describeControlAxis = (
  control: Pick<ENSControlDefinition, 'levelDimension'>
): string => {
  const dimensions = listControlDimensions(control);

  if (!dimensions.length) {
    return 'Se aplica por la categoría del sistema';
  }

  return dimensions.length === 1
    ? `Se aplica por el nivel de ${ENS_DIMENSION_NAMES[dimensions[0]]} (${dimensions[0]})`
    : `Se aplica por el nivel más alto de ${dimensions.join('·')}`;
};
