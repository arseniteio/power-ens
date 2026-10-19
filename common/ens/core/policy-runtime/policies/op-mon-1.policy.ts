// op.mon.1 · Intrusion detection. Wazuh covers this control by existing, so the policy measures
// what the template really asks: detection covers the declared systems, produces results, answers
// the risk analysis, its ruleset is current and its exclusions are recorded. None fits a primitive:
// 1. EVERYTHING IS MEASURED ON THE MANAGER and facts speak of OTHER systems. The manager's
// collector (agent.id=000) emits one row per agent with its `agente` field, so each P-01 row is
// crossed with its fact by ID or exact name (EV-02, EV-03). An agent not in P-01 (a test one, a
// decommissioned one) does not count; one in P-01 not found, or matching two agents, is reported.
// 2. CROSSINGS BETWEEN TABLES: each P-04 situation against the id ranges of the loaded rules
// (EV-04); EV-05 only if P-02 requires network detection; each silencing against P-06 (EV-08).
// 3. THE SERIES: that the engine processes is seen by comparing its counters between two runs
// (EV-01).
// Requirements: op.mon.1.1 EV-01 (engine active, processing, with rules), EV-02, EV-03, EV-04 and
// EV-05. op.mon.1.r1.1 EV-01, the P-03 sets loaded (own measurement, not an evidence) and EV-08
// with its two axes (age against P-08; silencings against P-06), combined as in op.exp.8.
// op.mon.1.r2.1 documentary: P-05's procedure table, every row complete, accredits it with the
// `attested` mark («acreditado documentalmente» on screen); without P-05 it stays unmeasured and
// P-ATT may accredit it since the catalog declares it without evidences; its decision carries
// `documental`. op.mon.1.r3.1 required in no category: EV-07 is measured and REPORTED without
// verdict (NO_APLICA with what there is).
// EV-06 stays in the catalog with no requirement judging it: NO_APLICA with the «dato del informe»
// reason so it is not painted grey.
// Invariants (as in `evidence/judgment.ts`): the collector emits instants and counts, not ages, so
// ages are measured against `context.now`; no fact or parameter is NO_EVALUABLE with reason and
// cause, never CUMPLE by absence; what the collector declares unmeasurable keeps its reason and
// cause; no default deadline, threshold or list.
// Decisions are emitted only for requirements applying at the level (system category): an R1
// decision at BÁSICA does not count for the requirement but the bridge would carry it to the
// evidence table.
// Types and utilities come from the file, never from a barrel (Settings TDZ cycle).
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
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
  SAME_RUN_WINDOW_MS,
  stripAccents,
  isEmptyField,
  equalsIgnoreCase,
  tableParameterRows,
  positiveScalar,
  missingParameter,
  createFactReader,
  decisionBuilderFor,
} from './policy-kit';
import type { ENSDecisionRuleType, Measurement } from './policy-kit';

const CONTROL = 'op.mon.1';
const POLICY = 'policy.op.mon.1';

// op.mon.1 facts, with state-fact freshness (26 h): the collector runs hourly (engine) and every 6
// h (the rest) and re-emits the whole state.
const { hechos: facts, validos: valid, estadoVigente: currentStatus, degradacion: degradation, sinHechos: withoutFacts, conDegradacion: withDegradation } = createFactReader(CONTROL, {
  recolector: 'el recolector de op.mon.1 del manager',
});

const decide = decisionBuilderFor(POLICY);

// Freshness of the ENGINE state, which arrives hourly. 26 h does not fit: ENSFácil facts reach the
// index THROUGH wazuh-analysisd, so if the engine dies its own state stops arriving and the last
// one, «processing», would keep accrediting the control a whole day. 3 h tolerates two missed
// hourly runs.
const ENGINE_FRESHNESS_HOURS = 3;

// P-01 systems and their agents. A P-01 system is the NAME or the ID of its agent: first by ID (a
// number, with or without leading zeros: 24 is agent 024), then by EXACT name ignoring case; never
// by similarity (a test agent «wazuh-real-old» is not «wazuh-real»). If the name matches two
// agents, none is chosen: declare it by ID.

type Resolution =
  | { tipo: 'unico'; hecho: ENSNormalizedEvent }
  | { tipo: 'ninguno' }
  | { tipo: 'ambiguo'; ids: string[] };

const agentId = (text: string): string | undefined =>
  /^\d+$/.test(text.trim()) ? text.trim().padStart(3, '0') : undefined;

// A fact's agent ID, normalized like P-01's: a collector emitting «24» instead of «024» must not
// leave the system without agent.
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
  const ids = Array.from(new Set(byName.map(e => factId(e))));

  if (ids.length === 1) {
    return { tipo: 'unico', hecho: byName[0] };
  }

  return ids.length > 1 ? { tipo: 'ambiguo', ids } : { tipo: 'ninguno' };
};

const ambiguous = (system: string, ids: string[]): Measurement =>
  notMeasured(
    `P-01 declara «${system}» y en el manager hay ${ids.length} agentes con ese nombre (${ids.join(', ')}): no se elige uno. Decláralo por su ID.`,
    'CONFIGURATION'
  );

const nameOf = (system: string, e: ENSNormalizedEvent): string => {
  const id = factId(e);
  const agent = factField(e, 'agente');

  return equalsIgnoreCase(agent, system) ? `${system} (${id})` : `${system} (${agent}, ${id})`;
};

