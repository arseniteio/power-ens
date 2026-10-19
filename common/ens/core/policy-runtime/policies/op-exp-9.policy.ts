// op.exp.9 · Incident management record. The seven primitives contrast ONE fact against ONE
// parameter grouped by machine; here almost everything groups by another key no control used, the
// FILE (`incidente_id`), and crosses two fact flows by it: EV-01 each affected system of each
// incident keeps its alerts and the window's daily archives verify their chained sum; EV-02 each
// incident has P-02's report phases, except duration and the end of an open incident; EV-03 every
// active response observed in an incident's window is recorded as an emergency action of THAT
// incident; EV-04 every object changed on an affected system during the incident is recorded as a
// modification derived from THAT incident; EV-05 an incident with legal relevance has every P-03
// evidence sealed (conditioned by the record mark and P-04); EV-06 each sealed evidence is in a
// P-05 destination, has chain of custody and its SHA-256 still matches (P-06's longest deadline);
// EV-07 the period of an open or legally relevant incident remains on disk (the indexer's
// protection is not visible without credentials); EV-08 a closed incident of a P-07 severity has
// its audit-event review within the deadline (the clock starts at CLOSING); EV-09 each file row
// links to it (reference).
// An EMPTY record is not an ABSENT one. Absent: nothing to judge against. Empty is judged: zero
// incidents against the alerts the manager saw (P-08, without P-09 groups). What demands nothing
// (no legally relevant incident, no expired review) is said with the read record as proof, not
// assumed.
// Invariants (as in `evidence/judgment.ts`): the collector emits instants and counts, not verdicts
// or ages, so deadlines are measured against `context.now`; no recent heartbeat, record or
// parameter is NO_EVALUABLE, never CUMPLE by missing data; no default deadline or level.
// Types and utilities come from the file, never from a barrel (Settings TDZ cycle).
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

const CONTROL = 'op.exp.9';
const POLICY = 'policy.op.exp.9';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// The manager's collector beats hourly and re-emits the WHOLE record state each run: 24 h + one run
// + margin. Observation tolerance, not policy.
const FRESHNESS_HOURS = 26;

// Same clock margin as `resolveCollectorCoverage`.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Must match P-01's first option.
const ENSFACIL_RECORD = 'Registro ENSFácil (/etc/ensfacil/incident-register.tsv)';

type Status = Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;

// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`). It reaches the evidence and
// requirement through the decision; without it the card inherited the classic model's cause, which
// does not see the facts the policy reads (an absent incident record came out «EVIDENCE», not
// CONFIGURATION).
type Measurement = {
  estado: Status;
  motivo: string;
  causa?: ENSGapCause;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough. Missing parameter (CONFIGURATION),
// missing heartbeat or facts (COLLECTION) and a record the organization does not keep
// (CONFIGURATION) say so explicitly.
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

const SEVERITY: Record<Status, number> = {
  CUMPLE: 0,
  NO_EVALUABLE: 1,
  NO_CUMPLE: 2,
};

const worstStatus = (measurements: Measurement[]): Status =>
  measurements.reduce<Status>(
    (actual, measurement) =>
      SEVERITY[measurement.estado] > SEVERITY[actual] ? measurement.estado : actual,
    'CUMPLE'
  );


// The normalizer splits an event with `evidence_id=EV-02,EV-09` into one per evidence
// (`<id>#EV-02`, `<id>#EV-09`); the FACT is judged here: once.
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

// `-` is the records format's empty.
const isEmptyField = (text: string): boolean => text === '' || text === '-';

const parseNumber = (text: string): number | undefined => {
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    return undefined;
  }

  const value = Number(text);

  return Number.isFinite(value) ? value : undefined;
};

const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return undefined;
  }

  const value = new Date(text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');

const listOf = (text: string): string[] =>
  isEmptyField(text)
    ? []
    : text
        .split(',')
        .map(t => t.trim())
        .filter(t => t && t !== '-');

// Lowest to highest: the order decides the severity of an incident with several rows.
const SEVERITIES = ['baja', 'media', 'alta', 'critica'];

const stripAccents = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const sameSystem = (a: string, b: string): boolean =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

const wholeDays = (ms: number): string => (ms / DAY_MS).toFixed(1);


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
        row[column.name] = cells[i] || '';
      });

      return row;
    });

  return result.length ? result : undefined;
};

const items = (context: ENSPolicyContext, id: string): string[] => {
  const value = findParameter(context, id)?.value;

  if (Array.isArray(value)) {
    return value.map(v => String(v).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[\n,]/)
      .map(v => v.trim())
      .filter(Boolean);
  }

  return [];
};

const positiveScalar = (context: ENSPolicyContext, id: string): string => {
  const value = findParameter(context, id)?.value;

  return value === undefined || value === null || Array.isArray(value)
    ? ''
    : String(value).trim();
};


type Heartbeat = { evento: ENSNormalizedEvent; cubiertas: string[] };

