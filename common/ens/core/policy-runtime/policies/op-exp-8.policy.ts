// op.exp.8 · Activity log.
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

const CONTROL = 'op.exp.8';
const POLICY = 'policy.op.exp.8';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Freshness of a state fact: collectors run hourly and re-emit the whole state; 26 h tolerates a
// day of failures. Observation tolerance, not policy.
const FRESHNESS_HOURS = 26;

// A fact from the future proves nothing (same clock tolerance as the heartbeat).
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

type Plane = 'servidor' | 'central';

// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`). It reaches the evidence and
// requirement through the decision; without it the card inherited the classic model's cause, which
// does not see the facts the policy reads.
type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL'>;
  motivo: string;
  causa?: ENSGapCause;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough. Missing parameter and missing facts say
// so explicitly (`missingParameter`, `sinHechos`) and the collector's declarations carry ITS cause
// (`degradacion`).
const notMeasured = (motive: string, cause: ENSGapCause = 'EVIDENCE'): Measurement => ({
  estado: 'NO_EVALUABLE',
  motivo: motive,
  causa: cause,
});
const notApplicable = (motive: string): Measurement => ({ estado: 'NO_APLICA', motivo: motive });

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
  NO_APLICA: -1,
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

// Several axes of one evidence into one measurement: worst status, with the reason that explains it
// (what fails or is missing; if all comply, what was measured).
const combineMeasurements = (pieces: Measurement[]): Measurement => {
  const status = worstStatus(pieces);

  if (status === 'CUMPLE') {
    return compliant(pieces.map(p => p.motivo).join(' '));
  }

  const owners = pieces.filter(p => p.estado === status);
  const also = pieces
    .filter(p => p.estado !== status && p.estado !== 'CUMPLE' && p.estado !== 'NO_APLICA')
    .map(p => p.motivo);

  return {
    estado: status,
    motivo: [...owners.map(p => p.motivo), ...(also.length ? [`Además: ${also.join(' ')}`] : [])].join(' '),
    ...(status === 'NO_EVALUABLE' ? { causa: commonGapCause(owners) } : {}),
  };
};


// The normalizer splits an event with `evidence_id=A,B` into one per evidence (`<id>#A`, `<id>#B`);
// the FACT is judged here, so it counts once.
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

const parseNumber = (text: string): number | undefined => {
  const clean = String(text).trim().replace(',', '.');

  if (!/^[+-]?\d+(\.\d+)?$/.test(clean)) {
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

const eventTime = (event: ENSNormalizedEvent): number => {
  const t = Date.parse(event.timestamp);

  return Number.isNaN(t) ? 0 : t;
};

const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');

const formatHours = (ms: number): string => (ms / HOUR_MS).toFixed(1);

// State facts of the LAST run that emitted them (the engine already dropped earlier runs, see
// `state-facts.ts`), without future ones. If the last is older than FRESHNESS_HOURS they do not
// describe today.
const currentStatus = (
  context: ENSPolicyContext,
  type: string,
  now: number
): { vigentes: ENSNormalizedEvent[]; ultimo?: number } => {
  const valid = facts(context, type).filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS);

  if (!valid.length) {
    return { vigentes: [] };
  }

  const last = Math.max(...valid.map(eventTime));

  if (now - last > FRESHNESS_HOURS * HOUR_MS) {
    return { vigentes: [], ultimo: last };
  }

  // The last run: what was emitted in the hour before the last fact.
  return {
    vigentes: valid.filter(e => last - eventTime(e) < HOUR_MS),
    ultimo: last,
  };
};

// What the collector declared it could not measure for an evidence, if newer than its last fact,
// with the cause IT declares (it knows whether a record the organization does not keep is missing,
// CONFIGURATION, or a source could not be read, COLLECTION); COLLECTION if none.
const degradation = (
  context: ENSPolicyContext,
  evidence: string,
  afterOf = 0
): Measurement | undefined => {
  const last = facts(context, 'evidence_state')
    .filter(
      e =>
        factField(e, 'evidence_id').split(',').map(x => x.trim()).includes(evidence) &&
        String(e.status || factField(e, 'estado')).toUpperCase() === 'NO_EVALUABLE' &&
        eventTime(e) >= afterOf
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
  last: number | undefined,
  whatIsMissing: string
): Measurement =>
  degradation(context, evidence) ||
  notMeasured(
    last
      ? `El último ${whatIsMissing} es de ${new Date(last).toISOString()}, hace más de ${FRESHNESS_HOURS} h: el recolector de op.exp.8 no está informando.`
      : `No consta ningún ${whatIsMissing}: el recolector de op.exp.8 no está desplegado en esta máquina o no informa.`,
    'COLLECTION'
  );


const findParameter = (
  context: ENSPolicyContext,
  id: string
): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

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
        row[column.name] = (cells[i] || '').trim();
      });

      return row;
    });

  return result.length ? result : undefined;
};

const positiveScalar = (context: ENSPolicyContext, id: string): number | undefined => {
  const value = findParameter(context, id)?.value;

  if (value === undefined || value === null || Array.isArray(value)) {
    return undefined;
  }

  return parseNumber(String(value));
};

const missingParameter = (context: ENSPolicyContext, id: string, purpose: string): Measurement =>
  notMeasured(`${parameterDisplayName(context, id)} está sin configurar: no hay contra qué juzgar ${purpose}.`, 'CONFIGURATION');

const equalsIgnoreCase = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();


const rowPlane = (context: ENSPolicyContext): Plane =>
  facts(context, 'collector_run').some(e => factField(e, 'tipo_servidor') === 'manager')
    ? 'central'
    : 'servidor';