// Agents registered on the manager that P-01 does not declare: they do not count but are reported
// so an auditor sees what is left out and in what state.
const p01Outside = (systems: Record<string, string>[], ofAgents: ENSNormalizedEvent[]): string => {
  const within = new Set<string>();

  systems.forEach(row => {
    const r = resolves(row.sistema, ofAgents);

    if (r.tipo === 'unico') {
      within.add(factId(r.hecho));
    }
  });

  const outside = ofAgents.filter(e => !within.has(factId(e)));

  if (!outside.length) {
    return '';
  }

  const disconnected = outside.filter(e => factField(e, 'estado_conexion') && factField(e, 'estado_conexion') !== 'active');

  return ` Fuera de P-01 hay ${outside.length} agente(s) registrado(s)${
    disconnected.length ? ` (${disconnected.length} sin conectar: ${formatList(disconnected.map(e => `${factField(e, 'agente')} ${factId(e)} ${factField(e, 'estado_conexion')}`))})` : ''
  }, que no cuentan.`;
};


type Range = [number, number];

// '5700-5799,80790' (the fact) or 'reglas 5710, 80790' (P-04's cell).
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

interface LoadedSet {
  conjunto: string;
  rangos: Range[];
  reglas?: number;
  partes: number;
  presentes: Set<number>;
}

// Sets of the last run, with their parts joined. A set with too many ids for one line arrives in
// several (`parte`, `partes`).
const loadedSets = (current: ENSNormalizedEvent[]): LoadedSet[] => {
  const byName = new Map<string, LoadedSet>();

  current.forEach(e => {
    const name = factField(e, 'conjunto');
    const c =
      byName.get(name) ||
      { conjunto: name, rangos: [], partes: 1, presentes: new Set<number>() };

    c.rangos.push(...ranges(factField(e, 'ids')));
    c.reglas = parseNumber(factField(e, 'reglas')) ?? c.reglas;
    c.partes = Math.max(c.partes, parseNumber(factField(e, 'partes')) || 1);
    c.presentes.add(parseNumber(factField(e, 'parte')) || 1);
    byName.set(name, c);
  });

  return Array.from(byName.values());
};

const isIncomplete = (c: LoadedSet): boolean => c.presentes.size < c.partes;


const ev01Base = (context: ENSPolicyContext, now: number): Measurement => {
  const series = valid(context, 'detection_engine_status', now);
  const last = series.length ? eventTime(series[series.length - 1]) : undefined;

  if (last === undefined) {
    return withoutFacts(context, 'EV-01', now, last, 'estado del motor de reglas del manager');
  }

  if (now - last > ENGINE_FRESHNESS_HOURS * HOUR_MS) {
    return notMeasured(
      `El último estado del motor de reglas es de ${iso(last)}, hace ${formatHours(now - last)} h (más de ${ENGINE_FRESHNESS_HOURS} h, y el recolector pasa cada hora): se ha parado el recolector de op.mon.1 o el propio motor de análisis (wazuh-analysisd), por el que llegan sus hechos. No se puede afirmar que el motor esté detectando.`,
      'COLLECTION'
    );
  }

  const actual = series[series.length - 1];
  const previous = [...series].reverse().find(e => eventTime(e) < last - SAME_RUN_WINDOW_MS);
  const partes: Measurement[] = [];

  const active = factField(actual, 'activo');

  if (active !== 'si') {
    partes.push(nonCompliant(`wazuh-manager no está activo (${active || 'desconocido'}): no hay motor de detección en marcha.`));
  } else {
    partes.push(compliant('wazuh-manager activo.'));
  }

  // That it processes: the analysis engine's counters between two runs.
  const processed = parseNumber(factField(actual, 'eventos_procesados'));
  const before = previous ? parseNumber(factField(previous, 'eventos_procesados')) : undefined;
  const fresh = parseNumber(factField(actual, 'alertas_nuevas'));
  const volume = `${factField(actual, 'eventos_recibidos') || '-'} recibidos, ${factField(actual, 'eventos_descartados') || '-'} descartados, ${factField(actual, 'alertas_escritas') || '-'} alertas escritas`;

  if (processed === undefined) {
    // Without counters (the engine's state file does not exist in this version or could not be
    // read), the other proof that it processes is that it writes alerts. `alertas_nuevas` does not
    // count ENSFácil's: collectors' own facts do not prove the engine detects anything.
    if (fresh !== undefined && fresh > 0) {
      partes.push(compliant(`El motor escribe alertas: ${fresh} alertas de detección nuevas en alerts.json desde la pasada anterior, sin contar las de ENSFácil (sin contadores del motor: ${factField(actual, 'fuente_contadores') || '-'}).`));
    } else {
      partes.push(
        degradation(context, 'EV-01', now, last + 1) ||
          notMeasured(
            `El recolector no ha podido leer los contadores del motor de análisis (${factField(actual, 'fuente_contadores') || 'sin fuente'})${fresh === 0 ? ' y no hay alertas de detección nuevas desde la pasada anterior' : ''}: no se puede afirmar que el motor procese eventos.`,
            'COLLECTION'
          )
      );
    }
  } else if (previous === undefined || before === undefined) {
    partes.push(
      processed > 0
        ? compliant(`El motor ha procesado ${processed} eventos (${volume}); una sola pasada, sin serie todavía.`)
        : notMeasured('El motor no ha procesado ningún evento y no hay una pasada anterior con la que comparar.')
    );
  } else if (processed > before) {
    partes.push(compliant(`El motor procesa: ${processed - before} eventos entre ${iso(eventTime(previous))} y ${iso(last)} (${volume}).`));
  } else if (processed < before) {
    // Counters return to zero when the service restarts.
    partes.push(
      processed > 0
        ? compliant(`El motor se reinició entre ${iso(eventTime(previous))} y ${iso(last)} y ha procesado ${processed} eventos desde entonces.`)
        : notMeasured(`El motor se reinició entre ${iso(eventTime(previous))} y ${iso(last)} y todavía no ha procesado ningún evento.`)
    );
  } else {
    partes.push(
      nonCompliant(`El motor de análisis no ha procesado ningún evento entre ${iso(eventTime(previous))} y ${iso(last)} (contador parado en ${processed}): está en marcha, pero no analiza.`)
    );
  }

  // That there are rules: the ruleset of the last complete run.
  const { vigentes: current, ultimo: lastRuleset } = currentStatus(context, 'ruleset_version_observed', now);
  const ruleset = current[current.length - 1];

  if (!ruleset) {
    partes.push(withoutFacts(context, 'EV-01', now, lastRuleset, 'inventario del ruleset del manager'));
  } else {
    const rules = parseNumber(factField(ruleset, 'reglas')) || 0;

    partes.push(
      rules > 0
        ? compliant(
            `Ruleset de Wazuh ${factField(ruleset, 'version_wazuh') || '(versión desconocida)'} con ${rules} reglas cargadas en ${factField(ruleset, 'ficheros')} ficheros, ${factField(ruleset, 'reglas_mitre') || '0'} con técnica MITRE ATT&CK.`
          )
        : nonCompliant('El manager no carga ninguna regla de detección: la detección no está basada en reglas.')
    );
  }

  return combineMeasurements(partes);
};

