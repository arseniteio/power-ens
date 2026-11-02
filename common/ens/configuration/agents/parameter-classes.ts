import { ENGINE_CATALOG, toParameterClasses } from '../../catalog/engine-catalog';

type ENSParameterClass = 'organisation' | 'system' | 'platform';

export const ENS_PARAMETER_CLASSES: Record<string, Record<string, ENSParameterClass>> = Object.fromEntries(
  ENGINE_CATALOG.map(entry => [entry.control, toParameterClasses(entry) as Record<string, ENSParameterClass>])
);

export const getParameterClass = (
  controlId: string,
  parameterId: string
): ENSParameterClass | undefined => ENS_PARAMETER_CLASSES[controlId]?.[parameterId];

export const isAgentLevelParameter = (controlId: string, parameterId: string): boolean => {
  const parameterClass = getParameterClass(controlId, parameterId);
  return parameterClass === 'system' || parameterClass === 'platform';
};