// EV-01 · the activity log is active and kept. System plane: auditd active with rules loaded
// (without rules auditd records only what the system sends it, not an audit log of activity) and
// the system log kept on disk (persistent journald or rsyslog). Directory plane (LDAP): slapd logs
// its operations only at `stats` level (256); without it nobody knows who did what in the
// directory.
const slapdRecordsOperations = (levels: string): boolean =>
  levels
    .split(/[\s,]+/)
    .filter(Boolean)
    .some(n => {
      const v = n.toLowerCase();

      if (v === 'stats' || v === 'any') {
        return true;
      }

      const num = /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : parseNumber(v);

      return num !== undefined && (num === -1 || (num & 256) !== 0);
    });

const ev01 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'audit_log_status', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-01', last, 'estado del registro de actividad de este servidor');
  }

  const pieces: Measurement[] = [];
  const ofSource = (source: string) => current.filter(e => factField(e, 'fuente') === source);

  const auditd = ofSource('auditd')[0];

  if (!auditd) {
    pieces.push(notMeasured('El recolector no ha informado del estado de auditd.'));
  } else if (factField(auditd, 'activo') !== 'si') {
    pieces.push(
      nonCompliant(
        `auditd no está activo (${factField(auditd, 'activo') || 'desconocido'}): el servidor no genera registro de auditoría. ${factField(auditd, 'detalle')}`.trim()
      )
    );
  } else if ((parseNumber(factField(auditd, 'reglas_cargadas')) || 0) <= 0) {
    pieces.push(nonCompliant('auditd está activo pero sin ninguna regla cargada: no registra la actividad de los usuarios.'));
  } else {
    pieces.push(compliant(`auditd activo con ${factField(auditd, 'reglas_cargadas')} reglas cargadas.`));
  }

  const journald = ofSource('journald')[0];
  const rsyslog = ofSource('rsyslog')[0];
  const journaldKeeps =
    journald && factField(journald, 'activo') === 'si' && factField(journald, 'almacenamiento') === 'persistente';
  const rsyslogKeeps = rsyslog && factField(rsyslog, 'activo') === 'si';

  if (!journald && !rsyslog) {
    pieces.push(notMeasured('El recolector no ha informado del registro del sistema (journald, rsyslog).'));
  } else if (journaldKeeps || rsyslogKeeps) {
    pieces.push(
      compliant(
        `Registro del sistema conservado en disco (${[journaldKeeps ? 'journald persistente' : '', rsyslogKeeps ? 'rsyslog' : ''].filter(Boolean).join(' y ')}).`
      )
    );
  } else {
    pieces.push(nonCompliant('El registro del sistema no se conserva en disco: journald no es persistente y rsyslog no está activo.'));
  }

  ofSource('slapd').forEach(slapd => {
    const levels = factField(slapd, 'niveles_log');

    if (factField(slapd, 'activo') !== 'si') {
      pieces.push(nonCompliant(`slapd no está en ejecución (${factField(slapd, 'activo') || 'desconocido'}): el directorio no registra su actividad.`));
    } else if (!slapdRecordsOperations(levels)) {
      pieces.push(
        nonCompliant(
          `slapd no registra sus operaciones: olcLogLevel=${levels || '(sin declarar)'} no incluye stats, así que no queda quién se autentica, qué consulta ni qué modifica en el directorio.`
        )
      );
    } else {
      pieces.push(compliant(`slapd registra sus operaciones (olcLogLevel=${levels}).`));
    }
  });

  const categories = tableParameterRows(context, 'P-01');

  if (!categories) {
    pieces.push(missingParameter(context, 'P-01', 'si el registro cubre los eventos de seguridad que la política exige'));
  } else {
    pieces.push(...p01Coverage(context, now, categories, auditd));
  }

  return combineMeasurements(pieces);
};

// EV-01 · what is declared auditable against what is really audited. Auditd active with rules does
// not say WHAT it records: on a real server with 80 rules EV-01 was CUMPLE while op.exp.5 showed
// configuration paths unwatched, op.exp.10 the key stores and EV-06 time changes. Now each category
// P-01 declares auditable is contrasted with what the collector observes in the kernel
// (`audit_coverage`: per category, which paths of its list some loaded rule watches for writing, or
// which system calls) or with the active log sources.
// The category is free text of the organization, recognized by words. What is not recognized is not
// taken as covered: it stays unmeasured with cause CONFIGURATION, fixed by naming it in the
// Configuration screen.
type Category = 'autenticacion' | 'configuracion' | 'hora' | 'claves' | 'cuentas' | 'privilegios' | 'directorio';

// Order matters: «cambios de hora» is time before configuration, and «cambios en las cuentas» is
// accounts.
const CATEGORIES: { clave: Category; patron: RegExp; nombre: string }[] = [
  { clave: 'directorio', patron: /ldap|directorio|slapd/, nombre: 'directorio LDAP' },
  { clave: 'hora', patron: /\bhora|reloj|tiempo|fecha/, nombre: 'cambios de hora' },
  { clave: 'claves', patron: /clave|criptogr|certificad|almacen/, nombre: 'almacenes de claves' },
  { clave: 'cuentas', patron: /cuenta|usuario|identidad|grupo/, nombre: 'cuentas y grupos' },
  { clave: 'privilegios', patron: /privilegi|sudo|administra/, nombre: 'privilegios' },
  { clave: 'autenticacion', patron: /autentic|login|sesion|acceso/, nombre: 'autenticación' },
  { clave: 'configuracion', patron: /configura|cambio/, nombre: 'cambios de configuración' },
];

const stripAccents = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const recognizes = (category: string): Category | undefined =>
  CATEGORIES.find(c => c.patron.test(stripAccents(category)))?.clave;

