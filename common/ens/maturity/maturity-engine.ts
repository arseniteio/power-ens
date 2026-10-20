// The level the evidence accredits: the highest level whose gates, and those of every level below, all pass
// (CMM levels are cumulative). Each gate says why it passes or fails. The traffic light is not an input: a red or a
// grey never forces L0; only what was not collected limits what the evidence can accredit (L2 and above).
// Pure: the server gives it the result, the days with facts, the snapshots and the records; the screens and the
// tests call it the same way. Recurrence and continuity are asked of every machine that measures the control: one
// that stopped reporting (agent down, collector without heartbeat) holds the control below L2.
import type { ENSControlDefinition } from '../catalog/types';
import type { ENSGlobalConfiguration, ENSLevel } from '../configuration/types';
import type { ENSComplianceResult } from '../core/evaluation/types';
import { resolveControlLevel } from '../core/control-level';
import { isUsableLink } from '../configuration/services/attestation-service';
import { ENS_DEFAULT_REVIEW_PERIOD_DAYS, ENS_MATURITY_FEEDBACK_SOURCES } from './maturity-records';
import type {
  ENSControlMaturity,
  ENSControlMaturityRecord,
  ENSControlMaturitySummary,
  ENSControlSnapshot,
  ENSMaturityDistribution,
  ENSMaturityFeedback,
  ENSMaturityGate,
  ENSMaturityLevel,
  ENSMaturityTargets,
} from './types';

// Every collector runs at least daily (a control without a heartbeat for 24 h is judged without data), so the
// period of a control is one day.
export const ENS_MATURITY_PERIOD_DAYS = 1;
// L2: facts in each of the last N whole days.
export const ENS_MATURITY_RECURRENT_DAYS = 7;
// L5: the trend is read over the last 180 days and needs at least 90 days and 10 snapshots.
export const ENS_MATURITY_TREND_WINDOW_DAYS = 180;
export const ENS_MATURITY_TREND_MIN_SPAN_DAYS = 90;
export const ENS_MATURITY_TREND_MIN_POINTS = 10;

const DAY_MS = 86400e3;

export interface ENSMaturityActivity {
  // Days (YYYY-MM-DD in `timeZone`) with at least one fact of the control in the window, on any machine.
  days: string[];
  // The machines that measure the control and their days: recurrence and continuity are required of each one
  // (a machine that stopped reporting is not hidden by the others). Absent: only `days` is read.
  machines?: { agentId: string; agentName?: string; days: string[] }[];
}

export type ENSMaturityResultInput = Pick<
  ENSComplianceResult,
  | 'status'
  | 'score'
  | 'coverage'
  | 'applicableRequirements'
  | 'measuredRequirements'
  | 'unmeasuredRequirements'
  | 'missingParameters'
  | 'parameters'
  | 'nonConformities'
>;

export interface ENSMaturityInput {
  control: Pick<ENSControlDefinition, 'id' | 'status' | 'levelDimension'>;
  // The organisation's result (consolidated over the scope); undefined while it is computed.
  result?: ENSMaturityResultInput;
  // The control is in the active configuration.
  configured: boolean;
  // undefined: it could not be read.
  activity?: ENSMaturityActivity;
  window: { from: string; to: string };
  timeZone: string;
  record: ENSControlMaturityRecord;
  targets: ENSMaturityTargets;
  ensLevel: ENSLevel;
  global?: Partial<ENSGlobalConfiguration>;
  // Earlier snapshots of the control, any order.
  snapshots: Pick<ENSControlSnapshot, 'date' | 'score'>[];
  now: Date;
}

// --- days -----------------------------------------------------------------------------------------------------

// The zone that decides what a day is: the configuration's, or UTC if it is not an IANA zone.
export const maturityTimeZone = (timeZone?: string): string => {
  try {
    if (timeZone) {
      new Intl.DateTimeFormat('en-CA', { timeZone });
      return timeZone;
    }
  } catch {
    // Not an IANA zone: UTC.
  }
  return 'UTC';
};

