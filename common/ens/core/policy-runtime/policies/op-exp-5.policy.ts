// op.exp.5 · Change management.
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
import type { ENSControlParameter, ENSLevel } from '../../../configuration/types';
import {
  toParameterTableRows,
  toTableRowCells,
} from '../../../configuration/services/parameter-value-validator';
import { parseReferenceList } from '../../evidence/judgment';

const CONTROL = 'op.exp.5';
const POLICY = 'policy.op.exp.5';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Freshness of the request-register read: the collector re-emits it every 20 h and runs hourly, so
// 24 h + one run + margin. Observation tolerance, not policy.
const FRESHNESS_HOURS = 26;

// Same clock margin as `resolveCollectorCoverage`.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

// Heartbeat confirming an evidence's coverage, as in the primitives.
const HEARTBEAT_HOURS = 24;

// Observation window of ACTIONS. A request whose window ended earlier cannot be contrasted with
// facts no longer in the window: judging it would give NO_CUMPLE for lack of data.
const PERIOD_DAYS = 30;

// Columns of the request register, in order: the TSV contract.
export const REQUEST_LOG_COLUMNS = [
  'peticion_id',
  'fecha_registro',
  'sistema',
  'descripcion',
  'riesgo',
  'aprobado_por',
  'fecha_aprobacion',
  'ventana_inicio',
  'ventana_fin',
  'preproduccion',
  'estado',
  'documentacion',
  'impacto_seguridad',
  'referencia',
];

// States in which the request went through authorization. Only an approved request authorizes a
// change; `revertida` was approved and deployed.
const AUTHORIZED_ROWS = ['aprobada', 'implantada', 'revertida'];
const DEPLOYED_STATES = ['implantada', 'revertida'];

// `causa` only with NO_EVALUABLE: whose gap it is (see `ENSGapCause`). It reaches the evidence and
// requirement through the decision; without it the card inherited the classic model's cause, which
// does not see the facts the policy reads (EV-05 said «nothing arrived» when P-05 was missing).
type Measurement = {
  estado: Exclude<ENSComplianceStatus, 'PARCIAL' | 'NO_APLICA'>;
  motivo: string;
  causa?: ENSGapCause;
};

const compliant = (motive: string): Measurement => ({ estado: 'CUMPLE', motivo: motive });
const nonCompliant = (motive: string): Measurement => ({ estado: 'NO_CUMPLE', motivo: motive });
// Defaults to EVIDENCE: the data arrived and is not enough; missing parameter and missing facts say
// so explicitly and the collector's declarations carry ITS cause (`degradacion`).
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

const isMeasurement = (x: unknown): x is Measurement =>
  typeof x === 'object' && x !== null && (x as Measurement).estado !== undefined && (x as Measurement).motivo !== undefined;


// The normalizer splits an event with `evidence_id=EV-01,EV-02` into one per evidence; the FACT is
// judged here, so it counts once.
const facts = (context: ENSPolicyContext, type: string): ENSNormalizedEvent[] => {
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
  const t = String(text || '').trim().replace(',', '.');

  if (!/^-?\d+(\.\d+)?$/.test(t)) {
    return undefined;
  }

  const value = Number(t);

  return Number.isFinite(value) ? value : undefined;
};

const parseInstant = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    return undefined;
  }

  // A date without time is UTC: the register is written in UTC.
  const value = new Date(text.length === 10 ? `${text}T00:00:00Z` : text).getTime();

  return Number.isFinite(value) ? value : undefined;
};

// The END of a window written with a date only is the end of that day: «hasta el 20» includes the
// 20th.
const endOf = (text: string): number | undefined => {
  const t = parseInstant(text);

  return t !== undefined && text.length === 10 ? t + DAY_MS - 1 : t;
};

const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

const stripAccents = (text: string): string =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const empty = (cell: string | undefined): boolean => {
  const t = String(cell || '').trim();

  return t === '' || t === '-';
};

const formatList = (items: string[], max = 5): string =>
  items.length > max
    ? `${items.slice(0, max).join('; ')} y ${items.length - max} más`
    : items.join('; ');

// The most recent degradation the collector declared for an evidence, with the cause IT declares
// (it knows whether a record the organization does not keep is missing, CONFIGURATION, or a source
// could not be read, COLLECTION); COLLECTION if none.
type Degradation = { texto: string; causa: ENSGapCause };

const DECLARABLE_CAUSES: ENSGapCause[] = ['CONFIGURATION', 'COLLECTION', 'EVIDENCE'];

const degradation = (context: ENSPolicyContext, evidence: string): Degradation | undefined => {
  const d = context.events
    .filter(
      e =>
        e.controlId === CONTROL &&
        e.eventType === 'evidence_state' &&
        e.evidenceId === evidence
    )
    .sort((a, b) => (parseInstant(b.timestamp) || 0) - (parseInstant(a.timestamp) || 0))[0];

  if (!d) {
    return undefined;
  }

  const declared = factField(d, 'causa').toUpperCase() as ENSGapCause;
  const cause = DECLARABLE_CAUSES.includes(declared) ? declared : 'COLLECTION';

  return { texto: `${factField(d, 'motivo')} (${factField(d, 'causa') || 'COLLECTION'})`, causa: cause };
};

