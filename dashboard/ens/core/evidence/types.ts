import { ENSComplianceStatus, ENSGapCause } from '../evaluation/types';
import { ENSLevel } from '../../configuration/types';
import { ENSDataSourceType } from '../data-source/types';

export type ENSEvidenceCategory =
  | 'CONFIGURATION'
  | 'EXECUTION'
  | 'MONITORING'
  | 'INTEGRITY'
  | 'ACCESS_CONTROL'
  | 'RECOVERY'
  | 'OFFSITE'
  | 'TRACEABILITY';

export type ENSEvidenceCriticality =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export interface ENSEvidenceQualityRequirements {
  requiredFields?: string[];
  requiredFieldsWhenStatus?: string[];
  fieldPatterns?: Record<string, string>;
  rejectSynthetic?: boolean;
}

// Primitivas de juicio del motor. Son deliberadamente pocas y deliberadamente
// iguales para los tres controles: el evaluador por control (op-acc-1.evaluator)
// dio dos caminos de evaluación sobre los mismos datos y se desconectó en
// `3e92f5c`. Aquí no hay código por control, solo una declaración en el catálogo.
//
// Se nombran por lo que significan para un AUDITOR, no por cómo se implementan.
// Hay siete y no una por evidencia porque cada una responde a una pregunta de
// auditoría distinta; dos que respondieran a la misma pregunta serían el
// evaluador por control con otro nombre. El razonamiento completo, evidencia a
// evidencia, está en `docs/PRIMITIVAS_DE_JUICIO.md`.
//
// Contra una LISTA de referencia:
//
//   NINGUNO_EN_LISTA        Ningún hecho observado figura en la lista PROHIBIDA.
//                           Aserción negativa: cero hechos con cobertura
//                           confirmada es CUMPLE.
//   TODOS_EN_LISTA          Todo hecho observado figura en la lista AUTORIZADA.
//                           Los hechos ACREDITAN algo (cuentas activas, accesos
//                           al repositorio): cero hechos es no haber medido.
//   NINGUNO_FUERA_DE_LISTA  Ningún HALLAZGO de un barrido queda fuera de la
//                           lista autorizada. Misma comparación que
//                           TODOS_EN_LISTA y regla de ausencia opuesta: aquí
//                           cero hechos con cobertura confirmada significa «se
//                           barrió y no se encontró nada», que sí es CUMPLE.
//
// Contra un UMBRAL numérico:
//
//   UMBRAL_MAXIMO     Ningún valor observado supera el del parámetro.
//   UMBRAL_MINIMO     Ningún valor observado queda por debajo del parámetro.
//
// Contra un PLAZO:
//
//   ANTIGUEDAD_MAXIMA El hecho más reciente no es más viejo que el plazo. Es la
//                     única primitiva EXISTENCIAL —le basta UN hecho lo bastante
//                     reciente—, y por eso nunca cumple por ausencia.
//
// Contra una TABLA de política:
//
//   CONFORME_A_TABLA  Cada hecho observado casa con LA FILA que le corresponde
//                     en la tabla, columna a columna. Es la primitiva de
//                     `op.acc.2.2`: los derechos de cada recurso siguen la
//                     decisión escrita del responsable.
export type ENSEvidenceJudgmentPrimitive =
  | 'NINGUNO_EN_LISTA'
  | 'TODOS_EN_LISTA'
  | 'NINGUNO_FUERA_DE_LISTA'
  | 'UMBRAL_MAXIMO'
  | 'UMBRAL_MINIMO'
  | 'ANTIGUEDAD_MAXIMA'
  | 'CONFORME_A_TABLA';

// Una columna de la tabla de política contrastada contra un campo del hecho.
//
// El nombre de la columna y el del campo se declaran por separado a propósito:
// la columna dice lo que el responsable DECIDIÓ ('acl_esperada') y el campo, lo
// que el agente OBSERVÓ ('acl'). Llamarlos igual por convención invitaría a
// nombrar el hecho crudo con el vocabulario de la política, que es justo la
// confusión que la migración deshace.
export interface ENSEvidenceTableCheck {
  column: string;
  factField: string;
}

// Declara que de esta evidencia decide el motor, no el agente.
//
// El agente emite el HECHO CRUDO (qué cuentas se han autenticado, qué días
// lleva una copia sin hacerse) y el motor lo contrasta con el parámetro que el
// auditor configuró en la pantalla. Cuando una evidencia declara `judgment`, su
// `evidence_state` deja de mandar sobre ella: el motor no lee `estado` en este
// camino.
//
// Invariante que ninguna primitiva puede romper: sin hecho observado o sin
// parámetro, NO_EVALUABLE con motivo. Nunca CUMPLE por ausencia, y nunca
// NO_CUMPLE por ausencia.
export interface ENSEvidenceJudgment {
  primitive: ENSEvidenceJudgmentPrimitive;

  // `id` del ENSControlParameter (p.ej. 'P-04'), no su `name`. El `id` es lo
  // estable entre el bloque semilla de `config/` y lo que devuelve el índice.
  parameterId: string;

  // Tipos de evento que transportan el hecho crudo. Es una lista, como
  // `expectedEventTypes`, porque un mismo hecho puede llegar por más de un tipo
  // (`generic_account_login` y `auth_success` para EV-03 de op.acc.1) y porque
  // durante una migración conviven el tipo viejo y el nuevo.
  factEventTypes: string[];

  // Campo del evento cuyo valor se contrasta. Se busca primero en `attributes` y
  // luego en la raíz del evento normalizado. Si el campo trae una lista, cada
  // elemento cuenta como un hecho observado independiente.
  //
  // En `CONFORME_A_TABLA` no se usa: allí los campos los declaran `factKeyField`
  // y `tableChecks`.
  factField: string;

