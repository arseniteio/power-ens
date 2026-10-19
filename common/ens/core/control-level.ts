import { ENSControlDefinition } from '../catalog/types';
import {
  ENSGlobalConfiguration,
  ENSLevel,
} from '../configuration/types';

// Level with which ONE control is evaluated. All use the global ENS level except those declaring in their catalog that they follow a dimension's level (`levelDimension`); for those, the dimension's level in the global configuration rules if declared, else the global one.
export const resolveControlLevel = (
  control: Pick<ENSControlDefinition, 'levelDimension'>,
  level: ENSLevel,
  global?: Partial<ENSGlobalConfiguration>
): ENSLevel => {
  if (control.levelDimension === 'T' && global?.traceabilityLevel) {
    return global.traceabilityLevel;
  }

  if (control.levelDimension === 'D' && global?.availabilityLevel) {
    return global.availabilityLevel;
  }

  return level;
};
