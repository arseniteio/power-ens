// op.mon.3 · Surveillance.
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import {
  HOUR_MS,
  DAY_MS,
  FRESHNESS_HOURS,
  SAME_RUN_WINDOW_MS,
  compliant,
  nonCompliant,
  notMeasured,
  notApplicable,
  commonGapCause,
  worstStatus,
  combineMeasurements,
  factField,
  parseNumber,
  parseInstant,
  eventTime,
  formatList,
  formatHours,
  wholeDays,
  iso,
  stripAccents,
  isEmptyField,
  equalsIgnoreCase,
  parameterDisplayName,
  tableParameterRows,
  positiveScalar,
  missingParameter,
  createFactReader,
  decisionBuilderFor,
} from './policy-kit';
import type { ENSDecisionRuleType, Measurement } from './policy-kit';

const CONTROL = 'op.mon.3';
const POLICY = 'policy.op.mon.3';

// op.mon.3 facts, with state-fact freshness (26 h): collectors re-emit the whole state every 6 h.
const { validos: valid, estadoVigente: currentStatus, degradacion: degradation, sinHechos: withoutFacts, conDegradacion: withDegradation } = createFactReader(CONTROL, {
  recolector: 'el recolector de op.mon.3',
});

const decide = decisionBuilderFor(POLICY);

// Freshness of CENTRAL COLLECTION state, which arrives hourly. 26 h does not fit: ENSFácil facts
// reach the index through the collection system itself, so if it stops its state stops arriving and
// the last one, «collecting», would keep accrediting the control a whole day. 3 h tolerates two
// missed hourly runs.
const COLLECTION_FRESHNESS_HOURS = 3;

// Window of ACTIONS (state is judged by the last run; actions by 30 days). It is what the collector
// keeps of each syslog sender's alerts and of the period's incidents.
const WINDOW_DAYS = 30;

const MANAGER = '000';

const MEASURED_IN_MANAGER =
  'Se mide en el sistema central de recolección (el manager de Wazuh, agente 000), no en esta máquina: su resultado sale en la fila del manager y en el del control.';

const NO_FACT_AT_ALL =
  'De esta fila no ha llegado ningún hecho, de op.mon.3 ni de otro control, así que no se sabe si es el manager o un agente: no está desplegado ningún recolector o la máquina no informa. Nada se da por bueno.';

// The machines of the row. An agent ID, normalized: 24 is agent 024, as in Wazuh.
const agentId = (text: string | undefined): string | undefined => {
  const clean = String(text || '').trim();

  return /^\d+$/.test(clean) ? clean.padStart(3, '0') : undefined;
};

// Machines whose facts the evaluation has, with their name. On a machine's row it is one; without a
// row (the set), all.
const machinesOf = (context: ENSPolicyContext): Map<string, string> => {
  const machines = new Map<string, string>();

  context.events.forEach(event => {
    const id = agentId(event.agentId);

    if (id && (!machines.has(id) || (!machines.get(id) && event.agentName))) {
      machines.set(id, event.agentName || '');
    }
  });

  return machines;
};

// Facts of ONE machine: each machine's collectors run at their own minute, so the last run is
// delimited machine by machine.
const ofMachine = (context: ENSPolicyContext, id: string): ENSPolicyContext => ({
  ...context,
  events: context.events.filter(event => agentId(event.agentId) === id),
});

const describeMachine = (id: string, name: string): string => (name ? `${name} (${id})` : id);

// The machine of a P-01 (or P-03) row among the evaluation's: by ID or EXACT name ignoring case;
// never by similarity.
const rowMachine = (system: string, machines: Map<string, string>): string | undefined => {
  const id = agentId(system);

  if (id && machines.has(id)) {
    return id;
  }

  const byName = Array.from(machines.entries()).filter(([, name]) => equalsIgnoreCase(name, system));

  return byName.length === 1 ? byName[0][0] : undefined;
};

// Agents the manager knows. `package_inventory_observed` (EV-04) carries one row per agent
// registered in global.db with its connection: the roster against which the manager's row checks
// P-01 and P-03 systems. A name matching two agents is not chosen: declare it by ID.

type Resolution =
  | { tipo: 'unico'; hecho: ENSNormalizedEvent }
  | { tipo: 'ninguno' }
  | { tipo: 'ambiguo'; ids: string[] };

const factId = (e: ENSNormalizedEvent): string =>
  agentId(factField(e, 'agente_id')) || factField(e, 'agente_id');

const resolves = (system: string, ofAgents: ENSNormalizedEvent[]): Resolution => {
  const id = agentId(system);

  if (id) {
    const byId = ofAgents.find(e => factId(e) === id);

    if (byId) {
      return { tipo: 'unico', hecho: byId };
    }
  }

  const byName = ofAgents.filter(e => equalsIgnoreCase(factField(e, 'agente'), system));
  const ids = Array.from(new Set(byName.map(factId)));

  if (ids.length === 1) {
    return { tipo: 'unico', hecho: byName[0] };
  }

  return ids.length > 1 ? { tipo: 'ambiguo', ids } : { tipo: 'ninguno' };
};

const ambiguous = (parameter: string, system: string, ids: string[]): Measurement =>
  notMeasured(
    `${parameter} declara «${system}» y en el manager hay ${ids.length} agentes con ese nombre (${ids.join(', ')}): no se elige uno. Decláralo por su ID.`,
    'CONFIGURATION'
  );

const nameOf = (system: string, e: ENSNormalizedEvent): string => {
  const id = factId(e);
  const agent = factField(e, 'agente');

  return equalsIgnoreCase(agent, system) ? `${system} (${id})` : `${system} (${agent}, ${id})`;
};


type Range = [number, number];

const ranges = (text: string): Range[] => {
  const output: Range[] = [];
  const pattern = /(\d+)\s*-\s*(\d+)|(\d+)/g;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m[3] !== undefined) {
      const n = Number(m[3]);

      output.push([n, n]);
    } else {
      const a = Number(m[1]);
      const b = Number(m[2]);

      output.push(a <= b ? [a, b] : [b, a]);
    }
  }

  return output;
};

const describeRange = ([a, b]: Range): string => (a === b ? String(a) : `${a}-${b}`);

const cutOff = ([a, b]: Range, [c, d]: Range): boolean => a <= d && c <= b;

// A rule-id cell admits only ids and ranges: «100510, 100500-100509». Any other text is rejected
// rather than interpreted (op.mon.1's lesson: «pendiente 2026-12» read as a range turned a gap into
// coverage).
const RULES_IN_CELL = /^\d+(\s*-\s*\d+)?(\s*[,;\s]\s*\d+(\s*-\s*\d+)?)*$/;

const NO_RULE = /^(-|ninguna|ninguno|sin regla)$/i;


interface Source {
  n: number;
  fuente: string;
  metodo: 'agente' | 'syslog';
  sistema: string;
  ubicacion: string;
  maxHoras?: number;
}

const POSITIVE_INTEGER = /^\d+$/;

// A P-01 row with its defect, if any. Nothing is guessed: a method that is neither «agente» nor
// «syslog», an agent source without location or a max-hours value that is not a positive integer
// are CONFIGURATION, naming the row.
const readsSource = (row: Record<string, string>, n: number): Source | string => {
  const name = row.fuente || `fila ${n}`;
  const method = stripAccents(row.metodo || '');
  const system = (row.sistema || '').trim();
  const location = (row.ubicacion || '').trim();
  const max = (row.max_horas_sin_eventos || '').trim();

  if (method !== 'agente' && method !== 'syslog') {
    return `P-01, fuente «${name}»: el método dice «${row.metodo || ''}» y solo puede ser «agente» o «syslog».`;
  }

  if (!system || system === '-') {
    return `P-01, fuente «${name}»: falta el sistema (el agente que la lee, o la IP del emisor syslog).`;
  }

  if (method === 'agente' && (!location || location === '-')) {
    return `P-01, fuente «${name}»: una fuente de agente necesita su ubicación (la ruta o el nombre del localfile).`;
  }

  if (max && max !== '-' && (!POSITIVE_INTEGER.test(max) || Number(max) <= 0)) {
    return `P-01, fuente «${name}»: max_horas_sin_eventos dice «${max}», que no es un número entero de horas; vacía si la continuidad de esta fuente no se juzga.`;
  }

  return {
    n,
    fuente: name,
    metodo: method,
    sistema: system,
    ubicacion: location,
    ...(max && max !== '-' ? { maxHoras: Number(max) } : {}),
  };
};

// P-01's location against the fact's: exact, or with the localfile's own * and ? wildcards. Paths
// are case-sensitive, as on Linux. `ninguna` (the logcollector reads no source) is not a location:
// it matches no row, not even `*`.
const matchesLocation = (declared: string, observed: string): boolean => {
  if (isEmptyField(observed) || observed === 'ninguna') {
    return false;
  }

  if (!/[*?]/.test(declared)) {
    return declared === observed;
  }

  const pattern = declared
    .split('')
    .map(c => (c === '*' ? '.*' : c === '?' ? '.' : c.replace(/[.+^${}()|[\]\\]/g, '\\$&')))
    .join('');

  return new RegExp(`^${pattern}$`).test(observed);
};


