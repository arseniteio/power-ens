import {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSParameterColumn,
} from '../../configuration/types';
import { compileParameterPattern } from '../../configuration/services/parameter-pattern';
import { supportsParameterPattern } from '../../configuration/services/parameter-input';
import { validateParameterValue } from '../../configuration/services/parameter-value-validator';
import { ENSNormalizedEvent } from '../data-source/types';
import {
  getEventFieldValue,
  hasMeaningfulValue,
  sortByTimestampDesc,
} from './normalized-events';
import { ENSGapCause } from '../evaluation/types';
import {
  ENSEvidenceBaseFields,
  ENSEvidenceDefinition,
  ENSEvidenceJudgment,
  ENSEvidenceResolved,
} from './types';

// El motor juzga la evidencia; el agente solo aporta el hecho crudo.
//
// Este fichero es el ÚNICO sitio donde vive «el motor decide esta evidencia», y
// es idéntico para los tres controles. No hay —ni puede haber— un evaluador por
// control: tener uno solo en op.acc.1 produjo dos caminos de evaluación sobre
// los mismos datos y se desconectó en `3e92f5c`.
//
// Invariante, por encima de cualquier primitiva: la ausencia de un dato no
// produce una afirmación. Sin hecho observado o sin parámetro, NO_EVALUABLE con
// motivo. Nunca un CUMPLE falso, y tampoco un NO_CUMPLE MEDIDO falso.
//
// El criterio del 04/08 no cambia nada de esto. Lo que decide este fichero es la
// OBSERVACIÓN —qué se ha podido mirar y qué no—, no el veredicto: una evidencia
// sin dato sigue saliendo NO_EVALUABLE, con su `gapCause` diciendo por qué. Que
// eso cuente como incumplimiento del requisito lo decide `applyAuditVerdict`, en
// `evaluation/utils/verdict.ts`. Fundir las dos capas sería perder justo la
// distinción que el responsable pidió conservar: mirando la tabla de evidencias
// se tiene que poder ver si la máquina se midió y falló, o si nunca se midió.

// --- Cobertura del recolector (T1.3) ---------------------------------------
//
// «El recolector corrió y no encontró nada» y «el recolector no corrió» son dos
// situaciones distintas, y de esa distinción depende si la ausencia de hechos
// puede llegar a significar CUMPLE:
//
//   - NINGUNO_EN_LISTA con cobertura CONFIRMADA y cero hechos → sí es CUMPLE
//     (se ha mirado y no hay ninguna cuenta prohibida autenticándose).
//   - Con cobertura DESCONOCIDA o AUSENTE, ese mismo caso es el falso verde que
//     el producto prohíbe, así que se queda en NO_EVALUABLE.
//
// Aquí es donde se decide si el producto miente: con la cobertura sin resolver,
// «cero hechos» es indistinguible de «agente apagado».
export type ENSCollectorCoverage =
  | 'CONFIRMADA'
  | 'AUSENTE'
  | 'DESCONOCIDA';

export interface ENSCollectorCoverageResult {
  coverage: ENSCollectorCoverage;

  // El motivo va SIEMPRE, también cuando la cobertura está confirmada: es lo
  // que el auditor lee para saber sobre qué latido concreto se sostiene un
  // CUMPLE que nadie ha observado directamente.
  reason: string;

  // Latido en el que se apoya la respuesta, para la traza.
  event?: ENSNormalizedEvent;
}

const DEFAULT_COLLECTOR_RUN_EVENT_TYPES = [
  'collector_run',
];

const DEFAULT_COLLECTOR_RUN_MAX_AGE_HOURS = 24;

// Cota SUPERIOR de la ventana. Un latido no puede venir del futuro: si lo hace,
// o el reloj está desviado o el dato está manipulado, y en ninguno de los dos
// casos demuestra que el recolector haya mirado nada. Sin esta cota, un
// `collector_run` fechado en 2099 valdría como latido perpetuo y volvería verde
// para siempre a cualquier evidencia de aserción negativa, aunque el agente
// llevara meses apagado. Es un fallo real, ya visto en revisión de este
// producto, y el mismo margen y el mismo criterio que aplica el agente en
// `ens_opacc1_score.py` (MARGEN_FUTURO) — los dos lados tienen que tratar igual
// un ts adelantado o vuelve a haber dos interpretaciones del mismo evento.
const COLLECTOR_RUN_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Campos del latido. No se declaran por evidencia en el catálogo a propósito:
// son el contrato agente↔motor, idéntico para los tres controles, y ponerlos en
// el catálogo invitaría a que cada evidencia lo declarara distinto.
const COLLECTOR_RUN_RESULT_FIELD = 'resultado';

const COLLECTOR_RUN_SUCCESS_VALUES = [
  'completada',
];

// Lista blanca de evidencias que ESA pasada llegó a mirar. No es lo mismo que
// «sobre las que emitió algo»: una evidencia de aserción negativa calla
// legítimamente cuando no hay nada que reportar, y ese silencio es justo el
// caso que puede significar CUMPLE. Lo que hace falta saber es si la fuente se
// pudo leer.
const COLLECTOR_RUN_COVERAGE_FIELD = 'evidencias_cubiertas';

const parseTimestamp = (
  value: string | undefined
): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
};