const heartbeat = (context: ENSPolicyContext, now: number): Heartbeat | Measurement => {
  const candidate = facts(context, 'collector_run')
    .map(e => ({ e, t: parseInstant(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS
    )
    .sort((a, b) => b.t - a.t);

  if (!candidate.length) {
    return notMeasured(
      'No consta ninguna pasada del recolector del manager: op.exp.9 se mide en el manager (install-manager.sh del runbook) y sin él no hay registro leído ni alertas contrastadas.',
      'COLLECTION'
    );
  }

  const { e, t } = candidate[0];

  if (now - t > FRESHNESS_HOURS * HOUR_MS) {
    return notMeasured(
      `La última pasada del recolector del manager es de ${e.timestamp} (hace ${((now - t) / HOUR_MS).toFixed(1)} h, más de ${FRESHNESS_HOURS} h): lo que dijo entonces de los registros no describe el estado de hoy.`,
      'COLLECTION'
    );
  }

  if (factField(e, 'resultado') !== 'completada') {
    return notMeasured(
      `La última pasada del recolector del manager (${e.timestamp}) declara resultado='${factField(e, 'resultado') || 'sin dato'}': no terminó correctamente.`,
      'COLLECTION'
    );
  }

  return { evento: e, cubiertas: listOf(factField(e, 'evidencias_cubiertas')) };
};

const isMeasurement = (x: unknown): x is Measurement =>
  typeof x === 'object' && x !== null && (x as Measurement).estado !== undefined;

type LogRow = {
  presente: boolean;
  legible: boolean;
  formato: string;
  validas: number;
  invalidas: number;
  fichero: string;
};

const record = (context: ENSPolicyContext, name: string): LogRow | undefined => {
  const read = facts(context, 'register_read')
    .filter(e => factField(e, 'registro') === name)
    .sort((a, b) => (parseInstant(b.timestamp) || 0) - (parseInstant(a.timestamp) || 0))[0];

  if (!read) {
    return undefined;
  }

  return {
    presente: factField(read, 'presente') === 'si',
    legible: factField(read, 'legible') === 'si',
    formato: factField(read, 'formato'),
    validas: parseNumber(factField(read, 'filas_validas')) || 0,
    invalidas: parseNumber(factField(read, 'filas_invalidas')) || 0,
    fichero: factField(read, 'fichero'),
  };
};

// A record that could not be read whole is not judged on a part; one that does not exist has
// nothing to be judged against. Returns the measurement if it must stop.
const usableRecord = (reg: LogRow | undefined, name: string, file: string): Measurement | undefined => {
  if (!reg) {
    return notMeasured(`El recolector del manager no ha informado del registro de ${name} (${file}) en su última pasada.`, 'COLLECTION');
  }

  if (!reg.presente) {
    return notMeasured(
      `No existe el registro de ${name} ${reg.fichero || file} en el manager (causa CONFIGURATION): un registro ausente no es un registro vacío, y sin él no hay contra qué juzgar. Créalo con la cabecera documentada.`,
      'CONFIGURATION'
    );
  }

  if (!reg.legible) {
    return notMeasured(`El registro de ${name} ${reg.fichero || file} existe pero el recolector no lo pudo leer.`, 'COLLECTION');
  }

  if (reg.formato !== 'ok') {
    return notMeasured(
      `El registro de ${name} ${reg.fichero || file} no empieza por la cabecera documentada (formato=${reg.formato || 'sin dato'}): no se interpreta un registro cuyas columnas no se conocen.`
    );
  }

  return undefined;
};


type Row = {
  evento: ENSNormalizedEvent;
  fase: string;
  fecha?: number;
  fechaTexto: string;
  severidad: string;
  sistemas: string[];
  referencia: string;
  relevante: boolean;
};

type Incident = {
  id: string;
  filas: Row[];
  inicio: number;
  fin?: number;
  abierto: boolean;
  severidad: string;
  sistemas: string[];
  relevante: boolean;
};

const incidents = (context: ENSPolicyContext): Incident[] => {
  const byId = new Map<string, Row[]>();

  facts(context, 'incident_report_registered').forEach(e => {
    const id = factField(e, 'incidente_id');

    if (isEmptyField(id)) {
      return;
    }

    const row: Row = {
      evento: e,
      fase: factField(e, 'fase'),
      fecha: parseInstant(factField(e, 'fecha')),
      fechaTexto: factField(e, 'fecha'),
      severidad: stripAccents(factField(e, 'severidad')),
      sistemas: listOf(factField(e, 'sistemas')),
      referencia: factField(e, 'referencia'),
      relevante: factField(e, 'relevancia_juridica') === 'si',
    };

    byId.set(id, [...(byId.get(id) || []), row]);
  });

  return Array.from(byId.entries())
    .map(([id, rows]) => {
      const dates = rows.map(f => f.fecha).filter((t): t is number => t !== undefined);
      const initial = rows.filter(f => f.fase === 'inicial' && f.fecha !== undefined).map(f => f.fecha as number);
      const final = rows.filter(f => f.fase === 'final' && f.fecha !== undefined).map(f => f.fecha as number);

      // An incident's severity is the highest recorded in any of its phases (same rule as
      // op.exp.7): one that reached critical is not judged with a low one's deadline because it was
      // downgraded on closing.
      const severity = rows
        .map(f => f.severidad)
        .filter(s => SEVERITIES.includes(s))
        .reduce((a, b) => (SEVERITIES.indexOf(b) > SEVERITIES.indexOf(a) ? b : a), '-');

      return {
        id,
        filas: rows,
        inicio: initial.length ? Math.min(...initial) : Math.min(...dates),
        fin: final.length ? Math.max(...final) : undefined,
        abierto: !final.length,
        severidad: severity,
        sistemas: Array.from(new Set(rows.flatMap(f => f.sistemas))),
        relevante: rows.some(f => f.relevante),
      };
    })
    .filter(i => Number.isFinite(i.inicio))
    .sort((a, b) => a.inicio - b.inicio);
};


type Base = {
  ahora: number;
  cubiertas: string[];
  reg: LogRow;
  lista: Incident[];
};

// What every evidence needs before judging anything: recent heartbeat, compatible P-01, the
// incident record read and the evidence covered in the last run. If something is missing, that is
// the measurement.
const base = (
  context: ENSPolicyContext,
  now: number,
  evidence: string,
  requiresP01: boolean
): Base | Measurement => {
  const alive = heartbeat(context, now);

  if (isMeasurement(alive)) {
    return alive;
  }

  const p01 = positiveScalar(context, 'P-01');

  if (p01 && p01 !== ENSFACIL_RECORD) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} declara «${p01}» como sistema de registro. ENSFácil solo lee su registro TSV del manager (/etc/ensfacil/incident-register.tsv); la integración con esa herramienta no existe, así que el registro de la gestión no se puede demostrar.`,
      'CONFIGURATION'
    );
  }

  if (!p01 && requiresP01) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} está sin configurar: no está declarado dónde se registran los incidentes.`,
      'CONFIGURATION'
    );
  }

  const reg = record(context, 'incidentes');
  const stop = usableRecord(reg, 'incidentes', '/etc/ensfacil/incident-register.tsv');

  if (stop) {
    return stop;
  }

  if (!alive.cubiertas.includes(evidence)) {
    return notMeasured(
      `La última pasada del recolector del manager (${alive.evento.timestamp}) no declara haber leído las fuentes de ${evidence}: ver sus avisos y degradaciones.`,
      'COLLECTION'
    );
  }

  return {
    ahora: now,
    cubiertas: alive.cubiertas,
    reg: reg as LogRow,
    lista: incidents(context),
  };
};