const p01Coverage = (
  context: ENSPolicyContext,
  now: number,
  categories: Record<string, string>[],
  auditd: ENSNormalizedEvent | undefined
): Measurement[] => {
  const { vigentes: sources } = currentStatus(context, 'audit_log_status', now);
  const { vigentes: coverage } = currentStatus(context, 'audit_coverage', now);
  const active = (source: string) =>
    sources.some(e => factField(e, 'fuente') === source && factField(e, 'activo') === 'si');
  const seen = new Set<Category>();
  const pieces: Measurement[] = [];

  categories.forEach(row => {
    const declared = row.categoria_evento || '';
    const key = recognizes(declared);

    if (!key) {
      pieces.push(
        notMeasured(
          `P-01 declara auditable «${declared}», y Power ENS no sabe qué observar en la máquina para esa categoría: no se puede afirmar que se registre. Nómbrala con una de las reconocidas (${CATEGORIES.map(c => c.nombre).join(', ')}).`,
          'CONFIGURATION'
        )
      );

      return;
    }

    if (seen.has(key)) {
      return;
    }

    seen.add(key);

    // Authentication is logged by PAM, sshd and sudo in the system log, and PAM also in auditd
    // without rules.
    if (key === 'autenticacion') {
      const who = [
        auditd && factField(auditd, 'activo') === 'si' && factField(auditd, 'habilitado_kernel') !== '0' ? 'auditd (PAM)' : '',
        active('journald') ? 'journald' : '',
        active('rsyslog') ? 'rsyslog' : '',
      ].filter(Boolean);

      pieces.push(
        who.length
          ? compliant(`«${declared}»: la registran ${who.join(', ')}.`)
          : nonCompliant(`«${declared}» está declarada auditable y ninguna fuente de la máquina la registra: ni auditd, ni journald, ni rsyslog están activos.`)
      );

      return;
    }

    // The directory exists only on an LDAP server: slapd's fact above judges it. On another server
    // there is nothing to log.
    if (key === 'directorio') {
      if (!sources.some(e => factField(e, 'fuente') === 'slapd')) {
        pieces.push(notApplicable(`«${declared}» no aplica a este servidor: no tiene directorio (slapd).`));
      }

      return;
    }

    const fact = coverage.find(e => factField(e, 'categoria') === key);

    // Without the new fact, time can still be decided with EV-06's.
    if (!fact && key === 'hora') {
      const clock = currentStatus(context, 'time_sync_status', now).vigentes[0];

      if (clock) {
        pieces.push(
          factField(clock, 'vigilancia_cambio_hora') === 'si'
            ? compliant(`«${declared}»: auditd registra los cambios de la hora del sistema.`)
            : nonCompliant(`«${declared}» está declarada auditable y no se audita: ${noHourTrace(context, now)}`)
        );

        return;
      }
    }

    if (!fact) {
      pieces.push(
        degradation(context, 'EV-01') ||
          notMeasured(
            `«${declared}»: el recolector de op.exp.8 de este servidor no informa de qué vigila auditd (hecho audit_coverage), así que no se puede afirmar que esa categoría se registre. Actualiza el recolector.`,
            'COLLECTION'
          )
      );

      return;
    }

    const object = factField(fact, 'objeto') === 'syscalls' ? 'las llamadas al sistema' : 'la escritura en';
    const without = factField(fact, 'sin_vigilar')
      .split(',')
      .map(x => x.trim())
      .filter(x => x && x !== '-');
    const watched = factField(fact, 'vigiladas')
      .split(',')
      .map(x => x.trim())
      .filter(x => x && x !== '-');
    const auditdStatus = factField(fact, 'auditd');

    if (without.length) {
      pieces.push(
        nonCompliant(
          `«${declared}» está declarada auditable y no se audita del todo: ${
            auditdStatus && auditdStatus !== 'si' ? `auditd ${auditdStatus === 'no_instalado' ? 'no está instalado' : `no está en marcha (${auditdStatus})`}, así que nada registra ` : 'ninguna regla cargada en el kernel registra '
          }${object} ${formatList(without, 8)}.`
        )
      );
    } else if (!watched.length) {
      pieces.push(
        notMeasured(`«${declared}»: ninguna de las rutas que Power ENS vigila para esa categoría existe en este servidor, así que no hay qué contrastar.`)
      );
    } else {
      pieces.push(compliant(`«${declared}»: auditd registra ${object} ${formatList(watched, 8)}.`));
    }
  });

  return pieces;
};

// EV-03 · the five fields of op.exp.8.1 in a real sample.
const FIELDS: [string, string][] = [
  ['con_usuario', 'usuario o entidad'],
  ['con_fecha_hora', 'fecha y hora'],
  ['con_objeto', 'objeto'],
  ['con_tipo_evento', 'tipo de evento'],
  ['con_resultado', 'resultado'],
];

const ev03 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'audit_record_fields', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-03', last, 'muestreo de los campos del registro de auditoría');
  }

  return combineMeasurements(
    current.map(e => {
      const source = `${factField(e, 'fuente')}${factField(e, 'plano') ? ` (${factField(e, 'plano')})` : ''}`;
      const sample = parseNumber(factField(e, 'muestra')) || 0;

      if (sample <= 0) {
        return notMeasured(`${source}: la muestra está vacía.`);
      }

      const absent = FIELDS.filter(([c]) => (parseNumber(factField(e, c)) || 0) <= 0).map(([, n]) => n);

      return absent.length
        ? nonCompliant(`${source}: en los ${sample} registros más recientes no aparece nunca ${absent.join(', ')}.`)
        : compliant(`${source}: los cinco campos presentes en la muestra de ${sample} registros.`);
    })
  );
};

// EV-04 · each declared server keeps its heartbeat with the manager, with no gaps longer than P-12,
// in ALL runs of the window.
// Measured by keepalive, not alerts: a healthy, quiet server goes hours without an alert and
// counting them as a gap gave a NO_CUMPLE that proved nothing. The manager's collector reads each
// agent's LAST keepalive from the local agents database every run; since the database keeps only
// the last, the gap shows in the series of runs: a run where the keepalive lagged more than P-12.
// Two limits stated in the reason: with hourly runs a gap is seen if it lasts more than P-12 plus
// the interval between runs, a shorter one may fall between two; if the collector's own runs are
// missing (two consecutive more than P-12 apart, or the last older than P-12) a gap there would not
// have been seen: NO_EVALUABLE by COLLECTION, never CUMPLE. An OBSERVED gap still wins: it is a
// measurement.
const KEEPALIVE_FACT = 'agent_keepalive_observed';