// R1 adds that the rule sets P-03 declares are loaded.
const p03Sets = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'ruleset_rules_loaded', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-04', now, last, 'inventario de reglas cargadas por conjunto');
  }

  const loaded = loadedSets(current);
  const summary = loaded.map(c => `${c.conjunto} (${c.reglas ?? '?'} reglas)`).join(', ');
  const declared = tableParameterRows(context, 'P-03');

  if (!declared) {
    return missingParameter(context, 'P-03', `qué conjuntos de reglas tienen que estar activos (cargados hoy: ${summary})`);
  }

  const missing = declared
    .map(f => f.conjunto)
    .filter(name => !loaded.some(c => equalsIgnoreCase(c.conjunto, name) && (c.reglas ?? c.rangos.length) > 0));

  return missing.length
    ? nonCompliant(`Conjuntos de reglas de P-03 que el manager no carga: ${missing.join(', ')}. Cargados: ${summary}.`)
    : compliant(`Cargados todos los conjuntos de reglas de P-03 (${summary}).`);
};


// The whole EV-02 degradation is declared by the collector only when it cannot read global.db. If
// it cannot read ONE agent's database (queue/db/NNN.db) it still emits its fact with
// `lectura=error`: it counts only if that agent is in P-01, and a measured NO_CUMPLE of another
// system still wins.
const ev02Facts = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'detection_coverage_observed', now);

  if (!current.length || last === undefined) {
    return withoutFacts(context, 'EV-02', now, last, 'estado de los agentes leído en el manager');
  }

  const systems = tableParameterRows(context, 'P-01');

  if (!systems) {
    return missingParameter(context, 'P-01', `qué sistemas tienen que estar bajo detección (el manager tiene hoy ${current.length} agentes registrados)`);
  }

  const deadline = positiveScalar(context, 'P-10');
  const failures: string[] = [];
  const connected: string[] = [];
  const ok: string[] = [];
  const partes: Measurement[] = [];

  systems.forEach(row => {
    const r = resolves(row.sistema, current);

    if (r.tipo === 'ninguno') {
      failures.push(`${row.sistema}: no figura en la base de agentes del manager`);

      return;
    }

    if (r.tipo === 'ambiguo') {
      partes.push(ambiguous(row.sistema, r.ids));

      return;
    }

    const e = r.hecho;
    const name = nameOf(row.sistema, e);
    const status = factField(e, 'estado_conexion');

    if (status !== 'active') {
      failures.push(`${name}: agente ${status || 'en estado desconocido'}, último keepalive ${isEmptyField(factField(e, 'ultimo_keepalive')) ? 'nunca' : factField(e, 'ultimo_keepalive')}`);

      return;
    }

    connected.push(name);

    if (factField(e, 'lectura') === 'error') {
      partes.push(
        notMeasured(
          `${name}: el recolector no ha podido leer su base en el manager (queue/db/${factId(e)}.db), así que no se sabe si sus pasadas de FIM y SCA siguen.`,
          'COLLECTION'
        )
      );

      return;
    }

    if (deadline === undefined) {
      return;
    }

    const problems: string[] = [];
    const seen: string[] = [];

    ([['fim_ultimo_fin', 'FIM'], ['sca_ultimo_fin', 'SCA']] as [string, string][]).forEach(([f, module]) => {
      const t = parseInstant(factField(e, f));

      if (t === undefined) {
        problems.push(`ninguna pasada de ${module} completada`);
      } else if (eventTime(e) - t > deadline * HOUR_MS) {
        // Judged at the instant of the READ, not at evaluation: the fact may be up to 26 h old and
        // measuring against the clock would turn a missed collector run into an «inactive analysis»
        // of the agent.
        problems.push(`la última pasada de ${module} terminó el ${iso(t)}, ${formatHours(eventTime(e) - t)} h antes de la lectura del ${iso(eventTime(e))}`);
      } else {
        seen.push(`${module} ${iso(t)}`);
      }
    });

    if (problems.length) {
      failures.push(`${name}: ${problems.join(' y ')} (P-10 = ${deadline} h), el análisis no está activo`);
    } else {
      ok.push(`${name} (${seen.join(', ')})`);
    }
  });

  const outside = p01Outside(systems, current);

  if (failures.length) {
    partes.push(nonCompliant(`Sistemas de P-01 sin cobertura de detección efectiva: ${formatList(failures)}.${outside}`));
  }

  if (deadline === undefined) {
    partes.push(
      missingParameter(
        context,
        'P-10',
        `si el análisis de FIM y SCA de cada sistema sigue activo (con el agente conectado: ${formatList(connected) || 'ninguno'})`
      )
    );
  } else if (!failures.length && ok.length) {
    partes.push(compliant(`Los ${ok.length} sistemas de P-01 tienen el agente conectado y pasadas de FIM y SCA en las últimas ${deadline} h: ${formatList(ok)}.${outside}`));
  }

  return combineMeasurements(partes);
};

