// CLASIFICACIÓN DE LOS PARÁMETROS: fuente ÚNICA y declarativa.
//
// Cada parámetro de cada control es de una de tres clases:
//
//   organisation  política que vale para todas las máquinas (periodicidades,
//                 umbrales, roles, registros, procedimientos, documentos, nube,
//                 plan de continuidad). Se edita en «Organización» y ningún
//                 agente ni plantilla la cambia.
//   system        describe el estado concreto de UNA máquina (sus cuentas,
//                 servicios, rutas, ACL, claves, criticidad, responsable). Se
//                 edita dentro de cada agente.
//   platform      depende del sistema operativo o del producto (Linux, LDAP
//                 Zimbra, Windows, PBS…) y es igual en todas las máquinas de esa
//                 plataforma. Es lo que fijan las plantillas.
//
// La usan la pantalla (qué va en cada nivel), el resolutor (qué puede venir de
// un agente o de una plantilla), el validador (un valor de agente sobre un
// parámetro de organización es un error) y `config/set-parameters.py`, que lee
// el objeto de abajo tal cual: por eso es JSON válido entre las llaves, sin
// comas finales ni comentarios. `tests/agent-configuration-model.test.ts`
// comprueba que están los 239 parámetros de los 23 bloques, ni uno más.
//
// Origen: el análisis del modelo de configuración de la 1.2.0 (tabla por
// parámetro con el motivo de cada clase).

export type ENSParameterClass = 'organisation' | 'system' | 'platform';

export const ENS_PARAMETER_CLASSES: Record<string, Record<string, ENSParameterClass>> =
{
  "mp.info.6": {"P-01": "system", "P-02": "organisation", "P-03": "organisation", "P-04": "system", "P-05": "organisation", "P-06": "system", "P-07": "platform", "P-08": "system", "P-09": "system", "P-10": "platform", "P-11": "platform", "P-12": "platform", "P-13": "platform", "P-14": "organisation", "P-ATT": "organisation"},
  "op.acc.1": {"P-01": "platform", "P-02": "system", "P-03": "platform", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "system", "P-08": "organisation", "P-09": "organisation", "P-10": "platform", "P-11": "platform", "P-12": "organisation", "P-ATT": "organisation"},
  "op.acc.2": {"P-01": "system", "P-02": "platform", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "system", "P-07": "organisation", "P-08": "system", "P-09": "system", "P-10": "platform", "P-11": "platform", "P-12": "platform"},
  "op.acc.3": {"P-01": "organisation", "P-02": "organisation", "P-03": "platform", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-ATT": "organisation"},
  "op.acc.4": {"P-01": "system", "P-02": "organisation", "P-03": "organisation", "P-04": "platform", "P-05": "system", "P-06": "platform", "P-07": "system"},
  "op.acc.5": {"P-01": "organisation", "P-02": "system", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-ATT": "organisation", "P-DA": "organisation"},
  "op.acc.6": {"P-01": "organisation", "P-02": "organisation", "P-03": "platform", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "platform", "P-08": "platform", "P-09": "organisation", "P-10": "organisation", "P-11": "platform", "P-ATT": "organisation"},
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
  "op.nub.1": {"P-01": "organisation", "P-02": "organisation", "P-03": "organisation", "P-04": "organisation", "P-05": "organisation", "P-06": "organisation", "P-07": "organisation", "P-08": "organisation", "P-09": "organisation", "P-10": "organisation", "P-11": "organisation", "P-12": "organisation", "P-13": "organisation"}
};

// La columna que NOMBRA LA MÁQUINA en las tablas «por sistema». La migración
// a sistemas reparte por ella las filas que hoy viven en la organización; una
// tabla por sistema que no está aquí (rutas, ACL, matrices de privilegios) no
// tiene una columna que diga de qué máquina es cada fila y no se reparte.
// Las listas de alcance (mp.info.6 P-04, op.acc.1 P-02, op.acc.2 P-01) tampoco:
// el motor las lee enteras para decidir en qué máquinas se mide el control.
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

// ¿Puede tener valor propio en un agente o venir de una plantilla?
export const isAgentLevelParameter = (controlId: string, parameterId: string): boolean => {
  const parameterClass = getParameterClass(controlId, parameterId);
  return parameterClass === 'system' || parameterClass === 'platform';
};

export const getSystemKeyColumn = (controlId: string, parameterId: string): string | undefined =>
  ENS_SYSTEM_KEY_COLUMNS[controlId]?.[parameterId];