const ev01 = (ctxM: ENSPolicyContext, now: number): Measurement => {
  const series = valid(ctxM, 'event_collection_status', now);
  const last = series.length ? eventTime(series[series.length - 1]) : undefined;

  if (last === undefined) {
    return withoutFacts(ctxM, 'EV-01', now, undefined, 'estado de la recolección central del manager');
  }

  if (now - last > COLLECTION_FRESHNESS_HOURS * HOUR_MS) {
    return notMeasured(
      `El último estado de la recolección central es de ${iso(last)}, hace ${formatHours(now - last)} h (más de ${COLLECTION_FRESHNESS_HOURS} h, y el recolector pasa cada hora): se ha parado el recolector de op.mon.3 del manager o el propio sistema de recolección, por el que llegan sus hechos. No se puede afirmar que el manager esté recolectando.`,
      'COLLECTION'
    );
  }

  const actual = series[series.length - 1];
  const previous = [...series].reverse().find(e => eventTime(e) < last - SAME_RUN_WINDOW_MS);
  const between = previous ? `entre ${iso(eventTime(previous))} y ${iso(last)}` : '';
  const pieces: Measurement[] = [];

  const active = factField(actual, 'activo');

  pieces.push(
    active === 'si'
      ? compliant('wazuh-manager activo.')
      : nonCompliant(`wazuh-manager no está activo (${active || 'desconocido'}): no hay sistema central de recolección en marcha.`)
  );

  const connections = factField(actual, 'conexiones');

  pieces.push(
    isEmptyField(connections)
      ? nonCompliant('El manager no declara ninguna conexión de recepción en <remote> (ni «secure» para los agentes ni «syslog»): no recibe eventos de ninguna otra fuente.')
      : compliant(
          `Recibe por ${connections}; ${factField(actual, 'agentes_activos') || '?'} de ${factField(actual, 'agentes_registrados') || '?'} agentes activos.`
        )
  );

  // That it collects: the analysis engine's processed counter between two runs; without it,
  // wazuh-remoted's message counter.
  const processes = (): Measurement => {
    const counters: [string, string][] = [
      ['eventos_procesados', 'El motor de análisis'],
      ['mensajes_remoted', 'wazuh-remoted'],
    ];

    for (const [name, who] of counters) {
      const nowN = parseNumber(factField(actual, name));

      if (nowN === undefined) {
        continue;
      }

      const before = previous ? parseNumber(factField(previous, name)) : undefined;

      if (before === undefined) {
        return nowN > 0
          ? compliant(`${who} ha recibido ${nowN} eventos desde que arrancó; una sola pasada, sin serie todavía.`)
          : notMeasured(`${who} no ha procesado ningún evento y no hay una pasada anterior con la que comparar.`);
      }

      if (nowN > before) {
        return compliant(`Recolecta: ${who} procesó ${nowN - before} eventos ${between}.`);
      }

      if (nowN < before) {
        return nowN > 0
          ? compliant(`${who} se reinició ${between} y ha procesado ${nowN} eventos desde entonces.`)
          : notMeasured(`${who} se reinició ${between} y todavía no ha procesado ningún evento.`);
      }

      return nonCompliant(
        `${who} no ha procesado ningún evento ${between} (contador parado en ${nowN}): el sistema de recolección está en marcha, pero no recolecta.`
      );
    }

    return (
      degradation(ctxM, 'EV-01', now, last + 1) ||
      notMeasured(
        `El recolector no ha podido leer los contadores del motor de análisis ni los de wazuh-remoted (${factField(actual, 'fuente_contadores') || 'sin fuente'}): no se puede afirmar que el manager recolecte.`,
        'COLLECTION'
      )
    );
  };

  pieces.push(processes());

  // That it does not lose: the analysis engine's discards (its full queue) between the two runs.
  // After a restart the counter counts from the restart.
  const discarded = parseNumber(factField(actual, 'eventos_descartados'));

  if (discarded !== undefined) {
    const before = previous ? parseNumber(factField(previous, 'eventos_descartados')) : undefined;
    const processedNow = parseNumber(factField(actual, 'eventos_procesados'));
    const processedBefore = previous ? parseNumber(factField(previous, 'eventos_procesados')) : undefined;
    const restart =
      before !== undefined &&
      (discarded < before ||
        (processedNow !== undefined && processedBefore !== undefined && processedNow < processedBefore));
    const fresh = before === undefined || restart ? discarded : discarded - before;
    const when =
      before === undefined ? 'desde que arrancó el motor' : restart ? `desde que se reinició (${between})` : between;

    pieces.push(
      fresh > 0
        ? nonCompliant(
            `El motor de análisis ha descartado ${fresh} eventos ${when}: su cola se llena y la recolección pierde eventos.`
          )
        : compliant(`Sin eventos descartados ${when}.`)
    );
  }

  const measurement = combineMeasurements(pieces);
  const deg = degradation(ctxM, 'EV-01', now, last + 1);

  return deg ? combineMeasurements([measurement, deg]) : measurement;
};