// A record with rows that could not be interpreted allows asserting nothing about what is missing:
// it lowers a CUMPLE to NO_EVALUABLE, never a NO_CUMPLE.
const withInvalidRows = (measurement: Measurement, reg: LogRow, name = 'incidentes'): Measurement =>
  measurement.estado === 'CUMPLE' && reg.invalidas > 0
    ? notMeasured(
        `${measurement.motivo} Pero ${reg.invalidas} fila(s) del registro de ${name} no se pudieron interpretar (ver los avisos del recolector): no se puede afirmar que no falte nada.`
      )
    : measurement;


// Zero incidents is judged against the non-ENSFácil alerts the manager generated in the last 30
// days above P-08's level. Only EV-02 can fail for this: it asks whether what had to be recorded
// was; for the others an empty record with pending alerts leaves no file to examine.
const emptyRecordCheck = (
  context: ENSPolicyContext,
  forEv02: boolean
): Measurement => {
  const level = parseNumber(positiveScalar(context, 'P-08'));

  if (level === undefined) {
    return notMeasured(
      `El registro de incidentes está vacío y ${parameterDisplayName(context, 'P-08')} no está declarado: sin un nivel de alerta contra el que contrastarlo, cero incidentes no se puede juzgar.`,
      'CONFIGURATION'
    );
  }

  const volume = facts(context, 'alert_volume_observed').sort(
    (a, b) => (parseInstant(b.timestamp) || 0) - (parseInstant(a.timestamp) || 0)
  )[0];

  if (!volume) {
    return notMeasured(
      'El registro de incidentes está vacío y el recolector no ha informado del volumen de alertas del manager: no hay contraste.',
      'COLLECTION'
    );
  }

  const detail = parseNumber(factField(volume, 'nivel_detalle'));

  if (detail === undefined || level < detail) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-08')} declara el nivel ${level}, y el recolector solo detalla por regla desde el nivel ${detail ?? '?'}: no se puede contrastar por debajo.`
    );
  }

  const rules = facts(context, 'alert_rule_volume_observed');
  const declared = parseNumber(factField(volume, 'reglas'));

  if (declared === undefined || rules.length < declared) {
    return notMeasured(
      `El recolector declara ${factField(volume, 'reglas') || '?'} reglas con alertas de nivel ${detail} o superior y solo han llegado ${rules.length}: el contraste no se hace sobre una parte.`,
      'COLLECTION'
    );
  }

  const excludedItems = items(context, 'P-09');
  const excludedList: string[] = [];
  const above: { regla: string; nivel: number; alertas: number; texto: string }[] = [];

  rules.forEach(r => {
    const n = parseNumber(factField(r, 'nivel'));
    const alerts = parseNumber(factField(r, 'alertas')) || 0;

    if (n === undefined || n < level || !alerts) {
      return;
    }

    const groups = listOf(factField(r, 'grupos'));
    const excludedGroup = groups.find(g => excludedItems.includes(g));

    if (excludedGroup) {
      excludedList.push(`${alerts} de la regla ${factField(r, 'regla')} (${excludedGroup})`);

      return;
    }

    above.push({
      regla: factField(r, 'regla'),
      nivel: n,
      alertas: alerts,
      texto: `${alerts} × regla ${factField(r, 'regla')} nivel ${n} «${factField(r, 'descripcion')}» en ${factField(r, 'agentes')}`,
    });
  });

  const total = above.reduce((t, e) => t + e.alertas, 0);
  const window = `${factField(volume, 'desde')} → ${factField(volume, 'hasta')}`;
  const outside = excludedList.length ? ` Excluidas por P-09: ${formatList(excludedList)}.` : '';
  const withoutFile = listOf(factField(volume, 'dias_sin_archivo'));

  if (total > 0) {
    above.sort((a, b) => b.nivel - a.nivel || b.alertas - a.alertas);

    return forEv02
      ? nonCompliant(
          `El registro de incidentes está vacío y el manager generó ${total} alertas ajenas a ENSFácil de nivel ${level} o superior (P-08) entre ${window}, sin ningún expediente: ${formatList(above.map(e => e.texto))}.${outside} Si no eran incidentes, lo decide y lo documenta op.exp.7 (o se excluye su grupo en P-09); si lo eran, su gestión no está registrada.`
        )
      : notMeasured(
          `El registro de incidentes está vacío y hay ${total} alertas de nivel ${level} o superior sin expediente (lo señala EV-02): no hay ningún expediente que examinar.`
        );
  }

  if (withoutFile.length) {
    return notMeasured(
      `El registro de incidentes está vacío, pero faltan los archivos de alertas de ${formatList(withoutFile)}: no se puede afirmar que en esos días no hubiera alertas de nivel ${level} o superior.${outside}`
    );
  }

  return compliant(
    `El registro de incidentes está leído y vacío, y el manager no generó ninguna alerta ajena a ENSFácil de nivel ${level} o superior (P-08) entre ${window}: no consta nada que debiera tener expediente.${outside}`
  );
};


