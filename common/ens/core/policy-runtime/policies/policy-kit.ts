// Helpers shared by the imperative policies: measurement of an evidence, combination, fact reading,
// screen parameter tables.
// Import by file path, never through a barrel (it brings back the Settings TDZ cycle); only types
// and the parameter validator live here.
// Invariants (as in `evidence/judgment.ts`): ages are measured against `context.now`; no fact or
// parameter is NO_EVALUABLE with reason and cause, never CUMPLE by absence; what the collector
// declares unmeasurable keeps its own reason and cause; no default deadline, threshold or list is
// invented here.
import type { ENSPolicyContext, ENSPolicyDecision, ENSReasonPart } from '../types';
import type { ENSComplianceStatus, ENSGapCause } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

// Default freshness of a state fact: collectors re-emit the whole state each run and 26 h tolerates
// a day of failures. Observation tolerance, not policy.
export const FRESHNESS_HOURS = 26;

// A fact from the future proves nothing (same clock tolerance as the heartbeat).
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Facts of one run are emitted within a few seconds.
export const SAME_RUN_WINDOW_MS = 5 * 60 * 1000;


// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`).
export type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL'>;
  motivo: string;
  causa?: ENSGapCause;
};

export const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
export const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough. Missing parameter and missing facts say
// so explicitly; what the collector declares carries its own cause.
export const notMeasured = (motive: string, cause: ENSGapCause = 'EVIDENCE'): Measurement => ({
  estado: 'NO_EVALUABLE',
  motivo: motive,
  causa: cause,
});
export const notApplicable = (motive: string): Measurement => ({ estado: 'NO_APLICA', motivo: motive });

// Cause of several unmeasured measurements, same order as the engine (`resolveGapCause`):
// COLLECTION only if all say so, CONFIGURATION if any does, otherwise EVIDENCE.
export const commonGapCause = (measurements: Measurement[]): ENSGapCause | undefined => {
  const causes = measurements
    .filter(m => m.estado === 'NO_EVALUABLE')
    .map(m => m.causa || 'EVIDENCE');

  if (!causes.length) {
    return undefined;
  }

  if (causes.every(c => c === 'COLLECTION')) {
    return 'COLLECTION';
  }

  return causes.includes('CONFIGURATION') ? 'CONFIGURATION' : 'EVIDENCE';
};