// Why change detection (EV-01) is not complete: what the collector declared or, without
// declaration, that no heartbeat confirms it (COLLECTION). It is the cause of every silence resting
// on EV-01.
const causeDetection = (context: ENSPolicyContext): ENSGapCause =>
  degradation(context, 'EV-01')?.causa || 'COLLECTION';

const heartbeatConfirms = (context: ENSPolicyContext, evidence: string, now: number): boolean => {
  const heartbeat = facts(context, 'collector_run')
    .map(e => ({ e, t: parseInstant(e.timestamp) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS && now - x.t <= HEARTBEAT_HOURS * HOUR_MS
    )
    .sort((a, b) => b.t - a.t)[0];

  return Boolean(
    heartbeat &&
      factField(heartbeat.e, 'resultado') === 'completada' &&
      factField(heartbeat.e, 'evidencias_cubiertas').split(',').map(s => s.trim()).includes(evidence)
  );
};

const agentName = (context: ENSPolicyContext): string | undefined =>
  context.events.find(e => e.controlId === CONTROL && e.agentName)?.agentName;


const findParameter = (context: ENSPolicyContext, id: string): ENSControlParameter | undefined =>
  context.configuration?.parameters.find(p => p.id === id);

const parameterDisplayName = (context: ENSPolicyContext, id: string): string => {
  const p = findParameter(context, id);

  return p ? `${id} (${p.label || p.name})` : id;
};

// Table rows split into their declared columns. Without columns the position is not guessed: the
// parameter is treated as not configured.
const tableParameterRows = (context: ENSPolicyContext, id: string): Record<string, string>[] | undefined => {
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

const values = (context: ENSPolicyContext, id: string): string[] =>
  parseReferenceList(findParameter(context, id)?.value);

const systemRow = (
  table: Record<string, string>[],
  column: string,
  names: string[]
): Record<string, string> | undefined =>
  table.find(f => names.some(n => n && f[column].toLowerCase() === n.toLowerCase())) ||
  table.find(f => f[column] === '*');


type Request = Record<string, string>;

type LogRow = {
  cabecera: ENSNormalizedEvent;
  leido: string;
  peticiones: Request[];
  ilegibles: number;
  host: string;
};

// P-01: where the register lives. Without ITSM integration the engine can only contrast the TSV the
// collector reads; if P-01 says requests live elsewhere the machine's register is not the source of
// truth and judging it would judge a copy nobody maintains.
const changeSystem = (context: ENSPolicyContext): Measurement | undefined => {
  const table = tableParameterRows(context, 'P-01');

  if (!table) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} está sin configurar: no se ha declarado dónde se registran las peticiones de cambio, así que no hay registro contra el que contrastar los cambios reales.`,
      'CONFIGURATION'
    );
  }

  if (!table.some(f => stripAccents(f.herramienta) === 'registro_tsv')) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-01')} declara que las peticiones viven en «${table.map(f => f.herramienta).join(', ')}», y no hay integración con ese sistema: el recolector solo lee el registro TSV de la máquina. El contraste no se puede hacer sin simular una integración que no existe.`,
      'CONFIGURATION'
    );
  }

  return undefined;
};