const ev02 = (context: ENSPolicyContext, now: number): Measurement =>
  withDegradation(context, now, 'EV-02', 'detection_coverage_observed', ev02Facts(context, now));


const ev03Facts = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: latest } = currentStatus(context, 'detection_activity_observed', now);

  if (!current.length || latest === undefined) {
    return withoutFacts(context, 'EV-03', now, latest, 'resumen de detecciones por agente');
  }

  const systems = tableParameterRows(context, 'P-01');

  if (!systems) {
    return missingParameter(context, 'P-01', 'qué sistemas tienen que producir detecciones');
  }

  const deadline = positiveScalar(context, 'P-09');

  if (deadline === undefined) {
    return missingParameter(context, 'P-09', 'cuántos días sin detecciones en un sistema activo son un fallo de la detección');
  }

  const coverage = currentStatus(context, 'detection_coverage_observed', now).vigentes;
  const failures: string[] = [];
  const ok: string[] = [];
  const aside: string[] = [];
  const partes: Measurement[] = [];

  systems.forEach(row => {
    const rc = resolves(row.sistema, coverage);
    const ra = resolves(row.sistema, current);

    if (rc.tipo === 'ambiguo' || ra.tipo === 'ambiguo') {
      partes.push(ambiguous(row.sistema, rc.tipo === 'ambiguo' ? rc.ids : (ra as { ids: string[] }).ids));

      return;
    }

    // Only the activity of a connected system is judged: a disconnected one or one without agent is
    // judged by EV-02 and not counted twice here.
    if (rc.tipo === 'unico' && factField(rc.hecho, 'estado_conexion') !== 'active') {
      aside.push(`${nameOf(row.sistema, rc.hecho)}, ${factField(rc.hecho, 'estado_conexion') || 'estado desconocido'}`);

      return;
    }

    if (rc.tipo === 'ninguno' && ra.tipo === 'ninguno') {
      aside.push(`${row.sistema}, sin agente`);

      return;
    }

    if (ra.tipo === 'ninguno') {
      partes.push(notMeasured(`${row.sistema}: el recolector del manager no informa de su actividad de detección.`, 'COLLECTION'));

      return;
    }

    const e = ra.hecho;
    const name = nameOf(row.sistema, e);
    const lastAlert = parseInstant(factField(e, 'ultima_alerta'));
    const since = parseInstant(factField(e, 'observado_desde'));
    const technical = isEmptyField(factField(e, 'tecnicas_mitre')) ? '' : `, técnicas ${factField(e, 'tecnicas_mitre')}`;
    const detail = `${factField(e, 'alertas_24h') || '0'} alertas en 24 h, nivel máximo ${factField(e, 'nivel_max_24h') || '-'}, ${factField(e, 'reglas_distintas_24h') || '0'} reglas distintas${technical}`;

    if (lastAlert !== undefined) {
      if (now - lastAlert > deadline * DAY_MS) {
        failures.push(`${name}: ${wholeDays(now - lastAlert)} días sin ninguna detección (la última, ${iso(lastAlert)})`);
      } else {
        ok.push(`${name}: última detección ${iso(lastAlert)}; ${detail}`);
      }
    } else if (since !== undefined && now - since > deadline * DAY_MS) {
      failures.push(`${name}: ninguna detección desde que el manager lo observa (${iso(since)})`);
    } else {
      partes.push(
        notMeasured(
          `${name}: sin detecciones observadas, y se observa desde ${since !== undefined ? iso(since) : 'un instante desconocido'}, menos que P-09 (${deadline} días): todavía no se puede afirmar ni negar que la detección funcione en él.`
        )
      );
    }
  });

  const notJudged = aside.length ? ` No se juzgan aquí, porque no están conectados (los juzga EV-02): ${formatList(aside)}.` : '';

  if (failures.length) {
    partes.push(
      nonCompliant(
        `Sistemas de P-01 conectados sin detecciones en más de P-09 (${deadline} días): ${formatList(failures)}. Un sistema activo que no produce detecciones indica reglas que no se aplican o una ingesta que no llega.${notJudged}`
      )
    );
  } else if (ok.length) {
    partes.push(compliant(`Los sistemas de P-01 conectados producen detecciones dentro de P-09 (${deadline} días): ${formatList(ok)}.${notJudged}`));
  } else if (!partes.length) {
    partes.push(notMeasured(`Ningún sistema de P-01 está conectado: no hay actividad que juzgar.${notJudged}`));
  }

  return combineMeasurements(partes);
};

const ev03 = (context: ENSPolicyContext, now: number): Measurement =>
  withDegradation(context, now, 'EV-03', 'detection_activity_observed', ev03Facts(context, now));


const NO_RULE = /^(-|ninguna|ninguno|sin regla|punto ciego)$/i;

// P-04's rules cell admits only ids and ranges: «5710, 5712, 80700-80799». Any other text is
// rejected rather than interpreted: «pendiente 2026-12», «CVE-2021-44228» or «AR-2026-04» carry
// hyphenated numbers that, read as ranges, turned a declared blind spot into a covered situation.
const P04_RULES = /^\d+(\s*-\s*\d+)?(\s*[,;\s]\s*\d+(\s*-\s*\d+)?)*$/;

// The most a P-04 range may span: b - a <= 9999. Fits any band of a real ruleset, and not a pair
// like «2021-44228».
const MAX_WIDTH_P04 = 9999;