  // Columna del parámetro que hace de lista de referencia, cuando el parámetro
  // NO es una lista plana.
  //
  // ES OBLIGATORIA EN CUANTO EL PARÁMETRO DECLARA DOS O MÁS COLUMNAS, y sin ella
  // el juicio se queda en NO_EVALUABLE con motivo. Es deliberado: la lista de
  // usuarios autorizados (P-07 de op.acc.1) es una tabla `usuario | sistema |
  // rol`, y comparar la FILA ENTERA contra el nombre de una cuenta no encuentra
  // nunca a nadie — un `TODOS_EN_LISTA` que declara no autorizada a toda la
  // plantilla, o un `NINGUNO_EN_LISTA` que da por buena a cualquiera. Adivinar
  // la columna (la primera, por ejemplo) sería peor: acertaría en P-07 y
  // fallaría en silencio en la siguiente tabla cuya clave no fuera la columna 1.
  parameterColumn?: string;

  // --- solo `CONFORME_A_TABLA` ---------------------------------------------

  // Columna que identifica la fila de la tabla ('recurso' en la ACL declarada).
  tableKeyColumn?: string;

  // Campo del hecho que trae esa clave. Por defecto, el mismo nombre que
  // `tableKeyColumn`.
  factKeyField?: string;

  // Columnas contrastadas y campo del hecho de cada una. Una columna que no
  // figure aquí NO se compara aunque la fila la traiga rellena: lo que se juzga
  // se declara, no se deduce.
  tableChecks?: ENSEvidenceTableCheck[];

  // --- primitivas numéricas y de plazo --------------------------------------

  // Segundo parámetro que se SUMA al umbral o al plazo. Es el margen de
  // tolerancia de mp.info.6 (P-02 sobre P-01): política de pleno derecho, vive
  // en la pantalla y tiene que poder sumarse desde el catálogo sin escribir
  // código para esa evidencia.
  //
  // Si no existe o está vacío se aplica SIN margen, que es el extremo estricto:
  // una ventana más corta nunca produce un CUMPLE que la ventana con margen no
  // produjera. Si existe pero no se puede leer, NO_EVALUABLE: eso no es un
  // margen ausente, es un margen ilegible.
  toleranceParameterId?: string;

  // Tipos de evento del latido del recolector. Es lo que permite distinguir
  // «he mirado y no había nada» de «no he podido mirar», y de esa distinción
  // depende si la ausencia de hechos puede llegar a significar CUMPLE (ver
  // `resolveCollectorCoverage` en judgment.ts). Por defecto, `collector_run`.
  collectorRunEventTypes?: string[];

  // Antigüedad máxima, en horas, de un latido para que cuente como cobertura
  // de la ventana evaluada. Por defecto 24 (los tres recolectores laten cada
  // hora, así que 24 tolera un día entero de fallos de red sin dejar de
  // reconocer un recolector vivo). La ventana tiene también cota SUPERIOR, que
  // no se configura aquí porque es tolerancia de reloj, no de política.
  collectorRunMaxAgeHours?: number;
}

export interface ENSEvidenceDefinition {
  id: string;
  controlId: string;
  title: string;
  description: string;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;

  // Opcional. Sin `judgment`, la evidencia se resuelve como siempre: manda el
  // `evidence_state` que emite el agente.
  judgment?: ENSEvidenceJudgment;
}

export interface ENSEvidenceResolved {
  id: string;
  controlId: string;
  title: string;
  description: string;
  status: ENSComplianceStatus;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;
  lastSeen?: string;
  agentId?: string;
  agentName?: string;
  resolvedEventId?: string;
  resolvedEventType?: string;
  resolvedSourceType?: ENSDataSourceType;
  resolvedSource?: string;
  resolvedRuleId?: string;
  resolvedRuleDescription?: string;
  resolvedAttributes?: Record<string, unknown>;
  latestSuccessfulEventId?: string;
  latestSuccessfulAttributes?: Record<string, unknown>;
  observations: string[];

  // POR QUÉ no hay medida, cuando no la hay. Solo viaja con `status`
  // NO_EVALUABLE, y es lo que evita que la causa del incumplimiento se tenga que
  // adivinar leyendo el texto del motivo:
  //
  //   COLLECTION     no ha llegado nada: agente caído, recolector sin ejecutar,
  //                  sin latido. Problema de RECOGIDA, no de la máquina.
  //   EVIDENCE       llegó el dato pero no basta: contrato de calidad, campo
  //                  ilegible, o el agente declara que no ha podido medir.
  //   CONFIGURATION  falta el parámetro contra el que juzgar, o está vacío.
  //
  // Nunca CATALOG: esa causa es del requisito, no de la evidencia — es la de un
  // requisito que no declara ninguna.
  gapCause?: ENSGapCause;
}

// La parte de la evidencia resuelta que se copia tal cual desde el catálogo,
// antes de saber nada del veredicto ni del evento que lo sostiene. La construye
// `engine.ts` y la consume también `judgment.ts`.
export type ENSEvidenceBaseFields = Omit<
  ENSEvidenceResolved,
  | 'status'
  | 'observations'
  | 'gapCause'
  | 'lastSeen'
  | 'agentId'
  | 'agentName'
  | 'resolvedEventId'
  | 'resolvedEventType'
  | 'resolvedSourceType'
  | 'resolvedSource'
  | 'resolvedRuleId'
  | 'resolvedRuleDescription'
>;
