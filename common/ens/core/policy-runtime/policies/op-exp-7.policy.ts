// op.exp.7 · Incident management.
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSComplianceStatus, ENSGapCause } from '../../evaluation/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import type { ENSControlParameter } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';

const CONTROL = 'op.exp.7';
const POLICY = 'policy.op.exp.7';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// The manager's collector runs hourly: 24 h + one run + margin. Observation tolerance, not policy.
const FRESHNESS_HOURS = 26;

// Same clock margin as `resolveCollectorCoverage`: a fact from the future proves nothing.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Window of ACTIONS: what is judged is what has been alive in the last 30 days, the same window the
// engine uses to read alerts.
const WINDOW_DAYS = 30;

// GDPR article 33: notification to the supervisory authority within 72 hours.
const AEPD_HOURS = 72;

// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`). It reaches the evidence and
// requirement through the decision; without it the card inherited the classic model's cause, which
// does not see the facts the policy reads.
type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
  causa?: ENSGapCause;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough (or there is no incident yet to measure
// with). Missing parameter (CONFIGURATION) and missing run or source (COLLECTION) say so
// explicitly, and the collector's declarations carry ITS cause (`degradacion`).
const notMeasured = (motive: string, cause: ENSGapCause = 'EVIDENCE'): Measurement => ({
  estado: 'NO_EVALUABLE',
  motivo: motive,
  causa: cause,
});

// Cause of several unmeasured measurements, same order as the engine (`resolveGapCause`):
// COLLECTION only if all say so, CONFIGURATION if any does, otherwise EVIDENCE.
const commonGapCause = (measurements: Measurement[]): ENSGapCause | undefined => {
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
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

const worstStatus = (measurements: Measurement[]): Measurement['estado'] =>
  measurements.reduce<Measurement['estado']>(
    (actual, measurement) =>
      SEVERITY[measurement.estado] > SEVERITY[actual] ? measurement.estado : actual,
    'CUMPLE'
  );


// The normalizer splits an event with `evidence_id=EV-02,EV-03` into one per evidence
// (`<id>#EV-02`, `<id>#EV-03`); the FACT is judged here, so it counts once.
const facts = (
  context: ENSPolicyContext,
  type: string
): ENSNormalizedEvent[] => {
  const seen = new Set<string>();

  return context.events.filter(event => {
    if (event.controlId !== CONTROL || event.eventType !== type) {
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

const factField = (event: ENSNormalizedEvent, name: string): string => {
  const value =
    event.attributes && Object.prototype.hasOwnProperty.call(event.attributes, name)
      ? event.attributes[name]
      : undefined;

  return value === undefined || value === null ? '' : String(value).trim();
};

// Numbers arrive as text from `alerts.json`.
const parseNumber = (text: string): number | undefined => {
  const clean = (text || '').replace(',', '.').trim();

  if (!/^-?\d+(\.\d+)?$/.test(clean)) {
    return undefined;
  }

  const value = Number(clean);

  return Number.isFinite(value) ? value : undefined;
};

const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return undefined;
  }

  const value = new Date(text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

const formatHours = (ms: number): string => (ms / HOUR_MS).toFixed(1);

const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

const stripAccents = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');

// Recipients or owners of a cell: «RSI + CISO», «J. Ruiz, M. Sanz».
const names = (text: string): string[] =>
  text
    .split(/[+,;]/)
    .map(n => stripAccents(n))
    .filter(n => n && n !== '-');

const sameSystem = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();


const findParameter = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

// Table rows split into their declared columns. Without columns the position is not guessed: the
// parameter is treated as not configured.
const tableParameterRows = (
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
        row[column.name] = cells[i] || '';
      });

      return row;
    });

  return result.length ? result : undefined;
};

const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// A system's row: that of its name or, if none, that of «*».
const systemRow = (
  table: Record<string, string>[],
  column: string,
  system: string
): Record<string, string> | undefined =>
  table.find(f => sameSystem(f[column] || '', system)) ||
  table.find(f => (f[column] || '').trim() === '*');


const SEVERITIES = ['baja', 'media', 'alta', 'critica'];
const RELEVANTES = ['alta', 'critica'];

const NAME: Record<string, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const range = (severity: string): number => SEVERITIES.indexOf(severity);

type Classification = {
  // [minimum level, severity], from highest level to lowest.
  umbrales: [number, string][];
  // Level from which an alert is High or Critical.
  relevanteDesde?: number;
  notificables: Set<string>;
};

// One parse per evaluation: EV-02, EV-03 and the art. 32 data read the same alerts, incidents and parameters.
const memoByContext = <T>(compute: (context: ENSPolicyContext) => T) => {
  const cache = new WeakMap<ENSPolicyContext, { value: T }>();
  return (context: ENSPolicyContext): T => {
    let entry = cache.get(context);
    if (!entry) {
      entry = { value: compute(context) };
      cache.set(context, entry);
    }
    return entry.value;
  };
};

const memoByInstant = <T>(compute: (context: ENSPolicyContext, now: number) => T) => {
  const cache = new WeakMap<ENSPolicyContext, Map<number, T>>();
  return (context: ENSPolicyContext, now: number): T => {
    let byInstant = cache.get(context);
    if (!byInstant) {
      byInstant = new Map();
      cache.set(context, byInstant);
    }
    if (!byInstant.has(now)) byInstant.set(now, compute(context, now));
    return byInstant.get(now) as T;
  };
};

const classification = memoByContext((context: ENSPolicyContext): Classification | undefined => {
  const table = tableParameterRows(context, 'P-01');

  if (!table) {
    return undefined;
  }

  const thresholds: [number, string][] = [];
  const notifiable = new Set<string>();

  table.forEach(row => {
    const severity = stripAccents(row.severidad || '');
    const min = parseNumber(row.nivel_minimo || '');

    if (!SEVERITIES.includes(severity)) {
      return;
    }

    if (stripAccents(row.notificable_ccn_cert || '') === 'si') {
      notifiable.add(severity);
    }

    if (min !== undefined) {
      thresholds.push([min, severity]);
    }
  });

  if (!thresholds.length) {
    return undefined;
  }

  thresholds.sort((a, b) => b[0] - a[0] || range(b[1]) - range(a[1]));

  const relevantes = thresholds.filter(([, s]) => RELEVANTES.includes(s)).map(([n]) => n);

  return {
    umbrales: thresholds,
    relevanteDesde: relevantes.length ? Math.min(...relevantes) : undefined,
    notificables: notifiable,
  };
});

// The highest severity whose minimum level the alert reaches.
const levelSeverity = (level: number, c: Classification): string | undefined => {
  const reached = c.umbrales.filter(([min]) => level >= min).map(([, s]) => s);

  return reached.length
    ? reached.reduce((a, b) => (range(b) > range(a) ? b : a))
    : undefined;
};

// P-02: severity -> recipients and deadline in hours. Empty deadline: no deadline.
type Escalated = { destinatario: string; plazo?: number };

const escalatedByKey = memoByContext((context: ENSPolicyContext): Map<string, Escalated> | undefined => {
  const table = tableParameterRows(context, 'P-02');

  if (!table) {
    return undefined;
  }

  const map = new Map<string, Escalated>();

  table.forEach(row => {
    const severity = stripAccents(row.severidad || '');

    if (SEVERITIES.includes(severity)) {
      map.set(severity, {
        destinatario: row.destinatario || '',
        plazo: parseNumber(row.plazo_horas || ''),
      });
    }
  });

  return map.size ? map : undefined;
});


type Heartbeat = { evento: ENSNormalizedEvent; t: number };

const heartbeats = (context: ENSPolicyContext, now: number): Heartbeat[] =>
  facts(context, 'collector_run')
    .map(event => ({ evento: event, t: parseInstant(event.timestamp) }))
    .filter((x): x is Heartbeat => x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS)
    .sort((a, b) => b.t - a.t);

const lastHeartbeat = (context: ENSPolicyContext, now: number): Heartbeat | undefined => {
  const last = heartbeats(context, now)[0];

  return last && now - last.t <= FRESHNESS_HOURS * HOUR_MS ? last : undefined;
};

const inList = (text: string, value: string): boolean =>
  text.split(',').map(s => s.trim()).includes(value);

// The degradation the collector declared for an evidence in the SAME run as the last heartbeat (or
// later): one from days ago says nothing. It carries the cause IT declares (COLLECTION if none): it
// knows whether a record the organization does not keep is missing or a source could not be read.
const degradation = (
  context: ENSPolicyContext,
  evidence: string,
  heartbeat: Heartbeat
): { motivo: string; causa: ENSGapCause } | undefined => {
  const candidate = context.events
    .filter(
      e =>
        e.controlId === CONTROL &&
        e.eventType === 'evidence_state' &&
        (e.evidenceId === evidence || inList(factField(e, 'evidence_id'), evidence))
    )
    .map(e => ({ e, t: parseInstant(e.timestamp) }))
    .filter(x => x.t !== undefined && (x.t as number) >= heartbeat.t - HOUR_MS && (x.t as number) <= heartbeat.t + FUTURE_TOLERANCE_MS)
    .sort((a, b) => (b.t as number) - (a.t as number));

  if (!candidate.length) {
    return undefined;
  }

  const declared = factField(candidate[0].e, 'causa').toUpperCase();

  return {
    motivo: factField(candidate[0].e, 'motivo'),
    causa: ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'].includes(declared)
      ? (declared as ENSGapCause)
      : 'COLLECTION',
  };
};

type Sources = { alertas?: boolean; registro?: boolean; ossecConf?: boolean };

// Could what this evidence needs be read in the last run? If not, the measurement is NO_EVALUABLE
// with the reason the collector itself gave.
const sources = (
  context: ENSPolicyContext,
  now: number,
  evidence: string,
  subject: Sources
): Heartbeat | Measurement => {
  const heartbeat = lastHeartbeat(context, now);

  if (!heartbeat) {
    return notMeasured(
      'No hay ninguna pasada reciente del recolector del manager (ens_opexp7_collect.sh): sin ella no se sabe qué alertas, incidentes ni sellos hay hoy. Revisa su cron en el manager y que el alcance del plugin incluya el agente 000.',
      'COLLECTION'
    );
  }

  const inspected = factField(heartbeat.evento, 'evidencias_miradas');
  const record = factField(heartbeat.evento, 'registro_incidentes');
  const motive = degradation(context, evidence, heartbeat);

  // An absent incident record is CONFIGURATION: the organization does not keep it. One that could
  // not be read is COLLECTION.
  if (subject.registro && !['presente', 'vacio'].includes(record)) {
    return motive
      ? notMeasured(motive.motivo, motive.causa)
      : record === 'ausente'
      ? notMeasured(
          'No existe el registro de incidentes del manager (/etc/ensfacil/incident-register.tsv): la organización no ha empezado a registrar incidentes.',
          'CONFIGURATION'
        )
      : notMeasured(`El registro de incidentes no se ha podido leer en la última pasada (${record || 'sin dato'}).`, 'COLLECTION');
  }

  if (subject.alertas && !inList(inspected, 'EV-01')) {
    return motive
      ? notMeasured(motive.motivo, motive.causa)
      : notMeasured('La última pasada del recolector no pudo leer las alertas del manager.', 'COLLECTION');
  }

  if (subject.ossecConf && !inList(inspected, 'EV-10')) {
    return motive
      ? notMeasured(motive.motivo, motive.causa)
      : notMeasured('La última pasada del recolector no pudo leer el ossec.conf del manager.', 'COLLECTION');
  }

  return heartbeat;
};

const isMeasurement = (x: unknown): x is Measurement =>
  typeof x === 'object' && x !== null && (x as Measurement).estado !== undefined;


// An active-response execution is only an AUTOMATIC RESPONSE if an alert triggered it:
// `regla_disparadora` is that alert's rule. Without it (`-`) it is a restart asked by hand or from
// the API, which proves neither containment, nor reconfiguration, nor that automatic response
// works. It is named in the reason but does not accredit.
const withOrigin = (e: ENSNormalizedEvent): boolean => {
  const rule = factField(e, 'regla_disparadora');

  return rule !== '' && rule !== '-';
};

const noteWithoutOrigin = (context: ENSPolicyContext): string => {
  const without = facts(context, 'active_response_executed').filter(e => !withOrigin(e));

  return without.length
    ? ` Ejecuciones sin alerta que las dispare (no acreditan): ${formatList(
        without.map(e => `${factField(e, 'programa') || factField(e, 'comando')} ${factField(e, 'accion')} en ${factField(e, 'sistema')} (${factField(e, 'instante')})`)
      )}.`
    : '';
};


type Notification = { fecha: number; escaladoA: string; notificadoA: string };

type Incident = {
  id: string;
  severidad: string;
  sistemas: string[];
  apertura: number;
  contencion?: number;
  cierre?: number;
  datosPersonales: 'si' | 'no' | '-';
  notificaciones: Notification[];
  ccnCert?: number;
  mejoras: string[];
};

const incidents = memoByInstant((context: ENSPolicyContext, now: number): Incident[] => {
  // One row per (incident, phase, date): if the record was re-emitted several times in the window,
  // the last copy counts.
  const seenRows = new Map<string, ENSNormalizedEvent>();

  facts(context, 'incident_registered').forEach(e => {
    const key = [factField(e, 'incidente_id'), factField(e, 'fase'), factField(e, 'fecha')].join('|');
    const previous = seenRows.get(key);

    if (!previous || (parseInstant(e.timestamp) || 0) >= (parseInstant(previous.timestamp) || 0)) {
      seenRows.set(key, e);
    }
  });

  const byId = new Map<string, Incident>();

  seenRows.forEach(e => {
    const id = factField(e, 'incidente_id');
    const date = parseInstant(factField(e, 'fecha'));

    if (!id || date === undefined) {
      return;
    }

    const actual: Incident = byId.get(id) || {
      id,
      severidad: '',
      sistemas: [],
      apertura: date,
      datosPersonales: '-',
      notificaciones: [],
      mejoras: [],
    };

    // An incident's severity is the highest recorded in any of its phases (same rule as op.exp.9):
    // one that reached critical is not judged with a low one's deadline because it was downgraded
    // on closing.
    const severity = stripAccents(factField(e, 'severidad'));

    if (SEVERITIES.includes(severity) && range(severity) > range(actual.severidad)) {
      actual.severidad = severity;
    }

    factField(e, 'sistemas')
      .split(',')
      .map(s => s.trim())
      .filter(s => s && s !== '-')
      .forEach(s => {
        if (!actual.sistemas.some(x => sameSystem(x, s))) {
          actual.sistemas.push(s);
        }
      });

    actual.apertura = Math.min(actual.apertura, date);

    const phase = factField(e, 'fase');

    if (phase === 'intermedio') {
      actual.contencion = Math.min(actual.contencion ?? date, date);
    }

    if (phase === 'final') {
      actual.cierre = Math.max(actual.cierre ?? date, date);
    }

    const dp = factField(e, 'datos_personales');

    if (dp === 'si' || (dp === 'no' && actual.datosPersonales !== 'si')) {
      actual.datosPersonales = dp;
    }

    byId.set(id, actual);
  });

  facts(context, 'incident_notification_recorded').forEach(e => {
    const incident = byId.get(factField(e, 'incidente_id'));
    const date = parseInstant(factField(e, 'fecha'));

    if (incident && date !== undefined) {
      incident.notificaciones.push({
        fecha: date,
        escaladoA: factField(e, 'escalado_a'),
        notificadoA: factField(e, 'notificado_a'),
      });
    }
  });

  facts(context, 'ccn_cert_notification_recorded').forEach(e => {
    const incident = byId.get(factField(e, 'incidente_id'));
    const date = parseInstant(factField(e, 'notificacion_ccn_cert'));

    if (incident && date !== undefined) {
      incident.ccnCert = Math.min(incident.ccnCert ?? date, date);
    }
  });

  facts(context, 'improvement_action_recorded').forEach(e => {
    const incident = byId.get(factField(e, 'incidente_id'));
    const measurements = factField(e, 'medidas_mejora');

    if (incident && measurements && measurements !== '-') {
      incident.mejoras.push(measurements);
    }
  });

  // Alive in the window: open, or closed in the last 30 days. An incident dated in the future
  // accredits nothing.
  return Array.from(byId.values())
    .filter(
      i =>
        i.apertura <= now + FUTURE_TOLERANCE_MS &&
        (i.cierre === undefined || i.cierre >= now - WINDOW_DAYS * DAY_MS)
    )
    .sort((a, b) => a.apertura - b.apertura);
});


type Alert = {
  sistema: string;
  nivel: number;
  regla: string;
  alertas: number;
  primera: number;
  ultima: number;
  descripcion: string;
};

const alerts = memoByInstant((context: ENSPolicyContext, now: number): Alert[] =>
  facts(context, 'security_alert_observed')
    .map(e => ({
      sistema: factField(e, 'sistema'),
      nivel: parseNumber(factField(e, 'nivel')),
      regla: factField(e, 'regla'),
      alertas: parseNumber(factField(e, 'alertas')) || 0,
      primera: parseInstant(factField(e, 'primera')),
      ultima: parseInstant(factField(e, 'ultima')),
      descripcion: factField(e, 'descripcion'),
    }))
    .filter(
      (a): a is Alert =>
        a.nivel !== undefined &&
        a.primera !== undefined &&
        a.ultima !== undefined &&
        a.ultima <= now + FUTURE_TOLERANCE_MS &&
        a.ultima >= now - WINDOW_DAYS * DAY_MS
    ));

// Does any incident of that system cover instant `t`? An incident covers what happens while open
// and what happened up to `plazo` hours before opening: registering within the escalation deadline
// turns the alert into an incident; later, no.
const covered = (
  system: string,
  t: number,
  deadlineMs: number,
  candidate: Incident[]
): Incident | undefined =>
  candidate.find(
    i =>
      i.sistemas.some(s => sameSystem(s, system)) &&
      i.apertura <= t + deadlineMs &&
      (i.cierre === undefined || t <= i.cierre)
  );


const ev01 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-01', { alertas: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const c = classification(context);

  if (!c) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} está sin configurar o no declara ningún nivel mínimo: las alertas llegan sin severidad ENS.`,
      'CONFIGURATION'
    );
  }

  // The collector only sees from its observation level. What it must see without fail is the
  // «relevant» threshold (High or Critical): below it a declared but unobserved severity is
  // reported, not invented.
  const since = parseNumber(factField(heartbeat.evento, 'nivel_observado_desde'));
  const declaredMin = Math.min(...c.umbrales.map(([n]) => n));

  if (since !== undefined && c.relevanteDesde !== undefined && since > c.relevanteDesde) {
    return notMeasured(
      `El recolector observa alertas desde nivel ${since} y P-01 declara Alta o Crítica desde nivel ${c.relevanteDesde}: las alertas relevantes entre esos niveles no se ven. Baja OPEXP7_NIVEL_OBSERVADO en /etc/ensfacil/opexp7.env del manager.`,
      'CONFIGURATION'
    );
  }

  const notSeen =
    since !== undefined && since > declaredMin
      ? ` Las severidades de P-01 por debajo de nivel ${since} no se observan (OPEXP7_NIVEL_OBSERVADO).`
      : '';

  // Does the manager write alerts? What was read in the last day's runs.
  const read = heartbeats(context, now)
    .filter(l => now - l.t <= DAY_MS)
    .reduce((total, l) => total + (parseNumber(factField(l.evento, 'alertas_leidas')) || 0), 0);

  if (read === 0) {
    return notMeasured(
      'Las pasadas del último día no han leído ninguna alerta en el manager: o no escribe alerts.json (jsonout_output) o el recolector no ve el fichero.',
      'COLLECTION'
    );
  }

  const bySeverity = new Map<string, { n: number; sistemas: Set<string> }>();

  alerts(context, now).forEach(a => {
    const severity = levelSeverity(a.nivel, c) || 'sin severidad';
    const actual = bySeverity.get(severity) || { n: 0, sistemas: new Set<string>() };

    actual.n += a.alertas;
    actual.sistemas.add(a.sistema);
    bySeverity.set(severity, actual);
  });

  const summary = [...SEVERITIES].reverse()
    .concat('sin severidad')
    .filter(s => bySeverity.has(s))
    .map(s => {
      const x = bySeverity.get(s)!;

      return `${NAME[s] || 'Sin severidad en P-01'} ${x.n} (${Array.from(x.sistemas).join(', ')})`;
    });

  return compliant(
    `El SIEM detecta y clasifica: las pasadas del recolector del último día leyeron ${read} alertas del manager; en los últimos ${WINDOW_DAYS} días, por severidad de P-01: ${summary.length ? summary.join('; ') : `ninguna de nivel ${since ?? declaredMin} o superior`}.${notSeen}`
  );
};

// Relevant alerts of the window against the recorded incidents (EV-02 and the art. 32 report count the same).
const reconcileAlerts = (
  context: ENSPolicyContext,
  now: number,
  c: NonNullable<ReturnType<typeof classification>>,
  p02: NonNullable<ReturnType<typeof escalatedByKey>>
) => {
  const excluded = new Map<string, string>();

  (tableParameterRows(context, 'P-12') || []).forEach(f => {
    if (f.regla) {
      excluded.set(f.regla.trim(), f.motivo || '');
    }
  });

  const recorded = incidents(context, now);
  const orphan: { texto: string; peso: number }[] = [];
  const withoutDeadline = new Set<string>();
  const excludedCounted = new Map<string, number>();
  let relevantes = 0;
  let pending = 0;
  let inIncident = 0;
  let orphanAlerts = 0;
  let withoutDeadlineAlerts = 0;
  const coverers = new Set<string>();

  alerts(context, now).forEach(a => {
    const severity = levelSeverity(a.nivel, c);

    if (!severity || !RELEVANTES.includes(severity)) {
      return;
    }

    if (excluded.has(a.regla)) {
      excludedCounted.set(a.regla, (excludedCounted.get(a.regla) || 0) + a.alertas);

      return;
    }

    relevantes += a.alertas;

    const deadline = p02.get(severity)?.plazo;

    if (deadline === undefined) {
      withoutDeadline.add(NAME[severity]);
      withoutDeadlineAlerts += a.alertas;

      return;
    }

    const deadlineMs = deadline * HOUR_MS;
    const atStart = covered(a.sistema, a.primera, deadlineMs, recorded);
    const atFinal = covered(a.sistema, a.ultima, deadlineMs, recorded);

    if (atStart && atFinal) {
      coverers.add(atStart.id);
      coverers.add(atFinal.id);
      inIncident += a.alertas;

      return;
    }

    if (now - a.primera <= deadlineMs) {
      pending += a.alertas;

      return;
    }

    orphanAlerts += a.alertas;
    orphan.push({
      peso: range(severity) * 1e6 + a.alertas,
      texto: `${a.sistema}: ${a.alertas} alerta(s) ${NAME[severity]} de la regla ${a.regla} (nivel ${a.nivel}, «${a.descripcion}») entre ${iso(a.primera)} y ${iso(a.ultima)}, sin incidente registrado en ${deadline} h`,
    });
  });

  return { excluded, orphan, withoutDeadline, excludedCounted, coverers, relevantes, pending, inIncident, orphanAlerts, withoutDeadlineAlerts };
};

// The reconciliation once per evaluation (callers check P-01 and P-02 first).
const reconciled = memoByInstant((context: ENSPolicyContext, now: number) =>
  reconcileAlerts(context, now, classification(context)!, escalatedByKey(context)!)
);

const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-02', { alertas: true, registro: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const c = classification(context);

  if (!c || c.relevanteDesde === undefined) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} no declara desde qué nivel una alerta es Alta o Crítica: no hay alerta relevante que conciliar.`,
      'CONFIGURATION'
    );
  }

  const p02 = escalatedByKey(context);

  if (!p02) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-02')} está sin configurar: sin plazo de escalado no se sabe cuándo una alerta se ha quedado sin incidente.`,
      'CONFIGURATION'
    );
  }

  const { excluded, orphan, withoutDeadline, excludedCounted, coverers, relevantes, pending } = reconciled(context, now);

  const excludedNote = excludedCounted.size
    ? ` No se concilian, por decisión escrita en P-12: ${Array.from(excludedCounted.entries())
        .map(([rule, n]) => `${n} alerta(s) de la regla ${rule} (${excluded.get(rule) || 'sin motivo'})`)
        .join('; ')}.`
    : '';

  const tool = (tableParameterRows(context, 'P-03') || [])[0]?.herramienta;
  const noteP03 = tool ? ` Expedientes en: ${tool}.` : '';
  const pendingNote = pending
    ? ` ${pending} alerta(s) relevantes todavía dentro de su plazo de escalado.`
    : '';

  if (orphan.length) {
    orphan.sort((a, b) => b.peso - a.peso);

    return nonCompliant(
      `Alertas de severidad Alta o Crítica que no se convirtieron en incidente registrado: ${formatList(orphan.map(h => h.texto))}.${excludedNote}${pendingNote}${noteP03}`
    );
  }

  if (withoutDeadline.size) {
    return notMeasured(
      `P-02 no tiene plazo para la severidad ${Array.from(withoutDeadline).join(', ')}: esas alertas no se pueden conciliar.${excludedNote}`,
      'CONFIGURATION'
    );
  }

  if (!inList(factField(heartbeat.evento, 'evidencias_cubiertas'), 'EV-02')) {
    return notMeasured('La última pasada no declara haber leído a la vez las alertas y el registro: el silencio no acredita nada.', 'COLLECTION');
  }

  return compliant(
    relevantes
      ? `Las ${relevantes} alertas de severidad Alta o Crítica de los últimos ${WINDOW_DAYS} días están dentro de un incidente registrado (${Array.from(coverers).join(', ')}).${excludedNote}${pendingNote}${noteP03}`
      : `Ninguna alerta de severidad Alta o Crítica (nivel ${c.relevanteDesde} o superior según P-01) en los últimos ${WINDOW_DAYS} días que haya que convertir en incidente.${excludedNote}${pendingNote}${noteP03}`
  );
};