// Un latido del mismo control y agente (ya filtrados por
// `resolveEvidenceForControl`), con ejecución correcta, cubriendo la ventana
// evaluada y declarando esta evidencia → CONFIRMADA; uno que declare fallo o
// que declare NO haber cubierto esta evidencia → AUSENTE; ninguno del que se
// pueda decir nada → DESCONOCIDA.
//
// Regla de fondo, y la razón de que falten datos se resuelva siempre hacia
// DESCONOCIDA: CONFIRMADA hay que GANÁRSELA. Un latido que no declara su
// resultado, o que no declara qué llegó a mirar, no demuestra cobertura —
// demuestra que el recolector es más viejo que este contrato. Y lo que no
// consta no puede convertir un silencio en un CUMPLE.
export const resolveCollectorCoverage = (
  definition: ENSEvidenceDefinition,
  judgment: ENSEvidenceJudgment,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSCollectorCoverageResult => {
  const eventTypes =
    judgment.collectorRunEventTypes?.length
      ? judgment.collectorRunEventTypes
      : DEFAULT_COLLECTOR_RUN_EVENT_TYPES;

  const maxAgeHours =
    judgment.collectorRunMaxAgeHours !==
      undefined &&
    Number.isFinite(
      judgment.collectorRunMaxAgeHours
    ) &&
    judgment.collectorRunMaxAgeHours > 0
      ? judgment.collectorRunMaxAgeHours
      : DEFAULT_COLLECTOR_RUN_MAX_AGE_HOURS;

  const candidates = sortByTimestampDesc(
    events.filter(
      event =>
        eventTypes.includes(event.eventType) &&
        definition.sourceTypes.includes(
          event.sourceType
        ) &&
        // El latido no es de ninguna evidencia en particular; si alguno viene
        // marcado, solo cuenta para la suya.
        (!event.evidenceId ||
          event.evidenceId === definition.id)
    )
  );

  if (!candidates.length) {
    return {
      coverage: 'DESCONOCIDA',
      reason: `No consta ningún evento de recolector (${eventTypes.join(', ')}) para ${definition.id}: no hay forma de saber si el recolector llegó a ejecutarse.`,
    };
  }

  const nowMs = now.getTime();

  const lowerBound =
    nowMs - maxAgeHours * 60 * 60 * 1000;

  const upperBound =
    nowMs + COLLECTOR_RUN_FUTURE_TOLERANCE_MS;

  let futureCandidate:
    | ENSNormalizedEvent
    | undefined;

  const inWindow = candidates.filter(event => {
    const timestamp = parseTimestamp(
      event.timestamp
    );

    if (timestamp === undefined) {
      return false;
    }

    if (timestamp > upperBound) {
      futureCandidate =
        futureCandidate || event;

      return false;
    }

    return timestamp >= lowerBound;
  });

  if (!inWindow.length) {
    return futureCandidate
      ? {
          coverage: 'DESCONOCIDA',
          reason: `El único evento de recolector para ${definition.id} está fechado en el futuro (${futureCandidate.timestamp}): un reloj desviado o un dato manipulado no demuestra que se haya mirado nada, así que no cuenta como latido.`,
          event: futureCandidate,
        }
      : {
          coverage: 'DESCONOCIDA',
          reason: `No consta ningún evento de recolector para ${definition.id} dentro de las últimas ${maxAgeHours} horas (el más reciente es de ${candidates[0].timestamp}).`,
          event: candidates[0],
        };
  }

  const latest = inWindow[0];

  const declaredResult = getEventFieldValue(
    latest,
    COLLECTOR_RUN_RESULT_FIELD
  );

  if (!hasMeaningfulValue(declaredResult)) {
    return {
      coverage: 'DESCONOCIDA',
      reason: `El latido del recolector ${latest.id} (${latest.timestamp}) no declara el campo '${COLLECTOR_RUN_RESULT_FIELD}', así que no consta que la pasada terminara bien.`,
      event: latest,
    };
  }

  if (
    !COLLECTOR_RUN_SUCCESS_VALUES.includes(
      normalizeForComparison(declaredResult)
    )
  ) {
    return {
      coverage: 'AUSENTE',
      reason: `El recolector ejecutó, pero su latido ${latest.id} (${latest.timestamp}) declara ${COLLECTOR_RUN_RESULT_FIELD}='${String(declaredResult)}': la pasada no terminó correctamente.`,
      event: latest,
    };
  }

  const declaredCoverage = getEventFieldValue(
    latest,
    COLLECTOR_RUN_COVERAGE_FIELD
  );

  if (!hasMeaningfulValue(declaredCoverage)) {
    return {
      coverage: 'DESCONOCIDA',
      reason: `El latido del recolector ${latest.id} (${latest.timestamp}) no declara '${COLLECTOR_RUN_COVERAGE_FIELD}', así que no consta que la pasada llegara a observar ${definition.id}.`,
      event: latest,
    };
  }

  const coveredEvidences = parseReferenceList(
    declaredCoverage
  ).map(normalizeForComparison);

  if (
    !coveredEvidences.includes(
      normalizeForComparison(definition.id)
    )
  ) {
    return {
      coverage: 'AUSENTE',
      reason: `El recolector ejecutó correctamente, pero su latido ${latest.id} (${latest.timestamp}) declara haber cubierto ${coveredEvidences.length ? `'${parseReferenceList(declaredCoverage).join("', '")}'` : 'ninguna evidencia'} y ${definition.id} no está: esa pasada no llegó a observar esta evidencia.`,
      event: latest,
    };
  }

  return {
    coverage: 'CONFIRMADA',
    reason: `El recolector ejecutó correctamente y declara haber cubierto ${definition.id} (latido ${latest.id} de ${latest.timestamp}, dentro de las últimas ${maxAgeHours} horas).`,
    event: latest,
  };
};

// --- Lectura del parámetro -------------------------------------------------

// Tolera el valor heredado en forma de cadena: lo que hay en el índice para
// muchos parámetros de tipo `list` son cadenas escritas a mano antes de que el
// formulario supiera editar listas. Se parte por saltos de línea y por comas,
// igual que `configuration/form-engine/renderers/list-parameter-renderer.tsx`
// —el motor y la pantalla tienen que leer el valor guardado de la misma forma—,
// y NUNCA por `|`, que en este producto separa los campos de un mismo elemento
// ('srv-dc01 | Windows').
export const parseReferenceList = (
  value: unknown
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return [String(value)];
  }

  return [];
};

// --- Lectura de un parámetro de tipo TABLA ---------------------------------
//
// `parseReferenceList` no sirve para una tabla, y no es un descuido suyo: parte
// por comas, y una celda `multiselect` ('lectura,escritura' en P-06 de op.acc.2)
// lleva comas dentro. Aplicada a una tabla rompería una fila en pedazos que no
// significan nada.
//
// Una tabla se lee en dos pasos: filas y celdas. Las FILAS son los elementos del
// array (o las líneas, si el valor llegó como cadena de un bloque sembrado a
// mano); NUNCA se parten por comas. Las CELDAS sí se parten por `|`, que es el
// separador de campos del producto ('/srv/datos | 750 | root:ops').
export const parseReferenceRows = (
  value: unknown
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

// Una fila cruda ('jgomez | srv01 | ops') repartida entre las columnas
// declaradas. Las celdas que la fila no trae quedan vacías, que es lo mismo que
// una celda en blanco: ese eje no se declara. Las que sobran se descartan.
export const splitRowCells = (
  row: string,
  columns: ENSParameterColumn[]
): Record<string, string> => {
  const cells = row.split('|').map(cell => cell.trim());

  const parsed: Record<string, string> = {};

  columns.forEach((column, index) => {
    parsed[column.name] = cells[index] ?? '';
  });

  return parsed;
};

// --- Comparación de valores ------------------------------------------------
//
// DOS reglas de mayúsculas, y la diferencia no es cosmética: decide en qué
// dirección se equivoca el motor cuando la política y la máquina escriben el
// mismo nombre distinto.
//
//   - Contra una lista PROHIBIDA (`NINGUNO_EN_LISTA`), sin distinguir
//     mayúsculas: 'ADMIN' y 'admin' cuentan los dos como la cuenta prohibida.
//     Equivocarse aquí produce un NO_CUMPLE de más, nunca un CUMPLE falso.
//   - Contra una lista AUTORIZADA o una celda de la tabla, DISTINGUIENDO
//     mayúsculas. En Linux 'Admin' y 'admin' son dos cuentas distintas, así que
//     tratarlas como la misma autorizaría a una cuenta que nadie autorizó: un
//     CUMPLE falso, que es lo único que este producto no puede hacer. Es además
//     lo que P-07 y P-09 llevan escrito en su propia descripción («la
//     comparación es literal y distingue mayúsculas»).
const normalizeForComparison = (
  value: unknown
): string =>
  String(value)
    .trim()
    .toLowerCase();

const normalizeStrict = (
  value: unknown
): string => String(value).trim();

// Modo octal como número. Tolera el cero inicial ('0750' y '750' son el mismo
// modo) y rechaza cualquier cosa que no sean dígitos octales.
const toOctalMode = (
  value: unknown
): number | undefined => {
  const text = String(value).trim();

  if (!/^[0-7]{3,4}$/.test(text)) {
    return undefined;
  }

  return parseInt(text, 8);
};

// «El modo observado no concede ni un permiso que el declarado no conceda.»
// Igualdad NO: un recurso más restrictivo que lo declarado no crea riesgo y
// declararlo desviación produciría no conformidades que ningún auditor firma.
// Lo que no puede pasar nunca es lo contrario, y es justo lo que esto mide.
const grantsNothingExtra = (
  observed: number,
  declared: number
): boolean => (observed & ~declared) === 0;

// Celda `multiselect`: dentro de la celda sí manda la coma, que es como la
// declara el formulario ('lectura,escritura').
const splitCellOptions = (
  cell: string
): string[] =>
  cell
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);

