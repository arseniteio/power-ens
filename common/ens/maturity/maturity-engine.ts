// Accredited level: the highest whose gates and those below all pass; red or grey never force L0 (pure, explained).
import type { ENSControlDefinition } from '../catalog/types';
import type { ENSGlobalConfiguration, ENSLevel } from '../configuration/types';
import type { ENSComplianceResult } from '../core/evaluation/types';
import { resolveControlLevel } from '../core/control-level';
import { isUsableLink } from '../configuration/services/attestation-service';
import { ENS_DEFAULT_REVIEW_PERIOD_DAYS, ENS_MATURITY_FEEDBACK_SOURCES, ownLabel } from './maturity-records';
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
  ENSProcedureAttestation,
} from './types';

// Facts read for L1-L3 (organisation-wide, independent of the screen window); shorter if the facts are kept less.
export const ENS_MATURITY_PERIOD_DAYS = 30;
// L2: facts in each of the last N whole days (every collector runs at least daily).
export const ENS_MATURITY_RECURRENT_DAYS = 7;
// L5: trend over the last 180 days, with at least 90 days and 10 snapshots.
export const ENS_MATURITY_TREND_WINDOW_DAYS = 180;
export const ENS_MATURITY_TREND_MIN_SPAN_DAYS = 90;
export const ENS_MATURITY_TREND_MIN_POINTS = 10;

const DAY_MS = 86400e3;

export interface ENSMaturityMachineActivity {
  agentId: string;
  agentName?: string;
  days: string[];
  // First day the machine ever sent an ENS fact (it entered the scope): days before it are not expected of it.
  since?: string;
}

export interface ENSMaturityActivity {
  // Days (YYYY-MM-DD) with at least one fact of the control in the period, on any machine.
  days: string[];
  // Each machine that measures the control: recurrence and continuity are asked of every one.
  machines?: ENSMaturityMachineActivity[];
}

// The maturity's own period: `limited` when the facts kept start after the 30 days.
export interface ENSMaturityPeriod {
  from: string;
  to: string;
  limited?: boolean;
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
  control: Pick<ENSControlDefinition, 'id' | 'status' | 'levelDimension'> & Partial<Pick<ENSControlDefinition, 'requirements'>>;
  // The organisation's result (consolidated over the scope); undefined for a control without one.
  result?: ENSMaturityResultInput;
  // The control is in the active configuration.
  configured: boolean;
  // undefined: it could not be read.
  activity?: ENSMaturityActivity;
  period: ENSMaturityPeriod;
  timeZone: string;
  record: ENSControlMaturityRecord;
  targets: ENSMaturityTargets;
  ensLevel: ENSLevel;
  global?: Partial<ENSGlobalConfiguration>;
  // Earlier snapshots of the control, any order.
  snapshots: Pick<ENSControlSnapshot, 'date' | 'score'>[];
  // Why the snapshots could not be read (for instance, no read permission on the index).
  snapshotsError?: string;
  now: Date;
}

// --- days -----------------------------------------------------------------------------------------------------

// One formatter per zone: building one per call costs ~40 µs and the series and the activity call it thousands of times.
const formatters = new Map<string, Intl.DateTimeFormat | null>();

const formatterOf = (timeZone?: string): Intl.DateTimeFormat | null => {
  const zone = timeZone || 'UTC';
  if (!formatters.has(zone)) {
    try {
      formatters.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }));
    } catch {
      formatters.set(zone, null);
    }
  }
  return formatters.get(zone) || null;
};

// The zone that decides what a day is: the configuration's, or UTC if it is not an IANA zone.
export const maturityTimeZone = (timeZone?: string): string => (timeZone && formatterOf(timeZone) ? timeZone : 'UTC');

// The configured zone for the maturity's days and the daily job: Europe/Madrid when none is configured.
export const ENS_DEFAULT_TIME_ZONE = 'Europe/Madrid';
export const configuredTimeZone = (timeZone?: string): string => maturityTimeZone(timeZone || ENS_DEFAULT_TIME_ZONE);