// The first relevant alert covering the incident: the detection instant (once per incident and evaluation).
const detections = memoByInstant(() => new Map<string, number | undefined>());

const detection = (i: Incident, context: ENSPolicyContext, now: number): number | undefined => {
  const known = detections(context, now);
  if (!known.has(i.id)) known.set(i.id, firstReconciledAlert(i, context, now));
  return known.get(i.id);
};

const firstReconciledAlert = (
  i: Incident,
  context: ENSPolicyContext,
  now: number
): number | undefined => {
  const c = classification(context);
  const deadline = escalatedByKey(context)?.get(i.severidad)?.plazo;

  if (!c || deadline === undefined) {
    return undefined;
  }

  const candidate = alerts(context, now).filter(a => {
    const s = levelSeverity(a.nivel, c);

    return (
      s &&
      RELEVANTES.includes(s) &&
      i.sistemas.some(x => sameSystem(x, a.sistema)) &&
      a.primera <= i.apertura &&
      a.primera >= i.apertura - deadline * HOUR_MS
    );
  });

  return candidate.length ? Math.min(...candidate.map(a => a.primera)) : undefined;
};

// Art. 32 report (op.mon.2): the reconciliation counts of the window as JSON, or why there are none.
const art32Reconciliation = (context: ENSPolicyContext, now: number): string => {
  const heartbeat = sources(context, now, 'EV-02', { alertas: true, registro: true });

  if (isMeasurement(heartbeat)) {
    return JSON.stringify({ motivo: heartbeat.motivo });
  }

  const c = classification(context);
  const p02 = escalatedByKey(context);

  if (!c || c.relevanteDesde === undefined || !p02) {
    return JSON.stringify({ motivo: 'P-01 o P-02 de op.exp.7 sin configurar: no hay alertas relevantes que conciliar.' });
  }

  const r = reconciled(context, now);

  return JSON.stringify({
    desde: iso(now - WINDOW_DAYS * DAY_MS),
    hasta: iso(now),
    ventanaDias: WINDOW_DAYS,
    relevantes: r.relevantes,
    enIncidente: r.inIncident,
    pendientes: r.pending,
    sinIncidente: r.orphanAlerts,
    sinPlazo: r.withoutDeadlineAlerts,
    excluidas: Array.from(r.excludedCounted.values()).reduce((a, b) => a + b, 0),
  });
};