// ¿Lo observado casa con lo que la política declara en ESA celda?
//
// `undefined` significa «no se puede comparar», que no es lo mismo que «no
// casa»: un modo que no es octal o un número que no es un número dejan el eje
// sin decidir, y de ahí sale NO_EVALUABLE, nunca NO_CUMPLE.
//
// La comparación la elige el TIPO DE COLUMNA que el parámetro ya declara. Es lo
// que evita el catálogo de casos particulares: la ACL declarada y el umask
// mínimo se comparan igual porque los dos son `octal`, sin que ninguna evidencia
// tenga que decir cómo.
const cellMatches = (
  observed: string,
  cell: string,
  column: ENSParameterColumn | undefined
): boolean | undefined => {
  if (column?.type === 'octal') {
    const observedMode = toOctalMode(observed);
    const declaredMode = toOctalMode(cell);

    if (
      observedMode === undefined ||
      declaredMode === undefined
    ) {
      return undefined;
    }

    return grantsNothingExtra(
      observedMode,
      declaredMode
    );
  }

  if (column?.type === 'multiselect') {
    return splitCellOptions(cell).includes(
      normalizeStrict(observed)
    );
  }

  if (column?.type === 'number') {
    const observedNumber = toFiniteNumber(observed);
    const declaredNumber = toFiniteNumber(cell);

    if (
      observedNumber === undefined ||
      declaredNumber === undefined
    ) {
      return undefined;
    }

    return observedNumber === declaredNumber;
  }

  return (
    normalizeStrict(observed) ===
    normalizeStrict(cell)
  );
};

const toFiniteNumber = (
  value: unknown
): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : undefined;
  }

  const text = String(value).trim();

  if (!text) {
    return undefined;
  }

  const parsed = Number(text);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
};

type ENSParameterReference =
  | {
      kind: 'LISTA';
      values: string[];
      // Set by a parameter in regex mode: replaces the comparison with `values`.
      matches?: (value: string) => boolean;
      // Qué se compara realmente: la lista entera o una columna suya. Va en la
      // referencia para que el motivo que lee el auditor lo diga.
      description: string;
    }
  | { kind: 'UMBRAL'; threshold: number; description: string }
  | { kind: 'VENTANA'; hours: number; description: string }
  | {
      kind: 'TABLA';
      rows: Record<string, string>[];
      columns: ENSParameterColumn[];
      description: string;
    }
  | { kind: 'SIN_PARAMETRO'; reason: string };

const LIST_PRIMITIVES: ENSEvidenceJudgment['primitive'][] = [
  'NINGUNO_EN_LISTA',
  'TODOS_EN_LISTA',
  'NINGUNO_FUERA_DE_LISTA',
];

const THRESHOLD_PRIMITIVES: ENSEvidenceJudgment['primitive'][] = [
  'UMBRAL_MAXIMO',
  'UMBRAL_MINIMO',
];

// Cuánto dura una hora de cada tipo de parámetro. La unidad del plazo la dice el
// TIPO del parámetro y no una declaración aparte en el catálogo: si estuvieran
// los dos, podrían discrepar, y un plazo de 30 leído como horas donde son días
// convierte un CUMPLE en un NO_CUMPLE sin que nada avise.
const DURATION_HOURS_BY_TYPE: Record<string, number> = {
  duration_hours: 1,
  duration_days: 24,
};

const resolveDurationHours = (
  parameter: ENSControlParameter
): number | undefined => {
  const factor =
    DURATION_HOURS_BY_TYPE[parameter.type];

  if (factor === undefined) {
    return undefined;
  }

  const amount = toFiniteNumber(parameter.value);

  return amount === undefined || amount < 0
    ? undefined
    : amount * factor;
};

// La lista contra la que se compara. Es AQUÍ donde se resuelve el aviso que dejó
// el agente de configuración: hoy `parseReferenceList` devuelve filas enteras, y
// la primera evidencia que apunte a un parámetro `table` compararía
// 'jgomez | srv01 | ops' contra 'jgomez' y no casaría jamás.
//
// Tres casos, y el del medio es el que no existía:
//
//   - Parámetro sin `columns` (o con una sola): lista plana, exactamente como
//     hasta hoy. P-04 de op.acc.1 —la única evidencia migrada— entra por aquí y
//     no cambia de comportamiento.
//   - Parámetro con dos o más columnas y `parameterColumn` declarada: se proyecta
//     ESA columna de cada fila.
//   - Parámetro con dos o más columnas y sin `parameterColumn`: NO se compara
//     nada. Comparar la fila entera sería el fallo silencioso; elegir la primera
//     columna por defecto sería el mismo fallo aplazado a la primera tabla cuya
//     clave no fuera la columna 1.
const resolveReferenceValues = (
  judgment: ENSEvidenceJudgment,
  parameter: ENSControlParameter,
  parameterLabel: string
):
  | { values: string[]; description: string }
  | { reason: string } => {
  const columns = parameter.columns ?? [];

  const declared = judgment.parameterColumn;

  if (declared) {
    if (!columns.length) {
      return {
        reason: `El juicio compara la columna '${declared}' del parámetro ${parameterLabel}, pero el parámetro no declara ninguna columna: no hay forma de saber qué posición ocupa dentro de cada fila. Vuelve a sembrar el bloque del control con config/inject-control.py.`,
      };
    }

    if (
      !columns.some(
        column => column.name === declared
      )
    ) {
      return {
        reason: `El juicio compara la columna '${declared}' del parámetro ${parameterLabel}, que declara las columnas ${columns.map(column => `'${column.name}'`).join(', ')} y ninguna se llama así.`,
      };
    }

    const values = parseReferenceRows(
      parameter.value
    )
      .map(
        row => splitRowCells(row, columns)[declared]
      )
      .filter(Boolean);

    return {
      values,
      description: `la columna '${declared}' de ${parameterLabel}`,
    };
  }

  if (columns.length > 1) {
    return {
      reason: `El parámetro ${parameterLabel} es una tabla de ${columns.length} columnas (${columns.map(column => `'${column.name}'`).join(', ')}) y el juicio no declara cuál se compara. Comparar la fila entera contra un valor suelto no encuentra nunca nada, así que no se compara: declara 'parameterColumn' en el catálogo.`,
    };
  }

  return {
    values: parseReferenceList(parameter.value),
    description: `la lista del parámetro ${parameterLabel}`,
  };
};