// An AGENT source on its machine's row: read by the logcollector, no discards in the period and, if
// the row declares it, no gap longer than max_horas_sin_eventos. Hours are measured at the fact's
// instant.
const sourceLocal = (ctxA: ENSPolicyContext, now: number, source: Source, machine: string): Measurement => {
  const { vigentes: current, ultimo: latest } = currentStatus(ctxA, 'log_source_observed', now);

  if (!current.length || latest === undefined) {
    return withoutFacts(ctxA, 'EV-02', now, latest, `inventario de las fuentes del logcollector de ${machine}`);
  }

  const okReadings = current.filter(e => factField(e, 'lectura') === 'ok' || !factField(e, 'lectura'));

  if (!okReadings.length) {
    const reading = factField(current[0], 'lectura');

    return notMeasured(
      `«${source.fuente}»: el recolector de ${machine} no ha podido leer wazuh-logcollector.state (${reading === 'ausente' ? 'no existe' : 'existe y no se puede leer'}), así que no se sabe qué fuentes lee.`,
      'COLLECTION'
    );
  }

  const their = okReadings.filter(e => matchesLocation(source.ubicacion, factField(e, 'ubicacion')));

  if (!their.length) {
    const reads = okReadings.map(e => factField(e, 'ubicacion')).filter(u => !isEmptyField(u) && u !== 'ninguna');

    return nonCompliant(
      `«${source.fuente}»: el logcollector de ${machine} no lee ${source.ubicacion} (${reads.length ? `lee: ${formatList(reads, 6)}` : 'no lee ninguna fuente'}).`
    );
  }

  const detail = `${source.ubicacion} en ${machine}`;

  // With a good read, a missing counter or `-` is a collector gap, never zero.
  const withoutCounter = their.filter(e => parseNumber(factField(e, 'descartes_periodo')) === undefined || parseNumber(factField(e, 'eventos')) === undefined);

  if (withoutCounter.length) {
    return notMeasured(
      `«${source.fuente}» (${detail}): el recolector no informa de los eventos o los descartes de ${formatList(withoutCounter.map(e => factField(e, 'ubicacion')))}, así que no se sabe si recolecta sin pérdidas.`,
      'COLLECTION'
    );
  }

  const discards = their.reduce((t, e) => t + (parseNumber(factField(e, 'descartes_periodo')) || 0), 0);
  const events = their.reduce((t, e) => t + (parseNumber(factField(e, 'eventos')) || 0), 0);

  if (discards > 0) {
    return nonCompliant(`«${source.fuente}» (${detail}): ${discards} eventos descartados en el periodo; la recolección pierde eventos.`);
  }

  if (source.maxHoras === undefined) {
    // Read but with no event ever seen: reading does not prove it collects. Without a max-hours
    // value there is nothing to judge against.
    if (events === 0 && their.every(e => parseInstant(factField(e, 'ultimo_evento')) === undefined)) {
      return notMeasured(
        `«${source.fuente}» (${detail}): el logcollector la lee pero no ha producido ningún evento desde que se observa. Declara max_horas_sin_eventos para esta fuente en P-01 y se juzgará su continuidad; sin él, lo que no se demuestra no cumple.`,
        'CONFIGURATION'
      );
    }

    return compliant(`«${source.fuente}» (${detail}): ${events} eventos desde el arranque del logcollector, sin descartes.`);
  }

  // The whole source: the last event of any of its files.
  const lastAlerts = their
    .map(e => ({ e, t: parseInstant(factField(e, 'ultimo_evento')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);

  if (lastAlerts.length) {
    const mostRecent = lastAlerts.reduce((a, b) => (b.t > a.t ? b : a));
    const gap = eventTime(mostRecent.e) - mostRecent.t;

    return gap > source.maxHoras * HOUR_MS
      ? nonCompliant(
          `«${source.fuente}» (${detail}): ${formatHours(gap)} h sin un evento nuevo al leerla (el último, ${iso(mostRecent.t)}), más que las ${source.maxHoras} h que admite: la vigilancia tiene una laguna.`
        )
      : compliant(`«${source.fuente}» (${detail}): último evento ${iso(mostRecent.t)}, sin descartes.`);
  }

  const starts = their
    .map(e => ({ e, t: parseInstant(factField(e, 'observado_desde')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);
  const since = starts.length ? starts.reduce((a, b) => (b.t < a.t ? b : a)) : undefined;

  if (since && eventTime(since.e) - since.t > source.maxHoras * HOUR_MS) {
    return nonCompliant(
      `«${source.fuente}» (${detail}): ningún evento desde que el recolector la observa (${iso(since.t)}), más de las ${source.maxHoras} h que admite.`
    );
  }

  return notMeasured(
    `«${source.fuente}» (${detail}): sin eventos nuevos observados, y se observa desde ${since ? iso(since.t) : 'un instante desconocido'}, menos que las ${source.maxHoras} h que admite: todavía no se puede afirmar ni negar su continuidad.`
  );
};

// An AGENT's shipping (wazuh-agentd.state). The manager has no agentd.
const agentShipment = (ctxA: ENSPolicyContext, now: number, machine: string): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(ctxA, 'agent_forwarding_observed', now);
  const fact = current[current.length - 1];

  if (!fact) {
    return withoutFacts(ctxA, 'EV-02', now, last, `estado de envío del agente de ${machine}`);
  }

  const read = factField(fact, 'lectura');

  if (read && read !== 'ok') {
    return notMeasured(
      `El recolector de ${machine} no ha podido leer wazuh-agentd.state (${read}): no se sabe si el agente envía sus eventos al manager.`,
      'COLLECTION'
    );
  }

  const status = factField(fact, 'conexion');
  const queue = factField(fact, 'mensajes_en_buffer');

  return status === 'connected'
    ? compliant(`El agente de ${machine} está conectado al manager (último ack ${factField(fact, 'ultimo_ack') || '-'}${!isEmptyField(queue) ? `, ${queue} mensajes en cola` : ''}).`)
    : nonCompliant(
        `El agente de ${machine} no está conectado al manager al leerlo (${status || 'estado desconocido'}, último ack ${factField(fact, 'ultimo_ack') || '-'}): sus eventos no llegan.`
      );
};

// A SYSLOG source, on the manager's row: the sender leaves a trace only when its events alert, so
// its last alert is judged, kept by the collector over the 30-day window.
const sourceSyslog = (ctxM: ENSPolicyContext, now: number, source: Source): Measurement => {
  const { vigentes: current, ultimo: latest } = currentStatus(ctxM, 'syslog_source_observed', now);

  if (!current.length || latest === undefined) {
    return withoutFacts(ctxM, 'EV-02', now, latest, 'resumen de los emisores syslog del manager');
  }

  const fact = current.find(e => equalsIgnoreCase(factField(e, 'ubicacion'), source.sistema));

  if (!fact) {
    const estados = valid(ctxM, 'event_collection_status', now);
    const since = estados.length ? parseInstant(factField(estados[estados.length - 1], 'alertas_observadas_desde')) : undefined;
    const emitters = current.filter(e => factField(e, 'ubicacion') !== 'ninguna').map(e => factField(e, 'ubicacion'));
    const other = emitters.length ? ` Emisores syslog con alertas: ${formatList(emitters)}.` : ' El manager no tiene alertas de ningún emisor syslog.';

    if (since !== undefined && latest - since >= WINDOW_DAYS * DAY_MS) {
      return nonCompliant(
        `«${source.fuente}» (syslog desde ${source.sistema}): ninguna alerta de ese emisor en los últimos ${WINDOW_DAYS} días; o no envía, o lo que envía no llega a alertar.${other}`
      );
    }

    return notMeasured(
      `«${source.fuente}» (syslog desde ${source.sistema}): ninguna alerta de ese emisor, pero el manager solo observa las alertas desde ${since !== undefined ? iso(since) : 'un instante desconocido'}, menos de ${WINDOW_DAYS} días. Las fuentes syslog solo dejan rastro cuando alertan.${other}`
    );
  }

  const lastAlert = parseInstant(factField(fact, 'ultima_alerta'));
  const n24 = factField(fact, 'alertas_24h') || '0';

  if (lastAlert === undefined) {
    return nonCompliant(`«${source.fuente}» (syslog desde ${source.sistema}): no consta ninguna alerta de ese emisor.`);
  }

  if (source.maxHoras !== undefined && eventTime(fact) - lastAlert > source.maxHoras * HOUR_MS) {
    return nonCompliant(
      `«${source.fuente}» (syslog desde ${source.sistema}): ${formatHours(eventTime(fact) - lastAlert)} h sin alertas al leerlo (la última, ${iso(lastAlert)}), más que las ${source.maxHoras} h que admite.`
    );
  }

  return compliant(`«${source.fuente}» (syslog desde ${source.sistema}): última alerta ${iso(lastAlert)}, ${n24} en 24 h.`);
};

// On the manager's row, sources of OTHER machines: their agent registered on the manager,
// unambiguous, connected and with its agent collector reporting. Each source's detail (discards,
// gaps) is judged on its machine's row, BUT that row exists only if the machine is in the ENS
// scope: a source of an agent outside the scope, or without the agent collector, is measured by
// nobody. So the roster carries the last heartbeat of its agent collector the manager saw in
// alerts.json (`recolector_agente_ultimo`): without it, or older than fact freshness, its sources
// are unmeasured and nothing is taken as good.
const sourceAgent = (ctxM: ENSPolicyContext, now: number, system: string, roster: ENSNormalizedEvent[]): Measurement => {
  const r = resolves(system, roster);

  if (r.tipo === 'ninguno') {
    return nonCompliant(`${system}: no figura en la base de agentes del manager; sus fuentes no pueden llegar.`);
  }

  if (r.tipo === 'ambiguo') {
    return ambiguous('P-01', system, r.ids);
  }

  const e = r.hecho;
  const status = factField(e, 'estado_conexion');

  if (status !== 'active') {
    return nonCompliant(
      `${nameOf(system, e)}: agente ${status || 'en estado desconocido'} (último keepalive ${isEmptyField(factField(e, 'ultimo_keepalive')) ? 'nunca' : factField(e, 'ultimo_keepalive')}); sus fuentes no llegan.`
    );
  }

  const heartbeat = parseInstant(factField(e, 'recolector_agente_ultimo'));

  if (heartbeat === undefined || eventTime(e) - heartbeat > FRESHNESS_HOURS * HOUR_MS) {
    return notMeasured(
      `${nameOf(system, e)}: conectado, pero su recolector de agente de op.mon.3 no informa (${
        heartbeat === undefined ? 'el manager no ha visto nunca su latido' : `último latido ${iso(heartbeat)}, más de ${FRESHNESS_HOURS} h antes de la lectura`
      }): sus fuentes no se miden. Si la máquina no está en el alcance ENS (grupo ens), su fila no existe y nadie las mide.`,
      'COLLECTION'
    );
  }

  return compliant(`${nameOf(system, e)} conectado al manager, con su recolector de agente informando (último latido ${iso(heartbeat)}).`);
};

const ev02 = (context: ENSPolicyContext, now: number, machines: Map<string, string>): Measurement => {
  const declared = tableParameterRows(context, 'P-01');

  if (!declared) {
    return missingParameter(context, 'P-01', 'qué fuentes tienen que alimentar la recolección');
  }

  const hasManager = machines.has(MANAGER);
  const ctxM = ofMachine(context, MANAGER);
  const roster: { vigentes: ENSNormalizedEvent[]; ultimo?: number } = hasManager
    ? currentStatus(ctxM, 'package_inventory_observed', now)
    : { vigentes: [] };
  const configuration: Measurement[] = [];
  const measurements: Measurement[] = [];
  const hereOutside: string[] = [];
  // What was judged here, as pairs (machine, state fact delimiting its last run): only those
  // degradations count. A machine may have both of the manager's (its sources and the syslog ones).
  const judged = new Map<string, [string, string]>();
  const judges = (id: string, type: string) => judged.set(`${id}|${type}`, [id, type]);
  const shipments = new Set<string>();
  const judgedRoster = new Set<string>();

  declared.forEach((row, i) => {
    const source = readsSource(row, i + 1);

    if (typeof source === 'string') {
      configuration.push(notMeasured(source, 'CONFIGURATION'));

      return;
    }

    if (source.metodo === 'syslog') {
      if (hasManager) {
        measurements.push(sourceSyslog(ctxM, now, source));
        judges(MANAGER, 'syslog_source_observed');
      } else {
        hereOutside.push(`«${source.fuente}» (syslog, en el manager)`);
      }

      return;
    }

    const id = rowMachine(source.sistema, machines);

    if (id) {
      const ctxA = ofMachine(context, id);
      const machine = describeMachine(id, machines.get(id) || '');

      measurements.push(sourceLocal(ctxA, now, source, machine));

      if (id !== MANAGER && !shipments.has(id)) {
        shipments.add(id);
        measurements.push(agentShipment(ctxA, now, machine));
      }

      judges(id, 'log_source_observed');
    } else {
      hereOutside.push(`«${source.fuente}» de ${source.sistema}`);
    }

    // The manager's row also checks the agent of OTHER machines' sources: that it exists and is
    // connected. Once per declared system.
    if (hasManager && id !== MANAGER) {
      const key = agentId(source.sistema) || source.sistema.toLowerCase();

      if (!judgedRoster.has(key)) {
        judgedRoster.add(key);
        measurements.push(
          roster.vigentes.length
            ? sourceAgent(ctxM, now, source.sistema, roster.vigentes)
            : withoutFacts(ctxM, 'EV-02', now, roster.ultimo, 'padrón de agentes del manager')
        );
      }
    }
  });

  const machineList = Array.from(machines.entries()).map(([id, name]) => describeMachine(id, name)).join(', ');
  const note = hereOutside.length
    ? ` Se juzgan en la fila de su máquina${hasManager ? ' (aquí, solo que su agente exista y esté conectado)' : ''}: ${formatList(hereOutside)}.`
    : '';

  if (!measurements.length && !configuration.length) {
    return notApplicable(`Ninguna fuente de P-01 es de esta máquina (${machineList}): no es una fuente declarada de la vigilancia.${note}`);
  }

  const failures = measurements.filter(m => m.estado === 'NO_CUMPLE');
  const blanks = measurements.filter(m => m.estado === 'NO_EVALUABLE');
  const ok = measurements.filter(m => m.estado === 'CUMPLE');
  const pieces: Measurement[] = [...configuration, ...blanks];

  if (failures.length) {
    pieces.push(nonCompliant(`Fuentes de P-01 sin recolección efectiva: ${formatList(failures.map(m => m.motivo), 6)}${note}`));
  } else if (ok.length) {
    pieces.push(compliant(`Recolección efectiva de las fuentes de P-01: ${formatList(ok.map(m => m.motivo), 6)}${note}`));
  }

  // What a collector declared it could not read after its last good run is combined with what was
  // measured, machine by machine.
  const degraded = Array.from(judged.values())
    .map(([id, type]) => withDegradation(ofMachine(context, id), now, 'EV-02', type, compliant('')))
    .filter((m, i, all) => m.estado !== 'CUMPLE' && all.findIndex(x => x.motivo === m.motivo) === i);

  return combineMeasurements([...pieces, ...degraded]);
};


const inWindow = (ctxM: ENSPolicyContext, type: string, now: number): ENSNormalizedEvent[] =>
  valid(ctxM, type, now).filter(e => now - eventTime(e) <= WINDOW_DAYS * DAY_MS);

const correlationAlerts = (ctxM: ENSPolicyContext, now: number, filter?: Range[]): string => {
  const alerts = inWindow(ctxM, 'correlation_alert_observed', now).filter(e => {
    if (!filter) {
      return true;
    }

    const n = parseNumber(factField(e, 'regla'));

    return n !== undefined && filter.some(r => cutOff(r, [n, n]));
  });

  if (!alerts.length) {
    return `Ninguna alerta de correlación en los últimos ${WINDOW_DAYS} días.`;
  }

  const byRule = new Map<string, number>();

  alerts.forEach(e => byRule.set(factField(e, 'regla'), (byRule.get(factField(e, 'regla')) || 0) + (parseNumber(factField(e, 'veces')) || 0)));

  const total = Array.from(byRule.values()).reduce((a, b) => a + b, 0);

  return `${total} alertas de correlación en los últimos ${WINDOW_DAYS} días, de ${byRule.size} reglas (${formatList(Array.from(byRule.entries()).map(([r, n]) => `${r}: ${n}`))}).`;
};

const ev03 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(ctxM, 'correlation_rules_inventory', now);

  if (!current.length || last === undefined) {
    return withoutFacts(ctxM, 'EV-03', now, last, 'inventario de reglas de correlación del manager');
  }

  const correlate = (e: ENSNormalizedEvent) => parseNumber(factField(e, 'reglas_correlacion')) || 0;
  const total = current.reduce((t, e) => t + correlate(e), 0);
  const summary = current
    .map(e => `${factField(e, 'conjunto')}: ${factField(e, 'reglas') || '?'} reglas, ${correlate(e)} de correlación, ${factField(e, 'tecnicas_correlacion') || '0'} técnicas MITRE`)
    .join('; ');
  const pieces: Measurement[] = [];

  if (total === 0) {
    pieces.push(nonCompliant(`El manager no carga ninguna regla que correlacione eventos (frequency o if_matched_*) y pueda alertar: recolecta, pero no correlaciona (${summary}).`));
  }

  const declared = tableParameterRows(context, 'P-02');

  if (!declared) {
    pieces.push(missingParameter(context, 'P-02', `qué conjuntos de reglas de correlación tienen que estar desplegados (cargados hoy: ${summary})`));
  } else {
    declared.forEach((f, i) => {
      if (!(f.conjunto || '').trim() || f.conjunto.trim() === '-') {
        pieces.push(notMeasured(`P-02, fila ${i + 1}: falta el conjunto de reglas.`, 'CONFIGURATION'));
      }
    });

    const missing = declared
      .map(f => (f.conjunto || '').trim())
      .filter(name => name && name !== '-')
      .filter(name => !current.some(e => equalsIgnoreCase(factField(e, 'conjunto'), name) && correlate(e) > 0));

    if (missing.length) {
      pieces.push(nonCompliant(`Conjuntos de P-02 que el manager no carga, o que no tienen ninguna regla de correlación: ${missing.join(', ')}. Cargados: ${summary}.`));
    } else if (total > 0) {
      pieces.push(compliant(`Cargados con reglas de correlación todos los conjuntos de P-02 (${summary}). ${correlationAlerts(ctxM, now)}`));
    }
  }

  return withDegradation(ctxM, now, 'EV-03', 'correlation_rules_inventory', combineMeasurements(pieces));
};


interface Surface {
  sca: Measurement;
  inventario: Measurement;
  detector: Measurement;
}

const POLICIES_IN_CELL = /^[A-Za-z0-9_.-]+(\s*,\s*[A-Za-z0-9_.-]+)*$/;

const surface = (context: ENSPolicyContext, ctxM: ENSPolicyContext, now: number): Surface => {
  const deadline = positiveScalar(context, 'P-11');

  // The vulnerability detector: does not depend on P-03.
  const detector = ((): Measurement => {
    const { vigentes: current, ultimo: last } = currentStatus(ctxM, 'vulnerability_detection_status', now);
    const vd = current[current.length - 1];

    if (!vd) {
      return withoutFacts(ctxM, 'EV-04', now, last, 'estado del detector de vulnerabilidades del manager');
    }

    const enabled = factField(vd, 'habilitado');

    if (enabled !== 'si') {
      return nonCompliant(`El detector de vulnerabilidades no está habilitado en ossec.conf (${enabled || 'desconocido'}): no se determinan las vulnerabilidades.`);
    }

    const pieces: Measurement[] = [];
    const feed = parseInstant(factField(vd, 'feed_actualizado'));

    if (feed === undefined) {
      pieces.push(nonCompliant('El detector de vulnerabilidades no tiene fuente (queue/vd/feed): no hay contra qué comparar el inventario.'));
    } else if (deadline === undefined) {
      pieces.push(missingParameter(context, 'P-11', `la vigencia de la fuente del detector de vulnerabilidades (del ${iso(feed)})`));
    } else if (eventTime(vd) - feed > deadline * HOUR_MS) {
      pieces.push(
        nonCompliant(`La fuente del detector de vulnerabilidades es del ${iso(feed)}: ${formatHours(eventTime(vd) - feed)} h al leerla, más que las ${deadline} de P-11. El detector no se actualiza.`)
      );
    } else {
      pieces.push(compliant(`Detector de vulnerabilidades habilitado, con su fuente del ${iso(feed)}${!isEmptyField(factField(vd, 'intervalo_feed')) ? ` (actualización cada ${factField(vd, 'intervalo_feed')})` : ''}.`));
    }

    // Indexer connector errors. ossec.log rotates at midnight, so the collector also reads the
    // previous day's, keeps the last error between runs and says since when it could read
    // (`errores_desde`). An error 24 h old or less wins even if the read window's count is 0; a 0
    // over a short window proves nothing.
    const errors = parseNumber(factField(vd, 'errores_indexacion_24h'));
    const lastError = parseInstant(factField(vd, 'ultimo_error_indexacion'));
    const since = parseInstant(factField(vd, 'errores_desde'));
    const sample = factField(vd, 'muestra_error') || 'sin muestra';

    if (lastError !== undefined && eventTime(vd) - lastError <= 24 * HOUR_MS) {
      pieces.push(
        nonCompliant(
          `El detector no consigue escribir su resultado en el indexer: el último error del conector es del ${iso(lastError)}, ${formatHours(eventTime(vd) - lastError)} h antes de la lectura (${errors ?? '?'} en la ventana leída; ${sample}). Un detector que no escribe no determina nada.`
        )
      );
    } else if (errors === undefined) {
      pieces.push(
        notMeasured(
          'El recolector no ha podido contar los errores del conector del indexer (ossec.log ausente, vacío o solo en JSON): no se sabe si el detector consigue escribir su resultado.',
          'COLLECTION'
        )
      );
    } else if (errors > 0) {
      pieces.push(
        nonCompliant(
          `El detector no consigue escribir su resultado en el indexer: ${errors} errores del conector en las 24 h anteriores a la lectura (${sample}). Un detector que no escribe no determina nada.`
        )
      );
    } else if (since === undefined || since > eventTime(vd) - 23 * HOUR_MS) {
      pieces.push(
        notMeasured(
          since === undefined
            ? 'El recolector no dice desde cuándo ha leído ossec.log (errores_desde): un recuento de 0 errores sin su ventana no demuestra que el detector escriba.'
            : `Sin errores del conector, pero el recolector solo ha podido leer ${formatHours(Math.max(0, eventTime(vd) - since))} h de ossec.log (desde ${iso(since)}), menos que las 24 h que se juzgan: no se puede afirmar que el detector escriba.`,
          'COLLECTION'
        )
      );
    } else {
      pieces.push(
        compliant(
          `Sin errores del conector del indexer al escribir las vulnerabilidades desde ${iso(since)}${lastError !== undefined ? ` (el último, del ${iso(lastError)})` : ''}.`
        )
      );
    }

    return combineMeasurements(pieces);
  })();

  const activeRows = tableParameterRows(context, 'P-03');

  if (!activeRows) {
    const missing = missingParameter(context, 'P-03', 'sobre qué activos tiene que determinarse la superficie de exposición');

    return { sca: missing, inventario: missing, detector };
  }

  if (deadline === undefined) {
    const missing = missingParameter(context, 'P-11', 'cuántas horas puede pasar un activo sin SCA o sin inventario');

    return { sca: missing, inventario: missing, detector };
  }

  const roster = currentStatus(ctxM, 'package_inventory_observed', now);
  const scas = currentStatus(ctxM, 'config_assessment_observed', now);
  const configuration: Measurement[] = [];
  const sca: Measurement[] = [];
  const inventory: Measurement[] = [];

  activeRows.forEach((row, i) => {
    const activeValue = (row.activo || '').trim();
    const declared = (row.politicas_sca || '').trim();

    if (!activeValue || activeValue === '-') {
      configuration.push(notMeasured(`P-03, fila ${i + 1}: falta el activo (el nombre o el ID de su agente).`, 'CONFIGURATION'));

      return;
    }

    if (declared && declared !== '-' && !POLICIES_IN_CELL.test(declared)) {
      configuration.push(
        notMeasured(
          `P-03, activo «${activeValue}»: la columna politicas_sca dice «${declared}», que no es una lista de identificadores de política SCA (cis_ubuntu24-04, cis_apache_24). Vacía si basta cualquier política.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    if (!roster.vigentes.length) {
      const withoutRoster = withoutFacts(ctxM, 'EV-04', now, roster.ultimo, 'padrón de agentes del manager');

      sca.push(withoutRoster);
      inventory.push(withoutRoster);

      return;
    }

    const r = resolves(activeValue, roster.vigentes);

    if (r.tipo === 'ninguno') {
      const withoutAgent = nonCompliant(`${activeValue}: no figura en la base de agentes del manager, así que no se analiza.`);

      sca.push(withoutAgent);
      inventory.push(withoutAgent);

      return;
    }

    if (r.tipo === 'ambiguo') {
      configuration.push(ambiguous('P-03', activeValue, r.ids));

      return;
    }

    const e = r.hecho;
    const id = factId(e);
    const name = nameOf(activeValue, e);
    const read = factField(e, 'lectura');

    // Package inventory, which feeds the detector.
    if (read === 'error') {
      inventory.push(notMeasured(`${name}: el recolector no ha podido leer su base en el manager (queue/db/${id}.db).`, 'COLLECTION'));
    } else if (read === 'ausente') {
      inventory.push(nonCompliant(`${name}: no tiene base en el manager (nunca ha enviado inventario).`));
    } else {
      const t = parseInstant(factField(e, 'inventario_ultimo'));

      if (t === undefined) {
        inventory.push(nonCompliant(`${name}: sin inventario de paquetes; el detector no puede analizarlo.`));
      } else if (eventTime(e) - t > deadline * HOUR_MS) {
        inventory.push(nonCompliant(`${name}: su inventario de paquetes es del ${iso(t)}, ${formatHours(eventTime(e) - t)} h al leerlo (P-11 = ${deadline} h).`));
      } else {
        inventory.push(compliant(`${name}: inventario del ${iso(t)}${!isEmptyField(factField(e, 'paquetes')) ? `, ${factField(e, 'paquetes')} paquetes` : ''}`));
      }
    }

    // SCA, per policy.
    const their = scas.vigentes.filter(x => factId(x) === id);

    if (!their.length) {
      sca.push(
        scas.vigentes.length
          ? notMeasured(`${name}: el recolector no informa de su evaluación de configuración (SCA).`, 'COLLECTION')
          : withoutFacts(ctxM, 'EV-04', now, scas.ultimo, 'inventario de evaluaciones SCA del manager')
      );

      return;
    }

    if (their.some(x => factField(x, 'lectura') === 'error')) {
      sca.push(notMeasured(`${name}: el recolector no ha podido leer su base en el manager (queue/db/${id}.db).`, 'COLLECTION'));

      return;
    }

    const policies = their.filter(x => !isEmptyField(factField(x, 'politica')) && factField(x, 'politica') !== 'ninguna');

    if (!policies.length) {
      sca.push(nonCompliant(`${name}: ninguna política SCA evaluada; sus deficiencias de configuración no se determinan.`));

      return;
    }

    const describe = (x: ENSNormalizedEvent) =>
      `${factField(x, 'politica')} ${factField(x, 'ultimo_fin') || '-'} (puntuación ${factField(x, 'puntuacion') || '-'}%)`;
    const current = (x: ENSNormalizedEvent): boolean => {
      const t = parseInstant(factField(x, 'ultimo_fin'));

      return t !== undefined && eventTime(x) - t <= deadline * HOUR_MS;
    };

    if (declared && declared !== '-') {
      const required = declared.split(',').map(p => p.trim()).filter(Boolean);
      const fail = required.filter(p => !policies.some(x => equalsIgnoreCase(factField(x, 'politica'), p) && current(x)));

      sca.push(
        fail.length
          ? nonCompliant(`${name}: políticas SCA de P-03 sin evaluar en P-11 (${deadline} h): ${fail.join(', ')} (evaluadas: ${formatList(policies.map(describe))}).`)
          : compliant(`${name}: ${formatList(policies.filter(x => required.some(p => equalsIgnoreCase(factField(x, 'politica'), p))).map(describe))}`)
      );

      return;
    }

    const recent = policies.filter(current);

    sca.push(
      recent.length
        ? compliant(`${name}: ${formatList(recent.map(describe))}`)
        : nonCompliant(`${name}: ninguna pasada SCA en P-11 (${deadline} h) (${formatList(policies.map(describe))}).`)
    );
  });

  const resume = (measurements: Measurement[], subject: string): Measurement => {
    const failures = measurements.filter(m => m.estado === 'NO_CUMPLE');
    const blanks = measurements.filter(m => m.estado === 'NO_EVALUABLE');
    const ok = measurements.filter(m => m.estado === 'CUMPLE');
    const pieces: Measurement[] = [...configuration, ...blanks];

    if (failures.length) {
      pieces.push(nonCompliant(`Activos de P-03 sin ${subject} vigente: ${formatList(failures.map(m => m.motivo))}`));
    } else if (ok.length) {
      pieces.push(compliant(`${subject[0].toUpperCase()}${subject.slice(1)} vigente en los activos de P-03: ${formatList(ok.map(m => m.motivo))}.`));
    }

    return combineMeasurements(pieces);
  };

  return {
    sca: resume(sca, 'evaluación de configuración (SCA)'),
    inventario: resume(inventory, 'inventario para el análisis de vulnerabilidades'),
    detector,
  };
};

const CVE_NOT_MEASURED =
  'El recuento de vulnerabilidades por activo vive en el indexer y no se lee sin credenciales: sin medir (R2 se juzga por capacidad).';


const ev06 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: latest } = currentStatus(ctxM, 'network_detection_observed', now);

  if (!current.length || latest === undefined) {
    return withoutFacts(ctxM, 'EV-06', now, latest, 'inventario de detección en red del manager');
  }

  const observed = current.filter(e => !isEmptyField(factField(e, 'producto')) && factField(e, 'producto') !== 'ninguno');
  const seen = observed.map(e => `${factField(e, 'producto')} por ${factField(e, 'fuente') || '-'}`).join(', ');

  if (!observed.length) {
    return withDegradation(
      ctxM,
      now,
      'EV-06',
      'network_detection_observed',
      nonCompliant('El manager no ingiere ninguna detección en red (Suricata, Snort, Zeek): sin sonda de red, R3.2 no se cumple. Es un componente externo, no configuración de Wazuh.')
    );
  }

  const probes = tableParameterRows(context, 'P-05');

  if (!probes) {
    return withDegradation(
      ctxM,
      now,
      'EV-06',
      'network_detection_observed',
      missingParameter(context, 'P-05', `qué sonda de red se exige (el manager ingiere: ${seen})`)
    );
  }

  const pieces: Measurement[] = [];
  const failures: string[] = [];
  const ok: string[] = [];

  probes.forEach((f, i) => {
    const product = (f.producto || '').trim();
    const max = (f.max_dias_sin_alertas || '').trim();

    if (!product || product === '-') {
      pieces.push(notMeasured(`P-05, fila ${i + 1}: falta el producto de la sonda de red.`, 'CONFIGURATION'));

      return;
    }

    if (max && max !== '-' && !POSITIVE_INTEGER.test(max)) {
      pieces.push(notMeasured(`P-05, sonda «${product}»: max_dias_sin_alertas dice «${max}», que no es un número entero de días.`, 'CONFIGURATION'));

      return;
    }

    const their = observed.filter(e =>
      equalsIgnoreCase(factField(e, 'producto'), product) || stripAccents(product).split(/[^a-z0-9]+/).includes(stripAccents(factField(e, 'producto')))
    );

    if (!their.length) {
      failures.push(`${product}: P-05 la declara y el manager no ingiere sus alertas (ingiere: ${seen})`);

      return;
    }

    const withAlert = their
      .map(e => ({ e, t: parseInstant(factField(e, 'ultima_alerta')) }))
      .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined);

    if (!withAlert.length) {
      failures.push(`${product}: llega por ${their.map(e => factField(e, 'fuente')).join(', ')} y no se ha recibido ninguna alerta suya`);

      return;
    }

    const lastWithAlert = withAlert.reduce((a, b) => (b.t > a.t ? b : a));

    if (max && max !== '-' && eventTime(lastWithAlert.e) - lastWithAlert.t > Number(max) * DAY_MS) {
      failures.push(`${product}: su última alerta es del ${iso(lastWithAlert.t)}, ${wholeDays(eventTime(lastWithAlert.e) - lastWithAlert.t)} días al leerla (máximo ${max})`);
    } else {
      ok.push(`${product} por ${factField(lastWithAlert.e, 'fuente') || '-'}: última alerta ${iso(lastWithAlert.t)}`);
    }
  });

  if (failures.length) {
    pieces.push(nonCompliant(`Detección en red de P-05 que no está operativa: ${formatList(failures)}.`));
  } else if (ok.length) {
    pieces.push(compliant(`El manager ingiere la detección en red de P-05: ${formatList(ok)}.`));
  }

  return withDegradation(ctxM, now, 'EV-06', 'network_detection_observed', combineMeasurements(pieces));
};


const ev08 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(ctxM, 'query_volume_rules_observed', now);

  if (!current.length || last === undefined) {
    return withoutFacts(ctxM, 'EV-08', now, last, 'inventario de reglas de umbral del manager');
  }

  const loaded: Range[] = [];
  const presentes = new Set<number>();
  let totalParts = 1;

  current.forEach(e => {
    if (!isEmptyField(factField(e, 'ids'))) {
      loaded.push(...ranges(factField(e, 'ids')));
    }

    totalParts = Math.max(totalParts, parseNumber(factField(e, 'partes')) || 1);
    presentes.add(parseNumber(factField(e, 'parte')) || 1);
  });

  const incomplete = presentes.size < totalParts;
  const total = parseNumber(factField(current[0], 'reglas_umbral'));
  const thresholds = tableParameterRows(context, 'P-07');

  if (!thresholds) {
    return withDegradation(
      ctxM,
      now,
      'EV-08',
      'query_volume_rules_observed',
      missingParameter(context, 'P-07', `qué consultas tienen que vigilarse y con qué regla (el manager carga ${total ?? '?'} reglas de umbral)`)
    );
  }

  const pieces: Measurement[] = [];
  const withoutRule: string[] = [];
  const withoutLoad: string[] = [];
  const ok: string[] = [];

  thresholds.forEach(f => {
    const name = `${f.sistema}${f.perfil ? ` / ${f.perfil}` : ''}`;
    const text = (f.reglas || '').trim();

    if (!text || NO_RULE.test(text)) {
      withoutRule.push(`«${name}» (${f.max_consultas || '?'} en ${f.ventana || '?'})`);

      return;
    }

    if (!RULES_IN_CELL.test(text)) {
      pieces.push(
        notMeasured(
          `P-07, «${name}»: la columna reglas dice «${text}», que no es una lista de ids o rangos de reglas (100510, 100500-100509). Si nadie la vigila, escribe «ninguna».`,
          'CONFIGURATION'
        )
      );

      return;
    }

    const declared = ranges(text);
    const covered = declared.filter(r => loaded.some(c => cutOff(c, r)));

    if (covered.length) {
      ok.push(`«${name}» → ${covered.map(describeRange).join(', ')}. ${correlationAlerts(ctxM, now, covered)}`);
    } else if (incomplete) {
      pieces.push(
        notMeasured(
          `«${name}»: ninguna de sus reglas (${declared.map(describeRange).join(', ')}) aparece en lo recibido, pero faltan partes del inventario (${presentes.size} de ${totalParts}): no se puede afirmar que no estén cargadas.`,
          'COLLECTION'
        )
      );
    } else {
      withoutLoad.push(`«${name}» (${declared.map(describeRange).join(', ')})`);
    }
  });

  if (withoutRule.length) {
    pieces.push(nonCompliant(`Consultas de P-07 que ninguna regla vigila: ${formatList(withoutRule)}.`));
  }

  if (withoutLoad.length) {
    pieces.push(nonCompliant(`Consultas de P-07 cuyas reglas no están cargadas como reglas de umbral (frequency) o no pueden alertar: ${formatList(withoutLoad)}.`));
  }

  if (!withoutRule.length && !withoutLoad.length && ok.length) {
    pieces.push(compliant(`Cada consulta de P-07 la vigila una regla de umbral cargada: ${formatList(ok)}`));
  }

  return withDegradation(ctxM, now, 'EV-08', 'query_volume_rules_observed', combineMeasurements(pieces));
};


const ev09 = (context: ENSPolicyContext, ctxM: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(ctxM, 'notification_channel_configured', now);

  if (!current.length || last === undefined) {
    return withoutFacts(ctxM, 'EV-09', now, last, 'inventario de canales de notificación del manager');
  }

  const enabled = current.filter(e => factField(e, 'habilitado') === 'si');
  const summary = current
    .map(e => `${factField(e, 'canal')} ${factField(e, 'habilitado') === 'si' ? `desde nivel ${factField(e, 'nivel_minimo') || '-'}` : 'deshabilitado'}`)
    .join(', ');
  const recipients = tableParameterRows(context, 'P-08');
  const pieces: Measurement[] = [];

  if (!enabled.length) {
    pieces.push(nonCompliant(`El manager no tiene ningún canal de notificación habilitado (${summary}): las detecciones no llegan a nadie en tiempo real.`));
  }

  if (!recipients) {
    pieces.push(missingParameter(context, 'P-08', `a quién y por qué canal tiene que llegar la alerta en tiempo real (canales: ${summary})`));

    return withDegradation(ctxM, now, 'EV-09', 'notification_channel_configured', combineMeasurements(pieces));
  }

  const failures: string[] = [];
  const ok: string[] = [];

  recipients.forEach(f => {
    const channel = (f.canal || '').trim();
    const level = (f.nivel_minimo || '').trim();
    const who = f.destinatario || channel;

    if (!channel) {
      pieces.push(notMeasured(`P-08, «${who}»: falta el canal («correo» o el nombre de la integración).`, 'CONFIGURATION'));

      return;
    }

    if (level && level !== '-' && (!POSITIVE_INTEGER.test(level) || Number(level) < 1 || Number(level) > 16)) {
      pieces.push(notMeasured(`P-08, «${who}»: nivel_minimo dice «${level}», que no es un nivel de alerta de Wazuh (1-16).`, 'CONFIGURATION'));

      return;
    }

    const e = current.find(x => equalsIgnoreCase(factField(x, 'canal'), channel));

    if (!e) {
      failures.push(`${who} por ${channel}: el canal no está configurado en el manager`);

      return;
    }

    if (factField(e, 'habilitado') !== 'si') {
      failures.push(`${who} por ${channel}: el canal está deshabilitado`);

      return;
    }

    const since = parseNumber(factField(e, 'nivel_minimo'));

    if (level && level !== '-' && since !== undefined && since > Number(level)) {
      failures.push(`${who} por ${channel}: el canal solo avisa desde el nivel ${since} y P-08 lo exige desde el ${level}`);

      return;
    }

    if (equalsIgnoreCase(channel, 'correo') && parseNumber(factField(e, 'destinatarios')) === undefined) {
      pieces.push(
        notMeasured(`${who} por correo: el recolector no informa de cuántos destinatarios tiene el correo, así que no se sabe si la alerta llega a alguien.`, 'COLLECTION')
      );

      return;
    }

    if (equalsIgnoreCase(channel, 'correo') && parseNumber(factField(e, 'destinatarios')) === 0) {
      failures.push(`${who} por correo: el correo está habilitado sin ningún destinatario`);

      return;
    }

    const errors = parseNumber(factField(e, 'errores_24h'));

    if (errors !== undefined && errors > 0) {
      failures.push(`${who} por ${channel}: ${errors} errores de envío en las 24 h anteriores a la lectura (integrations.log)`);

      return;
    }

    ok.push(`${who} por ${channel} desde nivel ${since ?? 'cualquiera'}`);
  });

  if (failures.length) {
    pieces.push(nonCompliant(`Alertas en tiempo real de P-08 que no llegan: ${formatList(failures)}.`));
  } else if (ok.length) {
    pieces.push(compliant(`Canales de P-08 configurados, habilitados y sin errores: ${formatList(ok)}. La latencia alerta → aviso no es medible: Wazuh no anota los envíos correctos.`));
  }

  return withDegradation(ctxM, now, 'EV-09', 'notification_channel_configured', combineMeasurements(pieces));
};


type TypeInspection = 'verificacion_configuracion' | 'analisis_vulnerabilidades' | 'pentest';

const INSPECTION_NAME: Record<TypeInspection, string> = {
  verificacion_configuracion: 'verificación de configuración',
  analisis_vulnerabilidades: 'análisis de vulnerabilidades',
  pentest: 'prueba de penetración',
};

type Plan = { continua: true } | { continua: false; dias: number };

// A P-09 inspection row: «continua» or a number of days. Nothing else.
const planOf = (context: ENSPolicyContext, type: TypeInspection): Plan | Measurement => {
  const plan = tableParameterRows(context, 'P-09');

  if (!plan) {
    return missingParameter(context, 'P-09', `con qué periodicidad tiene que hacerse la ${INSPECTION_NAME[type]}`);
  }

  const their = plan.filter(f => stripAccents(f.inspeccion || '') === type);

  if (!their.length) {
    return notMeasured(`P-09 no declara la periodicidad de la ${INSPECTION_NAME[type]} (${type}).`, 'CONFIGURATION');
  }

  if (their.length > 1) {
    return notMeasured(`P-09 declara ${their.length} veces la ${INSPECTION_NAME[type]}: una fila por inspección.`, 'CONFIGURATION');
  }

  const text = stripAccents((their[0].periodicidad || '').trim());

  if (text === 'continua') {
    return { continua: true };
  }

  const m = /^(\d+)(\s*(dias|d))?$/.exec(text);

  if (!m || Number(m[1]) <= 0) {
    return notMeasured(
      `P-09, ${type}: la periodicidad dice «${their[0].periodicidad || ''}», y solo puede ser un número de días (365 para anual) o «continua».`,
      'CONFIGURATION'
    );
  }

  return { continua: false, dias: Number(m[1]) };
};

const isPlan = (x: Plan | Measurement): x is Plan => 'continua' in x;

// The last inspection of a type in the record, against the periodicity. Age is measured at the
// instant the collector read the record.
const recordOf = (ctxM: ENSPolicyContext, now: number, type: TypeInspection, daysPlan: number): Measurement => {
  const { vigentes: current, ultimo: latest } = currentStatus(ctxM, 'security_inspection_recorded', now);

  if (!current.length || latest === undefined) {
    return withoutFacts(ctxM, 'EV-12', now, latest, 'registro de inspecciones del manager');
  }

  const rowsRecord = current.filter(e => factField(e, 'tipo') !== 'ninguna');
  const defective = rowsRecord.filter(e => !isEmptyField(factField(e, 'formato')) && factField(e, 'formato') !== 'ok');
  const pieces: Measurement[] = [];

  if (defective.length) {
    pieces.push(
      notMeasured(
        `Filas del registro de inspecciones con formato inválido, que no cuentan: ${formatList(defective.map(e => `línea ${factField(e, 'fila')}: ${factField(e, 'formato')}`))}.`,
        'CONFIGURATION'
      )
    );
  }

  const future = rowsRecord.filter(e => {
    const t = parseInstant(factField(e, 'fecha'));

    return factField(e, 'formato') === 'ok' && t !== undefined && t > eventTime(e) + SAME_RUN_WINDOW_MS;
  });

  if (future.length) {
    pieces.push(
      notMeasured(
        `Inspecciones con fecha futura en el registro, que es de actos realizados: ${formatList(future.map(e => `línea ${factField(e, 'fila')} (${factField(e, 'fecha')})`))}.`,
        'CONFIGURATION'
      )
    );
  }

  const done = rowsRecord
    .filter(e => (isEmptyField(factField(e, 'formato')) || factField(e, 'formato') === 'ok') && factField(e, 'tipo') === type)
    .map(e => ({ e, t: parseInstant(factField(e, 'fecha')) }))
    .filter((x): x is { e: ENSNormalizedEvent; t: number } => x.t !== undefined && x.t <= eventTime(x.e) + SAME_RUN_WINDOW_MS);

  if (!done.length) {
    pieces.push(nonCompliant(`No consta ninguna ${INSPECTION_NAME[type]} en el registro de inspecciones (periodicidad de P-09: ${daysPlan} días).`));
  } else {
    const lastDone = done.reduce((a, b) => (b.t > a.t ? b : a));
    const age = eventTime(lastDone.e) - lastDone.t;
    const subject = `la última ${INSPECTION_NAME[type]} es del ${iso(lastDone.t)} (${factField(lastDone.e, 'ejecutor') || 'ejecutor sin declarar'}, ${factField(lastDone.e, 'alcance') || 'alcance sin declarar'}; hallazgos: ${factField(lastDone.e, 'hallazgos') || '-'}, ${factField(lastDone.e, 'estado_remediacion') || '-'})`;

    pieces.push(
      age > daysPlan * DAY_MS
        ? nonCompliant(`Vencida: ${subject}, hace ${wholeDays(age)} días al leer el registro, más que los ${daysPlan} de P-09.`)
        : compliant(`Dentro de la periodicidad de P-09 (${daysPlan} días): ${subject}.`)
    );
  }

  return withDegradation(ctxM, now, 'EV-12', 'security_inspection_recorded', combineMeasurements(pieces));
};

// An R6 inspection. Returns the requirement's measurement and that of each evidence supporting it
// in THIS requirement.
const inspection = (
  context: ENSPolicyContext,
  ctxM: ENSPolicyContext,
  now: number,
  type: TypeInspection,
  continuous?: { evidencia: string; medida: Measurement }
): { requisito: Measurement; evidencias: { id: string; medida: Measurement }[] } => {
  const ofContinuous = continuous ? [{ id: continuous.evidencia, medida: continuous.medida }] : [];

  const plan = planOf(context, type);

  if (!isPlan(plan)) {
    // Without a plan there is nothing to judge the record against, but a continuous measurement
    // against still wins.
    const evidences = [...ofContinuous, { id: 'EV-12', medida: plan }];

    return { requisito: combineMeasurements(evidences.map(x => x.medida)), evidencias: evidences };
  }

  if (plan.continua) {
    if (!continuous) {
      const measurement = notMeasured(
        `P-09 declara la ${INSPECTION_NAME[type]} «continua», y no lo es: declara su periodicidad en días (365 para anual).`,
        'CONFIGURATION'
      );

      return { requisito: measurement, evidencias: [{ id: 'EV-12', medida: measurement }] };
    }

    return {
      requisito: continuous.medida,
      evidencias: [
        ...ofContinuous,
        { id: 'EV-12', medida: notApplicable(`P-09 declara la ${INSPECTION_NAME[type]} continua: se acredita con ${continuous.evidencia}, sin fila del registro.`) },
      ],
    };
  }

  const record = recordOf(ctxM, now, type, plan.dias);

  if (!continuous) {
    return { requisito: record, evidencias: [{ id: 'EV-12', medida: record }] };
  }

  // Periodic: the continuous measurement (exceeds the periodicity) or the last record row within it
  // is enough.
  if (continuous.medida.estado === 'CUMPLE') {
    return {
      requisito: compliant(`La ${INSPECTION_NAME[type]} es continua (${continuous.evidencia}), lo que supera la periodicidad de P-09 (${plan.dias} días): ${continuous.medida.motivo}`),
      evidencias: [
        ...ofContinuous,
        { id: 'EV-12', medida: notApplicable(`La ${INSPECTION_NAME[type]} continua (${continuous.evidencia}) ya cubre la periodicidad de P-09. Registro: ${record.motivo}`) },
      ],
    };
  }

  if (record.estado === 'CUMPLE') {
    return {
      requisito: compliant(`Acreditada con el registro: ${record.motivo} (la medida continua no basta: ${continuous.medida.motivo})`),
      evidencias: [...ofContinuous, { id: 'EV-12', medida: record }],
    };
  }

  return {
    requisito: combineMeasurements([continuous.medida, record]),
    evidencias: [...ofContinuous, { id: 'EV-12', medida: record }],
  };
};


const ev13 = (ctxM: ENSPolicyContext, now: number): string => {
  const incidents = currentStatus(ctxM, 'incident_registered', now);
  const inspections = currentStatus(ctxM, 'security_inspection_recorded', now).vigentes.filter(
    e => factField(e, 'motivo') === 'post_incidente'
  );

  if (!incidents.vigentes.length) {
    const deg = degradation(ctxM, 'EV-13', now);

    return deg ? deg.motivo : `No consta el resumen de incidentes del periodo: el recolector de op.mon.3 del manager no informa.`;
  }

  const real = incidents.vigentes.filter(e => factField(e, 'incidente_id') !== 'ninguno');
  const cited = new Map<string, string[]>();

  inspections.forEach(e => {
    const id = factField(e, 'incidente_id');

    cited.set(id, [...(cited.get(id) || []), `${factField(e, 'tipo')} del ${factField(e, 'fecha')}`]);
  });

  const withInspection = real.filter(e => cited.has(factField(e, 'incidente_id')));
  const withoutInspection = real.filter(e => !cited.has(factField(e, 'incidente_id')));
  const unknown = Array.from(cited.keys()).filter(id => !real.some(e => factField(e, 'incidente_id') === id));

  return [
    real.length
      ? `${real.length} incidentes en los últimos ${WINDOW_DAYS} días.`
      : `Ningún incidente en los últimos ${WINDOW_DAYS} días.`,
    withInspection.length
      ? `Con inspección posterior: ${formatList(withInspection.map(e => `${factField(e, 'incidente_id')} (${(cited.get(factField(e, 'incidente_id')) || []).join(', ')})`))}.`
      : '',
    withoutInspection.length ? `Sin inspección posterior registrada: ${formatList(withoutInspection.map(e => `${factField(e, 'incidente_id')} (${factField(e, 'severidad')})`))}.` : '',
    unknown.length ? `Inspecciones tras incidente que citan incidentes fuera del periodo o inexistentes: ${formatList(unknown)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const DATA_EV13 =
  'Dato del informe, sin veredicto: el registro de incidentes (13 columnas, compartido con op.exp.7 y op.exp.9) no dice qué incidentes revelaron vulnerabilidades nuevas o subestimadas, que son los que R6 obliga a inspeccionar.';


const documental = (context: ENSPolicyContext, parameter: string, subject: string, columns: (f: Record<string, string>) => string): Measurement => {
  const declared = tableParameterRows(context, parameter);

  return notMeasured(
    `${subject} no se puede medir: se acredita documentalmente con P-ATT.${declared ? ` ${parameterDisplayName(context, parameter)} declara: ${formatList(declared.map(columns))}.` : ` ${parameterDisplayName(context, parameter)} está sin declarar.`}`,
    'CONFIGURATION'
  );
};


type Row = 'central' | 'agente' | 'desconocida';

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const applies = (requirement: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requirement)
        ?.applicability.levels.includes(context.level)
    );

  const machines = machinesOf(context);
  const row: Row = machines.has(MANAGER) ? 'central' : machines.size ? 'agente' : 'desconocida';
  const ctxM = ofMachine(context, MANAGER);

  // Each measure is computed once and only if some applying requirement uses it.
  const cache: Record<string, Measurement> = {};
  const measure = (key: string, computes: () => Measurement): Measurement => {
    if (!cache[key]) {
      cache[key] = computes();
    }

    return cache[key];
  };

  let measuredSurface: Surface | undefined;
  const sup = (): Surface => {
    if (!measuredSurface) {
      measuredSurface = surface(context, ctxM, now);
    }

    return measuredSurface;
  };

  // An evidence's measurement for the central plane, or what corresponds to the row: on an agent's,
  // NO_APLICA; without facts, nothing is taken as good.
  const central = (key: string, computes: () => Measurement): Measurement =>
    row === 'agente'
      ? notApplicable(MEASURED_IN_MANAGER)
      : row === 'desconocida'
      ? notMeasured(NO_FACT_AT_ALL, 'COLLECTION')
      : measure(key, computes);

  const measurementOf = (evidence: string): Measurement => {
    switch (evidence) {
      case 'EV-01':
        return central('EV-01', () => ev01(ctxM, now));
      case 'EV-02':
        return row === 'desconocida' ? notMeasured(NO_FACT_AT_ALL, 'COLLECTION') : measure('EV-02', () => ev02(context, now, machines));
      case 'EV-03':
        return central('EV-03', () => ev03(context, ctxM, now));
      case 'EV-04':
        return central('EV-04', () => {
          const s = sup();
          const axes = [s.sca, s.inventario, s.detector].filter(
            (m, i, all) => all.findIndex(x => x.estado === m.estado && x.motivo === m.motivo) === i
          );

          return withDegradation(
            ctxM,
            now,
            'EV-04',
            'package_inventory_observed',
            combineMeasurements([...axes, ...(worstStatus(axes) === 'CUMPLE' ? [compliant(CVE_NOT_MEASURED)] : [])])
          );
        });
      case 'EV-06':
        return central('EV-06', () => ev06(context, ctxM, now));
      case 'EV-08':
        return central('EV-08', () => ev08(context, ctxM, now));
      case 'EV-09':
        return central('EV-09', () => ev09(context, ctxM, now));
      case 'EV-10':
        return central('EV-10', () => withDegradation(ctxM, now, 'EV-04', 'config_assessment_observed', sup().sca));
      default:
        return central('EV-11', () =>
          withDegradation(ctxM, now, 'EV-04', 'package_inventory_observed', combineMeasurements([sup().inventario, sup().detector]))
        );
    }
  };

  const requirementDecisions: ENSPolicyDecision[] = [];
  const evidenceDecisions: ENSPolicyDecision[] = [];

  const emits = (
    requirement: string,
    type: ENSDecisionRuleType,
    parameters: string[],
    measurement: Measurement,
    evidences: { id: string; medida: Measurement }[],
    expected: string
  ) => {
    const owners = evidences.filter(p => p.medida.estado === measurement.estado);

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads).
    requirementDecisions.push(
      decide(
        requirement,
        measurement.estado,
        (owners.length ? owners : evidences).map(p => p.id),
        parameters,
        type,
        requirement,
        [
          ...(measurement.motivo ? [measurement.motivo] : []),
          ...evidences.map(p => `${p.id} ${p.medida.estado}: ${p.medida.motivo}`),
        ].join(' | '),
        expected,
        measurement.causa ?? commonGapCause(owners.map(p => p.medida))
      )
    );

    // And one per evidence, with ITS status.
    evidences.forEach(p =>
      evidenceDecisions.push(
        decide(requirement, p.medida.estado, [p.id], parameters, type, `${requirement}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
      )
    );
  };

  // Technical ones: the worst of their evidences.
  const TECHNICIANS: { requisito: string; evidencias: string[]; parametros: string[]; tipo: ENSDecisionRuleType }[] = [
    { requisito: 'op.mon.3.1', evidencias: ['EV-01', 'EV-02'], parametros: ['P-01'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r1.1', evidencias: ['EV-03'], parametros: ['P-02'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r2.1', evidencias: ['EV-04'], parametros: ['P-03', 'P-11'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r3.2', evidencias: ['EV-06'], parametros: ['P-05'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r5.1', evidencias: ['EV-08'], parametros: ['P-07'], tipo: 'COVERAGE_REQUIRED' },
    { requisito: 'op.mon.3.r5.2', evidencias: ['EV-09'], parametros: ['P-08'], tipo: 'COVERAGE_REQUIRED' },
  ];

  TECHNICIANS.filter(r => applies(r.requisito)).forEach(definition => {
    const own = definition.evidencias.map(id => ({ id, medida: measurementOf(id) }));
    const status = worstStatus(own.map(p => p.medida));
    const owners = own.filter(p => p.medida.estado === status);

    emits(
      definition.requisito,
      definition.tipo,
      definition.parametros,
      { estado: status, motivo: '', ...(status === 'NO_EVALUABLE' ? { causa: commonGapCause(owners.map(p => p.medida)) } : {}) },
      own,
      definition.evidencias.map(id => `${id} CUMPLE`).join(' y ')
    );
  });

  // R3.1 and R4: documentary. Without a measurement the decision stays unmeasured (CONFIGURATION)
  // and P-ATT may accredit them since the catalog declares them without evidences. On an agent's
  // row they do not apply: they are accredited on the manager's.
  const DOCUMENTARY: { requisito: string; parametro: string; que: string; columnas: (f: Record<string, string>) => string }[] = [
    {
      requisito: 'op.mon.3.r3.1',
      parametro: 'P-04',
      que: 'La detección de comportamientos anómalos (Wazuh no trae motor de líneas base: son reglas que alguien escribe sobre los indicadores de la línea base)',
      columnas: f => `${f.indicador} (normal: ${f.normalidad || '-'}; anomalía: ${f.umbral_anomalia || '-'})`,
    },
    {
      requisito: 'op.mon.3.r4.1',
      parametro: 'P-06',
      que: 'El observatorio digital (un servicio de cibervigilancia externo, ajeno al perímetro de un SIEM)',
      columnas: f => `${f.servicio}${f.proveedor ? ` de ${f.proveedor}` : ''}${f.alcance ? ` (${f.alcance})` : ''}`,
    },
  ];

  DOCUMENTARY.filter(d => applies(d.requisito)).forEach(d => {
    const measurement = row === 'agente' ? notApplicable(MEASURED_IN_MANAGER) : documental(context, d.parametro, d.que, d.columnas);

    emits(d.requisito, 'COVERAGE_REQUIRED', [d.parametro], measurement, [], 'P-ATT del requisito');
  });

  // R6: P-09 rules.
  const INSPECTIONS: { requisito: string; tipo: TypeInspection; continua?: string; parametros: string[] }[] = [
    { requisito: 'op.mon.3.r6.1', tipo: 'verificacion_configuracion', continua: 'EV-10', parametros: ['P-03', 'P-09', 'P-10', 'P-11'] },
    { requisito: 'op.mon.3.r6.2', tipo: 'analisis_vulnerabilidades', continua: 'EV-11', parametros: ['P-03', 'P-09', 'P-10', 'P-11'] },
    { requisito: 'op.mon.3.r6.3', tipo: 'pentest', parametros: ['P-09', 'P-10'] },
  ];

  INSPECTIONS.filter(i => applies(i.requisito)).forEach(i => {
    const expected = i.continua ? `${i.continua} CUMPLE, o EV-12 dentro de P-09` : 'EV-12 dentro de P-09';

    if (row !== 'central') {
      const measurement = row === 'agente' ? notApplicable(MEASURED_IN_MANAGER) : notMeasured(NO_FACT_AT_ALL, 'COLLECTION');
      const evidences = [...(i.continua ? [i.continua] : []), 'EV-12'].map(id => ({ id, medida: measurement }));

      emits(i.requisito, 'MAX_AGE', i.parametros, measurement, evidences, expected);

      return;
    }

    const continuous = i.continua ? { evidencia: i.continua, medida: measurementOf(i.continua) } : undefined;
    const { requisito: requirement, evidencias: evidences } = inspection(context, ctxM, now, i.tipo, continuous);

    emits(i.requisito, 'MAX_AGE', i.parametros, requirement, evidences, expected);
  });

  // Evidences reported without verdict.
  const informational = (requirement: string, evidence: string, parameters: string[], motive: string) =>
    evidenceDecisions.push(decide(requirement, 'NO_APLICA', [evidence], parameters, 'COVERAGE_REQUIRED', `${requirement}/${evidence}`, motive, 'dato del informe'));

  const lineBase = tableParameterRows(context, 'P-04');
  const lists = row === 'central' ? currentStatus(ctxM, 'ioc_list_observed', now).vigentes.filter(e => factField(e, 'lista') !== 'ninguna') : [];
  const dataEv13 = row === 'central' ? `${DATA_EV13} ${ev13(ctxM, now)}` : DATA_EV13;

  informational(
    'op.mon.3.r3.1',
    'EV-05',
    ['P-04'],
    `Dato del informe, sin veredicto: R3.1 se acredita documentalmente (P-ATT). ${lineBase ? `Línea base de P-04: ${formatList(lineBase.map(f => `${f.indicador} (normal: ${f.normalidad || '-'}; anomalía: ${f.umbral_anomalia || '-'})`))}.` : 'P-04 sin declarar: no consta contra qué normalidad se detectan las anomalías.'}`
  );
  informational(
    'op.mon.3.r4.1',
    'EV-07',
    ['P-06'],
    row === 'agente'
      ? MEASURED_IN_MANAGER
      : `Dato del informe, sin veredicto: R4 exige el servicio de cibervigilancia, que se acredita documentalmente (P-ATT). ${
          lists.length
            ? `Listas de indicadores cargadas: ${formatList(lists.map(e => `${factField(e, 'lista')} (${factField(e, 'entradas') || '?'} entradas, del ${factField(e, 'actualizada') || '-'}, ${factField(e, 'reglas_que_la_usan') || '0'} reglas)`))}.`
            : 'El manager no carga ninguna lista de indicadores.'
        }`
  );
  informational('op.mon.3.r6.1', 'EV-13', ['P-09', 'P-10'], row === 'agente' ? MEASURED_IN_MANAGER : dataEv13);

  const s = row === 'central' && (applies('op.mon.3.r2.1') || applies('op.mon.3.r6.1') || applies('op.mon.3.r6.2')) ? sup() : undefined;
  const variables: ENSRuntimeVariable[] = [
    {
      name: 'fila_de_medida',
      value: row,
      parameterIds: [],
      evidenceIds: [],
      eventIds: [],
      description:
        row === 'central'
          ? 'Fila del sistema central de recolección (manager): se miden todas las evidencias.'
          : row === 'agente'
          ? 'Fila de un agente: se miden sus fuentes de P-01 (EV-02); lo demás se mide en el manager.'
          : NO_FACT_AT_ALL,
    },
    ...Object.entries(cache).map(([key, measurement]) => ({
      name: `medida_${key.replace(/[-.]/g, '')}`,
      value: measurement.estado,
      parameterIds: [],
      evidenceIds: [key],
      eventIds: [],
      description: measurement.motivo,
    })),
    ...(s
      ? [
          { name: 'superficie_sca', value: s.sca.estado, parameterIds: ['P-03', 'P-11'], evidenceIds: ['EV-04', 'EV-10'], eventIds: [], description: s.sca.motivo },
          { name: 'superficie_inventario', value: s.inventario.estado, parameterIds: ['P-03', 'P-11'], evidenceIds: ['EV-04', 'EV-11'], eventIds: [], description: s.inventario.motivo },
          { name: 'superficie_detector', value: s.detector.estado, parameterIds: ['P-11'], evidenceIds: ['EV-04', 'EV-11'], eventIds: [], description: s.detector.motivo },
        ]
      : []),
    {
      name: 'cve_por_activo',
      value: 'sin_medir',
      parameterIds: ['P-03'],
      evidenceIds: ['EV-04'],
      eventIds: [],
      description: CVE_NOT_MEASURED,
    },
  ];

  return { decisions: [...requirementDecisions, ...evidenceDecisions], runtimeVariables: variables };
};

export const opMon3PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // By system category: base in all three, R1 and R2 from MEDIA, R3 to R6 only in ALTA, R7 in none.
  requirements: [
    {
      requirementId: 'op.mon.3.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-01', 'EV-02'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-11'],
      evidenceIds: ['EV-04'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r3.1',
      levels: ['ALTO'],
      parameterIds: ['P-04'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r3.2',
      levels: ['ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r4.1',
      levels: ['ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r5.1',
      levels: ['ALTO'],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-08'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r5.2',
      levels: ['ALTO'],
      parameterIds: ['P-08'],
      evidenceIds: ['EV-09'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.3.r6.1',
      levels: ['ALTO'],
      parameterIds: ['P-03', 'P-09', 'P-10', 'P-11'],
      evidenceIds: ['EV-10', 'EV-12'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.3.r6.2',
      levels: ['ALTO'],
      parameterIds: ['P-03', 'P-09', 'P-10', 'P-11'],
      evidenceIds: ['EV-11', 'EV-12'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.3.r6.3',
      levels: ['ALTO'],
      parameterIds: ['P-09', 'P-10'],
      evidenceIds: ['EV-12'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.3.r7.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