const record = (context: ENSPolicyContext, now: number): LogRow | Measurement => {
  const ofP01 = changeSystem(context);

  if (ofP01) {
    return ofP01;
  }

  const headers = facts(context, 'change_register_read')
    .map(e => ({ e, t: parseInstant(factField(e, 'leido')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } =>
      x.t !== undefined && x.t <= now + FUTURE_TOLERANCE_MS
    )
    .sort((a, b) => b.t - a.t);

  if (!headers.length) {
    const motive = degradation(context, 'EV-02');

    return notMeasured(
      motive
        ? `No se ha podido leer el registro de peticiones de cambio: ${motive.texto}.`
        : 'No consta ninguna lectura del registro de peticiones de cambio de esta máquina: el recolector de op.exp.5 no está desplegado o no informa.',
      motive ? motive.causa : 'COLLECTION'
    );
  }

  const { e: header, t } = headers[0];

  if (now - t > FRESHNESS_HOURS * HOUR_MS) {
    return notMeasured(
      `La lectura más reciente del registro de peticiones es de ${factField(header, 'leido')}, hace más de ${FRESHNESS_HOURS} h: no describe el registro de hoy.`,
      'COLLECTION'
    );
  }

  const signature = factField(header, 'firma');
  const byLine = new Map<string, Request>();

  facts(context, 'change_request_registered')
    .filter(e => factField(e, 'registro_firma') === signature)
    .forEach(e => {
      const row: Request = {};

      REQUEST_LOG_COLUMNS.forEach(c => {
        row[c] = factField(e, c);
      });

      byLine.set(factField(e, 'linea') || factField(e, 'peticion_id'), row);
    });

  const declared = parseNumber(factField(header, 'filas'));

  if (declared === undefined || byLine.size < declared) {
    return notMeasured(
      `La lectura del registro de ${factField(header, 'leido')} declara ${factField(header, 'filas') || '?'} peticiones y solo han llegado ${byLine.size}: está incompleta y no se juzga sobre una parte.`,
      'COLLECTION'
    );
  }

  return {
    cabecera: header,
    leido: factField(header, 'leido'),
    peticiones: Array.from(byLine.values()),
    ilegibles: parseNumber(factField(header, 'filas_ilegibles')) || 0,
    host: factField(header, 'sistema_local'),
  };
};

// Does this request speak of this machine? `sistema` is comma-separated names (agent's or host's)
// or «*».
const isThisMachine = (p: Request, names: string[]): boolean =>
  p.sistema
    .split(/[,;]/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
    .some(s => s === '*' || names.some(n => n && n.toLowerCase() === s));

const namesOf = (context: ENSPolicyContext, reg?: LogRow): string[] =>
  [agentName(context) || '', reg?.host || ''].filter(Boolean);


type Change = {
  tipo: 'configuración' | 'software' | 'puerto' | 'hardware';
  desde: number;
  hasta: number;
  // An EXACT change has an instant (auditd, dpkg). One detected between two runs (ports, hardware)
  // is only known to have happened in that interval.
  exacto: boolean;
  texto: string;
};

// A configuration write made by the package manager itself is part of the software transaction, not
// a separate change.
const PACKAGE_MANAGER_PROCESS = /(^|\/)(dpkg|apt|apt-get|unattended-upgr[a-z-]*|packagekitd)$/;

const realChanges = (context: ENSPolicyContext, now: number): { cambios: Change[]; plegados: number } => {
  const changes: Change[] = [];
  let folded = 0;
  const valid = (t: number | undefined): t is number => t !== undefined && t <= now + FUTURE_TOLERANCE_MS;

  facts(context, 'config_file_modified').forEach(e => {
    if (PACKAGE_MANAGER_PROCESS.test(factField(e, 'proceso'))) {
      folded += 1;

      return;
    }

    const since = parseInstant(factField(e, 'primera'));
    const until = parseInstant(factField(e, 'ultima')) ?? since;

    if (!valid(since) || !valid(until)) {
      return;
    }

    changes.push({
      tipo: 'configuración',
      desde: since,
      hasta: until,
      exacto: true,
      texto: `${factField(e, 'recurso')} (${factField(e, 'operacion')} por ${factField(e, 'actor') || '?'}, ${factField(e, 'primera')})`,
    });
  });

  facts(context, 'package_changed').forEach(e => {
    const since = parseInstant(factField(e, 'inicio'));
    const until = parseInstant(factField(e, 'fin')) ?? since;

    if (!valid(since) || !valid(until)) {
      return;
    }

    changes.push({
      tipo: 'software',
      desde: since,
      hasta: until,
      exacto: true,
      texto: `software ${factField(e, 'inicio')} por ${factField(e, 'actor') || '?'} (${factField(e, 'mecanismo') || '?'}: ${(factField(e, 'paquetes') || '').slice(0, 80)})`,
    });
  });

  const betweenRuns = (type: 'puerto' | 'hardware', event: string, describe: (e: ENSNormalizedEvent) => string) =>
    facts(context, event).forEach(e => {
      const until = parseInstant(factField(e, 'detectado'));
      const since = parseInstant(factField(e, 'desde')) ?? until;

      if (!valid(since) || !valid(until)) {
        return;
      }

      changes.push({ tipo: type, desde: since, hasta: until, exacto: false, texto: describe(e) });
    });

  betweenRuns('puerto', 'listening_port_changed', e =>
    `puerto ${factField(e, 'protocolo')}/${factField(e, 'puerto')} ${factField(e, 'cambio')} (${factField(e, 'proceso') || '?'}, entre ${factField(e, 'desde')} y ${factField(e, 'detectado')})`
  );
  betweenRuns('hardware', 'hardware_changed', e =>
    `${factField(e, 'componente')} ${factField(e, 'cambio')}: ${factField(e, 'elemento')} (entre ${factField(e, 'desde')} y ${factField(e, 'detectado')})`
  );

  changes.sort((a, b) => a.desde - b.desde);

  return { cambios: changes, plegados: folded };
};

// Does this request cover this change? Approved, of this machine, with readable window, and the
// change INSIDE the window if its instant is exact or OVERLAPPING it if only the interval between
// two runs is known.
const covers = (p: Request, c: Change, names: string[]): boolean => {
  if (!AUTHORIZED_ROWS.includes(stripAccents(p.estado)) || empty(p.aprobado_por)) {
    return false;
  }

  if (!isThisMachine(p, names)) {
    return false;
  }

  const vi = parseInstant(p.ventana_inicio);
  const vf = endOf(p.ventana_fin);

  if (vi === undefined || vf === undefined) {
    return false;
  }

  // A PLANNED change is approved before being made. A request approved after the change is an
  // after-the-fact ratification and does not cover it: otherwise writing today a row with
  // yesterday's window would cover any change.
  const approved = parseInstant(p.fecha_aprobacion);

  if (approved === undefined || approved > c.hasta) {
    return false;
  }

  return c.exacto ? c.desde >= vi && c.hasta <= vf : c.desde <= vf && c.hasta >= vi;
};


const summaryChanges = (changes: Change[]): string => {
  const account = (type: Change['tipo']) => changes.filter(c => c.tipo === type).length;

  return `${changes.length} cambio(s) real(es): ${account('configuración')} de configuración, ${account('software')} de software, ${account('puerto')} de puertos en escucha y ${account('hardware')} de hardware`;
};

const ev01 = (context: ENSPolicyContext, now: number): Measurement => {
  const { cambios: changes, plegados: folded } = realChanges(context, now);

  if (!heartbeatConfirms(context, 'EV-01', now)) {
    const motive = degradation(context, 'EV-01');

    return notMeasured(
      `La detección de cambios no está completa${motive ? `: ${motive.texto}` : ': no consta un latido reciente del recolector que declare leídas las cuatro fuentes (auditd sobre todas las rutas de configuración, historial de apt y dpkg, puertos en escucha e inventario de hardware)'}. Se han observado ${summaryChanges(changes)}, pero lo que no se vigila no aparece.`,
      motive ? motive.causa : 'COLLECTION'
    );
  }

  return compliant(
    `Detección de cambios operativa en las cuatro fuentes. En la ventana: ${summaryChanges(changes)}${folded ? ` (y ${folded} escritura(s) de configuración hechas por el gestor de paquetes, que cuentan dentro de su transacción)` : ''}.`
  );
};

const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const reg = record(context, now);

  if (isMeasurement(reg)) {
    return reg;
  }

  const names = namesOf(context, reg);
  const { cambios: changes } = realChanges(context, now);
  const withoutRequest: string[] = [];
  const traced = new Map<string, number>();

  changes.forEach(c => {
    const p = reg.peticiones.find(pp => covers(pp, c, names));

    if (!p) {
      withoutRequest.push(c.texto);

      return;
    }

    traced.set(p.peticion_id, (traced.get(p.peticion_id) || 0) + 1);
  });

  const traces = Array.from(traced.entries()).map(([id, n]) => `${id} (${n})`);

  if (withoutRequest.length) {
    return nonCompliant(
      `${withoutRequest.length} de ${changes.length} cambios reales no tienen ninguna petición aprobada en el registro (${reg.leido}) cuya ventana los cubra: ${formatList(withoutRequest)}.${traces.length ? ` Trazados: ${formatList(traces)}.` : ''} Fuente de las peticiones: registro TSV de la máquina, mantenido a mano.`
    );
  }

  if (!heartbeatConfirms(context, 'EV-01', now)) {
    return notMeasured(
      `Los ${changes.length} cambios observados tienen petición aprobada, pero la detección de cambios no está completa (ver EV-01): un cambio que no se vigila no puede salir sin petición.`,
      causeDetection(context)
    );
  }

  return compliant(
    changes.length
      ? `Los ${changes.length} cambios reales de la ventana tienen petición aprobada cuya ventana los cubre: ${formatList(traces)}. Fuente: registro TSV de la máquina (${reg.peticiones.length} peticiones, leído ${reg.leido}).`
      : `Ningún cambio real en la ventana evaluada, con la detección de cambios confirmada por el latido. Registro de peticiones leído ${reg.leido} (${reg.peticiones.length} peticiones).`
  );
};

// Fields P-02 requires, translated to register columns.
const requiredFields = (context: ENSPolicyContext): { campos: string[]; desconocidos: string[] } => {
  const fields: string[] = [];
  const unknown: string[] = [];

  values(context, 'P-02').forEach(v => {
    const c = stripAccents(v).replace(/[\s-]+/g, '_');

    if (REQUEST_LOG_COLUMNS.includes(c)) {
      fields.push(c);
    } else {
      unknown.push(v);
    }
  });

  return { campos: Array.from(new Set(fields)), desconocidos: unknown };
};

const ev03 = (context: ENSPolicyContext, now: number, level: ENSLevel): Measurement => {
  const { campos: fields, desconocidos: unknown } = requiredFields(context);

  if (!fields.length && !unknown.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-02')} está sin configurar: no se ha decidido qué información mínima tiene que traer una petición.`, 'CONFIGURATION');
  }

  if (unknown.length) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-02')} nombra campos que el registro no tiene (${unknown.join(', ')}). Los campos válidos son las columnas del registro: ${REQUEST_LOG_COLUMNS.join(', ')}.`,
      'CONFIGURATION'
    );
  }

  const reg = record(context, now);

  if (isMeasurement(reg)) {
    return reg;
  }

  // R1 (ALTO) also requires the security impact assessment of EVERY documented change
  // (op.exp.5.r1.3).
  const required = level === 'ALTO' ? Array.from(new Set([...fields, 'impacto_seguridad'])) : fields;
  const prefix = (tableParameterRows(context, 'P-01') || []).find(f => stripAccents(f.herramienta) === 'registro_tsv')?.prefijo_referencia || '';
  const names = namesOf(context, reg);

  const authorized = reg.peticiones.filter(
    p => AUTHORIZED_ROWS.includes(stripAccents(p.estado)) && isThisMachine(p, names)
  );

  const incomplete: string[] = [];

  authorized.forEach(p => {
    const missing = required.filter(c => empty(p[c]));
    const badlyNumbered = prefix && !p.peticion_id.startsWith(prefix);

    if (missing.length || badlyNumbered) {
      incomplete.push(
        `${p.peticion_id || '(sin número)'}: ${[
          missing.length ? `sin ${missing.join(', ')}` : '',
          badlyNumbered ? `número fuera del formato «${prefix}…» de P-01` : '',
        ].filter(Boolean).join('; ')}`
      );
    }
  });

  const r1 = level === 'ALTO' ? ' (en ALTO se exige además impacto_seguridad, por op.exp.5.r1.3)' : '';

  if (reg.ilegibles > 0 || incomplete.length) {
    return nonCompliant(
      `Peticiones autorizadas sin la información mínima de P-02${r1}: ${[
        reg.ilegibles ? `${reg.ilegibles} fila(s) del registro que no tienen las ${REQUEST_LOG_COLUMNS.length} columnas y no se pueden leer` : '',
        incomplete.length ? formatList(incomplete) : '',
      ].filter(Boolean).join('; ')}.`
    );
  }

  return compliant(
    authorized.length
      ? `Las ${authorized.length} peticiones autorizadas de esta máquina traen ${required.join(', ')}${r1}.`
      : `El registro (leído ${reg.leido}) no contiene ninguna petición autorizada para esta máquina: no hay ninguna con información insuficiente.`
  );
};

