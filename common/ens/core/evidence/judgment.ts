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

// The engine judges the evidence; the agent only supplies the raw fact. This is the single place where "the engine decides this evidence", the same for every control.
//
// Invariant: absence of data never produces an assertion. Without an observed fact or a parameter the result is NO_EVALUABLE with a motive;
// never a false CUMPLE nor a false measured NO_CUMPLE.
// This file decides the OBSERVATION (what could be looked at), not the verdict: an evidence without data stays NO_EVALUABLE with its `gapCause`;
// that it counts against the requirement is decided by `applyAuditVerdict` (`evaluation/utils/verdict.ts`).

// Collector coverage. "The collector ran and found nothing" differs from the collector not having run:
// NINGUNO_EN_LISTA with CONFIRMED coverage and zero facts is CUMPLE; with UNKNOWN or ABSENT coverage the same case is a false green and stays NO_EVALUABLE.
export type ENSCollectorCoverage =
  | 'CONFIRMADA'
  | 'AUSENTE'
  | 'DESCONOCIDA';

export interface ENSCollectorCoverageResult {
  coverage: ENSCollectorCoverage;

  // The motive is ALWAYS present, even when coverage is confirmed: it tells the auditor which heartbeat a CUMPLE rests on.
  reason: string;

  // Heartbeat the answer rests on, for the trace.
  event?: ENSNormalizedEvent;
}

const DEFAULT_COLLECTOR_RUN_EVENT_TYPES = [
  'collector_run',
];

const DEFAULT_COLLECTOR_RUN_MAX_AGE_HOURS = 24;

// UPPER bound of the window. A heartbeat cannot come from the future (skewed clock or tampered data); without this bound a `collector_run` dated 2099
// would be a perpetual heartbeat. Same margin and criterion as the agent in `ens_opacc1_score.py` (MARGEN_FUTURO): both sides must treat an advanced ts alike.
const COLLECTOR_RUN_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Heartbeat fields. Not declared per evidence in the catalog on purpose: they are the agent-engine contract, identical for every control.
const COLLECTOR_RUN_RESULT_FIELD = 'resultado';

const COLLECTOR_RUN_SUCCESS_VALUES = [
  'completada',
];

// Whitelist of evidences THAT pass managed to look at; not the same as those it emitted something for, since a negative-assertion evidence legitimately stays silent.
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

// A heartbeat of the same control and agent (already filtered by `resolveEvidenceForControl`), with a successful run, covering the evaluated window and declaring this evidence: CONFIRMED;
// one declaring failure or declaring it did NOT cover this evidence: ABSENT; none that says anything: UNKNOWN.
// CONFIRMED must be EARNED: a heartbeat that does not declare its result or what it looked at only proves an older collector.
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
        // The heartbeat belongs to no evidence in particular; if one is tagged, it counts only for its own.
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

// Parameter reading.

// Tolerates the legacy string form (hand-written strings from before the form could edit lists). Split by newlines and commas, as
// `configuration/form-engine/renderers/list-parameter-renderer.tsx` does (engine and screen must read the stored value alike), and NEVER by `|`,
// which separates the fields of one element ('srv-dc01 | Windows').
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

// Reading a TABLE parameter. `parseReferenceList` does not fit: it splits by commas and a `multiselect` cell ('lectura,escritura') contains commas.
// Two steps: ROWS are the array elements (or lines, for a string), never split by commas; CELLS are split by `|`.
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

// A raw row ('jgomez | srv01 | ops') spread across the declared columns. Missing cells stay empty (that axis is not declared); extra ones are dropped.
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

// Value comparison. TWO case rules, deciding the direction in which the engine errs:
// - Against a FORBIDDEN list (`NINGUNO_EN_LISTA`) case-insensitive: errs towards an extra NO_CUMPLE, never a false CUMPLE.
// - Against an AUTHORISED list or a table cell, case-SENSITIVE: 'Admin' and 'admin' are different Linux accounts, and merging them would authorise an account nobody authorised.
//   P-07 and P-09 state it in their own description.
const normalizeForComparison = (
  value: unknown
): string =>
  String(value)
    .trim()
    .toLowerCase();