// The calendar day of an instant in a zone, YYYY-MM-DD.
export const dayIn = (date: Date, timeZone?: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: maturityTimeZone(timeZone), year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// Whole days of the window: those after the (partial) first day and before today.
export const wholeWindowDays = (window: { from: string }, now: Date, timeZone?: string): string[] => {
  const today = dayIn(now, timeZone);
  const days: string[] = [];
  for (let day = addDays(dayIn(new Date(window.from), timeZone), 1); day < today; day = addDays(day, 1)) days.push(day);
  return days;
};

const listDays = (days: string[], max = 5): string =>
  days.length > max ? `${days.slice(0, max).join(', ')} y ${days.length - max} más` : days.join(', ');

// --- gates ----------------------------------------------------------------------------------------------------

const gate = (
  id: ENSMaturityGate['id'],
  level: ENSMaturityGate['level'],
  origin: ENSMaturityGate['origin'],
  label: string,
  passed: boolean,
  reason: string
): ENSMaturityGate => ({ id, level, origin, label, passed, reason });

// A grey control (nothing could be measured) cannot accredit recurrence or continuity from the evidence.
const greyReason = (result?: ENSMaturityResultInput): string | undefined =>
  result?.status === 'NO_EVALUABLE' ? 'el control no se ha podido medir (gris)' : undefined;

// Each machine (or the whole set when none is given) with the days it lacks among `expected`.
const missingByMachine = (activity: ENSMaturityActivity, expected: string[]): { name: string; missing: string[] }[] => {
  const machines = activity.machines?.length ? activity.machines : [{ agentId: '', agentName: '', days: activity.days }];
  return machines
    .map(machine => {
      const days = new Set(machine.days);
      return { name: machine.agentName || machine.agentId, missing: expected.filter(day => !days.has(day)) };
    })
    .filter(machine => machine.missing.length);
};

const describeMissing = (gaps: { name: string; missing: string[] }[], total: number): string =>
  gaps
    .slice(0, 3)
    .map(gap => `${gap.name ? `${gap.name}: ` : ''}${gap.missing.length} de ${total} días sin hechos (${listDays(gap.missing)})`)
    .join('; ') + (gaps.length > 3 ? `; y ${gaps.length - 3} máquinas más` : '');

export const describeTrend = (
  snapshots: Pick<ENSControlSnapshot, 'date' | 'score'>[],
  now: Date,
  timeZone?: string
): { improving: boolean; reason: string } => {
  const today = dayIn(now, timeZone);
  const since = addDays(today, -ENS_MATURITY_TREND_WINDOW_DAYS);
  const points = snapshots
    .filter(snapshot => typeof snapshot.score === 'number' && snapshot.date >= since && snapshot.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const span = points.length ? daysBetween(points[0].date, points[points.length - 1].date) : 0;
  if (span < ENS_MATURITY_TREND_MIN_SPAN_DAYS || points.length < ENS_MATURITY_TREND_MIN_POINTS) {
    return {
      improving: false,
      reason: `Hacen falta ${ENS_MATURITY_TREND_MIN_SPAN_DAYS} días y ${ENS_MATURITY_TREND_MIN_POINTS} instantáneas diarias; hay ${span} días y ${points.length}.`,
    };
  }
  const middle = addDays(points[0].date, Math.floor(span / 2));
  const mean = (list: typeof points) => list.reduce((sum, point) => sum + (point.score as number), 0) / list.length;
  const first = mean(points.filter(point => point.date <= middle));
  const second = mean(points.filter(point => point.date > middle));
  const round = (value: number) => Math.round(value * 10) / 10;
  const text = `media ${round(first)} % → ${round(second)} % en ${span} días (${points.length} instantáneas)`;
  if (points.every(point => (point.score as number) >= 100)) {
    return { improving: true, reason: `Mantenido en el 100 % durante ${span} días (${points.length} instantáneas).` };
  }
  return second > first + 0.5 ? { improving: true, reason: `Tendencia de mejora: ${text}.` } : { improving: false, reason: `Sin mejora: ${text}.` };
};

// The current state of each feedback entry: the last one written with each reference.
export const currentFeedback = (feedback: ENSMaturityFeedback[]): ENSMaturityFeedback[] => {
  const byReference = new Map<string, ENSMaturityFeedback>();
  feedback.forEach(entry => byReference.set(entry.reference, entry));
  return Array.from(byReference.values());
};

const feedbackGate = (record: ENSControlMaturityRecord, now: Date, timeZone: string): ENSMaturityGate => {
  const label = 'Realimentación cerrada con cambio de procedimiento';
  const today = dayIn(now, timeZone);
  const entries = currentFeedback(record.feedback);
  if (!entries.length) return gate('L5.feedback', 5, 'Doc+D', label, false, 'Sin lecciones ni deficiencias registradas para el control.');
  const closed = entries.filter(entry => entry.closedAt && entry.closedAt <= today);
  if (!closed.length) return gate('L5.feedback', 5, 'Doc+D', label, false, `${entries.length} registradas, ninguna cerrada.`);
  const proven = closed.find(entry =>
    record.attestations.some(attestation => attestation.version === entry.procedureVersion && attestation.approvedAt >= entry.openedAt)
  );
  if (proven) {
    return gate(
      'L5.feedback',
      5,
      'Doc+D',
      label,
      true,
      `${proven.reference} (${ENS_MATURITY_FEEDBACK_SOURCES[proven.source] || proven.source}) cerrada el ${proven.closedAt} con el procedimiento versión ${proven.procedureVersion}.`
    );
  }
  const withoutVersion = closed.filter(entry => !entry.procedureVersion);
  return gate(
    'L5.feedback',
    5,
    'Doc+D',
    label,
    false,
    withoutVersion.length === closed.length
      ? `${closed.length} cerradas sin versión del procedimiento.`
      : 'Ninguna cerrada con una versión del procedimiento aprobada después de su apertura.'
  );
};

const ATTESTATION_FIELDS: Record<string, string> = {
  reference: 'referencia',
  version: 'versión',
  link: 'enlace',
  approvedAt: 'fecha de aprobación',
  validUntil: 'vigencia',
  disseminatedAt: 'fecha de difusión',
  disseminatedTo: 'destinatarios de la difusión',
  owner: 'responsable',
};

const procedureGate = (record: ENSControlMaturityRecord, now: Date, timeZone: string): ENSMaturityGate => {
  const label = 'Procedimiento documentado y difundido';
  const current = record.attestations[record.attestations.length - 1];
  if (!current) return gate('L3.procedure', 3, 'Doc', label, false, 'Sin procedimiento registrado.');
  const today = dayIn(now, timeZone);
  const missing = Object.entries(ATTESTATION_FIELDS)
    .filter(([field]) => !String((current as any)[field] || '').trim())
    .map(([, label]) => label);
  const name = `${current.reference} versión ${current.version}`;
  if (missing.length) return gate('L3.procedure', 3, 'Doc', label, false, `${name} incompleto: falta ${missing.join(', ')}.`);
  if (!isUsableLink(current.link)) return gate('L3.procedure', 3, 'Doc', label, false, `${name} sin enlace utilizable.`);
  if (current.validUntil < today) return gate('L3.procedure', 3, 'Doc', label, false, `${name} vencido el ${current.validUntil}.`);
  if (current.approvedAt > today) return gate('L3.procedure', 3, 'Doc', label, false, `${name} aún no aprobado (${current.approvedAt}).`);
  return gate(
    'L3.procedure',
    3,
    'Doc',
    label,
    true,
    `${name}, aprobado el ${current.approvedAt}, difundido el ${current.disseminatedAt} a ${current.disseminatedTo}; vigente hasta ${current.validUntil}. Responsable: ${current.owner}.`
  );
};

export const computeMaturityGates = (input: ENSMaturityInput): ENSMaturityGate[] => {
  const { result, activity, record, now } = input;
  const timeZone = maturityTimeZone(input.timeZone);
  const days = new Set(activity?.days || []);
  const whole = wholeWindowDays(input.window, now, timeZone);
  const gap = greyReason(result);
  const gates: ENSMaturityGate[] = [];

  // L1: something of the control in the period.
  gates.push(
    !activity
      ? gate('L1.facts', 1, 'A', 'Hechos del control en el periodo', false, 'No se pudo leer la actividad del control.')
      : days.size
      ? gate('L1.facts', 1, 'A', 'Hechos del control en el periodo', true, `Hechos en ${days.size} días de la ventana; el último, el ${Array.from(days).sort().pop()}.`)
      : gate('L1.facts', 1, 'A', 'Hechos del control en el periodo', false, 'Ningún hecho del control en la ventana de evaluación.')
  );

  // L2: recurrent facts over the last days (daily period).
  const recentDays = whole.slice(-ENS_MATURITY_RECURRENT_DAYS);
  const recentMissing = activity ? missingByMachine(activity, recentDays) : [];
  const recurrenceLabel = 'Hechos recurrentes sin huecos';
  gates.push(
    !activity
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, 'No se pudo leer la actividad del control.')
      : gap
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, `${capitalize(gap)}: lo que no se mide no acredita L2 ni superior.`)
      : recentDays.length < 2
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, 'La ventana de evaluación no tiene días completos suficientes (hacen falta 2 o más).')
      : recentMissing.length
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, `Últimos ${recentDays.length} días: ${describeMissing(recentMissing, recentDays.length)}.`)
      : gate(
          'L2.recurrence',
          2,
          'A',
          recurrenceLabel,
          true,
          `Hechos todos los días de los últimos ${recentDays.length} días${activity.machines && activity.machines.length > 1 ? ` en las ${activity.machines.length} máquinas` : ''} (periodicidad diaria).`
        )
  );

  // L3: parameters, procedure and continuity.
  const parametersLabel = 'Parámetros obligatorios completos';
  if (!input.configured) {
    gates.push(gate('L3.parameters', 3, 'A', parametersLabel, false, 'El control no está en la configuración activa.'));
  } else if (!result) {
    gates.push(gate('L3.parameters', 3, 'A', parametersLabel, false, 'Sin resultado del control.'));
  } else {
    const missing = result.missingParameters || [];
    const invalid = (result.parameters || []).filter(parameter => parameter.required && parameter.status === 'INVALID').map(parameter => parameter.id);
    gates.push(
      missing.length || invalid.length
        ? gate(
            'L3.parameters',
            3,
            'A',
            parametersLabel,
            false,
            [missing.length ? `Faltan ${missing.join(', ')}` : '', invalid.length ? `no válidos ${invalid.join(', ')}` : ''].filter(Boolean).join('; ') + '.'
          )
        : gate('L3.parameters', 3, 'A', parametersLabel, true, 'Todos los parámetros obligatorios están declarados y son válidos.')
    );
  }
  gates.push(procedureGate(record, now, timeZone));
  const continuityLabel = 'Evidencias continuas y sin lagunas';
  const gapDays = activity ? missingByMachine(activity, whole) : [];
  const unmeasured = result?.unmeasuredRequirements || [];
  gates.push(
    !activity
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, 'No se pudo leer la actividad del control.')
      : gap
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, `${capitalize(gap)}.`)
      : !whole.length
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, 'La ventana de evaluación no tiene días completos.')
      : gapDays.length
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, `${describeMissing(gapDays, whole.length)}.`)
      : !result || !result.applicableRequirements
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, 'Sin requisitos aplicables medidos.')
      : result.measuredRequirements < result.applicableRequirements
      ? gate(
          'L3.continuity',
          3,
          'A',
          continuityLabel,
          false,
          `${result.measuredRequirements} de ${result.applicableRequirements} requisitos evidenciados${unmeasured.length ? `; sin evidencia: ${listDays(unmeasured)}` : ''}.`
        )
      : gate(
          'L3.continuity',
          3,
          'A',
          continuityLabel,
          true,
          `Hechos los ${whole.length} días de la ventana${activity.machines && activity.machines.length > 1 ? ` en las ${activity.machines.length} máquinas` : ''} y los ${result.applicableRequirements} requisitos aplicables evidenciados.`
        )
  );

  // L4: indicator threshold and periodic reviews.
  const indicators = record.indicators[record.indicators.length - 1];
  const score = result?.score;
  gates.push(
    !indicators
      ? gate('L4.threshold', 4, 'D+A', 'Umbral definido y vigilado', false, 'Sin umbral declarado para el control.')
      : gate(
          'L4.threshold',
          4,
          'D+A',
          'Umbral definido y vigilado',
          true,
          `Umbral ${indicators.minScore} %; puntuación actual ${typeof score === 'number' ? `${score} %` : 'sin puntuación'}${
            typeof score === 'number' ? (score >= indicators.minScore ? ' (dentro del umbral)' : ' (desviación: por debajo del umbral)') : ''
          }.`
        )
  );
  const period = indicators?.reviewPeriodDays || ENS_DEFAULT_REVIEW_PERIOD_DAYS;
  const today = dayIn(now, timeZone);
  const lastReview = record.reviews
    .filter(review => review.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
  const reviewAge = lastReview ? daysBetween(lastReview.date, today) : undefined;
  gates.push(
    !lastReview
      ? gate('L4.reviews', 4, 'D+A', 'Revisiones periódicas registradas', false, `Sin revisiones registradas (periodicidad ${period} días).`)
      : (reviewAge as number) > period
      ? gate('L4.reviews', 4, 'D+A', 'Revisiones periódicas registradas', false, `Última revisión el ${lastReview.date} (hace ${reviewAge} días): fuera de la periodicidad de ${period} días.`)
      : gate('L4.reviews', 4, 'D+A', 'Revisiones periódicas registradas', true, `Última revisión el ${lastReview.date} por ${lastReview.reviewer} (hace ${reviewAge} días; periodicidad ${period} días).`)
  );

  // L5: improving trend over the persisted snapshots and feedback.
  const trend = describeTrend(input.snapshots, now, timeZone);
  gates.push(gate('L5.trend', 5, 'A', 'Serie histórica con tendencia de mejora', trend.improving, trend.reason));
  gates.push(feedbackGate(record, now, timeZone));

  return gates;
};