const ev04 = (context: ENSPolicyContext, now: number): Measurement => {
  if (!values(context, 'P-03').length) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-03')} está sin configurar: no hay criterios escritos que digan cuándo un cambio es de riesgo alto, así que la columna «riesgo» del registro no se apoya en ningún análisis declarado.`,
      'CONFIGURATION'
    );
  }

  const rsi = (tableParameterRows(context, 'P-04') || []).map(f => f.cuenta).filter(c => !empty(c));

  if (!rsi.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-04')} está sin configurar: no se puede verificar que la aprobación de un cambio de riesgo alto venga del Responsable de la Seguridad.`, 'CONFIGURATION');
  }

  const reg = record(context, now);

  if (isMeasurement(reg)) {
    return reg;
  }

  const names = namesOf(context, reg);
  const { cambios: changes } = realChanges(context, now);
  const since = now - PERIOD_DAYS * DAY_MS;

  const high = reg.peticiones.filter(p => stripAccents(p.riesgo) === 'alto' && isThisMachine(p, names));
  const findings: string[] = [];
  const reviewed: string[] = [];

  high.forEach(p => {
    const their = changes.filter(c => covers(p, c, names));
    const deployed = DEPLOYED_STATES.includes(stripAccents(p.estado)) || their.length > 0;
    const vf = endOf(p.ventana_fin);

    if (!deployed || (vf !== undefined && vf < since && !their.length)) {
      return;
    }

    // Deployment is the first REAL change the request covers; if none was observed, the declared
    // window start.
    const deployment = their.length ? their[0].desde : parseInstant(p.ventana_inicio);
    const approved = parseInstant(p.fecha_aprobacion);
    const problems: string[] = [];

    if (empty(p.aprobado_por)) {
      problems.push('sin aprobador');
    } else if (!rsi.includes(p.aprobado_por)) {
      problems.push(`aprobada por «${p.aprobado_por}», que no es el RSI de P-04`);
    }

    if (approved === undefined) {
      problems.push('sin fecha de aprobación legible');
    } else if (deployment !== undefined && approved > deployment) {
      problems.push(`aprobada el ${p.fecha_aprobacion}, DESPUÉS de su implantación (${iso(deployment)}${their.length ? ', primer cambio real observado' : ', inicio de su ventana'})`);
    }

    if (problems.length) {
      findings.push(`${p.peticion_id}: ${problems.join('; ')}`);
    } else {
      reviewed.push(p.peticion_id);
    }
  });

  if (findings.length) {
    return nonCompliant(`Cambios de riesgo alto sin aprobación previa y expresa del RSI: ${formatList(findings)}.`);
  }

  const withoutRequest = changes.filter(c => !reg.peticiones.some(p => covers(p, c, names)));

  if (withoutRequest.length) {
    return notMeasured(
      `${withoutRequest.length} cambio(s) real(es) no tienen petición (ver EV-02): su riesgo no se ha analizado y no se puede afirmar que ninguno fuera de riesgo alto.${reviewed.length ? ` Las de riesgo alto registradas (${reviewed.join(', ')}) tienen aprobación previa del RSI.` : ''}`
    );
  }

  if (!reviewed.length && !heartbeatConfirms(context, 'EV-01', now)) {
    return notMeasured('No consta ningún cambio de riesgo alto implantado, pero la detección de cambios no está completa (ver EV-01): el silencio no acredita nada.', causeDetection(context));
  }

  return compliant(
    reviewed.length
      ? `Los cambios de riesgo alto implantados (${reviewed.join(', ')}) fueron aprobados por el RSI antes de su implantación.`
      : `Ningún cambio de riesgo alto implantado en los últimos ${PERIOD_DAYS} días: todos los cambios reales están cubiertos por peticiones de otro riesgo.`
  );
};