// Facts of one run are emitted within a few seconds.
const SAME_RUN_WINDOW_MS = 5 * 60 * 1000;

// Slack of the gap between runs: cron does not fire on the same second every hour.
const RUN_SLACK = 15 * 60 * 1000;

const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

const keepaliveRuns = (
  valid: ENSNormalizedEvent[]
): { t: number; hechos: ENSNormalizedEvent[] }[] => {
  const runs: { t: number; hechos: ENSNormalizedEvent[] }[] = [];

  [...valid]
    .sort((a, b) => eventTime(a) - eventTime(b))
    .forEach(e => {
      const actual = runs[runs.length - 1];

      if (actual && eventTime(e) - actual.t <= SAME_RUN_WINDOW_MS) {
        actual.hechos.push(e);

        return;
      }

      runs.push({ t: eventTime(e), hechos: [e] });
    });

  return runs;
};

const ev04 = (context: ENSPolicyContext, now: number): Measurement => {
  const valid = facts(context, KEEPALIVE_FACT).filter(e => eventTime(e) <= now + FUTURE_TOLERANCE_MS);
  const last = valid.length ? Math.max(...valid.map(eventTime)) : undefined;

  if (last === undefined || now - last > FRESHNESS_HOURS * HOUR_MS) {
    return withoutFacts(context, 'EV-04', last, 'último keepalive de los agentes leído en el manager');
  }

  // What the collector declared after its last fact (the agents database could no longer be read,
  // for example).
  const deg = degradation(context, 'EV-04', last + 1);

  if (deg) {
    return deg;
  }

  const runs = keepaliveRuns(valid);
  const lastRun = runs[runs.length - 1];
  const servers = tableParameterRows(context, 'P-02');
  const deadline = positiveScalar(context, 'P-12');

  if (!servers) {
    return missingParameter(context, 'P-02', `qué servidores tienen que estar entregando (el manager tiene hoy ${lastRun.hechos.length} agentes registrados)`);
  }

  if (deadline === undefined || deadline <= 0) {
    return missingParameter(context, 'P-12', 'cuánto silencio de un servidor es una laguna');
  }

  const since = runs[0].t;
  const deadlineMs = deadline * HOUR_MS;
  const failures: string[] = [];
  const ok: string[] = [];

  servers.forEach(row => {
    const name = row.servidor;
    const its = (e: ENSNormalizedEvent) =>
      equalsIgnoreCase(factField(e, 'agente'), name) || equalsIgnoreCase(factField(e, 'agente_id'), name);

    if (!runs.some(p => p.hechos.some(its))) {
      failures.push(`${name}: no figura en la base de agentes del manager en ninguna pasada desde ${iso(since)}`);

      return;
    }

    // Per run, how far back its last keepalive was.
    const gaps: { t: number; detalle: string; retraso: number }[] = [];

    runs.forEach(p => {
      const fact = p.hechos.find(its);

      if (!fact) {
        gaps.push({ t: p.t, retraso: Infinity, detalle: 'no figuraba en la base de agentes' });

        return;
      }

      const keepalive = parseInstant(factField(fact, 'ultimo_keepalive'));
      const status = factField(fact, 'estado_conexion') || 'desconocido';

      if (keepalive === undefined) {
        gaps.push({ t: p.t, retraso: Infinity, detalle: `sin keepalive (${status})` });
      } else if (p.t - keepalive > deadlineMs) {
        gaps.push({
          t: p.t,
          retraso: p.t - keepalive,
          detalle: `último keepalive ${iso(keepalive)}, ${formatHours(p.t - keepalive)} h antes (${status})`,
        });
      }
    });

    if (gaps.length) {
      const worstGap = [...gaps].sort((a, b) => b.retraso - a.retraso)[0];
      const lastGap = gaps[gaps.length - 1];

      failures.push(
        `${name}: laguna en ${gaps.length} de ${runs.length} pasadas desde ${iso(since)} (plazo ${deadline} h); la peor, en la pasada de ${iso(worstGap.t)}: ${worstGap.detalle}${
          lastGap !== worstGap ? `; la más reciente, ${iso(lastGap.t)}: ${lastGap.detalle}` : ''
        }`
      );

      return;
    }

    const actual = lastRun.hechos.find(its);
    const keepalive = actual ? parseInstant(factField(actual, 'ultimo_keepalive')) : undefined;
    const events = actual ? factField(actual, 'eventos_24h') : '';

    ok.push(
      `${name} (último keepalive ${keepalive !== undefined ? `${Math.max(0, Math.round((lastRun.t - keepalive) / 60000))} min antes de la última pasada` : 'desconocido'}${
        events ? `; ${events} eventos en 24 h, dato informativo` : ''
      })`
    );
  });

  if (failures.length) {
    return nonCompliant(`Servidores de P-02 sin latido continuo con el manager: ${formatList(failures)}.`);
  }

  // No observed gap: was the WHOLE period observed?
  const blanks: string[] = [];

  runs.forEach((p, i) => {
    if (i > 0 && p.t - runs[i - 1].t > deadlineMs + RUN_SLACK) {
      blanks.push(`entre ${iso(runs[i - 1].t)} y ${iso(p.t)} (${formatHours(p.t - runs[i - 1].t)} h)`);
    }
  });

  if (now - lastRun.t > deadlineMs + RUN_SLACK) {
    blanks.push(`desde ${iso(lastRun.t)} hasta ahora (${formatHours(now - lastRun.t)} h)`);
  }

  if (blanks.length) {
    return notMeasured(
      `Faltan pasadas del recolector del manager ${formatList(blanks)}: más de P-12 (${deadline} h) sin mirar, así que una laguna de un servidor en ese intervalo no se habría visto. En las pasadas que sí hay, ningún servidor de P-02 superó el plazo.`,
      'COLLECTION'
    );
  }

  return compliant(
    `En las ${runs.length} pasadas del recolector del manager desde ${iso(since)}, el último keepalive de los ${ok.length} servidores de P-02 nunca quedó más atrás de ${deadline} h: ${formatList(ok)}.`
  );
};