// Nunca se recurre a `defaultValue`: juzgar contra un valor que el auditor no ha
// puesto es exactamente la pantalla que miente. Solo cuenta lo configurado.
const resolveParameterReference = (
  judgment: ENSEvidenceJudgment,
  parameter: ENSControlParameter | undefined,
  parameterLabel: string,
  tolerance: ENSControlParameter | undefined
): ENSParameterReference => {
  if (!parameter) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: `El parámetro ${parameterLabel} no existe en la configuración activa del control.`,
    };
  }

  if (!hasMeaningfulValue(parameter.value)) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: `El parámetro ${parameterLabel} está sin configurar.`,
    };
  }

  if (parameter.matchMode === 'regex') {
    const verdict = validateParameterValue(parameter, parameter.value);
    if (
      !LIST_PRIMITIVES.includes(judgment.primitive) ||
      judgment.parameterColumn ||
      judgment.toleranceParameterId ||
      !supportsParameterPattern(parameter) ||
      !verdict.valid
    ) {
      return {
        kind: 'SIN_PARAMETRO',
        reason: `El parámetro ${parameterLabel} no contiene una expresión regular utilizable: ${(verdict.reason ?? 'el juicio no admite patrones').replace(/\.$/, '')}.`,
      };
    }
    try {
      const pattern = compileParameterPattern(parameter.value);
      return {
        kind: 'LISTA',
        values: [],
        matches: value => pattern.matches(value),
        description: `la expresión regular '${String(parameter.value)}' del parámetro ${parameterLabel} (coincidencia completa)`,
      };
    } catch (error) {
      return {
        kind: 'SIN_PARAMETRO',
        reason: `Expresión regular inválida en ${parameterLabel}: ${String(error)}`,
      };
    }
  }

  // El margen solo significa algo sumado a un número o a un plazo. Declararlo en
  // una primitiva de lista es un error del catálogo, y se dice en vez de
  // ignorarse: un margen que no hace nada es la misma mentira que un parámetro
  // editable sin efecto.
  const wantsTolerance = Boolean(
    judgment.toleranceParameterId
  );

  const numericPrimitive =
    THRESHOLD_PRIMITIVES.includes(
      judgment.primitive
    ) ||
    judgment.primitive === 'ANTIGUEDAD_MAXIMA';

  if (wantsTolerance && !numericPrimitive) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: `El juicio declara el margen ${judgment.toleranceParameterId} sobre la primitiva ${judgment.primitive}, que no compara ningún número: un margen que no se suma a nada no se puede aplicar.`,
    };
  }

  // Margen ausente o vacío -> se aplica sin margen. Es el extremo ESTRICTO: una
  // ventana más corta nunca produce un CUMPLE que la ventana con margen no
  // produjera, así que su ausencia no puede fabricar un verde. Un margen que
  // está pero no se puede leer es otra cosa y no se adivina.
  let toleranceHours = 0;
  let toleranceAmount = 0;
  let toleranceMotive = '';

  if (
    wantsTolerance &&
    tolerance &&
    hasMeaningfulValue(tolerance.value)
  ) {
    const hours = resolveDurationHours(tolerance);

    const amount = toFiniteNumber(tolerance.value);

    if (
      judgment.primitive === 'ANTIGUEDAD_MAXIMA'
    ) {
      if (hours === undefined) {
        return {
          kind: 'SIN_PARAMETRO',
          reason: `El margen ${judgment.toleranceParameterId} está configurado con '${String(tolerance.value)}' y su tipo '${tolerance.type}' no expresa un plazo utilizable.`,
        };
      }

      toleranceHours = hours;
    } else {
      if (amount === undefined) {
        return {
          kind: 'SIN_PARAMETRO',
          reason: `El margen ${judgment.toleranceParameterId} no contiene un número utilizable (valor: '${String(tolerance.value)}').`,
        };
      }

      toleranceAmount = amount;
    }

    toleranceMotive = ` más el margen ${judgment.toleranceParameterId}`;
  }

  if (judgment.primitive === 'ANTIGUEDAD_MAXIMA') {
    const hours = resolveDurationHours(parameter);

    if (hours === undefined) {
      return {
        kind: 'SIN_PARAMETRO',
        reason: `El parámetro ${parameterLabel} es de tipo '${parameter.type}' con valor '${String(parameter.value)}', y de ahí no sale un plazo: ANTIGUEDAD_MAXIMA necesita un parámetro de duración (horas o días) para saber contra qué mide.`,
      };
    }

    return {
      kind: 'VENTANA',
      hours: hours + toleranceHours,
      description: `el plazo de ${parameterLabel}${toleranceMotive}`,
    };
  }

  if (
    THRESHOLD_PRIMITIVES.includes(
      judgment.primitive
    )
  ) {
    const threshold = toFiniteNumber(
      parameter.value
    );

    if (threshold === undefined) {
      return {
        kind: 'SIN_PARAMETRO',
        reason: `El parámetro ${parameterLabel} no contiene un número utilizable como umbral (valor: '${String(parameter.value)}').`,
      };
    }

    return {
      kind: 'UMBRAL',
      threshold: threshold + toleranceAmount,
      description: `${parameterLabel}${toleranceMotive}`,
    };
  }

  if (judgment.primitive === 'CONFORME_A_TABLA') {
    const columns = parameter.columns ?? [];

    if (!columns.length) {
      return {
        kind: 'SIN_PARAMETRO',
        reason: `El parámetro ${parameterLabel} no declara sus columnas, así que sus filas no se pueden repartir en campos y no hay contra qué contrastar el hecho. Vuelve a sembrar el bloque del control con config/inject-control.py.`,
      };
    }

    const rows = parseReferenceRows(
      parameter.value
    ).map(row => splitRowCells(row, columns));

    if (!rows.length) {
      return {
        kind: 'SIN_PARAMETRO',
        reason: `El parámetro ${parameterLabel} no contiene ninguna fila utilizable como política de referencia.`,
      };
    }

    return {
      kind: 'TABLA',
      rows,
      columns,
      description: `la tabla del parámetro ${parameterLabel}`,
    };
  }

  const resolved = resolveReferenceValues(
    judgment,
    parameter,
    parameterLabel
  );

  if ('reason' in resolved) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: resolved.reason,
    };
  }

  if (!resolved.values.length) {
    return {
      kind: 'SIN_PARAMETRO',
      reason: `El parámetro ${parameterLabel} no contiene ningún elemento utilizable como lista de referencia (se compara ${resolved.description}).`,
    };
  }

  return {
    kind: 'LISTA',
    values: resolved.values,
    description: resolved.description,
  };
};