const ev05 = (context: ENSPolicyContext): Measurement => {
  if (!tableParameterRows(context, 'P-05')) {
    return notMeasured(`${parameterDisplayName(context, 'P-05')} está sin configurar: no hay ningún entorno de preproducción declarado para esta máquina.`, 'CONFIGURATION');
  }

  return notMeasured(
    'P-05 declara la preproducción, pero demostrar que cada cambio pasó ANTES por ella exige cruzar los cambios reales de las dos máquinas, y el motor evalúa cada máquina por separado. La columna «preproduccion» del registro es una declaración de la organización, no una observación: no la sustituye. op.exp.5.3 queda sin demostrar hasta que la consolidación entre máquinas lo soporte.'
  );
};

const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const table = tableParameterRows(context, 'P-06');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-06')} está sin configurar: no se ha declarado qué documentación de configuración hay que actualizar tras un cambio ni dónde vive.`, 'CONFIGURATION');
  }

  const reg = record(context, now);

  if (isMeasurement(reg)) {
    return reg;
  }

  const names = namesOf(context, reg);
  const since = now - PERIOD_DAYS * DAY_MS;

  const modifications = new Map<string, number[]>();

  facts(context, 'config_doc_modified').forEach(e => {
    const t = parseInstant(factField(e, 'modificado'));
    const path = factField(e, 'ruta');

    if (t === undefined || !path) {
      return;
    }

    modifications.set(path, [...(modifications.get(path) || []), t]);
  });

  const required = reg.peticiones.filter(p => {
    const vi = parseInstant(p.ventana_inicio);

    return (
      stripAccents(p.estado) === 'implantada' &&
      isThisMachine(p, names) &&
      !empty(p.documentacion) &&
      vi !== undefined &&
      vi >= since
    );
  });

  const outside: string[] = [];
  const withoutDecide: string[] = [];
  const pending: string[] = [];
  const done: string[] = [];

  required.forEach(p => {
    const vi = parseInstant(p.ventana_inicio) as number;
    const vf = endOf(p.ventana_fin) ?? vi;

    p.documentacion
      .split(/[,;]/)
      .map(d => d.trim())
      .filter(Boolean)
      .forEach(name => {
        const row = table.find(f => stripAccents(f.documento) === stripAccents(name));

        if (!row) {
          withoutDecide.push(`${p.peticion_id}: el documento «${name}» no figura en P-06`);

          return;
        }

        const deadline = parseNumber(row.plazo_dias);

        if (deadline === undefined || deadline < 0) {
          withoutDecide.push(`${p.peticion_id}: P-06 no da un plazo en días legible para «${row.documento}»`);

          return;
        }

        const seen = modifications.get(row.ubicacion);

        if (!seen) {
          withoutDecide.push(`${p.peticion_id}: «${row.documento}» (${row.ubicacion}) no lo vigila el recolector de esta máquina`);

          return;
        }

        const limit = vf + deadline * DAY_MS;

        if (seen.some(t => t >= vi && t <= limit)) {
          done.push(`${p.peticion_id} → ${row.documento}`);
        } else if (now < limit) {
          pending.push(`${p.peticion_id} → ${row.documento} (plazo hasta ${iso(limit)})`);
        } else {
          outside.push(`${p.peticion_id}: «${row.documento}» no se modificó entre ${p.ventana_inicio} y ${iso(limit)}`);
        }
      });
  });

  if (outside.length) {
    return nonCompliant(`Cambios implantados sin actualizar su documentación de configuración en plazo: ${formatList(outside)}.`);
  }

  if (withoutDecide.length) {
    // Document P-06 does not name, without readable deadline, or that the collector does not have
    // declared to watch: all fixed by configuring.
    return notMeasured(`No se puede comprobar toda la documentación exigida: ${formatList(withoutDecide)}.`, 'CONFIGURATION');
  }

  return compliant(
    required.length
      ? `Documentación actualizada tras el cambio: ${formatList(done)}.${pending.length ? ` Dentro de plazo todavía: ${formatList(pending)}.` : ''}`
      : `Ninguna petición implantada en los últimos ${PERIOD_DAYS} días declara documentación de configuración que actualizar (columna «documentacion» del registro).`
  );
};