const SEVERITY: Record<Measurement['estado'], number> = {
  NO_APLICA: -1,
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

// Worst status; NO_APLICA only if all are. No measurement proves nothing: NO_EVALUABLE, never
// CUMPLE by emptiness.
export const worstStatus = (measurements: Measurement[]): Measurement['estado'] => {
  if (!measurements.length) {
    return 'NO_EVALUABLE';
  }

  if (measurements.every(m => m.estado === 'NO_APLICA')) {
    return 'NO_APLICA';
  }

  return measurements.reduce<Measurement['estado']>(
    (actual, measurement) =>
      SEVERITY[measurement.estado] > SEVERITY[actual] ? measurement.estado : actual,
    'CUMPLE'
  );
};

// Several axes of one evidence into one measurement: worst status, with the reason that explains it
// (what fails or is missing; if all comply, what was measured).
export const combineMeasurements = (partes: Measurement[]): Measurement => {
  if (!partes.length) {
    return notMeasured('No hay ninguna medida que juzgar.');
  }

  const status = worstStatus(partes);

  if (status === 'CUMPLE' || status === 'NO_APLICA') {
    return { estado: status, motivo: partes.map(p => p.motivo).join(' ') };
  }

  const owners = partes.filter(p => p.estado === status);
  const also = partes
    .filter(p => p.estado !== status && p.estado !== 'CUMPLE' && p.estado !== 'NO_APLICA')
    .map(p => p.motivo);

  return {
    estado: status,
    motivo: [...owners.map(p => p.motivo), ...(also.length ? [`Además: ${also.join(' ')}`] : [])].join(' '),
    ...(status === 'NO_EVALUABLE' ? { causa: commonGapCause(owners) } : {}),
  };
};

// Reason of a requirement measured by several evidences: `<ID> <STATUS>: <reason>` joined by ` | `
// and also split (`reasonParts`) so the screen need not guess the cuts.
export const compositeReason = (own: { id: string; medida: Measurement }[]): string =>
  own.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`).join(' | ');

const ALSO = 'Además: ';

export const reasonPartsOf = (own: { id: string; medida: Measurement }[]): ENSReasonPart[] =>
  own.map(p => {
    const motive = p.medida.motivo;
    // Same as the screen parser: at the start, or after a space with something before (from
    // position 1).
    const cutoff = motive.startsWith(ALSO) ? 0 : motive.indexOf(` ${ALSO}`, 1);
    const principal = cutoff < 0 ? motive : motive.slice(0, cutoff);
    const secondary = cutoff < 0 ? undefined : motive.slice(cutoff + (cutoff === 0 ? 0 : 1) + ALSO.length);
    return {
      evidenceId: p.id,
      status: p.medida.estado,
      text: principal,
      ...(p.medida.causa && p.medida.estado === 'NO_EVALUABLE' ? { cause: p.medida.causa } : {}),
      ...(secondary !== undefined ? { secondary: [secondary] } : {}),
    };
  });

// The decision with its parts.
export const withReasonParts = (decision: ENSPolicyDecision, partes: ENSReasonPart[]): ENSPolicyDecision => ({
  ...decision,
  reasonParts: partes,
});


export const factField = (event: ENSNormalizedEvent, name: string): string => {
  const value =
    event.attributes && Object.prototype.hasOwnProperty.call(event.attributes, name)
      ? event.attributes[name]
      : undefined;

  return value === undefined || value === null ? '' : String(value).trim();
};

export const parseNumber = (text: string): number | undefined => {
  const clean = String(text).trim().replace(',', '.');

  if (!/^[+-]?\d+(\.\d+)?$/.test(clean)) {
    return undefined;
  }

  const value = Number(clean);

  return Number.isFinite(value) ? value : undefined;
};

export const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return undefined;
  }

  const value = new Date(text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

export const eventTime = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isNaN(t) ? 0 : t;
};

export const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');

export const formatHours = (ms: number): string => (ms / HOUR_MS).toFixed(1);

export const wholeDays = (ms: number): number => Math.floor(ms / DAY_MS);

export const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

export const stripAccents = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

// A field the collector leaves empty or as `-` (nothing there).
export const isEmptyField = (text: string): boolean => !text || text === '-';

export const equalsIgnoreCase = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();


export interface ENSFactReader {
  hechos: (context: ENSPolicyContext, type: string) => ENSNormalizedEvent[];
  validos: (context: ENSPolicyContext, type: string, now: number) => ENSNormalizedEvent[];
  estadoVigente: (
    context: ENSPolicyContext,
    type: string,
    now: number
  ) => { vigentes: ENSNormalizedEvent[]; ultimo?: number };
  degradacion: (
    context: ENSPolicyContext,
    evidence: string,
    now: number,
    afterOf?: number
  ) => Measurement | undefined;
  sinHechos: (
    context: ENSPolicyContext,
    evidence: string,
    now: number,
    last: number | undefined,
    whatIsMissing: string
  ) => Measurement;
  conDegradacion: (
    context: ENSPolicyContext,
    now: number,
    evidence: string,
    type: string,
    measurement: Measurement
  ) => Measurement;
}

// Reading of the facts of ONE control; `recolector` names who is not reporting in the reasons.
export const createFactReader = (
  control: string,
  options: { recolector: string; frescuraHoras?: number }
): ENSFactReader => {
  const freshness = (options.frescuraHoras ?? FRESHNESS_HOURS) * HOUR_MS;
  const freshnessHours = options.frescuraHoras ?? FRESHNESS_HOURS;

  // The normalizer splits an event with `evidence_id=A,B` into one per evidence (`<id>#A`,
  // `<id>#B`); here the FACT is judged, so it counts once.
  const facts = (context: ENSPolicyContext, type: string): ENSNormalizedEvent[] => {
    const seen = new Set<string>();

    return context.events.filter(event => {
      if (event.controlId !== control || event.eventType !== type) {
        return false;
      }

      const base = String(event.id || '').split('#')[0];

      if (seen.has(base)) {
        return false;
      }

      seen.add(base);

      return true;
    });
  };

  // Valid facts of a type (no future ones), oldest first.
  const valid = (context: ENSPolicyContext, type: string, now: number): ENSNormalizedEvent[] =>
    facts(context, type)
      .filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS)
      .sort((a, b) => eventTime(a) - eventTime(b));

  // State facts of the LAST run that emitted them, without future ones. If the last is older than
  // the freshness they do not describe today.
  const currentStatus = (
    context: ENSPolicyContext,
    type: string,
    now: number
  ): { vigentes: ENSNormalizedEvent[]; ultimo?: number } => {
    const all = valid(context, type, now);

    if (!all.length) {
      return { vigentes: [] };
    }

    const last = eventTime(all[all.length - 1]);

    if (now - last > freshness) {
      return { vigentes: [], ultimo: last };
    }

    // The last run: what was emitted in the hour before the last fact.
    return {
      vigentes: all.filter(e => last - eventTime(e) < HOUR_MS),
      ultimo: last,
    };
  };

  // What the collector declared it could not measure for an evidence, if newer than `after`, with
  // its declared cause (COLLECTION if none). Same freshness as facts.
  const degradation = (
    context: ENSPolicyContext,
    evidence: string,
    now: number,
    afterOf = 0
  ): Measurement | undefined => {
    const since = Math.max(afterOf, now - freshness);
    const last = facts(context, 'evidence_state')
      .filter(
        e =>
          factField(e, 'evidence_id').split(',').map(x => x.trim()).includes(evidence) &&
          String(e.status || factField(e, 'estado')).toUpperCase() === 'NO_EVALUABLE' &&
          eventTime(e) >= since &&
          eventTime(e) <= now + FUTURE_TOLERANCE_MS
      )
      .sort((a, b) => eventTime(b) - eventTime(a))[0];

    if (!last) {
      return undefined;
    }

    const declared = factField(last, 'causa').toUpperCase();
    const cause: ENSGapCause = ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declared)
      ? (declared as ENSGapCause)
      : 'COLLECTION';

    return notMeasured(
      `El recolector no ha podido medirlo${declared ? ` (${declared})` : ''}: ${factField(last, 'motivo') || 'sin motivo declarado'}.`,
      cause
    );
  };

  const withoutFacts = (
    context: ENSPolicyContext,
    evidence: string,
    now: number,
    last: number | undefined,
    whatIsMissing: string
  ): Measurement =>
    degradation(context, evidence, now) ||
    notMeasured(
      last
        ? `El último ${whatIsMissing} es de ${iso(last)}, hace más de ${freshnessHours} h: ${options.recolector} no está informando.`
        : `No consta ningún ${whatIsMissing}: ${options.recolector} no está desplegado o no informa.`,
      'COLLECTION'
    );

  // What the collector declared unmeasurable AFTER the last fact is COMBINED with what was
  // measured, not substituted: a measured NO_CUMPLE still wins and what complied stops complying
  // (NO_EVALUABLE with the collector's cause). Without current facts `sinHechos` already says it.
  const withDegradation = (
    context: ENSPolicyContext,
    now: number,
    evidence: string,
    type: string,
    measurement: Measurement
  ): Measurement => {
    const { vigentes: current, ultimo: last } = currentStatus(context, type, now);

    if (!current.length || last === undefined) {
      return measurement;
    }

    const deg = degradation(context, evidence, now, last + 1);

    return deg ? combineMeasurements([measurement, deg]) : measurement;
  };

  return { hechos: facts, validos: valid, estadoVigente: currentStatus, degradacion: degradation, sinHechos: withoutFacts, conDegradacion: withDegradation };
};