// EV-05 · the most recent review, against P-04.
const ev05 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'log_review_recorded', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-05', last, 'estado del registro de revisiones');
  }

  const e = current.sort((a, b) => eventTime(b) - eventTime(a))[0];
  const deg = degradation(context, 'EV-05', eventTime(e) + 1);

  if (deg) {
    return deg;
  }

  if ((parseNumber(factField(e, 'revisiones')) || 0) === 0) {
    return nonCompliant(`El registro de revisiones (${factField(e, 'registro')}) no tiene ninguna revisión anotada: no consta que los registros se revisen.`);
  }

  const deadline = positiveScalar(context, 'P-04');

  if (deadline === undefined || deadline <= 0) {
    return missingParameter(context, 'P-04', `la periodicidad de las revisiones (la última anotada es del ${factField(e, 'ultima_revision')})`);
  }

  const date = parseInstant(factField(e, 'ultima_revision'));

  if (date === undefined) {
    return notMeasured(`La revisión más reciente no tiene una fecha legible (${factField(e, 'ultima_revision')}).`);
  }

  const detail = `revisión del ${factField(e, 'ultima_revision')} por ${factField(e, 'revisor')} (alcance: ${factField(e, 'alcance')}; hallazgos: ${factField(e, 'hallazgos')}; ${factField(e, 'referencia')})`;

  return now - date > deadline * DAY_MS
    ? nonCompliant(`La última ${detail} tiene ${Math.floor((now - date) / DAY_MS)} días, más que la periodicidad de ${deadline} días de P-04.`)
    : compliant(`Última ${detail}, dentro de la periodicidad de ${deadline} días. ${factField(e, 'revisiones')} revisiones anotadas.`);
};

// Why no trace of time changes remains, and what to do. Loading rules (`augenrules --load`) only
// helps if auditd is installed and running: on a manager without auditd that advice told people to
// run a command that does not exist. The same run's auditd state (EV-01) says it.
const noHourTrace = (context: ENSPolicyContext, now: number): string => {
  const syscalls = '(adjtimex, settimeofday, clock_settime)';
  const auditd = currentStatus(context, 'audit_log_status', now).vigentes.find(
    a => factField(a, 'fuente') === 'auditd'
  );
  const active = auditd ? factField(auditd, 'activo') : '';

  if (active === 'no_instalado') {
    return `auditd no está instalado en este servidor: nada registra los cambios de la hora del sistema ${syscalls} y un cambio de hora no dejaría traza. Hay que instalar auditd y cargar las reglas del runbook.`;
  }

  if (auditd && active !== 'si') {
    return `auditd no está en marcha (${active || 'desconocido'}): nada registra los cambios de la hora del sistema ${syscalls} y un cambio de hora no dejaría traza. Hay que arrancar auditd y cargar las reglas del runbook (augenrules --load).`;
  }

  return `auditd no registra los cambios de la hora del sistema ${syscalls}: un cambio de hora no dejaría traza. Carga las reglas del runbook (augenrules --load).`;
};

// EV-06 · time reference: synchronization, declared source, skew, authentication and trace of time
// changes.
const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'time_sync_status', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-06', last, 'estado de la sincronización del reloj');
  }

  const e = current.sort((a, b) => eventTime(b) - eventTime(a))[0];
  const service = factField(e, 'servicio');
  const sources = factField(e, 'fuentes')
    .split(',')
    .map(f => f.trim())
    .filter(f => f && f !== '-');
  const pieces: Measurement[] = [];

  if (service === 'ninguno' || factField(e, 'sincronizado') !== 'si') {
    pieces.push(nonCompliant(`El reloj no está sincronizado (servicio: ${service || 'desconocido'}): no hay referencia de tiempo fiable para el registro.`));
  } else {
    pieces.push(compliant(`Reloj sincronizado con ${service} (${sources.join(', ') || 'fuente no identificada'}).`));
  }

  const authentication = factField(e, 'autenticacion');

  if (sources.length && (authentication === 'ninguna' || !authentication)) {
    pieces.push(
      nonCompliant(
        `La sincronización con ${sources.join(', ')} no usa autenticación ni integridad${service === 'systemd-timesyncd' ? ' (systemd-timesyncd no las admite)' : ''}, que R2 exige al sincronizar con otros dispositivos.`
      )
    );
  } else if (sources.length) {
    pieces.push(compliant(`Sincronización autenticada (${authentication}).`));
  }

  const declared = tableParameterRows(context, 'P-05');

  if (!declared) {
    pieces.push(missingParameter(context, 'P-05', 'si las fuentes de tiempo en uso son las previstas'));
  } else {
    const foreign = sources.filter(f => !declared.some(d => equalsIgnoreCase(d.fuente_tiempo, f)));

    pieces.push(
      foreign.length
        ? nonCompliant(`Fuentes de tiempo en uso que P-05 no declara: ${foreign.join(', ')}.`)
        : compliant('Las fuentes en uso son las declaradas en P-05.')
    );
  }

  const max = positiveScalar(context, 'P-06');
  const skew = parseNumber(factField(e, 'desfase_segundos'));

  if (max === undefined || max < 0) {
    pieces.push(missingParameter(context, 'P-06', `la desviación del reloj (medida: ${factField(e, 'desfase_segundos')} s)`));
  } else if (skew === undefined) {
    pieces.push(notMeasured(`El servicio de sincronización no ha informado del desfase (${factField(e, 'desfase_segundos') || 'vacío'}).`));
  } else if (Math.abs(skew) > max) {
    pieces.push(nonCompliant(`Desfase del reloj de ${skew} s, mayor que los ${max} s de P-06.`));
  } else {
    pieces.push(compliant(`Desfase de ${skew} s, dentro de los ${max} s de P-06.`));
  }

  // Trace of time changes: without a rule recording them a change leaves no trace and it cannot be
  // asserted that only administration makes them.
  const changes = facts(context, 'clock_change_observed').map(
    c => `${factField(c, 'actor')} con ${factField(c, 'proceso')} (${factField(c, 'syscall')}, ${factField(c, 'veces')} veces, la última el ${factField(c, 'ultima')})`
  );

  if (factField(e, 'vigilancia_cambio_hora') !== 'si') {
    pieces.push(notMeasured(noHourTrace(context, now), 'CONFIGURATION'));
  } else {
    pieces.push(
      compliant(
        changes.length
          ? `Cambios de hora registrados en la ventana: ${formatList(changes)}.`
          : 'Los cambios de hora quedan registrados por auditd; ninguno en la ventana.'
      )
    );
  }

  return combineMeasurements(pieces);
};