const hoursP09 = (context: ENSPolicyContext): number | undefined => {
  const v = findParameter(context, 'P-09')?.value;
  const n = parseNumber(Array.isArray(v) ? String(v[0] ?? '') : String(v ?? ''));

  return n !== undefined && n > 0 ? n : undefined;
};

const ev07 = (context: ENSPolicyContext, now: number): Measurement => {
  const hours = hoursP09(context);

  if (hours === undefined) {
    return notMeasured(`${parameterDisplayName(context, 'P-09')} está sin configurar: no se ha decidido durante cuántas horas tras un cambio un servicio caído se atribuye a ese cambio.`, 'CONFIGURATION');
  }

  if (!heartbeatConfirms(context, 'EV-07', now)) {
    const motive = degradation(context, 'EV-07');

    return notMeasured(
      `No consta una lectura reciente del estado de los servicios${motive ? `: ${motive.texto}` : ''}: sin ella no se sabe si algún cambio dejó un servicio caído.`,
      motive ? motive.causa : 'COLLECTION'
    );
  }

  const { cambios: changes } = realChanges(context, now);
  const reg = record(context, now);
  const requests = isMeasurement(reg) ? [] : reg.peticiones;
  const names = namesOf(context, isMeasurement(reg) ? undefined : reg);

  // State facts already arrive cut to the last run (see `evidence/state-facts.ts`): these are the
  // services still down NOW.
  const down = facts(context, 'service_failed');
  const adverse: string[] = [];
  const revertedList: string[] = [];
  const foreign: string[] = [];

  down.forEach(e => {
    const start = parseInstant(factField(e, 'desde'));
    const unit = factField(e, 'unidad');

    const cause = start === undefined
      ? undefined
      : changes.filter(c => c.hasta <= start && start - c.hasta <= hours * HOUR_MS).pop();

    if (!cause) {
      foreign.push(unit);

      return;
    }

    const revertedRequest = requests.find(p => stripAccents(p.estado) === 'revertida' && covers(p, cause, names));

    if (revertedRequest) {
      revertedList.push(`${unit} tras ${cause.texto}, revertido en ${revertedRequest.peticion_id}`);
    } else {
      adverse.push(`${unit} caído desde ${factField(e, 'desde')}, ${((start as number - cause.hasta) / HOUR_MS).toFixed(1)} h después de ${cause.texto}`);
    }
  });

  if (adverse.length) {
    return nonCompliant(
      `Efectos adversos sostenidos tras un cambio, sin reversión registrada: ${formatList(adverse)}. Siguen caídos en la última pasada.`
    );
  }

  if (!changes.length && !heartbeatConfirms(context, 'EV-01', now)) {
    return notMeasured('No consta ningún cambio real, pero la detección de cambios no está completa (ver EV-01).', causeDetection(context));
  }

  return compliant(
    `Ningún servicio sigue caído por un cambio de las ${hours} h previas (${changes.length} cambios en la ventana).${revertedList.length ? ` Revertidos: ${formatList(revertedList)}.` : ''}${foreign.length ? ` Caídos sin cambio previo en ${hours} h (cuentan para EV-08, no aquí): ${formatList(foreign)}.` : ''}`
  );
};