const ev04Facts = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'ruleset_rules_loaded', now);

  if (!current.length || last === undefined) {
    return withoutFacts(context, 'EV-04', now, last, 'inventario de reglas cargadas por conjunto');
  }

  const situations = tableParameterRows(context, 'P-04');

  if (!situations) {
    return missingParameter(context, 'P-04', 'qué situaciones del análisis de riesgos tienen que tener una regla de detección');
  }

  const loaded = loadedSets(current);
  const incompleteSets = loaded.filter(isIncomplete);
  const inWhich = (r: Range): string | undefined =>
    loaded.find(c => c.rangos.some(loadedRange => cutOff(loadedRange, r)))?.conjunto;

  const blind: string[] = [];
  const withoutLoad: string[] = [];
  const ok: string[] = [];
  const partes: Measurement[] = [];

  situations.forEach(row => {
    const text = (row.regla_que_la_detecta || '').trim();

    if (!text || NO_RULE.test(text)) {
      blind.push(`«${row.situacion}»${row.activo_afectado ? ` (${row.activo_afectado})` : ''}`);

      return;
    }

    if (!P04_RULES.test(text)) {
      partes.push(
        notMeasured(
          `P-04, situación «${row.situacion}»: la columna de reglas dice «${text}», que no es una lista de ids o rangos de reglas (5710, 5712, 80700-80799). Si la situación no tiene regla, escribe «ninguna»: es un punto ciego declarado.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    // A backwards range is not a rule range: «2026-12» is a date and read as 12-2026 it would cover
    // any rule of that span.
    const reversed = (text.match(/\d+\s*-\s*\d+/g) || []).filter(r => {
      const [a, b] = r.split('-').map(n => Number(n.trim()));

      return a > b;
    });

    if (reversed.length) {
      partes.push(
        notMeasured(
          `P-04, situación «${row.situacion}»: «${reversed.join(', ')}» no es un rango de reglas, porque el primer id es mayor que el último (¿una fecha o una referencia?). Escribe los rangos de menor a mayor (80700-80799), o «ninguna» si la situación no tiene regla.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    // A range wider than MAX_WIDTH_P04 ids is not a rule band: it is a CVE- or reference-like pair
    // («2021-44228») that read as a range would cover any rule in the span.
    const widths = (text.match(/\d+\s*-\s*\d+/g) || []).filter(r => {
      const [a, b] = r.split('-').map(n => Number(n.trim()));

      return b - a > MAX_WIDTH_P04;
    });

    if (widths.length) {
      partes.push(
        notMeasured(
          `P-04, situación «${row.situacion}»: «${widths.join(', ')}» abarca más de ${MAX_WIDTH_P04 + 1} ids, más que cualquier banda de reglas real (¿una referencia o un CVE?). Si de verdad son reglas, parte el rango en tramos más pequeños.`,
          'CONFIGURATION'
        )
      );

      return;
    }

    const declared = ranges(text);

    const covered = declared.filter(r => inWhich(r) !== undefined);
    const outside = declared.filter(r => inWhich(r) === undefined);

    if (covered.length) {
      ok.push(
        `«${row.situacion}» → ${covered.map(r => `${describeRange(r)} (${inWhich(r)})`).join(', ')}${outside.length ? `; declaradas y no cargadas: ${outside.map(describeRange).join(', ')}` : ''}`
      );
    } else if (incompleteSets.length) {
      partes.push(
        notMeasured(
          `«${row.situacion}»: ninguna de sus reglas (${declared.map(describeRange).join(', ')}) aparece en lo recibido, pero faltan partes del inventario de ${incompleteSets.map(c => `${c.conjunto} (${c.presentes.size} de ${c.partes})`).join(', ')}: no se puede afirmar que no estén cargadas.`,
          'COLLECTION'
        )
      );
    } else {
      withoutLoad.push(`«${row.situacion}» (${declared.map(describeRange).join(', ')})`);
    }
  });

  if (blind.length) {
    partes.push(nonCompliant(`Situaciones de compromiso de P-04 sin ninguna regla de detección asociada, puntos ciegos declarados: ${formatList(blind)}.`));
  }

  if (withoutLoad.length) {
    partes.push(nonCompliant(`Situaciones de P-04 cuyas reglas no están cargadas en el manager (o son de nivel 0 y no alertan): ${formatList(withoutLoad)}.`));
  }

  if (!blind.length && !withoutLoad.length && ok.length) {
    partes.push(compliant(`Las ${situations.length} situaciones de compromiso de P-04 tienen regla de detección cargada: ${formatList(ok)}.`));
  }

  return combineMeasurements(partes);
};

const ev04 = (context: ENSPolicyContext, now: number): Measurement =>
  withDegradation(context, now, 'EV-04', 'ruleset_rules_loaded', ev04Facts(context, now));


const isYes = (text: string): boolean => ['si', 'yes', 'true'].includes(stripAccents(text.trim()));

const ev05 = (context: ENSPolicyContext, now: number): Measurement => {
  const declared = tableParameterRows(context, 'P-02');

  if (!declared) {
    return missingParameter(context, 'P-02', 'si el análisis de riesgos exige detección en red');
  }

  const { vigentes: current, ultimo: latest } = currentStatus(context, 'network_detection_observed', now);
  const observed = current.filter(e => !isEmptyField(factField(e, 'producto')) && factField(e, 'producto') !== 'ninguno');
  const seen = observed.map(e => `${factField(e, 'producto')} por ${factField(e, 'fuente') || '-'}`).join(', ');
  const required = declared.filter(f => isYes(f.necesaria));

  if (!required.length) {
    const justifications = declared.map(f => f.justificacion).filter(Boolean);

    return justifications.length
      ? notApplicable(
          `P-02 declara que el análisis de riesgos no exige detección en red: ${justifications.join('; ')}.${seen ? ` El manager ingiere, de todos modos: ${seen}.` : ''}`
        )
      : notMeasured(
          'P-02 declara que no hace falta detección en red sin la referencia al análisis de riesgos que lo justifique: es lo primero que un auditor preguntará.',
          'CONFIGURATION'
        );
  }

  if (!current.length || latest === undefined) {
    return withoutFacts(context, 'EV-05', now, latest, 'inventario de detección en red del manager');
  }

  // Only when P-02 requires it: with «no», what could not be read changes nothing.
  const deg = degradation(context, 'EV-05', now, latest + 1);
  const withDeg = (measurement: Measurement): Measurement => (deg ? combineMeasurements([measurement, deg]) : measurement);
  const deadline = positiveScalar(context, 'P-09');

  if (deadline === undefined) {
    return withDeg(missingParameter(context, 'P-09', 'cuánto tiempo sin alertas de red es una ingesta parada'));
  }

  const failures: string[] = [];
  const ok: string[] = [];

  required.forEach(f => {
    const product = (f.producto || '').trim();
    const their = observed.filter(e =>
      !product || equalsIgnoreCase(factField(e, 'producto'), product) || stripAccents(product).split(/[^a-z0-9]+/).includes(stripAccents(factField(e, 'producto')))
    );
    const name = product || 'detección en red';

    if (!their.length) {
      failures.push(`${name}: P-02 la exige y el manager no ingiere eventos de ese sistema${seen ? ` (ingiere: ${seen})` : ''}`);

      return;
    }

    const lastAlerts = their.map(e => parseInstant(factField(e, 'ultima_alerta'))).filter((t): t is number => t !== undefined);
    const lastAlert = lastAlerts.length ? Math.max(...lastAlerts) : undefined;
    const sources = their.map(e => factField(e, 'fuente')).join(', ');

    if (lastAlert === undefined) {
      failures.push(`${name}: llega por ${sources} y no se ha recibido ninguna alerta suya`);
    } else if (now - lastAlert > deadline * DAY_MS) {
      failures.push(`${name}: su última alerta es del ${iso(lastAlert)}, hace ${wholeDays(now - lastAlert)} días (P-09 = ${deadline})`);
    } else {
      const n24 = their.reduce((t, e) => t + (parseNumber(factField(e, 'alertas_24h')) || 0), 0);

      ok.push(`${name} por ${sources}: última alerta ${iso(lastAlert)}, ${n24} en 24 h`);
    }
  });

  return withDeg(
    failures.length
      ? nonCompliant(`Detección en red que P-02 exige y no está operativa: ${formatList(failures)}.`)
      : compliant(`El manager ingiere la detección en red que exige P-02: ${formatList(ok)}.`)
  );
};


const NO_REVERSION = ['', '-', 'no', 'ninguna', 'sin reversion', 'sin reversión'];

// The ACTUAL measurement of R3, the one reported: same criterion as op.exp.8's EV-11 and EV-12.
const factR3 = (context: ENSPolicyContext, now: number): Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'active_response_configured', now);

  if (!current.length) {
    return withoutFacts(context, 'EV-07', now, last, 'inventario de respuestas automáticas del manager');
  }

  const enabled = current.filter(
    e => !isEmptyField(factField(e, 'comando')) && factField(e, 'deshabilitada') !== 'si' && factField(e, 'comando_definido') === 'si'
  );
  const executed = facts(context, 'active_response_executed').filter(e => !isEmptyField(factField(e, 'regla_origen')));
  const describeRun = (e: ENSNormalizedEvent) =>
    `${factField(e, 'programa')} ${factField(e, 'accion')} en ${factField(e, 'agente')} por la regla ${factField(e, 'regla_origen')} (${factField(e, 'veces')} veces, la última el ${factField(e, 'ultima')})`;
  const runs = executed.length
    ? ` Ejecutadas a raíz de una alerta en la ventana: ${formatList(executed.map(describeRun))}.`
    : ' Ninguna ejecutada a raíz de una alerta en la ventana.';

  if (!enabled.length) {
    return nonCompliant(`El manager no tiene ninguna respuesta automática configurada y habilitada.${runs}`);
  }

  const summary = enabled
    .map(e => `${factField(e, 'comando')} sobre ${!isEmptyField(factField(e, 'reglas_id')) ? `reglas ${factField(e, 'reglas_id')}` : `grupos ${factField(e, 'grupos')}`}${!isEmptyField(factField(e, 'timeout')) ? `, reversión ${factField(e, 'timeout')} s` : ''}`)
    .join('; ');
  const expected = tableParameterRows(context, 'P-07');

  if (!expected) {
    return compliant(`Respuestas automáticas configuradas: ${summary} (P-07 sin declarar, no se contrastan).${runs}`);
  }

  const failures: string[] = [];

  expected.forEach(f => {
    const their = enabled.filter(e => equalsIgnoreCase(factField(e, 'comando'), f.accion));

    if (!their.length) {
      failures.push(`${f.accion}: prevista en P-07 y no configurada o deshabilitada`);
    } else if (!NO_REVERSION.includes((f.reversion || '').trim().toLowerCase()) && their.every(e => isEmptyField(factField(e, 'timeout')))) {
      failures.push(`${f.accion}: P-07 declara reversión (${f.reversion}) y la respuesta configurada no tiene timeout`);
    }
  });

  return failures.length
    ? nonCompliant(`Acciones de P-07 que no están como se declaran: ${formatList(failures)}. Configuradas: ${summary}.${runs}`)
    : compliant(`Configuradas y habilitadas las acciones de P-07 (${summary}).${runs}`);
};