// The calendar day of an instant in a zone, YYYY-MM-DD.
export const dayIn = (date: Date, timeZone?: string): string => (formatterOf(maturityTimeZone(timeZone)) as Intl.DateTimeFormat).format(date);

export const addDays = (day: string, days: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

// Whole days of the period: those after its (partial) first day and before today.
export const wholePeriodDays = (period: { from: string }, now: Date, timeZone?: string): string[] => {
  const today = dayIn(now, timeZone);
  const days: string[] = [];
  for (let day = addDays(dayIn(new Date(period.from), timeZone), 1); day < today; day = addDays(day, 1)) days.push(day);
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

// Only a grey by collection (nothing arrived, or a stale collector) caps the control at L1; a grey by configuration does not.
const greyByCollection = (result?: ENSMaturityResultInput): boolean =>
  result?.status === 'NO_EVALUABLE' &&
  (result.nonConformities || []).some(nonConformity => nonConformity.origin === 'NO_EVIDENCIADA' && nonConformity.cause === 'COLLECTION');

// Each machine (or the whole set) with the expected days it lacks; days before a machine's first fact ever are not expected.
const missingByMachine = (activity: ENSMaturityActivity, expected: string[]): { name: string; since?: string; missing: string[]; expected: number }[] => {
  const machines: ENSMaturityMachineActivity[] = activity.machines?.length ? activity.machines : [{ agentId: '', days: activity.days }];
  return machines
    .map(machine => {
      const days = new Set(machine.days);
      const own = machine.since ? expected.filter(day => day >= (machine.since as string)) : expected;
      const startsLater = Boolean(machine.since && expected.length && machine.since > expected[0]);
      return { name: machine.agentName || machine.agentId, since: startsLater ? machine.since : undefined, missing: own.filter(day => !days.has(day)), expected: own.length };
    })
    .filter(machine => machine.missing.length);
};

const describeMissing = (gaps: { name: string; since?: string; missing: string[]; expected: number }[]): string =>
  gaps
    .slice(0, 3)
    .map(gap => `${gap.name ? `${gap.name}: ` : ''}${gap.missing.length} de ${gap.expected} días sin hechos (${listDays(gap.missing)})${gap.since ? `, en el alcance desde el ${gap.since}` : ''}`)
    .join('; ') + (gaps.length > 3 ? `; y ${gaps.length - 3} máquinas más` : '');

// Machines that entered the scope during the period, to say so in a passing reason.
const describeLateMachines = (activity: ENSMaturityActivity, expected: string[]): string => {
  const late = (activity.machines || []).filter(machine => machine.since && expected.length && machine.since > expected[0]);
  return late.length ? `; ${late.map(machine => `${machine.agentName || machine.agentId} desde el ${machine.since}`).join(', ')}` : '';
};

// Facts kept (or sent) for less than the period: L1 says so; L2 and L3 need the whole period.
const periodNote = (period: ENSMaturityPeriod, timeZone: string): string =>
  period.limited ? ` (solo hay hechos desde el ${dayIn(new Date(period.from), timeZone)}, menos que los ${ENS_MATURITY_PERIOD_DAYS} días del periodo)` : '';

const missingHistory = (period: ENSMaturityPeriod, now: Date, timeZone: string): string | undefined => {
  if (!period.limited) return undefined;
  const have = daysBetween(dayIn(new Date(period.from), timeZone), dayIn(now, timeZone));
  const missing = Math.max(1, ENS_MATURITY_PERIOD_DAYS - have);
  return `Faltan ${missing} días de historial: solo hay hechos desde el ${dayIn(new Date(period.from), timeZone)} y hacen falta los ${ENS_MATURITY_PERIOD_DAYS} días del periodo.`;
};

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

// The procedure in force: the latest approval (ties: the latest recorded), not the last one typed in.
export const currentAttestation = (attestations: ENSProcedureAttestation[]): ENSProcedureAttestation | undefined =>
  [...attestations]
    .sort((a, b) => String(a.approvedAt).localeCompare(String(b.approvedAt)) || String(a.recordedAt).localeCompare(String(b.recordedAt)))
    .pop();

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
      `${proven.reference} (${ownLabel(ENS_MATURITY_FEEDBACK_SOURCES, proven.source) || proven.source}) cerrada el ${proven.closedAt} con el procedimiento versión ${proven.procedureVersion}.`
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
  const current = currentAttestation(record.attestations);
  if (!current) return gate('L3.procedure', 3, 'Doc', label, false, 'Sin procedimiento registrado.');
  const today = dayIn(now, timeZone);
  const missing = Object.entries(ATTESTATION_FIELDS)
    .filter(([field]) => !String((current as any)[field] || '').trim())
    .map(([, name]) => name);
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

// L4 threshold: declared, checked against the snapshots, and a deviation (latest below it) treated by a later review.
const thresholdGate = (input: ENSMaturityInput, timeZone: string): ENSMaturityGate => {
  const label = 'Umbral definido y vigilado';
  const { record } = input;
  const indicators = record.indicators[record.indicators.length - 1];
  if (!indicators) return gate('L4.threshold', 4, 'D+A', label, false, 'Sin umbral declarado para el control.');
  if (input.snapshotsError) return gate('L4.threshold', 4, 'D+A', label, false, `Umbral ${indicators.minScore} %: no se pueden leer las instantáneas (${input.snapshotsError}).`);
  const today = dayIn(input.now, timeZone);
  const scored = input.snapshots
    .filter(snapshot => typeof snapshot.score === 'number' && snapshot.date < today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = scored[scored.length - 1];
  if (!latest) return gate('L4.threshold', 4, 'D+A', label, false, `Umbral ${indicators.minScore} %: sin instantáneas para comprobar el umbral.`);
  if ((latest.score as number) >= indicators.minScore) {
    return gate('L4.threshold', 4, 'D+A', label, true, `Umbral ${indicators.minScore} %; última instantánea ${latest.score} % (${latest.date}): dentro del umbral.`);
  }
  let start = scored.length - 1;
  while (start > 0 && (scored[start - 1].score as number) < indicators.minScore) start -= 1;
  const since = scored[start].date;
  const deviation = `Desviación desde el ${since}: última instantánea ${latest.score} % por debajo del umbral ${indicators.minScore} %`;
  const treated = record.reviews
    .filter(review => review.date >= since && review.date <= today && (review.result === 'DESVIACION_EN_TRATAMIENTO' || Boolean(String(review.actions || '').trim())))
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
  return treated
    ? gate('L4.threshold', 4, 'D+A', label, true, `${deviation}; tratada en la revisión del ${treated.date} de ${treated.reviewer}.`)
    : gate('L4.threshold', 4, 'D+A', label, false, `${deviation}; ninguna revisión desde entonces la trata (acciones o «Desviación en tratamiento»).`);
};

export const computeMaturityGates = (input: ENSMaturityInput): ENSMaturityGate[] => {
  const { result, activity, record, now, period } = input;
  const timeZone = maturityTimeZone(input.timeZone);
  const days = new Set(activity?.days || []);
  const whole = wholePeriodDays(period, now, timeZone);
  const grey = greyByCollection(result);
  const note = periodNote(period, timeZone);
  const shortHistory = missingHistory(period, now, timeZone);
  const gates: ENSMaturityGate[] = [];

  // L1: something of the control in the period.
  const factsLabel = 'Hechos del control en el periodo';
  gates.push(
    !activity
      ? gate('L1.facts', 1, 'A', factsLabel, false, 'No se pudo leer la actividad del control.')
      : days.size
      ? gate('L1.facts', 1, 'A', factsLabel, true, `Hechos en ${days.size} días de los últimos ${ENS_MATURITY_PERIOD_DAYS}; el último, el ${Array.from(days).sort().pop()}${note}.`)
      : gate('L1.facts', 1, 'A', factsLabel, false, `Ningún hecho del control en los últimos ${ENS_MATURITY_PERIOD_DAYS} días${note}.`)
  );

  // L2: recurrent facts over the last days, on every machine.
  const recentDays = whole.slice(-ENS_MATURITY_RECURRENT_DAYS);
  const recentMissing = activity ? missingByMachine(activity, recentDays) : [];
  const recurrenceLabel = 'Hechos recurrentes sin huecos';
  const several = activity?.machines && activity.machines.length > 1 ? ` en las ${activity.machines.length} máquinas` : '';
  gates.push(
    !activity
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, 'No se pudo leer la actividad del control.')
      : grey
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, 'El control está en gris por falta de recogida: lo que no se recoge no acredita L2 ni superior.')
      : shortHistory
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, shortHistory)
      : recentMissing.length
      ? gate('L2.recurrence', 2, 'A', recurrenceLabel, false, `Últimos ${recentDays.length} días: ${describeMissing(recentMissing)}.`)
      : gate('L2.recurrence', 2, 'A', recurrenceLabel, true, `Hechos todos los días de los últimos ${recentDays.length} días${several} (periodicidad diaria)${describeLateMachines(activity, recentDays)}.`)
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
      : grey
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, 'El control está en gris por falta de recogida.')
      : shortHistory
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, shortHistory)
      : gapDays.length
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, `${describeMissing(gapDays)}.`)
      : !result || !result.applicableRequirements
      ? gate('L3.continuity', 3, 'A', continuityLabel, false, 'Sin requisitos aplicables medidos en la evaluación actual.')
      : result.measuredRequirements < result.applicableRequirements
      ? gate(
          'L3.continuity',
          3,
          'A',
          continuityLabel,
          false,
          `En la evaluación actual, ${result.measuredRequirements} de ${result.applicableRequirements} requisitos evidenciados${unmeasured.length ? `; sin evidencia: ${listDays(unmeasured)}` : ''}.`
        )
      : gate(
          'L3.continuity',
          3,
          'A',
          continuityLabel,
          true,
          `Hechos los ${whole.length} días completos del periodo${several}${describeLateMachines(activity, whole)} y los ${result.applicableRequirements} requisitos aplicables evidenciados en la evaluación actual.`
        )
  );

  // L4: threshold watched and periodic reviews.
  gates.push(thresholdGate(input, timeZone));
  const indicators = record.indicators[record.indicators.length - 1];
  const reviewPeriod = indicators?.reviewPeriodDays || ENS_DEFAULT_REVIEW_PERIOD_DAYS;
  const today = dayIn(now, timeZone);
  const lastReview = record.reviews
    .filter(review => review.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .pop();
  const reviewAge = lastReview ? daysBetween(lastReview.date, today) : undefined;
  const reviewsLabel = 'Revisiones periódicas registradas';
  gates.push(
    !lastReview
      ? gate('L4.reviews', 4, 'D+A', reviewsLabel, false, `Sin revisiones registradas (periodicidad ${reviewPeriod} días).`)
      : (reviewAge as number) > reviewPeriod
      ? gate('L4.reviews', 4, 'D+A', reviewsLabel, false, `Última revisión el ${lastReview.date} (hace ${reviewAge} días): fuera de la periodicidad de ${reviewPeriod} días.`)
      : gate('L4.reviews', 4, 'D+A', reviewsLabel, true, `Última revisión el ${lastReview.date} por ${lastReview.reviewer} (hace ${reviewAge} días; periodicidad ${reviewPeriod} días).`)
  );

  // L5: improving trend over the persisted snapshots and feedback.
  const trend = input.snapshotsError
    ? { improving: false, reason: `No se pudieron leer las instantáneas: ${input.snapshotsError}.` }
    : describeTrend(input.snapshots, now, timeZone);
  gates.push(gate('L5.trend', 5, 'A', 'Serie histórica con tendencia de mejora', trend.improving, trend.reason));
  gates.push(feedbackGate(record, now, timeZone));

  return gates;
};

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