// EV-07 · retention: on disk it is visible; the indexes' is not.
const ev07 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current } = currentStatus(context, 'log_retention_observed', now);
  const alerts = current.find(e => factField(e, 'almacen') === 'alertas_disco');
  const p07 = tableParameterRows(context, 'P-07');
  const max = p07
    ? Math.max(...p07.map(f => parseNumber(f.dias_retencion) || 0))
    : undefined;

  const disk = alerts
    ? ` En disco, el manager conserva alertas desde el ${factField(alerts, 'mas_antiguo')} (${factField(alerts, 'dias_conservados')} días)${max ? `; P-07 declara hasta ${max} días` : ''}.`
    : '';

  // Without indexer credentials by the owner's decision: what is missing is a configuration
  // decision, not a collection failure.
  const deg =
    degradation(context, 'EV-07') ||
    notMeasured(
      'La retención de los índices del Wazuh Indexer (políticas ISM) solo se ve consultando el indexer, y el recolector del manager no usa credenciales.',
      'CONFIGURATION'
    );

  return notMeasured(
    `${deg.motivo}${disk}${p07 ? '' : ` ${parameterDisplayName(context, 'P-07')} está sin configurar.`}`,
    p07 ? deg.causa : 'CONFIGURATION'
  );
};

// EV-08 · who can read the logs, against P-08.
const ev08 = (context: ENSPolicyContext, now: number, plane: Plane): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'log_access_permissions', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-08', last, 'estado del acceso a los registros');
  }

  const authorized = tableParameterRows(context, 'P-08')?.map(f => f.cuenta).filter(Boolean);
  const open: string[] = [];
  const foreign: string[] = [];

  current.forEach(e => {
    const accounts = factField(e, 'cuentas')
      .split(',')
      .map(c => c.trim())
      .filter(Boolean);

    if (accounts.includes('*')) {
      open.push(factField(e, 'ruta'));
    }

    // LITERAL comparison: on Linux 'Admin' and 'admin' are two accounts.
    const outside = authorized
      ? accounts.filter(c => c !== '*' && !authorized.includes(c))
      : [];

    if (outside.length) {
      foreign.push(`${factField(e, 'ruta')} (${outside.join(', ')})`);
    }
  });

  const pieces: Measurement[] = [];

  if (open.length) {
    pieces.push(nonCompliant(`Registros legibles por cualquier cuenta de la máquina: ${formatList(open)}.`));
  }

  if (!authorized) {
    pieces.push(missingParameter(context, 'P-08', 'qué cuentas pueden leer los registros'));
  } else if (foreign.length) {
    pieces.push(nonCompliant(`Registros legibles por cuentas que P-08 no autoriza: ${formatList(foreign)}.`));
  } else if (!open.length) {
    pieces.push(compliant(`Los ${current.length} registros observados solo los pueden leer cuentas autorizadas en P-08.`));
  }

  if (plane === 'central') {
    pieces.push(
      degradation(context, 'EV-08') ||
        notMeasured(
          'Los accesos efectivos a los índices (audit log del plugin de seguridad del indexer) no se ven sin credenciales.',
          'CONFIGURATION'
        )
    );
  }

  return combineMeasurements(pieces);
};

// EV-09 · log copies: not visible without indexer credentials.
const ev09 = (context: ENSPolicyContext): Measurement =>
  degradation(context, 'EV-09') ||
  notMeasured(
    'Las copias de los registros (snapshots del Wazuh Indexer) solo se ven consultando el indexer, y el recolector del manager no usa credenciales.',
    'CONFIGURATION'
  );

// EV-10 · the rule sets declared in P-10, loaded.
const ev10 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'correlation_rules_inventory', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-10', last, 'inventario de reglas del manager');
  }

  const total = current.reduce((t, e) => t + (parseNumber(factField(e, 'reglas')) || 0), 0);
  const summary = current
    .map(e => `${factField(e, 'conjunto')}: ${factField(e, 'reglas')} reglas, ${factField(e, 'reglas_con_mitre')} con MITRE ATT&CK`)
    .join('; ');

  if (total === 0) {
    return nonCompliant('El manager no carga ninguna regla de análisis: no hay herramienta que analice la actividad.');
  }

  const declared = tableParameterRows(context, 'P-10');

  if (!declared) {
    return missingParameter(context, 'P-10', `qué conjuntos de reglas tienen que estar desplegados (cargados hoy: ${summary})`);
  }

  const missing = declared
    .map(f => f.conjunto_reglas)
    .filter(c => !current.some(e => equalsIgnoreCase(factField(e, 'conjunto'), c) && (parseNumber(factField(e, 'reglas')) || 0) > 0));

  return missing.length
    ? nonCompliant(`Conjuntos de reglas de P-10 que el manager no carga: ${missing.join(', ')}. Cargados: ${summary}.`)
    : compliant(`Cargados todos los conjuntos de reglas de P-10 (${summary}).`);
};