const CHANNELS = ['cola_itsm', 'buzon', 'integracion_wazuh'];

const ev08 = (context: ENSPolicyContext): Measurement => {
  const table = tableParameterRows(context, 'P-07');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-07')} está sin configurar: no se ha declarado por qué canal se comunican los fallos al responsable de seguridad.`, 'CONFIGURATION');
  }

  const down = facts(context, 'service_failed').map(e => factField(e, 'unidad'));
  const failures = down.length ? `Fallos detectados ahora: ${formatList(down)}.` : 'No hay ningún servicio caído en la última pasada.';
  const channels = table.map(f => stripAccents(f.canal)).filter(c => CHANNELS.includes(c));

  return notMeasured(
    `${failures} La comunicación por ${channels.length ? channels.join(', ') : 'el canal declarado'} (${table.map(f => f.destino).filter(Boolean).join(', ') || 'sin destino'}) no deja ningún hecho observable en esta máquina: no hay integración que registre el envío, y un buzón o una cola humana no se ven desde Wazuh. op.exp.5.r1.2 se detecta a medias y no se demuestra.`
  );
};

const LOCAL_MECHANISMS = ['lvm', 'zfs', 'btrfs'];

// op.exp.4's EV-09 logic applied to all EXACT changes (configuration and software): a port or disk
// changing between two runs has no precise «before» to measure the reversion point against.
const ev09 = (context: ENSPolicyContext, now: number): Measurement => {
  const table = tableParameterRows(context, 'P-08');

  if (!table) {
    return notMeasured(`${parameterDisplayName(context, 'P-08')} está sin configurar: no se ha previsto ningún mecanismo de reversión.`, 'CONFIGURATION');
  }

  const reg = record(context, now);
  const row = systemRow(table, 'sistema', namesOf(context, isMeasurement(reg) ? undefined : reg));

  if (!row) {
    return notMeasured(`P-08 no tiene fila para ${agentName(context) || 'esta máquina'} ni una fila «*».`, 'CONFIGURATION');
  }

  const mechanism = row.mecanismo.toLowerCase();

  if (!LOCAL_MECHANISMS.includes(mechanism)) {
    return notMeasured(
      `El mecanismo declarado en P-08 («${row.mecanismo}») no deja huella en la máquina: un snapshot de hipervisor o una copia externa no los observa este control, y no se simulan.`
    );
  }

  const window = parseNumber(row.ventana_horas || '');

  if (window === undefined || window <= 0) {
    return notMeasured(`La ventana previa de P-08 («${row.ventana_horas}») no es un número de horas utilizable.`, 'CONFIGURATION');
  }

  const changes = realChanges(context, now).cambios.filter(c => c.exacto);

  if (!changes.length) {
    return heartbeatConfirms(context, 'EV-01', now)
      ? compliant('Ningún cambio de configuración ni de software en la ventana evaluada, con la detección de cambios confirmada: no había punto de reversión que exigir.')
      : notMeasured('No consta ningún cambio, pero la detección de cambios no está completa (ver EV-01): el silencio no acredita nada.', causeDetection(context));
  }

  const points = facts(context, 'reversion_point_created')
    .filter(e => factField(e, 'mecanismo').toLowerCase() === mechanism)
    .map(e => parseInstant(factField(e, 'creado')))
    .filter((t): t is number => t !== undefined);

  const degraded = degradation(context, 'EV-09');

  if (!points.length && degraded) {
    return notMeasured(
      `El recolector no ha podido observar puntos de reversión: ${degraded.texto}. Hay ${changes.length} cambio(s) sin punto de reversión demostrable.`,
      degraded.causa
    );
  }

  const withoutPoint = changes
    .filter(c => !points.some(t => t <= c.desde && c.desde - t <= window * HOUR_MS))
    .map(c => c.texto);

  if (withoutPoint.length) {
    return nonCompliant(`Cambios sin punto de reversión ${row.mecanismo} en las ${window} h previas: ${formatList(withoutPoint)}.`);
  }

  return compliant(`Los ${changes.length} cambios tenían un punto de reversión ${row.mecanismo} en las ${window} h previas.`);
};


