import { ENGINE_CATALOG, toParameterClasses } from '../../catalog/engine-catalog';

type ENSParameterClass = 'organisation' | 'system' | 'platform';

// The classes of every control come from the engine catalog.
export const ENS_PARAMETER_CLASSES: Record<string, Record<string, ENSParameterClass>> = Object.fromEntries(
  ENGINE_CATALOG.map(entry => [entry.control, toParameterClasses(entry) as Record<string, ENSParameterClass>])
);

// Column that NAMES THE MACHINE in per-system tables; the migration distributes rows by it. Per-system tables
// absent here (paths, ACL, privilege matrices) have no such column and are not distributed, nor are the scope
// lists (op.acc.1 P-02, op.acc.2 P-01), which the engine reads whole.
export const ENS_SYSTEM_KEY_COLUMNS: Record<string, Record<string, string>> = {
  'op.acc.1': { 'P-07': 'sistema' },
  'op.acc.5': { 'P-02': 'host' },
};

export const getParameterClass = (
  controlId: string,
  parameterId: string
): ENSParameterClass | undefined => ENS_PARAMETER_CLASSES[controlId]?.[parameterId];

// Can it have its own value on an agent or come from a template?
export const isAgentLevelParameter = (controlId: string, parameterId: string): boolean => {
  const parameterClass = getParameterClass(controlId, parameterId);
  return parameterClass === 'system' || parameterClass === 'platform';
};