// Art. 32 report: the first reconciled alert of each incident of the window (its detection instant), as JSON.
const art32Detection = (context: ENSPolicyContext, now: number): string => {
  const heartbeat = sources(context, now, 'EV-02', { alertas: true, registro: true });

  if (isMeasurement(heartbeat)) {
    return JSON.stringify({ motivo: heartbeat.motivo, incidentes: [] });
  }

  return JSON.stringify({
    desde: iso(now - WINDOW_DAYS * DAY_MS),
    hasta: iso(now),
    incidentes: incidents(context, now).flatMap(i => {
      const detected = detection(i, context, now);

      return detected === undefined ? [] : [{ id: i.id, apertura: iso(i.apertura), deteccion: iso(detected) }];
    }),
  });
};

const ev03 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-03', { registro: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const table = tableParameterRows(context, 'P-05');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-05')} está sin configurar: no hay plazos contra los que medir la respuesta.`, 'CONFIGURATION');
  }

  const recorded = incidents(context, now);

  if (!recorded.length) {
    return notMeasured(
      `No hay incidentes registrados vivos en los últimos ${WINDOW_DAYS} días: no hay tiempos de respuesta que medir.`
    );
  }

  const deadlines = new Map<string, { contencion?: number; resolucion?: number }>();

  table.forEach(f => {
    const s = stripAccents(f.severidad || '');

    if (SEVERITIES.includes(s)) {
      deadlines.set(s, {
        contencion: parseNumber(f.contencion_horas || ''),
        resolucion: parseNumber(f.resolucion_horas || ''),
      });
    }
  });

  type Series = { contencion: number[]; resolucion: number[]; deteccion: number[] };
  const series = new Map<string, Series>();
  const withoutRow = new Set<string>();
  const exceeded: string[] = [];
  const pending: string[] = [];

  recorded.forEach(i => {
    const deadline = deadlines.get(i.severidad);

    if (!deadline) {
      withoutRow.add(`${i.id} (${NAME[i.severidad] || 'sin severidad'})`);

      return;
    }

    const severitySeries = series.get(i.severidad) || { contencion: [], resolucion: [], deteccion: [] };

    // Containment: up to the intermediate phase; if closed without it, closing implies it. Open
    // without containment: its age, only if it already exceeds the deadline.
    const measure = (end: number | undefined, limit: number | undefined, axis: 'contencion' | 'resolucion') => {
      if (end !== undefined) {
        severitySeries[axis].push(end - i.apertura);

        if (limit !== undefined && end - i.apertura > limit * HOUR_MS) {
          exceeded.push(`${i.id} (${NAME[i.severidad]}): ${axis === 'contencion' ? 'contención' : 'resolución'} en ${formatHours(end - i.apertura)} h, plazo ${limit} h`);
        }

        return;
      }

      if (limit !== undefined && now - i.apertura > limit * HOUR_MS) {
        severitySeries[axis].push(now - i.apertura);
        exceeded.push(`${i.id} (${NAME[i.severidad]}): sin ${axis === 'contencion' ? 'contención' : 'resolución'} registrada tras ${formatHours(now - i.apertura)} h, plazo ${limit} h`);
      } else {
        pending.push(`${i.id} (${axis === 'contencion' ? 'contención' : 'resolución'})`);
      }
    };

    measure(i.contencion ?? i.cierre, deadline.contencion, 'contencion');
    measure(i.cierre, deadline.resolucion, 'resolucion');

    const detected = detection(i, context, now);

    if (detected !== undefined) {
      severitySeries.deteccion.push(i.apertura - detected);
    }

    series.set(i.severidad, severitySeries);
  });

  const average = (xs: number[]): number | undefined =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined;

  const averageOutside: string[] = [];
  const summary: string[] = [];

  series.forEach((severitySeries, severity) => {
    const deadline = deadlines.get(severity)!;
    const mc = average(severitySeries.contencion);
    const mr = average(severitySeries.resolucion);
    const md = average(severitySeries.deteccion);

    summary.push(
      `${NAME[severity]}: MTTD ${md !== undefined ? `${formatHours(md)} h` : 'sin alerta de origen'}, contención media ${mc !== undefined ? `${formatHours(mc)} h` : '—'} (plazo ${deadline.contencion ?? 'sin declarar'}), resolución media ${mr !== undefined ? `${formatHours(mr)} h` : '—'} (plazo ${deadline.resolucion ?? 'sin declarar'})`
    );

    if (mc !== undefined && deadline.contencion !== undefined && mc > deadline.contencion * HOUR_MS) {
      averageOutside.push(`contención media de ${NAME[severity]} ${formatHours(mc)} h > ${deadline.contencion} h`);
    }

    if (mr !== undefined && deadline.resolucion !== undefined && mr > deadline.resolucion * HOUR_MS) {
      averageOutside.push(`resolución media de ${NAME[severity]} ${formatHours(mr)} h > ${deadline.resolucion} h`);
    }
  });

  if (averageOutside.length) {
    return nonCompliant(
      `Los tiempos de respuesta superan los plazos de P-05: ${formatList(averageOutside)}. Incidentes fuera de plazo: ${formatList(exceeded)}. (${summary.join(' | ')}.)`
    );
  }

  if (withoutRow.size) {
    return notMeasured(`P-05 no tiene fila para la severidad de: ${formatList(Array.from(withoutRow))}.`, 'CONFIGURATION');
  }

  const measured = Array.from(series.values()).some(s => s.contencion.length || s.resolucion.length);

  if (!measured) {
    return notMeasured(`Ningún incidente ha llegado todavía a contención o resolución, y ninguno ha superado su plazo: pendientes ${formatList(pending)}.`);
  }

  return compliant(
    `Tiempos medios dentro de P-05: ${summary.join(' | ')}.${exceeded.length ? ` Incidentes sueltos fuera de plazo (la media sigue dentro): ${formatList(exceeded)}.` : ''}${pending.length ? ` Pendientes: ${formatList(pending)}.` : ''}`
  );
};

const ev04 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-04', { registro: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const p02 = escalatedByKey(context);

  if (!p02) {
    return notMeasured(`${parameterDisplayName(context, 'P-02')} está sin configurar: no se sabe a quién había que escalar ni en qué plazo.`, 'CONFIGURATION');
  }

  const recorded = incidents(context, now);

  if (!recorded.length) {
    return notMeasured(
      `No hay incidentes registrados vivos en los últimos ${WINDOW_DAYS} días: no hay escalado que verificar.`
    );
  }

  // From MEDIA, also communication to the P-04 owners (r2.3).
  const withOwners = context.level === 'MEDIO' || context.level === 'ALTO';
  const p04 = tableParameterRows(context, 'P-04');
  const failures: string[] = [];
  const withoutDecide: string[] = [];
  const pending: string[] = [];
  let ok = 0;

  recorded.forEach(i => {
    const row = p02.get(i.severidad);
    let failure = false;

    if (!row) {
      withoutDecide.push(`${i.id}: P-02 no tiene fila para la severidad ${NAME[i.severidad] || 'sin severidad'}`);

      return;
    }

    const required = names(row.destinatario);
    const escalatedNotifications = i.notificaciones.filter(n => n.escaladoA && n.escaladoA !== '-');
    const list = new Set(escalatedNotifications.flatMap(n => names(n.escaladoA)));
    const missing = required.filter(d => !list.has(d));
    const reference = Math.min(i.apertura, detection(i, context, now) ?? i.apertura);
    const deadlineMs = row.plazo !== undefined ? row.plazo * HOUR_MS : undefined;

    if (!escalatedNotifications.length) {
      if (deadlineMs !== undefined && now - reference <= deadlineMs && i.cierre === undefined) {
        pending.push(i.id);

        return;
      }

      failures.push(`${i.id} (${NAME[i.severidad]}): no consta ningún escalado; correspondía a ${row.destinatario}`);

      return;
    }

    if (missing.length) {
      failure = true;
      failures.push(`${i.id} (${NAME[i.severidad]}): no consta escalado a ${missing.join(', ')} (P-02 exige ${row.destinatario})`);
    }

    const primero = Math.min(...escalatedNotifications.map(n => n.fecha));

    if (deadlineMs !== undefined && primero - reference > deadlineMs) {
      failure = true;
      failures.push(`${i.id}: escalado ${formatHours(primero - reference)} h después de la detección, plazo ${row.plazo} h`);
    }

    if (withOwners) {
      if (!p04) {
        withoutDecide.push(`${i.id}: ${parameterDisplayName(context, 'P-04')} sin configurar`);

        return;
      }

      const notified = new Set(i.notificaciones.flatMap(n => names(n.notificadoA)));

      i.sistemas.forEach(s => {
        const r = systemRow(p04, 'sistema', s);

        if (!r) {
          withoutDecide.push(`${i.id}: P-04 no tiene fila para ${s} ni una fila «*»`);

          return;
        }

        const due = [r.responsable_informacion, r.responsable_servicio]
          .filter(Boolean)
          .flatMap(names);
        const withoutReport = due.filter(d => !notified.has(d));

        if (withoutReport.length) {
          if (i.cierre === undefined && deadlineMs !== undefined && now - reference <= deadlineMs) {
            pending.push(`${i.id} (responsables de ${s})`);
          } else {
            failure = true;
            failures.push(`${i.id}: no consta comunicación a ${withoutReport.join(', ')} (responsables de ${s} en P-04)`);
          }
        }
      });
    }

    if (!failure) {
      ok += 1;
    }
  });

  if (failures.length) {
    return nonCompliant(`Escalado o comunicación incumplidos: ${formatList(failures)}.`);
  }

  // What stays undecided is always a row P-02 or P-04 lacks.
  if (withoutDecide.length) {
    return notMeasured(`No se puede juzgar todo: ${formatList(withoutDecide)}.`, 'CONFIGURATION');
  }

  if (!ok) {
    return notMeasured(`Los incidentes están dentro de su plazo de escalado y aún no consta el escalado: ${formatList(pending)}.`);
  }

  return compliant(
    `${ok} incidente(s) escalados a quien exige P-02 dentro de su plazo${withOwners ? ', con comunicación a los responsables de P-04' : ''}.${pending.length ? ` En plazo todavía: ${formatList(pending)}.` : ''}`
  );
};

const ev05 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-05', { registro: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const p08 = tableParameterRows(context, 'P-08');

  if (!p08) {
    return notMeasured(`${parameterDisplayName(context, 'P-08')} está sin configurar: no se ha decidido qué evidencias se preservan.`, 'CONFIGURATION');
  }

  const recorded = incidents(context, now);

  if (!recorded.length) {
    return notMeasured(
      `No hay incidentes registrados vivos en los últimos ${WINDOW_DAYS} días: no hay registros que preservar.`
    );
  }

  // The last verified seal of each day.
  const days = new Map<string, ENSNormalizedEvent>();

  facts(context, 'alert_log_seal_checked')
    .sort((a, b) => (parseInstant(a.timestamp) || 0) - (parseInstant(b.timestamp) || 0))
    .forEach(e => days.set(factField(e, 'dia'), e));

  const failures: string[] = [];
  const pending: string[] = [];
  let verified = 0;

  recorded.forEach(i => {
    const their = Array.from(days.values()).filter(e => inList(factField(e, 'incidentes'), i.id));

    if (!their.length) {
      pending.push(i.id);

      return;
    }

    their.forEach(e => {
      const day = factField(e, 'dia');
      const seal = factField(e, 'sello_sha256');
      const computed = factField(e, 'calculado_sha256');
      const chain = factField(e, 'cadena_sha256');
      const previous = factField(e, 'anterior_sha256');

      verified += 1;

      if (factField(e, 'conservado') !== 'si') {
        failures.push(`${i.id}: el registro de alertas del ${day} no se conserva (${factField(e, 'fichero')})`);
      } else if (factField(e, 'sellado') !== 'si' || !seal || seal === '-') {
        failures.push(`${i.id}: el registro del ${day} no tiene sello de integridad`);
      } else if (seal !== computed) {
        failures.push(`${i.id}: el registro del ${day} NO coincide con su sello (sellado ${seal.slice(0, 12)}…, hoy ${computed.slice(0, 12)}…): ha sido alterado`);
      } else if (chain && chain !== '-' && previous && previous !== '-' && chain !== previous) {
        failures.push(`${i.id}: la cadena de sellos se rompe el ${day} (el sello del día anterior ha cambiado)`);
      }
    });
  });

  const other = p08
    .map(f => f.tipo_evidencia)
    .filter(t => t && !/registro|log|alerta/i.test(t));
  const noteOther = other.length
    ? ` Sin verificación técnica (se acreditan fuera de ENSFácil): ${other.join(', ')}.`
    : '';

  if (failures.length) {
    return nonCompliant(`Registros de incidentes sin proteger: ${formatList(failures)}.${noteOther}`);
  }

  if (!verified) {
    return notMeasured(`Ningún día de los incidentes está sellado todavía (se sella al rotar, a medianoche): ${formatList(pending)}.`);
  }

  return compliant(
    `Los ${verified} registros diarios de alertas de los incidentes se conservan y coinciden con su sello SHA-256, con la cadena de sellos intacta.${pending.length ? ` Aún sin día sellado: ${formatList(pending)}.` : ''}${noteOther}`
  );
};

const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-06', { registro: true, alertas: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const serious = incidents(context, now).filter(i => RELEVANTES.includes(i.severidad));

  if (!serious.length) {
    return notMeasured(
      `No hay incidentes de severidad Alta o Crítica vivos en los últimos ${WINDOW_DAYS} días: no hay contención que exigir.`
    );
  }

  const authorized = new Set(
    (tableParameterRows(context, 'P-09') || []).map(f => (f.accion || '').trim().toLowerCase()).filter(Boolean)
  );
  const p02 = escalatedByKey(context);
  const deadlinesContainment = new Map<string, number>();

  (tableParameterRows(context, 'P-05') || []).forEach(f => {
    const s = stripAccents(f.severidad || '');
    const h = parseNumber(f.contencion_horas || '');

    if (SEVERITIES.includes(s) && h !== undefined) {
      deadlinesContainment.set(s, h);
    }
  });

  const runs = facts(context, 'active_response_executed').filter(withOrigin).map(e => ({
    sistema: factField(e, 'sistema'),
    comando: factField(e, 'comando').toLowerCase(),
    accion: factField(e, 'accion'),
    t: parseInstant(factField(e, 'instante')),
  }));

  const failures: string[] = [];
  const pending: string[] = [];
  const contents: string[] = [];

  serious.forEach(i => {
    const before = (p02?.get(i.severidad)?.plazo || 0) * HOUR_MS;
    const ar = runs.find(
      x =>
        x.t !== undefined &&
        authorized.has(x.comando) &&
        x.accion !== 'delete' &&
        i.sistemas.some(s => sameSystem(s, x.sistema)) &&
        x.t >= i.apertura - before &&
        x.t <= (i.cierre ?? now)
    );

    if (ar) {
      contents.push(`${i.id} por ${ar.comando} en ${ar.sistema}`);

      return;
    }

    if (i.contencion !== undefined) {
      contents.push(`${i.id} (contención registrada el ${iso(i.contencion)})`);

      return;
    }

    const limit = deadlinesContainment.get(i.severidad);

    if (i.cierre === undefined && (limit === undefined || now - i.apertura <= limit * HOUR_MS)) {
      pending.push(i.id);

      return;
    }

    failures.push(
      `${i.id} (${NAME[i.severidad]}, ${i.sistemas.join(', ')}): ni respuesta activa de P-09 en sus sistemas ni contención registrada${i.cierre !== undefined ? ' antes del cierre' : ` en ${formatHours(now - i.apertura)} h`}`
    );
  });

  const foreign = runs.filter(x => x.comando && !authorized.has(x.comando));
  const foreignNote = foreign.length
    ? ` Respuestas activas de comandos que P-09 no declara (no cuentan como contención): ${Array.from(new Set(foreign.map(x => `${x.comando} en ${x.sistema}`))).join(', ')}.`
    : '';

  if (failures.length) {
    return nonCompliant(`Incidentes graves sin medidas urgentes de contención: ${formatList(failures)}.${foreignNote}`);
  }

  if (!contents.length) {
    return notMeasured(`Los incidentes graves están aún dentro de su plazo de contención: ${formatList(pending)}.${foreignNote}`);
  }

  return compliant(
    `Consta contención en los incidentes graves: ${formatList(contents)}.${pending.length ? ` Aún en plazo: ${formatList(pending)}.` : ''}${foreignNote}`
  );
};

const ev07 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-07', { registro: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const p07 = tableParameterRows(context, 'P-07');

  if (!p07) {
    return notMeasured(`${parameterDisplayName(context, 'P-07')} está sin configurar: no se sabe qué sistemas tratan datos personales.`, 'CONFIGURATION');
  }

  const affected = incidents(context, now).filter(
    i =>
      i.datosPersonales === 'si' ||
      i.sistemas.some(s => systemRow(p07, 'sistema', s))
  );

  if (!affected.length) {
    return notMeasured(
      `Ningún incidente vivo en los últimos ${WINDOW_DAYS} días afecta a un sistema de P-07: no hay régimen del RGPD que verificar.`
    );
  }

  const deadline = AEPD_HOURS * HOUR_MS;
  const failures: string[] = [];
  const pending: string[] = [];
  const ok: string[] = [];

  affected.forEach(i => {
    const expired = i.cierre !== undefined || now - i.apertura > deadline;

    if (i.datosPersonales === '-') {
      if (expired) {
        failures.push(`${i.id} (${i.sistemas.join(', ')}): sin valoración de afectación a datos personales`);
      } else {
        pending.push(i.id);
      }

      return;
    }

    if (i.datosPersonales === 'no') {
      ok.push(`${i.id} valorado sin afectación`);

      return;
    }

    const aepd = i.notificaciones
      .filter(n => names(n.notificadoA).some(x => x.includes('aepd')))
      .map(n => n.fecha);

    if (aepd.length) {
      const first = Math.min(...aepd);

      if (first - i.apertura > deadline) {
        failures.push(`${i.id}: notificado a la AEPD ${formatHours(first - i.apertura)} h después de la apertura (máximo ${AEPD_HOURS} h)`);
      } else {
        ok.push(`${i.id} notificado a la AEPD en ${formatHours(first - i.apertura)} h`);
      }

      return;
    }

    if (expired && now - i.apertura > deadline) {
      failures.push(`${i.id}: afecta a datos personales y no consta notificación a la AEPD en ${AEPD_HOURS} h`);
    } else if (expired) {
      failures.push(`${i.id}: afecta a datos personales, se cerró y no consta notificación a la AEPD`);
    } else {
      pending.push(i.id);
    }
  });

  if (failures.length) {
    return nonCompliant(`Incidentes con datos personales fuera del régimen del RGPD: ${formatList(failures)}.`);
  }

  if (!ok.length) {
    return notMeasured(`Incidentes con datos personales aún dentro de las ${AEPD_HOURS} h: ${formatList(pending)}.`);
  }

  return compliant(`${formatList(ok)}.${pending.length ? ` Aún dentro de las ${AEPD_HOURS} h: ${formatList(pending)}.` : ''}`);
};

const ev08 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-08', { registro: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const p06 = tableParameterRows(context, 'P-06');

  if (!p06) {
    return notMeasured(`${parameterDisplayName(context, 'P-06')} está sin configurar: no hay ventanilla única declarada.`, 'CONFIGURATION');
  }

  const c = classification(context);

  if (!c || !c.notificables.size) {
    return notMeasured(`${parameterDisplayName(context, 'P-01')} no marca ninguna severidad como notificable al CCN-CERT: no se sabe qué incidentes había que notificar.`, 'CONFIGURATION');
  }

  const notifiable = incidents(context, now).filter(i => c.notificables.has(i.severidad));

  if (!notifiable.length) {
    return notMeasured(
      `Ningún incidente vivo en los últimos ${WINDOW_DAYS} días es de una severidad notificable según P-01.`
    );
  }

  const p02 = escalatedByKey(context);
  const failures: string[] = [];
  const pending: string[] = [];
  const ok: string[] = [];

  notifiable.forEach(i => {
    const deadline = p02?.get(i.severidad)?.plazo;
    const deadlineMs = deadline !== undefined ? deadline * HOUR_MS : undefined;

    if (i.ccnCert !== undefined) {
      if (deadlineMs !== undefined && i.ccnCert - i.apertura > deadlineMs) {
        failures.push(`${i.id}: notificado al CCN-CERT ${formatHours(i.ccnCert - i.apertura)} h después de la apertura (plazo ${deadline} h)`);
      } else {
        ok.push(`${i.id} (${iso(i.ccnCert)})`);
      }

      return;
    }

    if (i.cierre !== undefined || (deadlineMs !== undefined && now - i.apertura > deadlineMs)) {
      failures.push(`${i.id} (${NAME[i.severidad]}): notificable y sin notificación al CCN-CERT`);
    } else {
      pending.push(i.id);
    }
  });

  if (failures.length) {
    return nonCompliant(`Incidentes notificables sin notificar al CCN-CERT por ${p06[0].plataforma}: ${formatList(failures)}.`);
  }

  if (!ok.length) {
    return notMeasured(`Incidentes notificables aún en plazo: ${formatList(pending)}.`);
  }

  return compliant(`Notificados al CCN-CERT por ${p06[0].plataforma}: ${formatList(ok)}.${pending.length ? ` En plazo: ${formatList(pending)}.` : ''}`);
};

const ev09 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-09', { alertas: true, ossecConf: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const p10 = tableParameterRows(context, 'P-10');

  if (!p10) {
    return notMeasured(`${parameterDisplayName(context, 'P-10')} está sin configurar: no hay elementos de reconfiguración dinámica declarados.`, 'CONFIGURATION');
  }

  const authorized = new Set(
    (tableParameterRows(context, 'P-09') || []).map(f => (f.accion || '').trim().toLowerCase()).filter(Boolean)
  );

  if (!authorized.size) {
    return notMeasured(`${parameterDisplayName(context, 'P-09')} está sin configurar: no hay acciones de reconfiguración autorizadas.`, 'CONFIGURATION');
  }

  const items = p10.map(f => f.elemento).filter(Boolean);
  // To know whether a system HAS an agent any execution counts, also those no alert triggered: they
  // only say the agent is there.
  const withAgent = new Set(
    facts(context, 'security_alert_observed')
      .concat(facts(context, 'active_response_executed'))
      .map(e => factField(e, 'sistema').toLowerCase())
  );
  const observable = items.filter(e => withAgent.has(e.toLowerCase()));

  const reconfigurations = facts(context, 'active_response_executed').filter(
    e =>
      withOrigin(e) &&
      authorized.has(factField(e, 'comando').toLowerCase()) &&
      factField(e, 'accion') !== 'delete' &&
      items.some(x => sameSystem(x, factField(e, 'sistema')))
  );

  // A serious incident on a P-10 element without reconfiguration during it.
  const serious = incidents(context, now).filter(
    i => RELEVANTES.includes(i.severidad) && i.sistemas.some(s => items.some(x => sameSystem(x, s)))
  );
  const withoutReaction = serious.filter(
    i =>
      i.cierre !== undefined &&
      !reconfigurations.some(e => {
        const t = parseInstant(factField(e, 'instante'));

        return t !== undefined && t >= i.apertura && t <= (i.cierre as number) && i.sistemas.some(s => sameSystem(s, factField(e, 'sistema')));
      })
  );

  if (withoutReaction.length) {
    return nonCompliant(
      `Incidentes graves en elementos de P-10 cerrados sin ninguna reconfiguración: ${formatList(withoutReaction.map(i => `${i.id} (${i.sistemas.join(', ')})`))}.`
    );
  }

  if (reconfigurations.length) {
    return compliant(
      `Reconfiguración dinámica ejercitada: ${formatList(reconfigurations.map(e => `${factField(e, 'comando')} en ${factField(e, 'sistema')} (${factField(e, 'instante')})`))}.`
    );
  }

  if (!observable.length) {
    return notMeasured(
      `Ningún elemento de P-10 (${items.join(', ')}) tiene agente de Wazuh en el alcance: sus cambios no se pueden observar.`,
      'COLLECTION'
    );
  }

  return notMeasured(
    `No consta ninguna reconfiguración con una acción de P-09 sobre ${observable.join(', ')} en los últimos ${WINDOW_DAYS} días: la capacidad no se ha ejercitado y no se puede demostrar.${noteWithoutOrigin(context)}`
  );
};

const ev10 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-10', { ossecConf: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const p11 = (tableParameterRows(context, 'P-11') || []).filter(f => f.lista_cdb);

  if (!p11.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-11')} no declara ninguna lista CDB en la que se carguen los indicadores de los avisos.`, 'CONFIGURATION');
  }

  const last = new Map<string, ENSNormalizedEvent>();

  facts(context, 'threat_list_observed')
    .sort((a, b) => (parseInstant(a.timestamp) || 0) - (parseInstant(b.timestamp) || 0))
    .forEach(e => last.set(factField(e, 'lista'), e));

  const failures: string[] = [];
  const withoutDecide: string[] = [];
  const ok: string[] = [];

  p11.forEach(f => {
    const name = f.lista_cdb.trim().replace(/^\/var\/ossec\//, '');
    const e = last.get(name);
    const deadline = parseNumber(f.plazo_dias || '');

    if (!e) {
      failures.push(`${name} no está cargada en el ossec.conf del manager`);

      return;
    }

    if (factField(e, 'existe') !== 'si') {
      failures.push(`${name} está declarada en el ossec.conf pero el fichero no existe`);

      return;
    }

    if ((parseNumber(factField(e, 'reglas_que_la_usan')) || 0) === 0) {
      failures.push(`ninguna regla usa ${name}: sus indicadores no dan capacidad de detección`);

      return;
    }

    const modified = parseInstant(factField(e, 'modificada'));

    if (deadline === undefined) {
      withoutDecide.push(`${name}: P-11 no declara el plazo de incorporación`);

      return;
    }

    if (modified === undefined) {
      withoutDecide.push(`${name}: sin fecha de modificación legible`);

      return;
    }

    if (now - modified > deadline * DAY_MS) {
      failures.push(`${name} lleva ${Math.floor((now - modified) / DAY_MS)} días sin actualizarse (plazo ${deadline})`);

      return;
    }

    ok.push(`${name} (${factField(e, 'entradas')} entradas, actualizada ${factField(e, 'modificada')}, ${factField(e, 'reglas_que_la_usan')} regla(s))`);
  });

  if (failures.length) {
    return nonCompliant(`Los avisos del CCN-CERT no se traducen en detección vigente: ${formatList(failures)}.`);
  }

  if (withoutDecide.length) {
    return notMeasured(`No se puede juzgar todo: ${formatList(withoutDecide)}.`);
  }

  return compliant(`Listas de indicadores cargadas, usadas y al día: ${formatList(ok)}.`);
};