const NOT_REQUIRED_R3 =
  'R3 no se exige en ninguna categoría (Anexo II): se informa, sin veredicto.';


const ev08 = (context: ENSPolicyContext, now: number): Measurement => {
  const partes: Measurement[] = [];

  // Axis 1: ruleset age against P-08.
  const { vigentes: versions, ultimo: lastVersion } = currentStatus(context, 'ruleset_version_observed', now);
  const ruleset = versions[versions.length - 1];

  if (!ruleset) {
    partes.push(degradation(context, 'EV-08', now) || withoutFacts(context, 'EV-01', now, lastVersion, 'inventario del ruleset del manager'));
  } else {
    const max = positiveScalar(context, 'P-08');
    const date = parseInstant(factField(ruleset, 'fecha_ruleset'));
    const that = `ruleset de Wazuh ${factField(ruleset, 'version_wazuh') || '(versión desconocida)'}`;

    if (date === undefined) {
      partes.push(notMeasured(`El recolector no ha podido fechar el ${that} (fecha_ruleset=${factField(ruleset, 'fecha_ruleset') || 'vacía'}).`));
    } else if (max === undefined) {
      partes.push(missingParameter(context, 'P-08', `la vigencia del ${that}, del ${iso(date)} (${wholeDays(now - date)} días)`));
    } else if (now - date > max * DAY_MS) {
      partes.push(
        nonCompliant(
          `El ${that} es del ${iso(date)} (${factField(ruleset, 'fichero_mas_reciente') || 'fichero más reciente'}): ${wholeDays(now - date)} días, más que los ${max} de P-08. Las reglas de detección envejecen como las firmas de un antivirus.`
        )
      );
    } else {
      partes.push(compliant(`El ${that} es del ${iso(date)}: ${wholeDays(now - date)} días, dentro de los ${max} de P-08.`));
    }
  }

  // Axis 2: each silencing, in P-06 with reason and approval.
  const { vigentes: sweep, ultimo: lastSweep } = currentStatus(context, 'rule_silenced', now);

  if (!sweep.length || lastSweep === undefined) {
    partes.push(withoutFacts(context, 'EV-08', now, lastSweep, 'barrido de exclusiones y reglas silenciadas'));

    return combineMeasurements(partes);
  }

  // What could not be swept after the last good run is added to what it measured, without hiding
  // it.
  const deg = degradation(context, 'EV-08', now, lastSweep + 1);

  if (deg) {
    partes.push(deg);
  }

  const silenced = sweep.filter(e => factField(e, 'tipo') !== 'ninguno' && !isEmptyField(factField(e, 'objeto')));
  const describe = (e: ENSNormalizedEvent) =>
    `${factField(e, 'objeto')} (${factField(e, 'tipo') === 'fichero_excluido' ? 'fichero excluido' : 'regla a nivel 0'} en ${factField(e, 'fichero') || '-'})`;

  if (!silenced.length) {
    partes.push(compliant('El manager no tiene ningún fichero de reglas excluido ni ninguna regla reescrita a nivel 0.'));

    return combineMeasurements(partes);
  }

  const authorized = tableParameterRows(context, 'P-06');

  if (!authorized) {
    partes.push(missingParameter(context, 'P-06', `si los ${silenced.length} silenciamientos del manager están justificados (${formatList(silenced.map(describe))})`));

    return combineMeasurements(partes);
  }

  const outside: string[] = [];
  const withoutJustify: string[] = [];
  const ok: string[] = [];

  silenced.forEach(e => {
    const object = factField(e, 'objeto');
    const row = authorized.find(f => equalsIgnoreCase(f.regla, object));

    if (!row) {
      outside.push(describe(e));
    } else if (!row.motivo || !row.aprobo) {
      withoutJustify.push(`${describe(e)}: ${!row.motivo ? 'sin motivo' : 'sin quién lo aprobó'}`);
    } else {
      ok.push(`${object} (${row.motivo}; aprobó ${row.aprobo})`);
    }
  });

  if (outside.length) {
    partes.push(nonCompliant(`Silenciamientos que P-06 no declara: ${formatList(outside)}. Una exclusión sin constancia degrada la detección sin que nadie lo advierta.`));
  }

  if (withoutJustify.length) {
    partes.push(nonCompliant(`Silenciamientos de P-06 sin justificación o sin aprobación: ${formatList(withoutJustify)}.`));
  }

  if (!outside.length && !withoutJustify.length) {
    partes.push(compliant(`Los ${silenced.length} silenciamientos del manager están en P-06 con motivo y aprobación: ${formatList(ok)}.`));
  }

  return combineMeasurements(partes);
};