type Window = {
  evento: ENSNormalizedEvent;
  conocido: boolean;
  alertas: number;
  sinArchivo: string[];
  alterados: string[];
  sinSuma: string[];
  acciones: number;
  accionesEmitidas: number;
  cambios: number;
  cambiosEmitidos: number;
  desde: string;
  hasta: string;
};

const windows = (context: ENSPolicyContext): Window[] =>
  facts(context, 'incident_source_events_available').map(e => ({
    evento: e,
    conocido: factField(e, 'agente_conocido') === 'si',
    alertas: parseNumber(factField(e, 'alertas')) || 0,
    sinArchivo: listOf(factField(e, 'dias_sin_archivo')),
    alterados: listOf(factField(e, 'dias_alterados')),
    sinSuma: listOf(factField(e, 'dias_sin_suma')),
    acciones: parseNumber(factField(e, 'acciones')) || 0,
    accionesEmitidas: parseNumber(factField(e, 'acciones_emitidas')) || 0,
    cambios: parseNumber(factField(e, 'cambios')) || 0,
    cambiosEmitidos: parseNumber(factField(e, 'cambios_emitidos')) || 0,
    desde: factField(e, 'desde'),
    hasta: factField(e, 'hasta'),
  }));

const windowOf = (all: Window[], incident: string, system: string): Window | undefined =>
  all.find(v => factField(v.evento, 'incidente_id') === incident && sameSystem(factField(v.evento, 'sistema'), system));

type Action = {
  incidente: string;
  fecha?: number;
  sistema: string;
  tipo: string;
  objeto: string;
};

const actions = (context: ENSPolicyContext): Action[] =>
  facts(context, 'incident_action_registered').map(e => ({
    incidente: factField(e, 'incidente_id'),
    fecha: parseInstant(factField(e, 'fecha')),
    sistema: factField(e, 'sistema'),
    tipo: factField(e, 'tipo'),
    objeto: factField(e, 'objeto'),
  }));

const coversSystem = (declared: string, observed: string): boolean =>
  declared === '*' || sameSystem(declared, observed);


const ev01 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = base(context, now, 'EV-01', true);

  if (isMeasurement(b)) {
    return b;
  }

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, false),
      b.reg
    );
  }

  const all = windows(context);
  const findings: string[] = [];
  const withoutMeasurement: string[] = [];
  const ok: string[] = [];

  b.lista.forEach(inc => {
    if (!inc.sistemas.length) {
      withoutMeasurement.push(`${inc.id}: el registro no declara ningún sistema afectado`);

      return;
    }

    inc.sistemas.forEach(system => {
      const v = windowOf(all, inc.id, system);

      if (!v) {
        withoutMeasurement.push(`${inc.id} en ${system}: el recolector no ha informado de su ventana`);

        return;
      }

      // The daily archives belong to the manager, not the system: a lost day is reported once per
      // incident even if it affects all its systems.
      if (v.sinArchivo.length) {
        findings.push(`${inc.id}: faltan los archivos de alertas del manager de ${formatList(v.sinArchivo)} (ventana ${v.desde} → ${v.hasta})`);
      }

      if (v.alterados.length) {
        findings.push(`${inc.id}: el archivo de alertas de ${formatList(v.alterados)} no coincide con la suma encadenada que Wazuh selló al rotarlo`);
      }

      if (v.sinArchivo.length || v.alterados.length) {
        return;
      }

      if (!v.conocido) {
        withoutMeasurement.push(`${inc.id}: «${system}» no es un agente de este manager, así que sus eventos no están en él`);

        return;
      }

      if (v.sinSuma.length) {
        withoutMeasurement.push(`${inc.id} en ${system}: los archivos de ${formatList(v.sinSuma)} no tienen su suma de Wazuh y su integridad no se puede acreditar`);

        return;
      }

      if (v.alertas === 0) {
        withoutMeasurement.push(`${inc.id} en ${system}: ninguna alerta de ese agente entre ${v.desde} y ${v.hasta}; el origen del incidente no es observable en Wazuh`);

        return;
      }

      ok.push(`${inc.id} en ${system}: ${v.alertas} alertas (${v.desde} → ${v.hasta})`);
    });
  });

  if (findings.length) {
    return nonCompliant(`No se conservan los eventos que originaron los incidentes: ${formatList(Array.from(new Set(findings)))}.`);
  }

  if (withoutMeasurement.length) {
    return notMeasured(`No se puede acreditar la conservación de los eventos de origen: ${formatList(withoutMeasurement)}.${ok.length ? ` Sí consta: ${formatList(ok)}.` : ''}`);
  }

  return withInvalidRows(
    compliant(`Los eventos de origen de los ${b.lista.length} incidentes se conservan en el manager, con los archivos diarios de su ventana presentes y su suma encadenada verificada: ${formatList(ok)}.`),
    b.reg
  );
};