export const findParameter = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

export const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// Table rows split into their declared columns. Without columns the position is not guessed: the
// parameter is treated as not configured.
export const tableParameterRows = (
  context: ENSPolicyContext,
  id: string
): Record<string, string>[] | undefined => {
  const p = findParameter(context, id);
  const columns = p?.columns || [];

  if (!p || !columns.length) {
    return undefined;
  }

  const result = toParameterTableRows(p.value)
    .map(row => toTableRowCells(row))
    .filter(cells => cells.some(Boolean))
    .map(cells => {
      const row: Record<string, string> = {};

      columns.forEach((column, i) => {
        row[column.name] = (cells[i] || '').trim();
      });

      return row;
    });

  return result.length ? result : undefined;
};

// A positive scalar (deadline, threshold). Zero or negative is not configured.
export const positiveScalar = (context: ENSPolicyContext, id: string): number | undefined => {
  const value = findParameter(context, id)?.value;

  if (value === undefined || value === null || Array.isArray(value)) {
    return undefined;
  }

  const n = parseNumber(String(value));

  return n !== undefined && n > 0 ? n : undefined;
};

export const missingParameter = (context: ENSPolicyContext, id: string, purpose: string): Measurement =>
  notMeasured(`${parameterDisplayName(context, id)} está sin configurar: no hay contra qué juzgar ${purpose}.`, 'CONFIGURATION');


export type ENSDecisionRuleType = ENSPolicyDecision['trace']['ruleType'];

// A policy decision for `policyId`. `acreditado` marks a CUMPLE as documentary (`attested`); with
// another status it marks nothing.
export const decisionBuilderFor = (policyId: string) => (
  requirement: string,
  status: Measurement['estado'],
  evidences: string[],
  parameters: string[],
  type: ENSDecisionRuleType,
  ruleId: string,
  motive: string,
  expected: string,
  cause?: ENSGapCause,
  accredited = false
): ENSPolicyDecision => ({
  policyId,
  requirementId: requirement,
  status: status,
  parameterIds: parameters,
  evidenceIds: evidences,
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId,
    ruleType: type,
    expression: expected,
    expected: expected,
    actual: status,
    result: status === 'CUMPLE',
  },
  reason: motive,
  ...(status === 'NO_EVALUABLE' && cause ? { cause: cause } : {}),
  ...(accredited && status === 'CUMPLE' ? { attested: true } : {}),
});