const r2 = (context: ENSPolicyContext): { medida: Measurement; acreditado: boolean } => {
  const procedures = tableParameterRows(context, 'P-05');

  if (!procedures) {
    return {
      medida: missingParameter(context, 'P-05', 'qué procedimientos de respuesta a las alertas existen (R2 también se puede acreditar con P-ATT)'),
      acreditado: false,
    };
  }

  const incompleteProcedures = procedures.filter(f => !f.procedimiento || !f.responsable);

  if (incompleteProcedures.length) {
    return {
      medida: notMeasured(
        `P-05 tiene ${incompleteProcedures.length} tipo(s) de alerta sin procedimiento o sin responsable (${formatList(incompleteProcedures.map(f => f.tipo_de_alerta))}): un procedimiento sin identificar o sin quien lo aplique no acredita una respuesta pautada.`,
        'CONFIGURATION'
      ),
      acreditado: false,
    };
  }

  return {
    medida: compliant(
      `P-05 declara ${procedures.length} procedimiento(s) de respuesta a las alertas, cada uno con su responsable: ${formatList(procedures.map(f => `${f.tipo_de_alerta} → ${f.procedimiento} (${f.responsable})`))}. La aplicación de cada procedimiento a sus alertas la mide op.exp.7.`
    ),
    acreditado: true,
  };
};

const REPORT_DATA =
  'Dato del informe, sin veredicto: la existencia de los procedimientos de respuesta (R2) se acredita documentalmente con P-05 o P-ATT, y su aplicación a cada alerta la mide op.exp.7 cruzando las alertas con el registro de incidentes (sus EV-02 y EV-06).';


// Which measures decide each technical requirement. R1 adds a measure that is NOT an evidence: the
// P-03 rule sets loaded. It goes apart, with the parameter name, so an unconfigured P-03 leaves R1
// unproven without painting EV-01 grey while the base, with the same EV-01, complies. It carries no
// per-evidence decision and appears in the requirement's only if it is the deciding one (the bridge
// finds no «P-03» evidence and paints nothing).
const P03_MEASUREMENT = 'P-03';