const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

// Highest level whose gates, and those of the levels below, all pass.
export const accreditedLevelOf = (gates: ENSMaturityGate[]): ENSMaturityLevel => {
  let level: ENSMaturityLevel = 0;
  for (const candidate of [1, 2, 3, 4, 5] as const) {
    const own = gates.filter(entry => entry.level === candidate);
    if (!own.length || !own.every(entry => entry.passed)) break;
    level = candidate;
  }
  return level;
};

export const computeControlMaturity = (input: ENSMaturityInput): ENSControlMaturity => {
  const { control, record } = input;
  const applicableLevel = resolveControlLevel(control, input.ensLevel, input.global);
  const assessed = record.assessments[record.assessments.length - 1];
  const target = assessed?.target !== undefined ? assessed.target : input.targets[applicableLevel];
  const measured = control.status === 'ACTIVE';
  const applicable = !measured || !input.result || input.result.status !== 'NO_APLICA';
  const gates = measured && applicable ? computeMaturityGates(input) : [];
  const accredited = measured && applicable ? accreditedLevelOf(gates) : undefined;
  const reviews = [...record.reviews].sort((a, b) => a.date.localeCompare(b.date));

  return {
    controlId: control.id,
    measured,
    applicable,
    accredited,
    assessed,
    target,
    targetSource: assessed?.target !== undefined ? 'ASSESSMENT' : 'CATEGORY',
    applicableLevel,
    aboveAccredited: Boolean(assessed) && assessed!.level > (accredited ?? 0),
    gates,
    attestation: record.attestations[record.attestations.length - 1],
    attestations: record.attestations.length,
    lastReview: reviews[reviews.length - 1],
    reviews: record.reviews.length,
    indicators: record.indicators[record.indicators.length - 1],
    feedback: currentFeedback(record.feedback),
    assessments: record.assessments.length,
    evaluatedAt: input.now.toISOString(),
  };
};