const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = base(context, now, 'EV-02', true);

  if (isMeasurement(b)) {
    return b;
  }

  const p02 = tableParameterRows(context, 'P-02');

  if (!p02) {
    return notMeasured(`${parameterDisplayName(context, 'P-02')} está sin configurar: no están declaradas las fases de reporte que se exigen.`, 'CONFIGURATION');
  }

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, true),
      b.reg
    );
  }

  const required = p02
    .map(f => ({ fase: stripAccents(f.fase), horas: parseNumber((f.exigible_desde_horas || '').replace(',', '.')) }))
    .filter(f => ['inicial', 'intermedio', 'final'].includes(f.fase));

  if (!required.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-02')} no declara ninguna fase reconocible (inicial, intermedio, final).`, 'CONFIGURATION');
  }

  const findings: string[] = [];
  const ok: string[] = [];

  b.lista.forEach(inc => {
    const duration = (inc.fin ?? now) - inc.inicio;
    const missing: string[] = [];

    required.forEach(({ fase: phase, horas: hours }) => {
      if (phase === 'final' && inc.abierto) {
        return;
      }

      if (hours !== undefined && duration <= hours * HOUR_MS) {
        return;
      }

      if (!inc.filas.some(f => f.fase === phase)) {
        missing.push(phase);
      }
    });

    const initial = inc.filas.find(f => f.fase === 'inicial');
    const incomplete: string[] = [];

    if (initial && isEmptyField(initial.severidad)) {
      incomplete.push('sin severidad');
    }

    if (initial && !initial.sistemas.length) {
      incomplete.push('sin sistemas afectados');
    }

    if (missing.length) {
      findings.push(
        `${inc.id} (${inc.abierto ? 'abierto' : 'cerrado'}, ${wholeDays(duration)} días) sin reporte ${missing.join(' ni ')}`
      );
    }

    if (incomplete.length) {
      findings.push(`${inc.id}: el reporte inicial está ${incomplete.join(' y ')}`);
    }

    if (!missing.length && !incomplete.length) {
      ok.push(`${inc.id} (${inc.filas.map(f => f.fase).join(', ')})`);
    }
  });

  if (findings.length) {
    return nonCompliant(`Incidentes sin los reportes que exige P-02: ${formatList(findings)}.`);
  }

  return withInvalidRows(
    compliant(`Los ${b.lista.length} incidentes registrados tienen las fases de reporte que exige P-02: ${formatList(ok)}.`),
    b.reg
  );
};

// EV-03 and EV-04 are the same sweep over two classes of fact: what Wazuh recorded as done in the
// incident's window, against what the organization linked to the file.
const sweep = (
  context: ENSPolicyContext,
  now: number,
  evidence: 'EV-03' | 'EV-04'
): Measurement => {
  const b = base(context, now, evidence, true);

  if (isMeasurement(b)) {
    return b;
  }

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, false),
      b.reg
    );
  }

  const isEv03 = evidence === 'EV-03';
  const typeFact = isEv03 ? 'emergency_action_observed' : 'system_change_observed';
  const recordedType = isEv03 ? 'emergencia' : 'modificacion';
  const fieldObject = isEv03 ? 'programa' : 'objeto';
  const that = isEv03 ? 'respuesta activa' : 'cambio';

  const regAct = record(context, 'actuaciones');
  const all = windows(context);
  const observed = facts(context, typeFact);
  const recorded = actions(context).filter(a => a.tipo === recordedType);

  const findings: string[] = [];
  const withoutMeasurement: string[] = [];
  let seen = 0;

  b.lista.forEach(inc => {
    if (!inc.sistemas.length) {
      withoutMeasurement.push(`${inc.id}: el registro no declara ningún sistema afectado que barrer`);
    }

    inc.sistemas.forEach(system => {
      const v = windowOf(all, inc.id, system);

      if (!v) {
        withoutMeasurement.push(`${inc.id} en ${system}: el recolector no ha informado de su ventana`);

        return;
      }

      if (!v.conocido) {
        withoutMeasurement.push(`${inc.id}: «${system}» no es un agente de este manager y no se puede barrer`);

        return;
      }

      const ofSystem = observed.filter(
        e => factField(e, 'incidente_id') === inc.id && sameSystem(factField(e, 'sistema'), system)
      );

      seen += ofSystem.length;

      ofSystem.forEach(e => {
        const object = factField(e, fieldObject);

        const lists = recorded.some(
          a =>
            a.incidente === inc.id &&
            coversSystem(a.sistema, system) &&
            (a.objeto === '*' || (isEv03 ? a.objeto === object : !isEmptyField(a.objeto) && object.startsWith(a.objeto)))
        );

        if (!lists) {
          findings.push(
            `${inc.id} en ${system}: ${that} ${isEv03 ? '' : `de ${factField(e, 'origen')} `}«${object}» (${factField(e, 'veces') || '1'} vez/veces, ${factField(e, 'primera')}${factField(e, 'ultima') && factField(e, 'ultima') !== factField(e, 'primera') ? ` → ${factField(e, 'ultima')}` : ''})`
          );
        }
      });

      const declared = isEv03 ? v.acciones : v.cambios;
      const emitted = isEv03 ? v.accionesEmitidas : v.cambiosEmitidos;

      if (emitted < declared || ofSystem.length < emitted) {
        withoutMeasurement.push(
          `${inc.id} en ${system}: el barrido encontró ${declared} objetos distintos y solo han llegado ${ofSystem.length}`
        );
      }

      if (v.sinArchivo.length || v.alterados.length) {
        withoutMeasurement.push(`${inc.id} en ${system}: faltan o están alterados los archivos de alertas de ${formatList(v.sinArchivo.concat(v.alterados))}, así que el barrido no es completo`);
      }
    });
  });

  if (findings.length) {
    const withoutRecord = regAct && !regAct.presente ? ' No existe /etc/ensfacil/incident-actions.tsv, así que ninguna consta.' : '';

    return nonCompliant(
      `${isEv03 ? 'Actuaciones de emergencia' : 'Modificaciones del sistema'} observadas por Wazuh en la ventana de un incidente que no constan en su expediente (registro de actuaciones, tipo ${recordedType}): ${formatList(findings)}.${withoutRecord}`
    );
  }

  if (withoutMeasurement.length) {
    return notMeasured(`El barrido de las ventanas de incidente no es completo: ${formatList(withoutMeasurement)}.`);
  }

  const manual = recorded.filter(a => b.lista.some(i => i.id === a.incidente)).length;

  const measurement = compliant(
    seen
      ? `Las ${seen} ${isEv03 ? 'respuestas activas' : 'modificaciones'} observadas en las ventanas de los ${b.lista.length} incidentes constan en su expediente.`
      : `Barridas las ventanas de los ${b.lista.length} incidentes en las alertas del manager: ninguna ${isEv03 ? 'respuesta activa' : 'modificación de ficheros, paquetes, configuración ni cuentas'} en los sistemas afectados.${manual ? ` Constan ${manual} ${recordedType === 'emergencia' ? 'actuaciones de emergencia' : 'modificaciones'} registradas a mano.` : ''}`
  );

  return regAct && regAct.presente ? withInvalidRows(withInvalidRows(measurement, b.reg), regAct, 'actuaciones') : withInvalidRows(measurement, b.reg);
};