// A control in draft is applicable only if one of its requirements applies at the level it is applied with.
const draftApplies = (input: ENSMaturityInput, applicableLevel: ENSLevel): boolean =>
  !input.control.requirements || input.control.requirements.some(requirement => (requirement.applicability?.levels || []).includes(applicableLevel));

export const computeControlMaturity = (input: ENSMaturityInput): ENSControlMaturity => {
  const { control, record } = input;
  const applicableLevel = resolveControlLevel(control, input.ensLevel, input.global);
  const assessed = record.assessments[record.assessments.length - 1];
  const target = assessed?.target !== undefined ? assessed.target : input.targets[applicableLevel];
  const measured = control.status === 'ACTIVE';
  const applicable = measured ? !input.result || input.result.status !== 'NO_APLICA' : draftApplies(input, applicableLevel);
  const gates = measured && applicable ? computeMaturityGates(input) : [];
  const accredited = measured && applicable ? accreditedLevelOf(gates) : undefined;
  const reviews = [...record.reviews].sort((a, b) => a.date.localeCompare(b.date));
  // Judged against the level stored when it was recorded; unknown then, any level above L0 needed a justification.
  const aboveAccredited = Boolean(assessed) && assessed!.level > (assessed!.accredited ?? 0);
  const accreditedDropped =
    Boolean(assessed) && accredited !== undefined && assessed!.accredited !== undefined && accredited < assessed!.accredited && assessed!.level > accredited;

  return {
    controlId: control.id,
    measured,
    applicable,
    accredited,
    assessed,
    target,
    targetSource: assessed?.target !== undefined ? 'ASSESSMENT' : 'CATEGORY',
    applicableLevel,
    aboveAccredited,
    accreditedDropped,
    gates,
    attestation: currentAttestation(record.attestations),
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

// How many applicable controls are at each level, accredited and assessed, and how many are below their target.
export const summarizeMaturityDistribution = (list: ENSControlMaturitySummary[]): ENSMaturityDistribution => {
  const empty = () => ({ L0: 0, L1: 0, L2: 0, L3: 0, L4: 0, L5: 0 } as Record<string, number>);
  const distribution: ENSMaturityDistribution = {
    accredited: { ...empty(), notMeasured: 0 },
    assessed: { ...empty(), notAssessed: 0 },
    belowTarget: 0,
    applicable: 0,
  };
  list
    .filter(entry => entry.applicable)
    .forEach(entry => {
      distribution.applicable += 1;
      if (entry.accredited === undefined) distribution.accredited.notMeasured += 1;
      else distribution.accredited[`L${entry.accredited}`] += 1;
      if (entry.assessed === undefined) distribution.assessed.notAssessed += 1;
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

// The assessment lines of the panel and the report: who and when, always; then the mark against the level stored then.
export const describeAssessment = (maturity: ENSControlMaturity): { line?: string; mark?: string; dropped?: string } => {
  const assessed = maturity.assessed;
  if (!assessed) return {};
  const target = assessed.target !== undefined ? `, objetivo L${assessed.target}` : '';
  const line = `Valorado L${assessed.level}${target} por ${assessed.reviewer} el ${assessed.date}${assessed.justification ? `. Justificación: ${assessed.justification}` : ''}.`;
  const mark = maturity.aboveAccredited
    ? !maturity.measured
      ? `Valorado L${assessed.level} sin medición todavía: se apoya solo en la justificación.`
      : assessed.accredited === undefined
      ? `Valorado sin nivel acreditado calculado al registrarlo (L${assessed.level}).`
      : `Valorado por encima de lo acreditado al registrarlo (L${assessed.level} frente a L${assessed.accredited}).`
    : undefined;
  const dropped = maturity.accreditedDropped
    ? `La evidencia acreditaba L${assessed.accredited} al valorarlo (${assessed.date}); hoy acredita L${maturity.accredited}: revisar la valoración.`
    : undefined;
  return { line, mark, dropped };
};