// EV-11 · configured automatic responses, and P-11's.
const NO_REVERSION = ['', '-', 'no', 'ninguna', 'sin reversion', 'sin reversión'];

const ev11 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'active_response_configured', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-11', last, 'inventario de respuestas activas del manager');
  }

  const enabled = current.filter(
    e => factField(e, 'comando') !== '-' && factField(e, 'deshabilitada') !== 'si' && factField(e, 'comando_definido') === 'si'
  );

  if (!enabled.length) {
    return nonCompliant('El manager no tiene ninguna respuesta automática configurada y habilitada: el sistema recolecta y correlaciona, pero no responde.');
  }

  const summary = enabled
    .map(e => `${factField(e, 'comando')} sobre ${factField(e, 'reglas_id') !== '-' ? `reglas ${factField(e, 'reglas_id')}` : `grupos ${factField(e, 'grupos')}`}${factField(e, 'timeout') !== '-' ? `, reversión ${factField(e, 'timeout')} s` : ''}`)
    .join('; ');

  const expected = tableParameterRows(context, 'P-11');

  if (!expected) {
    return missingParameter(context, 'P-11', `qué respuestas automáticas están previstas (configuradas hoy: ${summary})`);
  }

  const failures: string[] = [];

  expected.forEach(f => {
    const their = enabled.filter(e => equalsIgnoreCase(factField(e, 'comando'), f.accion));

    if (!their.length) {
      failures.push(`${f.accion}: prevista en P-11 y no configurada o deshabilitada`);
    } else if (
      !NO_REVERSION.includes((f.reversion || '').trim().toLowerCase()) &&
      their.every(e => factField(e, 'timeout') === '-')
    ) {
      failures.push(`${f.accion}: P-11 declara reversión (${f.reversion}) y la respuesta configurada no tiene timeout`);
    }
  });

  return failures.length
    ? nonCompliant(`Respuestas automáticas de P-11 que no están como se declaran: ${formatList(failures)}. Configuradas: ${summary}.`)
    : compliant(`Configuradas y habilitadas las respuestas de P-11 (${summary}).`);
};

// EV-12 · automatic responses executed in the window.
const ev12 = (context: ENSPolicyContext): Measurement => {
  const all = facts(context, 'active_response_executed');
  const automatic = all.filter(e => factField(e, 'regla_origen') && factField(e, 'regla_origen') !== '-');
  const describe = (e: ENSNormalizedEvent) =>
    `${factField(e, 'programa')} ${factField(e, 'accion')} en ${factField(e, 'agente')}${factField(e, 'regla_origen') !== '-' ? ` por la regla ${factField(e, 'regla_origen')}` : ''} (${factField(e, 'veces')} veces, la última el ${factField(e, 'ultima')})`;

  if (automatic.length) {
    return compliant(`Respuestas automáticas ejecutadas en la ventana: ${formatList(automatic.map(describe))}.`);
  }

  return notMeasured(
    `No consta en la ventana ninguna respuesta automática disparada por una alerta: la capacidad está configurada o no, pero no hay prueba de que opere.${all.length ? ` Ejecuciones sin alerta que las dispare (no son respuesta automática): ${formatList(all.map(describe))}.` : ''}`
  );
};

// EV-13 · the logging system's services.
const ev13 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'logging_service_status', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-13', last, 'estado de los servicios de Wazuh');
  }

  const down = current.filter(e => factField(e, 'activo') !== 'si');

  return down.length
    ? nonCompliant(`Servicios del sistema de registro que no están activos: ${down.map(e => `${factField(e, 'servicio')} (${factField(e, 'activo')})`).join(', ')}.`)
    : compliant(`Servicios del sistema de registro activos: ${current.map(e => `${factField(e, 'servicio')} desde ${factField(e, 'activo_desde')}`).join(', ')}.`);
};

// Measurement of an evidence judged by a primitive, as its primitive left it; not re-judged here.
const ofPrimitive = (context: ENSPolicyContext, id: string): Measurement => {
  const evidence = context.evidences.find(e => e.id === id);
  const status = evidence?.status;
  const motive =
    evidence?.observations?.filter(o => !o.startsWith('Pregunta de auditoría')).join(' ') || '';

  if (status === 'CUMPLE') return compliant(motive);
  if (status === 'NO_CUMPLE' || status === 'PARCIAL') return nonCompliant(motive);

  return notMeasured(motive || `${id} no se ha podido medir.`, evidence?.gapCause || 'COLLECTION');
};


type Type = ENSPolicyDecision['trace']['ruleType'];