const HEX64 = /^[0-9a-f]{64}$/i;

type Sealed = {
  evento: ENSNormalizedEvent;
  incidente: string;
  fecha?: number;
  tipo: string;
  fichero: string;
  sha256: string;
  destino: string;
};

const sealed = (context: ENSPolicyContext): Sealed[] =>
  facts(context, 'evidence_export_sealed').map(e => ({
    evento: e,
    incidente: factField(e, 'incidente_id'),
    fecha: parseInstant(factField(e, 'fecha')),
    tipo: factField(e, 'tipo_evidencia'),
    fichero: factField(e, 'fichero'),
    sha256: factField(e, 'sha256'),
    destino: factField(e, 'destino'),
  }));

const ev05 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = base(context, now, 'EV-05', false);

  if (isMeasurement(b)) {
    return b;
  }

  const p03 = tableParameterRows(context, 'P-03');

  if (!p03) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-03')} está sin configurar: la composición de la evidencia con valor jurisdiccional no está determinada, y el ENS exige hacerlo con asesoramiento legal especializado.`,
      'CONFIGURATION'
    );
  }

  if (!items(context, 'P-04').length) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-04')} está sin configurar: la marca de relevancia jurídica del registro no tiene criterios declarados contra los que haberse tomado.`,
      'CONFIGURATION'
    );
  }

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, false),
      b.reg
    );
  }

  const relevantes = b.lista.filter(i => i.relevante);

  if (!relevantes.length) {
    return withInvalidRows(
      compliant(
        `Ninguno de los ${b.lista.length} incidentes del registro está marcado con relevancia jurídica según los criterios de P-04: no hay evidencia jurisdiccional que exigir. La marca la pone la organización en el registro.`
      ),
      b.reg
    );
  }

  const regCus = record(context, 'custodia');
  const stop = usableRecord(regCus, 'custodia', '/etc/ensfacil/evidence-custody.tsv');

  if (stop) {
    return notMeasured(`Hay ${relevantes.length} incidente(s) con relevancia jurídica. ${stop.motivo}`, stop.causa);
  }

  const all = sealed(context);
  const missing: string[] = [];
  const ok: string[] = [];

  relevantes.forEach(inc => {
    p03.forEach(row => {
      const type = row.tipo_evidencia;

      const done = all.find(
        s =>
          s.incidente === inc.id &&
          stripAccents(s.tipo) === stripAccents(type) &&
          HEX64.test(s.sha256) &&
          (!row.destino || s.destino === row.destino)
      );

      if (done) {
        ok.push(`${inc.id}: ${type} (${done.sha256.slice(0, 12)}…)`);

        return;
      }

      const similar = all.find(s => s.incidente === inc.id && stripAccents(s.tipo) === stripAccents(type));

      missing.push(
        similar
          ? `${inc.id}: ${type} ${HEX64.test(similar.sha256) ? `depositada en «${similar.destino}» y P-03 exige «${row.destino}»` : 'sin un SHA-256 válido'}`
          : `${inc.id}: ${type} no se ha exportado ni sellado`
      );
    });
  });

  if (missing.length) {
    return nonCompliant(`Incidentes con relevancia jurídica sin la evidencia sellada que determina P-03: ${formatList(missing)}.`);
  }

  return withInvalidRows(
    withInvalidRows(
      compliant(`Los ${relevantes.length} incidentes con relevancia jurídica tienen sellada cada evidencia de P-03: ${formatList(ok)}.`),
      b.reg
    ),
    regCus as LogRow,
    'custodia'
  );
};

