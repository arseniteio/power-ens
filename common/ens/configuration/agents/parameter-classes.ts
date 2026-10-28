// Classes of the controls the engine judges come from its catalog; the rest from the object below, which
// set-parameters.py parses as JSON, so it stays strict JSON. The mp.* controls without collector
// (catalog/support/measurement-plan.ts) are all 'organisation' while they are documentary: the wave that brings
// their collector decides which ones go per system or per platform, with their built-in templates.
import { ENGINE_CATALOG, toParameterClasses } from '../../catalog/engine-catalog';

type ENSParameterClass = 'organisation' | 'system' | 'platform';

const HAND_PARAMETER_CLASSES: Record<string, Record<string, ENSParameterClass>> =
{
  "mp.info.6": {"P-01": "system", "P-02": "organisation", "P-03": "organisation", "P-04": "system", "P-05": "organisation", "P-06": "system", "P-07": "platform", "P-08": "system", "P-09": "system", "P-10": "platform", "P-11": "platform", "P-12": "platform", "P-13": "platform", "P-14": "organisation", "P-ATT": "organisation"},
  "op.cont.2": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation"},
  "op.cont.3": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "system"},
  "op.exp.1": {"P-01": "system", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "system", "P-08": "organisation", "P-ATT": "organisation"},
  "op.exp.2": {"P-01": "platform", "P-02": "system", "P-03": "platform", "P-04": "system", "P-05": "organisation", "P-06": "system", "P-07": "organisation", "P-ATT": "organisation"},
  "op.exp.3": {"P-01": "platform", "P-02": "system", "P-03": "system", "P-04": "platform", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation", "P-ATT": "organisation"},
  "op.exp.4": {"P-01": "organisation", "P-02": "system", "P-03": "platform", "P-04": "system", "P-05": "platform", "P-06": "system", "P-07": "system", "P-08": "organisation", "P-09": "system", "P-ATT": "organisation"},
  "op.exp.5": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "system", "P-06": "organisation", "P-07": "organisation", "P-08": "system", "P-09": "organisation", "P-ATT": "organisation"},
  "op.exp.6": {"P-01": "platform", "P-02": "system", "P-03": "organisation", "P-04": "platform", "P-05": "organisation", "P-06": "organisation", "P-07": "platform", "P-08": "platform", "P-09": "organisation", "P-10": "organisation", "P-ATT": "organisation"},
  "op.exp.7": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "system", "P-05": "organisation", "P-06": "organisation", "P-07": "system", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation", "P-11": "organisation", "P-12": "organisation", "P-ATT": "organisation"},
  "op.exp.8": {"P-01": "platform", "P-02": "system", "P-03": "platform", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "platform", "P-09": "organisation", "P-10": "organisation", "P-11": "organisation", "P-12": "organisation", "P-ATT": "organisation"},
  "op.exp.9": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-ATT": "organisation"},
  "op.exp.10": {"P-01": "system", "P-02": "platform", "P-03": "organisation", "P-04": "system", "P-05": "system", "P-06": "organisation", "P-07": "organisation", "P-08": "platform", "P-09": "organisation", "P-10": "organisation", "P-ATT": "organisation"},
  "op.mon.1": {"P-01": "system", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation", "P-ATT": "organisation"},
  "op.mon.2": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation"},
  "op.mon.3": {"P-01": "system", "P-02": "organisation", "P-03": "system", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "system", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation", "P-11": "organisation", "P-ATT": "organisation"},
  "op.nub.1": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation", "P-11": "organisation", "P-12": "organisation", "P-13": "organisation"},
  "mp.eq.2": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation"},
  "mp.eq.3": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation"},
  "mp.eq.4": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-ATT": "organisation"},
  "mp.com.1": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation"},
  "mp.com.3": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-ATT": "organisation"},
  "mp.com.4": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation"},
  "mp.sw.2": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation"},
  "mp.s.1": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-ATT": "organisation"},
  "mp.s.2": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation"},
  "mp.s.3": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation", "P-11": "organisation"},
  "mp.s.4": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation"}
};

export const ENS_PARAMETER_CLASSES: Record<string, Record<string, ENSParameterClass>> = {
  ...Object.fromEntries(ENGINE_CATALOG.map(entry => [entry.control, toParameterClasses(entry) as Record<string, ENSParameterClass>])),
  ...HAND_PARAMETER_CLASSES,
};

// Column that NAMES THE MACHINE in per-system tables; the migration distributes rows by it. Per-system tables
// absent here (paths, ACL, privilege matrices) have no such column and are not distributed, nor are the scope
// lists (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01), which the engine reads whole.
export const ENS_SYSTEM_KEY_COLUMNS: Record<string, Record<string, string>> = {
  'op.acc.1': { 'P-07': 'sistema' },
  'op.acc.5': { 'P-02': 'host' },
  'op.cont.3': { 'P-07': 'sistema' },
  'op.exp.1': { 'P-01': 'activo', 'P-06': 'activo' },
  'op.exp.2': { 'P-02': 'perfil', 'P-04': 'activo', 'P-06': 'maquina' },
  'op.exp.3': { 'P-02': 'perfil' },
  'op.exp.4': { 'P-02': 'ambito', 'P-04': 'sistema', 'P-06': 'sistema_prod', 'P-07': 'sistema', 'P-09': 'dispositivo' },
  'op.exp.5': { 'P-05': 'sistema_prod', 'P-08': 'sistema' },
  'op.exp.6': { 'P-02': 'equipo' },
  'op.exp.7': { 'P-04': 'sistema', 'P-07': 'sistema' },
  'op.exp.8': { 'P-02': 'servidor' },
  'op.exp.10': { 'P-04': 'sistema', 'P-05': 'medio' },
  'op.mon.1': { 'P-01': 'sistema' },
  'op.mon.3': { 'P-01': 'sistema', 'P-03': 'activo', 'P-07': 'sistema' },
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
