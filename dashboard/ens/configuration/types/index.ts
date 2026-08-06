export type ENSLevel = 'BAJO' | 'MEDIO' | 'ALTO';

export type ENSParameterType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'list'
  | 'path'
  | 'url'
  | 'duration_hours'
  | 'duration_days'
  // Política que no cabe en un escalar ni en una lista de valores sueltos: una
  // rejilla de filas con columnas declaradas. Es lo que hoy vive en los ficheros
  // que el operador escribe a mano en la máquina (`opacc2-acl.tsv`,
  // `opacc2-privilegios.tsv`, `opacc2-accesos.tsv`, el fichero de autorizados de
  // op.acc.1). Ver `columns` y `ENSParameterColumn` más abajo.
  | 'table';

// Tipos de celda. Son un vocabulario CORTO a propósito: cada uno tiene que
// significar lo mismo en todas las tablas del producto, o la validación por
// columna se convierte en una colección de casos particulares que el siguiente
// control no puede reutilizar. Si una tabla necesita una comprobación que solo
// vale para ella, va como refinamiento por nombre de parámetro
// (`PARAMETER_REFINEMENTS`), no como tipo de columna nuevo.
export type ENSParameterColumnType =
  // Texto libre en una celda: 'root:ops', 'sudo:total', 'u:auditor:r-x'.
  | 'string'
  // Nombre de cuenta, perfil o grupo. Sin espacios, sin comas y sin `|`: se
  // compara literalmente contra lo que hay en la máquina, y un espacio de más
  // convierte una autorización válida en una cuenta que no existe.
  | 'identifier'
  // Ruta absoluta. Mismo criterio que el tipo `path` de un parámetro.
  | 'path'
  // Modo de fichero en octal, tres o cuatro dígitos ('750', '2770').
  | 'octal'
  // Número entero o decimal, con el rango que declare el parámetro.
  | 'number'
  // Fecha AAAA-MM-DD, y que exista de verdad (un 2026-02-31 no es una fecha).
  | 'date'
  // Una de las opciones declaradas en la columna.
  | 'select'
  // Varias de las opciones declaradas, separadas por comas dentro de la celda.
  | 'multiselect';

/**
 * Una columna de un parámetro `table` (o la forma del elemento de un `list`).
 *
 * `name` es el identificador estable de la columna, el que usará quien exporte
 * esta política a la máquina; `label` es lo que ve el auditor. Se separan por lo
 * mismo que `name`/`label` en el parámetro: renombrar la cabecera de una columna
 * no puede cambiar el contrato con el agente.
 */
export interface ENSParameterColumn {
  name: string;
  label: string;
  type: ENSParameterColumnType;
  // Una columna obligatoria vacía deja la fila INCOMPLETA, y una tabla con
  // filas incompletas no es una tabla válida. Una fila del todo en blanco no
  // cuenta: eso es una fila recién añadida, no una fila mal rellena.
  required: boolean;
  // Obligatorias para `select` y `multiselect`; ignoradas en el resto.
  options?: string[];
  // Solo tiene sentido en la ÚLTIMA columna: la fila puede traer más celdas de
  // las declaradas y todas pertenecen a esta. No todo parámetro tabular tiene
  // aridad fija — P-03 de op.acc.3 es `función | indicador | indicador | …` y su
  // evaluador la lee literalmente así (`const [fn, ...indicators] = cells`).
  // Sin esto habría que dejar el parámetro sin columnas, y eso es peor: sin
  // columnas el motor no puede repartir las celdas.
  variadic?: boolean;
}

export type ENSParameterStatus =
  | 'CONFIGURED'
  | 'NOT_CONFIGURED'
  | 'NOT_APPLICABLE'
  | 'INVALID';

export type ENSConfigurationScopeMode = 'global' | 'agent' | 'group';

export interface ENSConfigurationScope {
  mode: ENSConfigurationScopeMode;
  agentIds: string[];
  groupIds: string[];
}

export interface ENSGlobalConfiguration {
  clientName: string;
  organization: string;
  ensLevel: ENSLevel;
  ensVersion: string;
  scope: string;
  evaluationPeriod: string;
  timezone: string;
  reportLanguage: 'es' | 'en';
  activePolicy: string;
}