const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = base(context, now, 'EV-06', false);

  if (isMeasurement(b)) {
    return b;
  }

  if (!items(context, 'P-04').length) {
    return notMeasured(`${parameterDisplayName(context, 'P-04')} está sin configurar: sin criterios de relevancia jurídica no hay régimen de custodia que exigir.`, 'CONFIGURATION');
  }

  const p05 = tableParameterRows(context, 'P-05');

  if (!p05) {
    return notMeasured(`${parameterDisplayName(context, 'P-05')} está sin configurar: no hay repositorio de custodia declarado contra el que situar las evidencias.`, 'CONFIGURATION');
  }

  const p06 = tableParameterRows(context, 'P-06');
  const deadlines = (p06 || [])
    .map(f => parseNumber((f.dias_retencion || '').replace(',', '.')))
    .filter((d): d is number => d !== undefined && d >= 0);

  if (!deadlines.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-06')} no declara ningún plazo de retención en días: no se puede saber si una evidencia desaparecida se destruyó antes de tiempo.`, 'CONFIGURATION');
  }

  const retention = Math.max(...deadlines);

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, false),
      b.reg
    );
  }

  const regCus = record(context, 'custodia');
  const relevantes = b.lista.filter(i => i.relevante);

  if (!regCus) {
    return notMeasured('El recolector del manager no ha informado del registro de custodia (/etc/ensfacil/evidence-custody.tsv) en su última pasada.', 'COLLECTION');
  }

  if (!regCus.presente) {
    return relevantes.length
      ? notMeasured(`Hay ${relevantes.length} incidente(s) con relevancia jurídica y no existe el registro de custodia /etc/ensfacil/evidence-custody.tsv (causa CONFIGURATION).`, 'CONFIGURATION')
      : withInvalidRows(compliant('Ningún incidente del registro está marcado con relevancia jurídica y no hay evidencias en custodia: no hay cadena de custodia que acreditar.'), b.reg);
  }

  const stopCus = usableRecord(regCus, 'custodia', '/etc/ensfacil/evidence-custody.tsv');

  if (stopCus) {
    return stopCus;
  }

  const all = sealed(context);

  if (!all.length) {
    return relevantes.length
      ? notMeasured(`Hay ${relevantes.length} incidente(s) con relevancia jurídica y ninguna evidencia en custodia (lo señala EV-05): no hay cadena de custodia que examinar.`)
      : withInvalidRows(compliant('No hay evidencias en custodia ni incidentes con relevancia jurídica: no hay cadena de custodia que acreditar.'), b.reg);
  }

  const regLog = record(context, 'custodia_accesos');
  const stopLog = usableRecord(regLog, 'cadena de custodia', '/etc/ensfacil/evidence-custody-log.tsv');

  if (stopLog) {
    return notMeasured(`Hay ${all.length} evidencia(s) en custodia. ${stopLog.motivo}`, stopLog.causa);
  }

  const destinations = p05.map(f => f.destino).filter(Boolean);
  const accesses = facts(context, 'custody_access_recorded');
  const verifications = facts(context, 'custody_integrity_checked');

  const findings: string[] = [];
  const withoutMeasurement: string[] = [];
  const ok: string[] = [];

  all.forEach(s => {
    const name = `${s.incidente}: ${s.fichero}`;
    let badly = false;

    if (!destinations.includes(s.destino)) {
      findings.push(`${name} está en «${s.destino}», que no es un repositorio de custodia de P-05`);
      badly = true;
    }

    if (!accesses.some(a => factField(a, 'fichero') === s.fichero)) {
      findings.push(`${name} no tiene ninguna anotación en el registro de cadena de custodia`);
      badly = true;
    }

    const v = verifications.find(x => factField(x, 'fichero') === s.fichero && factField(x, 'incidente_id') === s.incidente);

    if (!v) {
      withoutMeasurement.push(`${name}: el recolector no ha informado de su verificación`);

      return;
    }

    if (factField(v, 'verificable') === 'si') {
      if (factField(v, 'coincide') !== 'si') {
        findings.push(`${name}: el SHA-256 actual (${factField(v, 'sha256_actual').slice(0, 12)}…) no coincide con el sellado (${s.sha256.slice(0, 12)}…): la evidencia se ha alterado`);

        return;
      }

      if (!badly) {
        ok.push(`${name} (SHA-256 verificado ${factField(v, 'verificado') || ''})`.trim());
      }

      return;
    }

    if (factField(v, 'motivo') === 'ausente') {
      if (s.fecha !== undefined && now - s.fecha < retention * DAY_MS) {
        findings.push(`${name} ya no existe en el manager y se recogió el ${factField(s.evento, 'fecha')}, dentro del plazo más largo de P-06 (${retention} días): evidencia destruida antes de plazo`);
      } else if (s.fecha === undefined) {
        withoutMeasurement.push(`${name} ya no existe y su fecha de recogida no se puede leer`);
      }

      return;
    }

    withoutMeasurement.push(`${name}: ${factField(v, 'motivo') === 'remoto' ? 'está fuera del manager y su integridad no se puede recalcular desde aquí' : 'el manager no la puede leer'}`);
  });

  if (findings.length) {
    return nonCompliant(`La cadena de custodia de las evidencias no es acreditable: ${formatList(findings)}.`);
  }

  if (withoutMeasurement.length) {
    return notMeasured(`No se puede acreditar la integridad de todo lo custodiado: ${formatList(withoutMeasurement)}.`);
  }

  return withInvalidRows(
    compliant(
      `Las ${all.length} evidencias custodiadas están en un repositorio de P-05, tienen cadena de custodia anotada y su SHA-256 sigue coincidiendo: ${formatList(ok)}. Que el registro recoja TODOS los accesos es una declaración de la organización: el manager no ve los accesos al repositorio.`
    ),
    b.reg
  );
};

const ev07 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = base(context, now, 'EV-07', false);

  if (isMeasurement(b)) {
    return b;
  }

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, false),
      b.reg
    );
  }

  const protectable = b.lista.filter(i => i.abierto || i.relevante);

  if (!protectable.length) {
    return withInvalidRows(
      compliant(`Ninguno de los ${b.lista.length} incidentes está abierto ni marcado con relevancia jurídica: no hay periodo que proteger de la rotación.`),
      b.reg
    );
  }

  const all = windows(context);
  const findings: string[] = [];
  const presentes: string[] = [];

  protectable.forEach(inc => {
    inc.sistemas.forEach(system => {
      const v = windowOf(all, inc.id, system);

      if (!v) {
        return;
      }

      if (v.sinArchivo.length) {
        findings.push(`${inc.id} (${inc.abierto ? 'abierto' : 'relevancia jurídica'}): ya no están los registros de ${formatList(v.sinArchivo)}`);
      } else if (v.alterados.length) {
        findings.push(`${inc.id}: los registros de ${formatList(v.alterados)} no coinciden con su suma de Wazuh`);
      } else {
        presentes.push(`${inc.id} en ${system} (${v.desde} → ${v.hasta})`);
      }
    });
  });

  if (findings.length) {
    return nonCompliant(`Se han perdido o alterado registros del periodo de incidentes que había que proteger: ${formatList(Array.from(new Set(findings)))}.`);
  }

  return notMeasured(
    `Causa CONFIGURATION. Los archivos diarios de alertas del manager del periodo de ${protectable.length} incidente(s) abierto(s) o con relevancia jurídica siguen en disco con su suma verificada${presentes.length ? ` (${formatList(presentes)})` : ''}, pero lo que op.exp.9.2 pide es que los índices wazuh-alerts-* de ese periodo estén exentos de la política ISM de rotación, y eso solo se ve consultando el wazuh-indexer. El recolector del manager no usa ninguna credencial, así que esa protección queda sin demostrar.`,
    'CONFIGURATION'
  );
};