const ev11 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-11', { alertas: true, ossecConf: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const configured = facts(context, 'active_response_configured').filter(
    e => factField(e, 'deshabilitada') !== 'si'
  );

  if (!configured.length) {
    return nonCompliant('No hay ninguna respuesta activa habilitada en el ossec.conf del manager.');
  }

  const executed = facts(context, 'active_response_executed').filter(withOrigin);
  const text = Array.from(new Set(configured.map(e => `${factField(e, 'comando')} (${factField(e, 'reglas')})`))).join(', ');

  if (!executed.length) {
    return notMeasured(
      `Respuesta automática configurada (${text}) pero sin ninguna ejecución disparada por una alerta en los últimos ${WINDOW_DAYS} días: no hay prueba de que opere.${noteWithoutOrigin(context)}`
    );
  }

  return compliant(
    `Respuesta automática configurada (${text}) y ejercitada ${executed.length} vez/veces a raíz de una alerta en los últimos ${WINDOW_DAYS} días: ${formatList(
      executed.map(e => `${factField(e, 'comando')} en ${factField(e, 'sistema')} por la regla ${factField(e, 'regla_disparadora')} (${factField(e, 'instante')})`)
    )}.${noteWithoutOrigin(context)}`
  );
};

const ev12 = (context: ENSPolicyContext, now: number): Measurement => {
  const heartbeat = sources(context, now, 'EV-12', { registro: true });

  if (isMeasurement(heartbeat)) {
    return heartbeat;
  }

  const closed = incidents(context, now).filter(i => i.cierre !== undefined);

  if (!closed.length) {
    return notMeasured(
      `Ningún incidente cerrado en los últimos ${WINDOW_DAYS} días: no hay bucle de mejora que verificar.`
    );
  }

  const without = closed.filter(i => !i.mejoras.length);

  if (without.length) {
    return nonCompliant(
      `Incidentes cerrados sin ninguna medida de mejora registrada: ${formatList(without.map(i => i.id))}.`
    );
  }

  return compliant(`Los ${closed.length} incidentes cerrados tienen medidas de mejora registradas.`);
};