const TECHNICIANS: { requisito: string; medidas: string[]; parametros: string[]; tipo: ENSDecisionRuleType }[] = [
  { requisito: 'op.mon.1.1', medidas: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05'], parametros: ['P-01', 'P-02', 'P-04', 'P-09', 'P-10'], tipo: 'COVERAGE_REQUIRED' },
  { requisito: 'op.mon.1.r1.1', medidas: ['EV-01', P03_MEASUREMENT, 'EV-08'], parametros: ['P-03', 'P-06', 'P-08'], tipo: 'MAX_AGE' },
];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const applies = (requirement: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requirement)
        ?.applicability.levels.includes(context.level)
    );

  // Each measure is computed once and only if some applying requirement uses it.
  const cache: Record<string, Measurement> = {};
  const measure = (key: string, computes: () => Measurement): Measurement => {
    if (!cache[key]) {
      cache[key] = computes();
    }

    return cache[key];
  };

  const measurementOf = (measurement: string): Measurement => {
    switch (measurement) {
      case 'EV-01':
        return measure('EV-01', () => ev01Base(context, now));
      case P03_MEASUREMENT:
        return measure(P03_MEASUREMENT, () => p03Sets(context, now));
      case 'EV-02':
        return measure('EV-02', () => ev02(context, now));
      case 'EV-03':
        return measure('EV-03', () => ev03(context, now));
      case 'EV-04':
        return measure('EV-04', () => ev04(context, now));
      case 'EV-05':
        return measure('EV-05', () => ev05(context, now));
      default:
        return measure('EV-08', () => ev08(context, now));
    }
  };

  const requirementDecisions: ENSPolicyDecision[] = [];
  const evidenceDecisions: ENSPolicyDecision[] = [];

  TECHNICIANS.filter(r => applies(r.requisito)).forEach(definition => {
    const own = definition.medidas.map(id => ({ id, medida: measurementOf(id) }));
    const status = worstStatus(own.map(p => p.medida));
    const owners = own.filter(p => p.medida.estado === status);

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads).
    requirementDecisions.push(
      withReasonParts(decide(
        definition.requisito,
        status,
        owners.map(p => p.id),
        definition.parametros,
        definition.tipo,
        definition.requisito,
        compositeReason(own),
        definition.medidas.map(id => `${id} CUMPLE`).join(' y '),
        commonGapCause(owners.map(p => p.medida))
      ), reasonPartsOf(own))
    );

    // And one per evidence, with ITS status. P-03's is not an evidence.
    own
      .filter(p => p.id !== P03_MEASUREMENT)
      .forEach(p =>
        evidenceDecisions.push(
          decide(definition.requisito, p.medida.estado, [p.id], definition.parametros, definition.tipo, `${definition.requisito}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
        )
      );
  });

  // R2: documentary. A complete declaration in P-05 accredits it; without it the decision stays
  // unmeasured and P-ATT may accredit it. It comes only from the screen table, so it carries
  // `documental`: a stopped collector does not turn it into a COLLECTION gap (see
  // `ENSPolicyDecision`).
  let measurementR2: Measurement | undefined;

  if (applies('op.mon.1.r2.1')) {
    const { medida: measurement, acreditado: accredited } = r2(context);

    measurementR2 = measurement;
    requirementDecisions.push({
      ...decide(
        'op.mon.1.r2.1',
        measurement.estado,
        [],
        ['P-05'],
        'COVERAGE_REQUIRED',
        'op.mon.1.r2.1',
        measurement.motivo,
        'P-05 con procedimiento y responsable por tipo de alerta, o P-ATT',
        measurement.causa,
        accredited
      ),
      documental: true,
    });
  }

  // EV-06: report data. EV-07: R3 is reported with what there is.
  const r3 = factR3(context, now);

  evidenceDecisions.push(
    decide('op.mon.1.r2.1', 'NO_APLICA', ['EV-06'], ['P-05'], 'COVERAGE_REQUIRED', 'op.mon.1.r2.1/EV-06', REPORT_DATA, 'dato del informe'),
    decide(
      'op.mon.1.r3.1',
      'NO_APLICA',
      ['EV-07'],
      ['P-07'],
      'COVERAGE_REQUIRED',
      'op.mon.1.r3.1/EV-07',
      `${NOT_REQUIRED_R3} De hecho: ${r3.motivo}`,
      'se informa'
    )
  );

  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(cache).map(([key, measurement]) => ({
      name: `medida_${key.replace('-', '')}`,
      value: measurement.estado,
      parameterIds: key === P03_MEASUREMENT ? [P03_MEASUREMENT] : [],
      evidenceIds: key === P03_MEASUREMENT ? [] : [key],
      eventIds: [],
      description: measurement.motivo,
    })),
    ...(measurementR2
      ? [
          {
            name: 'acreditacion_R2',
            value: measurementR2.estado,
            parameterIds: ['P-05'],
            evidenceIds: [],
            eventIds: [],
            description: measurementR2.motivo,
          },
        ]
      : []),
    {
      name: 'cobertura_de_hecho_R3',
      value: r3.estado,
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description: r3.motivo,
    },
  ];

  return { decisions: [...requirementDecisions, ...evidenceDecisions], runtimeVariables: variables };
};

export const opMon1PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // By system category: base in all three, R1 from MEDIA, R2 only in ALTA, R3 in none.
  requirements: [
    {
      requirementId: 'op.mon.1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-04', 'P-09', 'P-10'],
      evidenceIds: ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.1.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-03', 'P-06', 'P-08'],
      evidenceIds: ['EV-01', 'EV-08'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.1.r2.1',
      levels: ['ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.1.r3.1',
      levels: [],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-07'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