const ev08 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = base(context, now, 'EV-08', false);

  if (isMeasurement(b)) {
    return b;
  }

  const p07 = tableParameterRows(context, 'P-07');

  if (!p07) {
    return notMeasured(`${parameterDisplayName(context, 'P-07')} está sin configurar: no está decidido qué incidentes obligan a revisar los eventos auditables ni en qué plazo.`, 'CONFIGURATION');
  }

  const deadlines = new Map<string, number>();

  p07.forEach(f => {
    const d = parseNumber((f.plazo_dias || '').replace(',', '.'));

    if (d !== undefined && d >= 0) {
      deadlines.set(stripAccents(f.severidad), d);
    }
  });

  if (!deadlines.size) {
    return notMeasured(`${parameterDisplayName(context, 'P-07')} no declara ningún plazo en días utilizable.`, 'CONFIGURATION');
  }

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, false),
      b.reg
    );
  }

  const reviews = actions(context).filter(a => a.tipo === 'revision_eventos');

  const changes = facts(context, 'auditable_events_revised')
    .map(e => ({ e, t: parseInstant(factField(e, 'modificado')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);

  const findings: string[] = [];
  const ok: string[] = [];
  const pending: string[] = [];

  b.lista.forEach(inc => {
    const deadline = deadlines.get(inc.severidad);

    if (deadline === undefined || inc.abierto || inc.fin === undefined) {
      return;
    }

    const expires = inc.fin + deadline * DAY_MS;

    const recorded = reviews.find(
      r => r.incidente === inc.id && r.fecha !== undefined && r.fecha >= inc.inicio && r.fecha <= expires
    );

    if (recorded) {
      ok.push(`${inc.id}: revisión registrada el ${new Date(recorded.fecha as number).toISOString().slice(0, 10)}`);

      return;
    }

    const change = changes
      .filter(c => c.t >= inc.inicio && c.t <= expires)
      .sort((a, b2) => a.t - b2.t)[0];

    if (change) {
      ok.push(`${inc.id}: ${factField(change.e, 'fichero')} modificado el ${factField(change.e, 'modificado')} (por correlación temporal con el incidente)`);

      return;
    }

    if (now > expires) {
      findings.push(
        `${inc.id} (severidad ${inc.severidad}, cerrado el ${new Date(inc.fin).toISOString().slice(0, 10)}): ni revisión registrada ni cambio de reglas, decodificadores, ossec.conf o agent.conf en los ${deadline} días de P-07`
      );
    } else {
      pending.push(`${inc.id} (vence el ${new Date(expires).toISOString().slice(0, 10)})`);
    }
  });

  if (findings.length) {
    return nonCompliant(`El análisis de incidentes no ha llevado a revisar los eventos auditables dentro del plazo de P-07: ${formatList(findings)}.`);
  }

  const text = ok.length
    ? `Revisión de eventos auditables acreditada: ${formatList(ok)}.`
    : 'Ningún incidente cerrado de una severidad de P-07 tiene su revisión vencida.';

  return withInvalidRows(
    compliant(`${text}${pending.length ? ` Dentro de plazo todavía: ${formatList(pending)}.` : ''}`),
    b.reg
  );
};

const ev09 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = base(context, now, 'EV-09', false);

  if (isMeasurement(b)) {
    return b;
  }

  if (!b.lista.length) {
    return withInvalidRows(
      b.reg.invalidas ? notMeasured('El registro de incidentes no tiene ninguna fila válida.') : emptyRecordCheck(context, false),
      b.reg
    );
  }

  const withoutReference: string[] = [];

  b.lista.forEach(inc => {
    const orphan = inc.filas.filter(f => isEmptyField(f.referencia)).map(f => f.fase || '?');

    if (orphan.length) {
      withoutReference.push(`${inc.id} (${orphan.join(', ')})`);
    }
  });

  if (withoutReference.length) {
    return nonCompliant(
      `Filas del registro sin referencia al expediente, con lo que el expediente no se puede presentar entero: ${formatList(withoutReference)}.`
    );
  }

  return withInvalidRows(
    compliant(
      `Los ${b.lista.length} expedientes enlazan cada una de sus filas; el informe los consolida por incidente con sus alertas, actuaciones, cambios y evidencias.`
    ),
    b.reg
  );
};


const REQUIREMENTS: Record<string, { evidencias: string[]; parametros: string[]; tipo: ENSPolicyDecision['trace']['ruleType'] }> = {
  'op.exp.9.1': { evidencias: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'], parametros: ['P-01', 'P-02', 'P-08', 'P-09'], tipo: 'COVERAGE_REQUIRED' },
  'op.exp.9.2': { evidencias: ['EV-05', 'EV-06', 'EV-07', 'EV-09'], parametros: ['P-03', 'P-04', 'P-05', 'P-06'], tipo: 'CONDITIONAL_REQUIRED' },
  'op.exp.9.3': { evidencias: ['EV-08', 'EV-09'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED' },
};

const decide = (
  requirement: string,
  status: Status,
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

export const measureOpExp9Evidences = (context: ENSPolicyContext): Record<string, Measurement> => {
  const now = (context.now || new Date()).getTime();

  return {
    'EV-01': ev01(context, now),
    'EV-02': ev02(context, now),
    'EV-03': sweep(context, now, 'EV-03'),
    'EV-04': sweep(context, now, 'EV-04'),
    'EV-05': ev05(context, now),
    'EV-06': ev06(context, now),
    'EV-07': ev07(context, now),
    'EV-08': ev08(context, now),
    'EV-09': ev09(context, now),
  };
};

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const measurements = measureOpExp9Evidences(context);
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

  return { decisions, runtimeVariables: variables };
};

export const opExp9PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.9.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-08', 'P-09'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.9.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-04', 'P-05', 'P-06'],
      evidenceIds: ['EV-05', 'EV-06', 'EV-07', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.9.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