const normalizeStrict = (
  value: unknown
): string => String(value).trim();

// Octal mode as a number. Tolerates the leading zero and rejects anything but octal digits.
const toOctalMode = (
  value: unknown
): number | undefined => {
  const text = String(value).trim();

  if (!/^[0-7]{3,4}$/.test(text)) {
    return undefined;
  }

  return parseInt(text, 8);
};

// "The observed mode grants no permission the declared one does not." Not equality: a more restrictive resource creates no risk.
const grantsNothingExtra = (
  observed: number,
  declared: number
): boolean => (observed & ~declared) === 0;

// `multiselect` cell: inside the cell the comma separates values.
const splitCellOptions = (
  cell: string
): string[] =>
  cell
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);

// Does the observed value match what the policy declares in THAT cell? `undefined` means "cannot compare", not "does not match": the axis stays undecided and the result is NO_EVALUABLE.
// The comparison is chosen by the COLUMN TYPE the parameter already declares, so no per-evidence special cases exist.
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
      // What is really compared: the whole list or one column of it. Goes in the reference so the auditor's motive says it.
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

// Hours per unit of each parameter type. The deadline unit comes from the parameter TYPE, not a separate catalog declaration that could disagree.
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

// The list to compare against. Three cases:
// - no `columns` (or one): flat list, as before (op.acc.1 P-04 enters here);
// - two or more columns with `parameterColumn`: that column of each row is projected;
// - two or more columns without `parameterColumn`: nothing is compared (the whole row would be a silent failure, and defaulting to the first column the same failure postponed).
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

// `defaultValue` is never used: judging against a value the auditor did not set is a lying screen.
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

  // A margin only means something added to a number or deadline. Declaring it on a list primitive is a catalog error and is reported, not ignored.
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

  // Missing or empty margin: applied without margin, the STRICT extreme (a shorter window never yields a CUMPLE the margin window would not). An unreadable margin is not guessed.
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

// Reading the raw facts.

interface ENSObservedFact {
  event: ENSNormalizedEvent;
  text: string;

  // Only in `CONFORME_A_TABLA`: the key that looks up its row and what the agent observed on each contrasted axis.
  key?: string;
  values?: Record<string, string>;
}

interface ENSUnusableFactEvent {
  event: ENSNormalizedEvent;
  reason: string;
}

// Names the facts (which concrete account), deduplicated and cut to five to stay readable.
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

// Judgment.