// Which evidences measure each requirement in each plane. A requirement without evidences in a
// plane is NO_APLICA in that row: it is measured in the other.
const REQUIREMENTS: Record<string, { servidor: string[]; central: string[]; parametros: string[]; tipo: Type }> = {
  'op.exp.8.1': { servidor: ['EV-01', 'EV-03'], central: ['EV-01', 'EV-03', 'EV-04', 'EV-13'], parametros: ['P-01', 'P-03'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.8.2': { servidor: ['EV-02'], central: ['EV-04', 'EV-13'], parametros: ['P-02', 'P-12'], tipo: 'MAX_AGE' },
  'op.exp.8.r1.1': { servidor: [], central: ['EV-05'], parametros: ['P-04'], tipo: 'MAX_AGE' },
  'op.exp.8.r2.1': { servidor: ['EV-06'], central: ['EV-06'], parametros: ['P-05', 'P-06'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.8.r3.1': { servidor: [], central: ['EV-07'], parametros: ['P-01', 'P-07'], tipo: 'MIN_RETENTION' },
  'op.exp.8.r4.1': { servidor: ['EV-08'], central: ['EV-08', 'EV-09', 'EV-13'], parametros: ['P-08', 'P-09'], tipo: 'WHITELIST' },
  'op.exp.8.r5.1': { servidor: [], central: ['EV-10'], parametros: ['P-10'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.8.r5.2': { servidor: [], central: ['EV-11', 'EV-12'], parametros: ['P-11'], tipo: 'COVERAGE_REQUIRED' },
};

const PRIMITIVES = ['EV-02'];

const decide = (
  requirement: string,
  status: Measurement['estado'],
  evidences: string[],
  parameters: string[],
  type: Type,
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

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const plane = rowPlane(context);

  const measure: Record<string, () => Measurement> = {
    'EV-01': () => ev01(context, now),
    'EV-02': () => ofPrimitive(context, 'EV-02'),
    'EV-03': () => ev03(context, now),
    'EV-04': () => ev04(context, now),
    'EV-05': () => ev05(context, now),
    'EV-06': () => ev06(context, now),
    'EV-07': () => ev07(context, now),
    'EV-08': () => ev08(context, now, plane),
    'EV-09': () => ev09(context),
    'EV-10': () => ev10(context, now),
    'EV-11': () => ev11(context, now),
    'EV-12': () => ev12(context),
    'EV-13': () => ev13(context, now),
  };

  const ofPlane = new Set(Object.values(REQUIREMENTS).flatMap(r => r[plane]));
  const measurements: Record<string, Measurement> = {};

  ofPlane.forEach(id => {
    measurements[id] = measure[id]();
  });

  const requirementDecisions: ENSPolicyDecision[] = [];
  const evidenceDecisions: ENSPolicyDecision[] = [];

  Object.entries(REQUIREMENTS).forEach(([requirement, definition]) => {
    const evidences = definition[plane];

    if (!evidences.length) {
      requirementDecisions.push(
        decide(
          requirement,
          'NO_APLICA',
          [],
          definition.parametros,
          definition.tipo,
          requirement,
          'Este requisito se mide en el sistema central de registro (el manager de Wazuh, agente 000): esta máquina no conserva, revisa ni correlaciona el registro de las demás. Su resultado sale en la fila del manager y en el del control.',
          'se mide en el manager'
        )
      );

      return;
    }

    const own = evidences.map(id => ({ id, medida: measurements[id] }));
    const status = worstStatus(own.map(p => p.medida));
    const owners = own.filter(p => p.medida.estado === status);

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads).
    requirementDecisions.push(
      withReasonParts(decide(
        requirement,
        status,
        owners.map(p => p.id),
        definition.parametros,
        definition.tipo,
        requirement,
        compositeReason(own),
        evidences.map(id => `${id} CUMPLE`).join(' y '),
        commonGapCause(owners.map(p => p.medida))
      ), reasonPartsOf(own))
    );

    // And one per evidence measured here, with ITS status. Primitive ones already have their
    // verdict.
    own
      .filter(p => !PRIMITIVES.includes(p.id))
      .forEach(p =>
        evidenceDecisions.push(
          decide(requirement, p.medida.estado, [p.id], definition.parametros, definition.tipo, `${requirement}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
        )
      );
  });

  // The OTHER plane's evidences were not measured in this row because they have no subject here:
  // NO_APLICA with the reason, so the table does not paint them as «nothing arrived».
  const otherPlane = context.control.requirements
    .flatMap(r => r.evidenceIds.map(id => ({ id, requisito: r.id })))
    .filter(({ id }) => !ofPlane.has(id));
  const seen = new Set<string>();

  otherPlane.forEach(({ id, requisito: requirement }) => {
    if (seen.has(id)) {
      return;
    }

    seen.add(id);
    evidenceDecisions.push(
      decide(
        requirement,
        'NO_APLICA',
        [id],
        [],
        REQUIREMENTS[requirement]?.tipo || 'COVERAGE_REQUIRED',
        `${requirement}/${id}`,
        plane === 'servidor'
          ? `${id} es del sistema central de registro y se mide en el manager (agente 000), no en esta máquina.`
          : `${id} es del agente de cada servidor; el manager no tiene agente propio que entregue su registro.`,
        'se mide en el otro plano'
      )
    );
  });

  const variables: ENSRuntimeVariable[] = [
    {
      name: 'plano_de_la_fila',
      value: plane,
      parameterIds: [],
      evidenceIds: [],
      eventIds: [],
      description:
        plane === 'central'
          ? 'Fila del sistema central de registro (manager): se miden las evidencias del servidor y las centrales.'
          : 'Fila de un servidor: se miden sus evidencias; las centrales se miden en el manager.',
    },
    ...Object.entries(measurements).map(([id, measurement]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: measurement.estado,
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: measurement.motivo,
    })),
  ];

  return { decisions: [...requirementDecisions, ...evidenceDecisions], runtimeVariables: variables };
};

export const opExp8PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Cumulative reinforcements BY TRACEABILITY LEVEL: base in all three, R1-R4 from MEDIO, R5 only
  // in ALTO.
  requirements: [
    {
      requirementId: 'op.exp.8.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03'],
      evidenceIds: ['EV-01', 'EV-03', 'EV-04', 'EV-13'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-12'],
      evidenceIds: ['EV-02', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.8.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.exp.8.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05', 'P-06'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.r3.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'MIN_RETENTION',
    },
    {
      requirementId: 'op.exp.8.r4.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-08', 'EV-09', 'EV-13'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.8.r5.1',
      levels: ['ALTO'],
      parameterIds: ['P-10'],
      evidenceIds: ['EV-10'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.8.r5.2',
      levels: ['ALTO'],
      parameterIds: ['P-11'],
      evidenceIds: ['EV-11', 'EV-12'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