export interface ENSControlParameter {
  id: string;
  controlId: string;
  name: string;
  label: string;
  description: string;
  levels: ENSLevel[];
  requirements: string[];
  type: ENSParameterType;
  example?: string;
  // Opciones admitidas para `type: 'select'`. Declararlas hace dos cosas a la
  // vez, y las dos tienen que ir juntas: el formulario pinta un desplegable
  // (`SelectParameterRenderer`) y la validación exige que el valor sea una de
  // ellas (`parameter-value-validator.ts`).
  //
  // Sigue siendo opcional porque en `wazuh-ens-configuration` puede haber un
  // bloque sembrado antes de que existieran: sin `options`, ese select se edita
  // como texto libre y su validación se queda en "no está vacío", igual que
  // antes. Se cierra volviendo a sembrar el bloque con `inject-control.py`, que
  // conserva los valores ya configurados.
  options?: string[];
  // Forma del ELEMENTO del parámetro. Declararla hace las mismas dos cosas que
  // `options` en un `select`, y también van juntas: el formulario pinta una
  // rejilla editable (`TableParameterRenderer`) y la validación exige que cada
  // celda signifique algo para su columna (`parameter-value-validator.ts`).
  //
  //   - `type: 'table'` -> una columna por campo de la fila.
  //   - `type: 'list'`  -> UNA sola columna, que describe cada elemento suelto
  //     (la línea base de SUID es una lista de RUTAS, no de nombres de binario:
  //     un 'sudo' sin ruta no casa con nada y saca ~25 SUID legítimos de un
  //     Ubuntu limpio como no autorizados). Si se declara más de una columna en
  //     un `list`, solo se aplica la primera: lo que tiene campos es una tabla.
  //
  // Sigue siendo opcional porque en `wazuh-ens-configuration` puede haber un
  // bloque sembrado antes de que existieran. Sin `columns`, un `table` se edita
  // y se valida como una lista corriente —tolerancia deliberada, la misma que
  // con un `select` sin `options`—: nunca se ofrece un campo que acepte lo que
  // el motor rechaza, ni se rechaza lo que el campo deja escribir.
  columns?: ENSParameterColumn[];
  required: boolean;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string | number | boolean | string[];
  value?: string | number | boolean | string[];
  wazuhUsage: string;
  ensfacilUsage: string;
  evidenceIds: string[];
  ruleIds: string[];
  ifNotConfigured: string;
  status?: ENSParameterStatus;
}

export interface ENSControlConfiguration {
  controlId: string;
  controlName: string;
  family: string;
  enabled: boolean;
  applicableLevels: ENSLevel[];
  parameters: ENSControlParameter[];
}

// Veredicto sobre UN valor concreto. `reason` está redactado para que el
// auditor pueda corregir sin adivinar: dice qué se esperaba y qué llegó.
export interface ENSParameterValueVerdict {
  valid: boolean;
  reason?: string;
}

// Motivo de invalidez con la identidad del parámetro, para poder listarlos en la
// no conformidad NC-CFG y en el formulario sin volver a validar.
export interface ENSParameterValueIssue {
  parameterId: string;
  parameterName: string;
  label: string;
  required: boolean;
  reason: string;
}

export interface ENSControlConfigurationValidation {
  controlId: string;
  controlName: string;
  activeLevel: ENSLevel;
  totalParameters: number;
  configured: number;
  notConfigured: number;
  notApplicable: number;
  invalid: number;
  missingRequired: ENSControlParameter[];
  invalidParameters: ENSControlParameter[];
  // Obligatorios del nivel activo que SÍ tienen valor, pero un valor que no
  // significa nada para su tipo. Bloquean la evaluación igual que los que
  // faltan, pero el arreglo es distinto: corregir, no rellenar.
  invalidRequired: ENSControlParameter[];
  issues: ENSParameterValueIssue[];
  status: 'CONFIGURED' | 'INCOMPLETE' | 'INVALID';
  parameters: ENSControlParameter[];
}

export interface ENSConfigurationVersion {
  id: string;
  clientId: string;
  version: string;
  status: ENSConfigurationLifecycleStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  changeReason: string;
  global: ENSGlobalConfiguration;
  scope: ENSConfigurationScope;
  controls: ENSControlConfiguration[];
  auditTrail: ENSConfigurationAuditEntry[];
}
export type ENSConfigurationLifecycleStatus =
  | 'DRAFT'
  | 'CONFIGURED'
  | 'INCOMPLETE'
  | 'INVALID'
  | 'ACTIVE'
  | 'ARCHIVED';

export type ENSControlParameterValues = Record<
  string,
  ENSControlParameter['value']
>;

export interface ENSConfigurationAuditEntry {
  action: 'CREATED' | 'UPDATED' | 'VALIDATED' | 'RESET';
  user: string;
  date: string;
  summary: string;
}

export * from './configuration-session';