// `now` is a parameter so the clock can be frozen: the heartbeat is measured against a window with two bounds, and the future-heartbeat case needs a deterministic test.
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

  // Fact events are ONLY the types in `factEventTypes`. The agent's `evidence_state` does not enter here and its `estado` is never read: once an evidence declares `judgment`, it stops ruling.
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

    // `CONFORME_A_TABLA` reads several fields of one event: the row key and what was observed per axis. An event without key is unreadable; missing axes are resolved below against the row.
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

  // `gapCause` is filled only when the state is NO_EVALUABLE: it is WHY nothing was measured and drives the unevidenced nonconformity's action.
  // No parameter: CONFIGURATION; no heartbeat: COLLECTION; data arrived but unreadable: EVIDENCE.
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

  // Case 1: neither fact nor parameter.
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
      // Both are missing but only one unblocks: without the parameter there is no verdict even if the fact arrives, so the action is to configure it.
      'CONFIGURATION'
    );
  }

  // Case 2: a fact but no parameter to compare against. Never a verdict.
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

  // Case 3: a parameter but no observed fact. The false-green temptation: it stops being one only when the collector is known to have run and covered the window.
  if (!observedFacts.length) {
    const coverage = resolveCollectorCoverage(
      definition,
      judgment,
      events,
      now
    );

    const coverageMotive = `Cobertura del recolector: ${coverage.coverage}. ${coverage.reason}`;

    // Only a NEGATIVE assertion can be met by absence ("none of the observed facts is in the list" holds with zero facts if it was looked at: EV-03).
    // The others ("all observed facts are in the list", "no value exceeds the threshold", "there is a recent fact", "each fact matches its row") are POSITIVE statements about a system nothing was observed of,
    // and stay NO_EVALUABLE even with confirmed coverage.
    // `NINGUNO_FUERA_DE_LISTA` also passes by absence. It differs from `TODOS_EN_LISTA` not in the comparison but in WHAT THE FACT IS: the latter's facts ACCREDIT something that exists
    // (an active account), so observing none is not having looked; the former's are FINDINGS of a sweep (SUID binary, world-writable resource), so finding none is the normal healthy result.
    const allowsComplianceByAbsence =
      judgment.primitive === 'NINGUNO_EN_LISTA' ||
      judgment.primitive ===
        'NINGUNO_FUERA_DE_LISTA';

    // Not even with confirmed coverage: facts that arrived but could not be read mean something unreadable was observed, and asserting compliance would assert about what is missing.
    if (
      coverage.coverage === 'CONFIRMADA' &&
      allowsComplianceByAbsence &&
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
        !allowsComplianceByAbsence
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
      // The fallen-agent case: no facts and no heartbeat. The cause is COLLECTION, not a finding on the machine. If unreadable fact events arrived, the producer of the evidence is at fault.
      unusableFactEvents.length ? 'EVIDENCE' : 'COLLECTION'
    );
  }

  // Case 4: observed fact and valid parameter. This is where a verdict exists.

  // ANTIGUEDAD_MAXIMA has its own path because it is the only EXISTENTIAL primitive: the others fail on ONE fact, this one passes on one. It measures against the clock, not a pre-subtracted number
  // from the agent (which would keep saying 2 a month later with the agent off). The fact is the copy INSTANT and its age grows by itself.
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

      // Same upper bound and reason as the collector heartbeat: a future-dated fact proves nothing.
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
              // Unlike the universal primitives, an unreadable fact does NOT break compliance here: the assertion is existential and its witness is already identified.
              // The number discarded is reported for the auditor.
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

  // What unblocks what could not be decided. By default it belongs to the fact producer (EVIDENCE); `CONFORME_A_TABLA` raises it to CONFIGURATION when a ROW is missing:
  // without the written decision there is no verdict even with a perfect fact.
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

    // Index by the declared key, possibly multi-column (one subject has rows for different resources). If the policy repeats the SAME whole key, the last row wins (what the auditor sees last in the grid).
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

    // What could not be decided because POLICY is missing, not data. Counted apart because it decides the nonconformity action.
    let policyGaps = 0;

    observedFacts.forEach(fact => {
      const row = rowsByKey.get(
        normalizeStrict(fact.key ?? '')
      );

      // No row is NOT a proven failure: it is a decision nobody wrote. The engine cannot say a 777 mode is wrong if the policy does not say what it should be.
      // NO_EVALUABLE with cause CONFIGURATION, so the table still separates "measured and failed" and "nothing to measure against".
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

        // Empty cell = that axis is not declared (P-08 contract: owner and ACL may be left empty). Not judged, and reported.
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

      // A row declaring none of the contrasted axes accredits nothing.
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
    // NINGUNO_EN_LISTA fails with what IS in the list; TODOS_EN_LISTA and NINGUNO_FUERA_DE_LISTA, with what is NOT.
    const mustBeInList =
      judgment.primitive !== 'NINGUNO_EN_LISTA';

    // See the two case rules above: against an authorised list the comparison is literal.
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

  // Not enough that the observed does not fail: with unreadable fact events the observation is incomplete, and asserting compliance would assert about what is missing.
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