type Requirement = {
  evidencias: string[];
  parametros: string[];
  tipo: ENSPolicyDecision['trace']['ruleType'];
  niveles: ENSLevel[];
};

const REQUIREMENTS: Record<string, Requirement> = {
  'op.exp.5.1': { evidencias: ['EV-01', 'EV-02'], parametros: ['P-01'], tipo: 'WHITELIST', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.2': { evidencias: ['EV-03'], parametros: ['P-01', 'P-02'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.3': { evidencias: ['EV-05'], parametros: ['P-05'], tipo: 'COVERAGE_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.4': { evidencias: ['EV-04'], parametros: ['P-01', 'P-03', 'P-04'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.5': { evidencias: ['EV-06', 'EV-07'], parametros: ['P-06', 'P-09'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['MEDIO', 'ALTO'] },
  'op.exp.5.r1.1': { evidencias: ['EV-07', 'EV-09'], parametros: ['P-08', 'P-09'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['ALTO'] },
  'op.exp.5.r1.2': { evidencias: ['EV-08'], parametros: ['P-07'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['ALTO'] },
  'op.exp.5.r1.3': { evidencias: ['EV-03'], parametros: ['P-01', 'P-02'], tipo: 'CONDITIONAL_REQUIRED', niveles: ['ALTO'] },
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

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const level = context.level;

  // Only requirements that govern at the evaluated level. At BAJO none does (op.exp.5 does not
  // apply to the BÁSICA category) and without decisions the engine leaves them NO_APLICA. It also
  // keeps R1's judgment (EV-03 with impact assessment) from painting the evidence at a level where
  // R1 does not govern: the bridge carries to the evidence the worst decision naming it.
  const current = Object.entries(REQUIREMENTS).filter(([, r]) => r.niveles.includes(level));

  if (!current.length) {
    return { decisions: [], runtimeVariables: [] };
  }

  const measurements: Record<string, Measurement> = {
    'EV-01': ev01(context, now),
    'EV-02': ev02(context, now),
    'EV-03': ev03(context, now, level),
    'EV-04': ev04(context, now),
    'EV-05': ev05(context),
    'EV-06': ev06(context, now),
    'EV-07': ev07(context, now),
    'EV-08': ev08(context),
    'EV-09': ev09(context, now),
  };

  const decisions: ENSPolicyDecision[] = [];

  current.forEach(([requirement, { evidencias: evidences, parametros: parameters, tipo: type }]) => {
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

export const opExp5PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.1.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.exp.5.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'WHITELIST',
    },
    {
      requirementId: 'op.exp.5.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-03'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.3',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.4',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-04'],
      evidenceIds: ['EV-04'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.5',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-06', 'P-09'],
      evidenceIds: ['EV-06', 'EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.1',
      levels: ['ALTO'],
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-07', 'EV-09'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.2',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.exp.5.r1.3',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-03'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
  ],
};