// --- Lectura de los hechos crudos ------------------------------------------

interface ENSObservedFact {
  event: ENSNormalizedEvent;
  text: string;

  // Solo en `CONFORME_A_TABLA`: la clave que busca su fila y lo que el agente
  // observó de cada eje contrastado.
  key?: string;
  values?: Record<string, string>;
}

interface ENSUnusableFactEvent {
  event: ENSNormalizedEvent;
  reason: string;
}

// Nombra los hechos, que es lo que el auditor necesita: no «algo falló», sino
// qué cuenta concreta. Se quitan los repetidos y se corta en cinco para que la
// observación siga siendo legible.
const describeFacts = (
  facts: ENSObservedFact[]
): string => {
  const unique: string[] = [];

  facts.forEach(fact => {
    if (
      !unique.some(
        item =>
          normalizeForComparison(item) ===
          normalizeForComparison(fact.text)
      )
    ) {
      unique.push(fact.text);
    }
  });

  const shown = unique
    .slice(0, 5)
    .map(item => `'${item}'`);

  const remaining = unique.length - shown.length;

  return remaining > 0
    ? `${shown.join(', ')} y ${remaining} más`
    : shown.join(', ');
};

// --- Juicio ----------------------------------------------------------------

// `now` es un parámetro y no una llamada suelta a `new Date()` porque la
// cobertura del recolector se mide contra una ventana con dos cotas: sin poder
// congelar el reloj, la prueba de que un latido del futuro NO vale sería
// imposible de escribir de forma determinista.
export const judgeEvidence = (
  definition: ENSEvidenceDefinition,
  judgment: ENSEvidenceJudgment,
  baseEvidence: ENSEvidenceBaseFields,
  events: ENSNormalizedEvent[],
  configuration?: ENSControlConfiguration,
  now: Date = new Date()
): ENSEvidenceResolved => {
  const parameter =
    configuration?.parameters.find(
      candidate =>
        candidate.id === judgment.parameterId
    );

  const parameterLabel = parameter?.name
    ? `${judgment.parameterId} (${parameter.name})`
    : judgment.parameterId;

  const toleranceParameter =
    judgment.toleranceParameterId
      ? configuration?.parameters.find(
          candidate =>
            candidate.id ===
            judgment.toleranceParameterId
        )
      : undefined;

  const reference = resolveParameterReference(
    judgment,
    parameter,
    parameterLabel,
    toleranceParameter
  );

  // Los eventos de hecho son SOLO los tipos declarados en `factEventTypes`. El
  // `evidence_state` del agente no entra aquí y su `estado` no se lee en ningún
  // punto de este fichero: cuando una evidencia declara `judgment`, deja de
  // mandar sobre ella.
  const factEvents = sortByTimestampDesc(
    events.filter(
      event =>
        definition.sourceTypes.includes(
          event.sourceType
        ) &&
        judgment.factEventTypes.includes(
          event.eventType
        ) &&
        (!event.evidenceId ||
          event.evidenceId === definition.id)
    )
  );

  const observedFacts: ENSObservedFact[] = [];
  const unusableFactEvents: ENSUnusableFactEvent[] = [];

  factEvents.forEach(event => {
    if (
      definition.qualityRequirements
        ?.rejectSynthetic &&
      event.isSynthetic
    ) {
      unusableFactEvents.push({
        event,
        reason:
          'está marcado como sintético o de demostración',
      });

      return;
    }

    // `CONFORME_A_TABLA` lee VARIOS campos del mismo evento: la clave que busca
    // su fila y lo observado de cada eje. Un evento sin clave no se puede
    // contrastar con ninguna fila, así que es ilegible; los ejes que falten se
    // resuelven abajo, contra la fila, porque un eje que la política no declara
    // tampoco hace falta que el agente lo observe.
    if (judgment.primitive === 'CONFORME_A_TABLA') {
      const keyFields = judgment.factKeyFields?.length
        ? judgment.factKeyFields
        : [
            judgment.factKeyField ||
              judgment.tableKeyColumn ||
              '',
          ];

      const keyParts = keyFields.map(field =>
        getEventFieldValue(event, field)
      );

      const missing = keyFields.filter(
        (field, index) =>
          !hasMeaningfulValue(keyParts[index])
      );

      if (missing.length) {
        unusableFactEvents.push({
          event,
          reason: `no trae valor en el campo '${missing.join("', '")}', que es el que identifica su fila en la tabla de política`,
        });

        return;
      }

      const keyValue = keyParts
        .map(part => String(part).trim())
        .join(' | ');

      const values: Record<string, string> = {};

      (judgment.tableChecks ?? []).forEach(
        check => {
          const observed = getEventFieldValue(
            event,
            check.factField
          );

          if (hasMeaningfulValue(observed)) {
            values[check.column] = String(
              observed
            ).trim();
          }
        }
      );

      observedFacts.push({
        event,
        text: String(keyValue).trim(),
        key: String(keyValue).trim(),
        values,
      });

      return;
    }

    const rawValue = getEventFieldValue(
      event,
      judgment.factField
    );

    const rawValues = Array.isArray(rawValue)
      ? rawValue
      : [rawValue];

    const usableValues = rawValues.filter(
      hasMeaningfulValue
    );

    if (!usableValues.length) {
      unusableFactEvents.push({
        event,
        reason: `no trae valor en el campo '${judgment.factField}'`,
      });

      return;
    }

    usableValues.forEach(value => {
      observedFacts.push({
        event,
        text: String(value).trim(),
      });
    });
  });

  // `gapCause` solo se rellena cuando el estado es NO_EVALUABLE: es el POR QUÉ
  // de la falta de medida, y de él sale la acción de la no conformidad no
  // evidenciada. Sin parámetro es CONFIGURATION; sin latido, COLLECTION; con el
  // dato llegado pero ilegible, EVIDENCE.
  const buildResult = (
    status: ENSEvidenceResolved['status'],
    motives: string[],
    decisiveEvent?: ENSNormalizedEvent,
    gapCause?: ENSGapCause
  ): ENSEvidenceResolved => ({
    ...baseEvidence,
    status,
    gapCause: status === 'NO_EVALUABLE' ? gapCause : undefined,
    relatedRules: Array.from(
      new Set([
        ...definition.relatedRules,
        ...(decisiveEvent?.ruleId
          ? [decisiveEvent.ruleId]
          : []),
      ])
    ),
    lastSeen: decisiveEvent?.timestamp,
    agentId: decisiveEvent?.agentId,
    agentName: decisiveEvent?.agentName,
    resolvedEventId: decisiveEvent?.id,
    resolvedEventType: decisiveEvent?.eventType,
    resolvedSourceType:
      decisiveEvent?.sourceType,
    resolvedSource: decisiveEvent?.source,
    resolvedRuleId: decisiveEvent?.ruleId,
    resolvedRuleDescription:
      decisiveEvent?.ruleDescription,
    resolvedAttributes:
      decisiveEvent?.attributes,
    latestSuccessfulEventId:
      status === 'CUMPLE'
        ? decisiveEvent?.id
        : undefined,
    latestSuccessfulAttributes:
      status === 'CUMPLE'
        ? decisiveEvent?.attributes
        : undefined,
    observations: [
      `Evidencia ${definition.id} juzgada por el motor con la primitiva ${judgment.primitive} sobre el parámetro ${parameterLabel}.`,
      ...motives,
      `Pregunta de auditoría: ${definition.auditQuestion}`,
    ],
  });

  const readFieldName =
    judgment.primitive === 'CONFORME_A_TABLA'
      ? judgment.factKeyField ||
        judgment.tableKeyColumn ||
        ''
      : judgment.factField;

  const missingFactsMotive = factEvents.length
    ? `No hay ningún hecho observado utilizable para ${definition.id}: llegaron ${factEvents.length} evento(s) de tipo ${judgment.factEventTypes.join(', ')}, pero ninguno aporta valor en el campo '${readFieldName}'.`
    : `No hay ningún hecho observado para ${definition.id}: no ha llegado ningún evento de tipo ${judgment.factEventTypes.join(', ')}.`;

  // Caso 1: ni hecho ni parámetro.
  if (
    !observedFacts.length &&
    reference.kind === 'SIN_PARAMETRO'
  ) {
    return buildResult(
      'NO_EVALUABLE',
      [
        missingFactsMotive,
        reference.reason,
        'Sin hecho observado y sin parámetro de referencia no se puede afirmar ni negar el cumplimiento.',
      ],
      factEvents[0],
      // Faltan las dos cosas, pero solo una desbloquea: sin el parámetro no hay
      // veredicto ni aunque llegue el hecho, así que la acción es configurarlo.
      'CONFIGURATION'
    );
  }

  // Caso 2: hay hecho, pero no hay parámetro contra el que contrastarlo. Nunca
  // un veredicto: sin la referencia configurada, el hecho no dice nada.
  if (reference.kind === 'SIN_PARAMETRO') {
    return buildResult(
      'NO_EVALUABLE',
      [
        reference.reason,
        `Se han observado ${observedFacts.length} hecho(s) (${describeFacts(observedFacts)}), pero sin el valor de referencia no se puede afirmar ni negar el cumplimiento.`,
      ],
      observedFacts[0]?.event,
      'CONFIGURATION'
    );
  }

  // Caso 3: hay parámetro, pero no se ha observado ningún hecho. Es donde vive
  // la tentación del falso verde: «no se ha visto nada malo, luego cumple». Solo
  // deja de serlo cuando consta que el recolector ejecutó y cubrió la ventana.
  if (!observedFacts.length) {
    const coverage = resolveCollectorCoverage(
      definition,
      judgment,
      events,
      now
    );

    const coverageMotive = `Cobertura del recolector: ${coverage.coverage}. ${coverage.reason}`;

    // Solo la aserción NEGATIVA puede cumplirse por ausencia. «Ninguno de los
    // hechos observados está en la lista» sigue siendo cierto con cero hechos
    // observados, siempre que conste que se ha mirado — es literalmente lo que
    // acredita EV-03: nadie se autenticó con una cuenta prohibida.
    //
    // Las demás no: «todos los hechos observados están en la lista», «ningún
    // valor observado supera el umbral», «hay un hecho reciente» y «cada hecho
    // casa con su fila» son afirmaciones POSITIVAS sobre un sistema del que no
    // se ha observado nada. Que sean vacuamente ciertas en lógica no las hace
    // ciertas en una auditoría: cero copias de seguridad observadas no acredita
    // que las copias se hagan a tiempo. Se quedan en NO_EVALUABLE aunque la
    // cobertura esté confirmada.
    //
    // La segunda que sí cumple por ausencia es `NINGUNO_FUERA_DE_LISTA`, y por
    // qué merece la pena distinguirla de `TODOS_EN_LISTA` —con la que comparte
    // la comparación exacta— es la decisión de diseño de todo este fichero: no
    // es la comparación lo que cambia, es QUÉ ES EL HECHO. Los hechos de
    // `TODOS_EN_LISTA` ACREDITAN algo que existe en la máquina (una cuenta
    // activa, un acceso al repositorio), y no observar ninguno es no haber
    // mirado. Los de `NINGUNO_FUERA_DE_LISTA` son HALLAZGOS de un barrido (un
    // binario SUID, un recurso world-writable, una elevación de privilegio), y
    // no encontrar ninguno es el resultado normal de una máquina sana. Obligar
    // a las cuatro evidencias de barrido a un NO_EVALUABLE permanente para no
    // duplicar una comparación de tres líneas convertiría el gris en el color
    // de una máquina correcta, y el gris cuenta en contra desde el 04/08.
    const admiteCumplimientoPorAusencia =
      judgment.primitive === 'NINGUNO_EN_LISTA' ||
      judgment.primitive ===
        'NINGUNO_FUERA_DE_LISTA';

    // Ni siquiera con cobertura confirmada: si llegaron eventos de hecho que no
    // se han podido leer, no se ha observado «nada», se ha observado algo
    // ilegible. Afirmar cumplimiento sería afirmar sobre lo que falta.
    if (
      coverage.coverage === 'CONFIRMADA' &&
      admiteCumplimientoPorAusencia &&
      !unusableFactEvents.length
    ) {
      return buildResult(
        'CUMPLE',
        [
          coverageMotive,
          judgment.primitive ===
          'NINGUNO_FUERA_DE_LISTA'
            ? `No se ha observado ningún hecho de tipo ${judgment.factEventTypes.join(', ')} en la ventana evaluada, y consta que el recolector barrió: no hay ningún hallazgo que contrastar con ${parameterLabel}.`
            : `No se ha observado ningún hecho de tipo ${judgment.factEventTypes.join(', ')} en la ventana evaluada, y consta que el recolector miró: ningún valor de la lista del parámetro ${parameterLabel} se ha producido.`,
        ],
        coverage.event
      );
    }

    return buildResult(
      'NO_EVALUABLE',
      [
        missingFactsMotive,
        coverageMotive,
        ...(coverage.coverage === 'CONFIRMADA' &&
        !admiteCumplimientoPorAusencia
          ? [
              `La primitiva ${judgment.primitive} afirma algo sobre los hechos observados, así que no puede acreditarse sin observar ninguno, ni siquiera con la cobertura confirmada.`,
            ]
          : []),
        ...(coverage.coverage === 'CONFIRMADA' &&
        unusableFactEvents.length
          ? [
              `La cobertura está confirmada, pero ${unusableFactEvents.length} evento(s) de hecho no se han podido interpretar, así que lo observado no está vacío: está incompleto.`,
            ]
          : []),
        ...unusableFactEvents
          .slice(0, 1)
          .map(
            unusable =>
              `Último evento descartado ${unusable.event.id}: ${unusable.reason}.`
          ),
      ],
      factEvents[0] || coverage.event,
      // ÉSTE es el caso del agente caído: no hay hechos y el latido no consta.
      // La causa es de RECOGIDA y no un hallazgo sobre la máquina. Si llegaron
      // eventos de hecho ilegibles, entonces sí llegó algo y la culpa es del
      // productor de la evidencia, no de la recogida.
      unusableFactEvents.length ? 'EVIDENCE' : 'COLLECTION'
    );
  }

  // Caso 4: hecho observado y parámetro válido. Aquí sí hay veredicto.

  // ANTIGUEDAD_MAXIMA sale por su propio camino porque es la única primitiva
  // EXISTENCIAL: a las demás les incumple UN hecho, a ésta le CUMPLE uno. «La
  // última copia no puede ser más vieja que 24 h» se satisface con una copia
  // reciente, aunque haya otras cien antiguas — que las haya es lo normal.
  //
  // Y por eso mide contra el reloj y no contra un número que traiga el agente
  // ya restado: un evento que dijera `horas_desde_la_copia: 2` seguiría diciendo
  // 2 dentro de un mes, y afirmaría cumplimiento con el agente apagado. Aquí el
  // hecho es el INSTANTE de la copia, y su antigüedad crece sola hasta que el
  // veredicto se cae, que es lo que un auditor espera.
  if (reference.kind === 'VENTANA') {
    const windowMs =
      reference.hours * 60 * 60 * 1000;

    const nowMs = now.getTime();

    const readable: {
      fact: ENSObservedFact;
      timestamp: number;
    }[] = [];

    const unreadable: ENSObservedFact[] = [];
    const fromTheFuture: ENSObservedFact[] = [];

    observedFacts.forEach(fact => {
      const timestamp = parseTimestamp(fact.text);

      if (timestamp === undefined) {
        unreadable.push(fact);

        return;
      }

      // Misma cota superior y mismo motivo que el latido del recolector: un
      // hecho fechado por delante del reloj no demuestra nada, y sin esta cota
      // un `2099` dejaría la evidencia en verde para siempre.
      if (
        timestamp >
        nowMs + COLLECTOR_RUN_FUTURE_TOLERANCE_MS
      ) {
        fromTheFuture.push(fact);

        return;
      }

      readable.push({ fact, timestamp });
    });

    const mostRecent = readable.sort(
      (a, b) => b.timestamp - a.timestamp
    )[0];

    if (!mostRecent) {
      return buildResult(
        'NO_EVALUABLE',
        [
          `Ninguno de los ${observedFacts.length} hecho(s) observado(s) trae una marca de tiempo utilizable en '${judgment.factField}'${fromTheFuture.length ? ` (${fromTheFuture.length} viene(n) fechado(s) por delante del reloj: ${describeFacts(fromTheFuture)})` : ''}, así que no se puede medir su antigüedad contra ${reference.description}.`,
        ],
        observedFacts[0].event,
        'EVIDENCE'
      );
    }

    const ageHours =
      (nowMs - mostRecent.timestamp) /
      (60 * 60 * 1000);

    if (nowMs - mostRecent.timestamp > windowMs) {
      return buildResult(
        'NO_CUMPLE',
        [
          `El hecho más reciente es de ${mostRecent.fact.text} (${ageHours.toFixed(1)} h), y ${reference.description} admite como mucho ${reference.hours} h.`,
        ],
        mostRecent.fact.event
      );
    }

    return buildResult(
      'CUMPLE',
      [
        `El hecho más reciente es de ${mostRecent.fact.text} (${ageHours.toFixed(1)} h), dentro de ${reference.description} (${reference.hours} h).`,
        ...(fromTheFuture.length
          ? [
              `Se han descartado ${fromTheFuture.length} hecho(s) fechado(s) por delante del reloj (${describeFacts(fromTheFuture)}): un reloj desviado no acredita nada.`,
            ]
          : []),
        ...(unreadable.length ||
        unusableFactEvents.length
          ? [
              // A diferencia de las primitivas universales, aquí un hecho
              // ilegible NO tumba el cumplimiento: la afirmación es existencial
              // y el testigo que la sostiene ya está identificado. Exigir que
              // TODOS los eventos fueran legibles convertiría en gris a
              // cualquier máquina con una copia antigua mal formada, teniendo
              // delante una copia reciente y correcta. Se dice cuántos se han
              // descartado para que el auditor lo vea.
              `Se han descartado ${unreadable.length + unusableFactEvents.length} hecho(s) sin marca de tiempo legible; el veredicto se sostiene sobre el que sí la trae.`,
            ]
          : []),
      ],
      mostRecent.fact.event
    );
  }

  let offenders: ENSObservedFact[] = [];
  let breachMotive = '';
  let complianceMotive = '';
  let undecidableMotive: string | undefined;

  // Qué desbloquea lo que no se ha podido decidir. Por defecto es del productor
  // del hecho (EVIDENCE): un valor que no se puede leer lo arregla el agente.
  // `CONFORME_A_TABLA` lo sube a CONFIGURATION cuando lo que falta es una FILA,
  // por el mismo criterio que el caso «sin parámetro»: sin la decisión escrita
  // no hay veredicto ni aunque el hecho llegue perfecto, así que la acción es
  // declararla en la pantalla y no tocar la máquina.
  let undecidableCause: ENSGapCause = 'EVIDENCE';

  if (reference.kind === 'UMBRAL') {
    const threshold = reference.threshold;

    const isMaximum =
      judgment.primitive === 'UMBRAL_MAXIMO';

    offenders = observedFacts.filter(fact => {
      const observed = toFiniteNumber(fact.text);

      if (observed === undefined) {
        return false;
      }

      return isMaximum
        ? observed > threshold
        : observed < threshold;
    });

    const unreadable = observedFacts.filter(
      fact =>
        toFiniteNumber(fact.text) === undefined
    );

    breachMotive = isMaximum
      ? `Se ha observado ${describeFacts(offenders)}, que supera el máximo ${threshold} definido en el parámetro ${reference.description}.`
      : `Se ha observado ${describeFacts(offenders)}, que no llega al mínimo ${threshold} definido en el parámetro ${reference.description}.`;

    complianceMotive = isMaximum
      ? `Ninguno de los ${observedFacts.length} valor(es) observado(s) supera el máximo ${threshold} definido en el parámetro ${reference.description}.`
      : `Ninguno de los ${observedFacts.length} valor(es) observado(s) queda por debajo del mínimo ${threshold} definido en el parámetro ${reference.description}.`;

    if (unreadable.length) {
      undecidableMotive = `No se puede interpretar como número ${describeFacts(unreadable)}, así que no cabe afirmar que el umbral se respeta.`;
    }
  } else if (reference.kind === 'TABLA') {
    const keyColumns = judgment.tableKeyColumns?.length
      ? judgment.tableKeyColumns
      : [judgment.tableKeyColumn || ''];

    const checks = judgment.tableChecks ?? [];

    // Índice por la clave declarada, que puede ser de varias columnas: un mismo
    // sujeto tiene filas para recursos distintos. Si la política repite la
    // MISMA clave entera, manda la última fila: es lo que ve el auditor al
    // final de la rejilla.
    const rowsByKey = new Map<
      string,
      Record<string, string>
    >();

    reference.rows.forEach(row => {
      const parts = keyColumns.map(column =>
        normalizeStrict(row[column] ?? '')
      );

      if (parts.every(part => part)) {
        rowsByKey.set(parts.join(' | '), row);
      }
    });

    const columnsByName = new Map(
      reference.columns.map(column => [
        column.name,
        column,
      ])
    );

    const breaches: string[] = [];
    const undecidables: string[] = [];

    // Lo que no se ha podido decidir porque falta POLÍTICA, no porque falte
    // dato. Se cuenta aparte porque decide la acción de la no conformidad.
    let policyGaps = 0;

    observedFacts.forEach(fact => {
      const row = rowsByKey.get(
        normalizeStrict(fact.key ?? '')
      );

      // Sin fila NO hay incumplimiento demostrado: hay una decisión que nadie ha
      // escrito. El motor no puede afirmar que un modo 777 esté mal si la
      // política no dice cuál debía ser. Sale NO_EVALUABLE con causa
      // CONFIGURATION —que bajo el criterio del 04/08 cuenta igual en contra—,
      // y así la tabla de evidencias sigue distinguiendo «se midió y falló» de
      // «nunca hubo contra qué medir», que es justo lo que el responsable pidió
      // conservar.
      if (!row) {
        policyGaps += 1;

        undecidables.push(
          `'${fact.text}' no figura en ${reference.description}: no hay decisión declarada contra la que contrastarlo`
        );

        return;
      }

      let judgedAxes = 0;
      let failed = false;

      checks.forEach(check => {
        const cell = normalizeStrict(
          row[check.column] ?? ''
        );

        // Celda vacía = ese eje no se declara. Es el contrato escrito de P-08:
        // «propietario y ACL se pueden dejar vacíos cuando ese eje no se
        // declara». No se juzga y se dice.
        if (!cell) {
          return;
        }

        const observed =
          fact.values?.[check.column];

        if (observed === undefined) {
          undecidables.push(
            `de '${fact.text}' la política declara ${check.column}='${cell}' y el hecho no trae el campo '${check.factField}'`
          );

          return;
        }

        judgedAxes += 1;

        const column = columnsByName.get(
          check.column
        );

        const verdict = cellMatches(
          observed,
          cell,
          column
        );

        if (verdict === undefined) {
          undecidables.push(
            `de '${fact.text}', ${check.column}='${observed}' no se puede comparar con la política '${cell}'`
          );

          judgedAxes -= 1;

          return;
        }

        if (!verdict) {
          failed = true;

          breaches.push(
            `'${fact.text}' tiene ${check.column}='${observed}' y ${reference.description} declara '${cell}'`
          );
        }
      });

      if (failed) {
        offenders.push(fact);

        return;
      }

      // Una fila que no declara ni un eje de los contrastados no acredita nada:
      // el recurso está en la política, pero la política no dice nada de él.
      if (!judgedAxes) {
        policyGaps += 1;

        undecidables.push(
          `de '${fact.text}' la política no declara ninguno de los ejes contrastados (${checks.map(check => check.column).join(', ')})`
        );
      }
    });

    if (policyGaps) {
      undecidableCause = 'CONFIGURATION';
    }

    breachMotive = `Se ha observado que ${breaches.slice(0, 5).join('; ')}${breaches.length > 5 ? ` y ${breaches.length - 5} desviación(es) más` : ''}.`;

    complianceMotive = `Los ${observedFacts.length} recurso(s) observado(s) casan con su fila de ${reference.description} en todos los ejes declarados (${checks.map(check => check.column).join(', ')}).`;

    if (undecidables.length) {
      undecidableMotive = `No se ha podido contrastar: ${undecidables.slice(0, 5).join('; ')}${undecidables.length > 5 ? ` y ${undecidables.length - 5} caso(s) más` : ''}.`;
    }
  } else {
    // NINGUNO_EN_LISTA incumple con lo que SÍ está en la lista; TODOS_EN_LISTA y
    // NINGUNO_FUERA_DE_LISTA, con lo que NO está.
    const mustBeInList =
      judgment.primitive !== 'NINGUNO_EN_LISTA';

    // Ver la nota de las dos reglas de mayúsculas, arriba: contra una lista
    // autorizada se compara literal, o 'Admin' pasaría por el 'admin' que el
    // responsable autorizó.
    const compare = mustBeInList
      ? normalizeStrict
      : normalizeForComparison;

    const normalizedReference = reference.values.map(
      compare
    );

    offenders = observedFacts.filter(
      fact =>
        (reference.matches
          ? reference.matches(fact.text)
          : normalizedReference.includes(compare(fact.text))) !== mustBeInList
    );

    breachMotive = mustBeInList
      ? `Se ha observado ${describeFacts(offenders)}, que no figura en ${reference.description}.`
      : `Se ha observado ${describeFacts(offenders)}, que figura en ${reference.description}.`;

    complianceMotive =
      judgment.primitive ===
      'NINGUNO_FUERA_DE_LISTA'
        ? `Ninguno de los ${observedFacts.length} hallazgo(s) del barrido queda fuera de ${reference.description}.`
        : mustBeInList
          ? `Los ${observedFacts.length} hecho(s) observado(s) figuran todos en ${reference.description}.`
          : `Ninguno de los ${observedFacts.length} hecho(s) observado(s) figura en ${reference.description}.`;
  }

  if (offenders.length) {
    return buildResult(
      'NO_CUMPLE',
      [breachMotive],
      offenders[0].event
    );
  }

  if (undecidableMotive) {
    return buildResult(
      'NO_EVALUABLE',
      [undecidableMotive],
      observedFacts[0].event,
      undecidableCause
    );
  }

  // No basta con que lo observado no incumpla: si además hay eventos de hecho
  // que no se han podido leer, lo observado está incompleto y afirmar
  // cumplimiento sería afirmar sobre lo que falta.
  if (unusableFactEvents.length) {
    return buildResult(
      'NO_EVALUABLE',
      [
        `${unusableFactEvents.length} evento(s) de hecho no se han podido interpretar (último, ${unusableFactEvents[0].event.id}: ${unusableFactEvents[0].reason}), así que lo observado está incompleto y no cabe afirmar cumplimiento.`,
      ],
      observedFacts[0].event,
      'EVIDENCE'
    );
  }

  return buildResult(
    'CUMPLE',
    [complianceMotive],
    observedFacts[0].event
  );
};