export const summarizeControlMaturity = (maturity: ENSControlMaturity): ENSControlMaturitySummary => ({
  controlId: maturity.controlId,
  measured: maturity.measured,
  applicable: maturity.applicable,
  accredited: maturity.accredited,
  assessed: maturity.assessed?.level,
  target: maturity.target,
  aboveAccredited: maturity.aboveAccredited,
});

// How many controls are at each level: accredited (or «sin medición») and assessed (or «sin valorar»).
export const summarizeMaturityDistribution = (list: ENSControlMaturitySummary[]): ENSMaturityDistribution => {
  const empty = () => ({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 } as Record<string, number>);
  const distribution: ENSMaturityDistribution = {
    accredited: { ...empty(), sinMedicion: 0 },
    assessed: { ...empty(), sinValorar: 0 },
    belowTarget: 0,
    applicable: 0,
  };
  list
    .filter(entry => entry.applicable)
    .forEach(entry => {
      distribution.applicable += 1;
      if (entry.accredited === undefined) distribution.accredited.sinMedicion += 1;
      else distribution.accredited[`L${entry.accredited}`] += 1;
      if (entry.assessed === undefined) distribution.assessed.sinValorar += 1;
      else distribution.assessed[`L${entry.assessed}`] += 1;
      const level = entry.assessed ?? entry.accredited;
      if (level !== undefined && level < entry.target) distribution.belowTarget += 1;
    });
  return distribution;
};

// «Madurez: L3 (acreditado L3, objetivo L3)»; without assessment «Madurez: sin valorar (…)».
export const describeMaturityHeadline = (maturity: Pick<ENSControlMaturity, 'measured' | 'applicable' | 'accredited' | 'assessed' | 'target'>): string => {
  if (!maturity.applicable) return 'Madurez: no aplica en este nivel';
  const assessed = maturity.assessed ? `L${maturity.assessed.level}` : 'sin valorar';
  const accredited = maturity.measured ? `acreditado L${maturity.accredited ?? 0}` : 'sin medición todavía';
  return `Madurez: ${assessed} (${accredited}, objetivo L${maturity.target})`;
};
