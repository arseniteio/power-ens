import { ENSControlDefinition } from '../catalog/types';
import {
  ENSGlobalConfiguration,
  ENSLevel,
} from '../configuration/types';

// Nivel con el que se evalúa UN control.
//
// Todos los controles se evalúan con el nivel ENS global salvo los que declaran
// en su catálogo que se rigen por el nivel de una dimensión (`levelDimension`).
// Para esos, manda el nivel de esa dimensión en la configuración global si está
// declarado; si no lo está, el global, exactamente como antes de existir.
//
// Es la única bifurcación: un control sin `levelDimension`, o una configuración
// sin el nivel de la dimensión, devuelven `level` tal cual.
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