type Evidences = Record<string, Measurement>;

const REQUIREMENTS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.7.1': { evidencias: ['EV-01', 'EV-02', 'EV-04'], parametros: ['P-01', 'P-02', 'P-03', 'P-12'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.2': { evidencias: ['EV-07'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED' },
  'op.exp.7.r1.1': { evidencias: ['EV-08'], parametros: ['P-06', 'P-01', 'P-02'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r2.1': { evidencias: ['EV-05', 'EV-06'], parametros: ['P-08', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r2.2': { evidencias: ['EV-03'], parametros: ['P-05', 'P-01'], tipo: 'MAX_AGE' },
  'op.exp.7.r2.3': { evidencias: ['EV-04'], parametros: ['P-02', 'P-04'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r2.4': { evidencias: ['EV-12'], parametros: [], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r3.1': { evidencias: ['EV-09'], parametros: ['P-09', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.7.r3.2': { evidencias: ['EV-10'], parametros: ['P-11'], tipo: 'MAX_AGE' },
  'op.exp.7.r4.1': { evidencias: ['EV-11'], parametros: ['P-09'], tipo: 'COVERAGE_REQUIRED' },
};

const decide = (
  requirement: string,
  status: Measurement['estado'],
  evidences: string[],
  parameters: string[],
  type: ENSPolicyDecision['trace']['ruleType'],
  ruleId: string,
  motive: string,
  expected: string,
  cause?: ENSGapCause
): ENSPolicyDecision => ({
  policyId: POLICY,
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
});

export const evaluateOpExp7 = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();

  const measurements: Evidences = {
    'EV-01': ev01(context, now),
    'EV-02': ev02(context, now),
    'EV-03': ev03(context, now),
    'EV-04': ev04(context, now),
    'EV-05': ev05(context, now),
    'EV-06': ev06(context, now),
    'EV-07': ev07(context, now),
    'EV-08': ev08(context, now),
    'EV-09': ev09(context, now),
    'EV-10': ev10(context, now),
    'EV-11': ev11(context, now),
    'EV-12': ev12(context, now),
  };

  const decisions: ENSPolicyDecision[] = [];

  Object.entries(REQUIREMENTS).forEach(([requirement, { evidencias: evidences, parametros: parameters, tipo: type }]) => {
    const own = evidences.map(id => ({ id, medida: measurements[id] }));
    const status = worstStatus(own.map(p => p.medida));

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads; `find` returns
    // the first). It names only the evidences that support it so the bridge does not paint a
    // healthy one with another's color.
    const owners = own.filter(p => p.medida.estado === status);

    decisions.push(
      withReasonParts(decide(
        requirement,
        status,
        owners.map(p => p.id),
        parameters,
        type,
        requirement,
        compositeReason(own),
        evidences.map(id => `${id} CUMPLE`).join(' y '),
        commonGapCause(owners.map(p => p.medida))
      ), reasonPartsOf(own))
    );

    // And one per evidence, with ITS status, so the evidence table shows what was measured of each
    // and not the aggregate.
    own.forEach(p =>
      decisions.push(
        decide(
          requirement,
          p.medida.estado,
          [p.id],
          parameters,
          type,
          `${requirement}/${p.id}`,
          p.medida.motivo,
          `${p.id} CUMPLE`,
          p.medida.causa
        )
      )
    );
  });

  const variables: ENSRuntimeVariable[] = Object.entries(measurements).map(([id, measurement]) => ({
    name: `medida_${id.replace('-', '')}`,
    value: measurement.estado,
    parameterIds: [],
    evidenceIds: [id],
    eventIds: [],
    description: measurement.motivo,
  }));

  variables.push(
    {
      name: 'informe_art32_conciliacion',
      value: art32Reconciliation(context, now),
      parameterIds: ['P-01', 'P-02', 'P-12'],
      evidenceIds: ['EV-02'],
      eventIds: [],
      description: 'Conciliación de las alertas Alta y Crítica de la ventana con los incidentes registrados (JSON), para el informe del art. 32.',
    },
    {
      name: 'informe_art32_deteccion',
      value: art32Detection(context, now),
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-03'],
      eventIds: [],
      description: 'Primera alerta conciliada de cada incidente de la ventana (JSON): el instante de detección cuando el registro no trae fecha_ocurrencia.',
    }
  );

  return { decisions, runtimeVariables: variables };
};

export const opExp7PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluateOpExp7,
  requirements: [
    {
      requirementId: 'op.exp.7.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-03', 'P-12'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      // Cumulative reinforcements: MEDIA «+ R1 + R2», ALTA «+ R1 + R2 + R3».
      requirementId: 'op.exp.7.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06', 'P-01', 'P-02'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-05', 'EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-01'],
      evidenceIds: ['EV-03'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.7.r2.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r2.4',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: ['EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-09', 'P-10'],
      evidenceIds: ['EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.7.r3.2',
      levels: ['ALTO'],
      parameterIds: ['P-11'],
      evidenceIds: ['EV-10'],
      ruleType: 'MAX_AGE',
    },
    // The ENS defines R4 but requires it in no category: without levels the engine evaluates it
    // NO_APLICA.
    {
      requirementId: 'op.exp.7.r4.1',
      levels: [],
      parameterIds: ['P-09'],
      evidenceIds: ['EV-11'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
