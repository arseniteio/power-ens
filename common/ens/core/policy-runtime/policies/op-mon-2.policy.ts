// op.mon.2 · Metrics system.
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import { toParameterListItems } from '../../../configuration/services/parameter-value-validator';
import { ENS_SCOPE_GROUP } from '../../scope/engine';
import { STALE_COLLECTOR_MAX_AGE_HOURS } from '../../evidence/stale-collector';
import {
  HOUR_MS,
  DAY_MS,
  SAME_RUN_WINDOW_MS,
  FUTURE_TOLERANCE_MS,
  compliant,
  nonCompliant,
  notMeasured,
  commonGapCause,
  worstStatus,
  combineMeasurements,
  factField,
  parseNumber,
  parseInstant,
  eventTime,
  formatList,
  wholeDays,
  iso,
  stripAccents,
  isEmptyField,
  equalsIgnoreCase,
  findParameter,
  parameterDisplayName,
  tableParameterRows,
  missingParameter,
  createFactReader,
  decisionBuilderFor,
} from './policy-kit';
import type { ENSDecisionRuleType, Measurement } from './policy-kit';

const CONTROL = 'op.mon.2';
const POLICY = 'policy.op.mon.2';

// All op.mon.2 facts are slow states: the collector runs every 6 h and re-emits the whole state.
// Freshness 26 h, the kit's.
const { hechos: facts, estadoVigente: currentStatus, degradacion: degradation, sinHechos: withoutFacts, conDegradacion: withDegradation } = createFactReader(CONTROL, {
  recolector: 'el recolector de op.mon.2 del manager',
});

// EV-06 (R2) reads the SAME cycle record as EV-02, and the collector declares the gaps of that read
// with EV-02: with `log_alert_level` above 3, for example, it degrades EV-02, EV-03 and EV-04 by
// CONFIGURATION and their facts do not arrive. EV-06 inherits that degradation, otherwise R2 would
// come out unmeasured by COLLECTION a gap that is CONFIGURATION. Its own, if declared, wins.
const INHERITS_DEGRADATION: Record<string, string> = { 'EV-06': 'EV-02' };

const decide = decisionBuilderFor(POLICY);

const MANAGER = '000';

const CYCLE_RECORD = '/etc/ensfacil/metrics-cycle-register.tsv';
const INCIDENT_RECORD = '/etc/ensfacil/incident-register.tsv';

// A collector is current if its last heartbeat is at most as old as the engine allows before
// declaring the control stopped on that machine (`stale-collector.ts`), measured against the
// instant op.mon.2 read the heartbeats, not the evaluation clock.
const CURRENT_HEARTBEAT_MS = STALE_COLLECTOR_MAX_AGE_HOURS * HOUR_MS;

// Duration of each P-02 periodicity, in days: a cycle's deadline is this plus the margin the
// organization declares.
const PERIODS: Record<string, number> = {
  mensual: 31,
  trimestral: 92,
  semestral: 184,
  anual: 366,
};

// Window of the article-32 annual report.
const ANNUAL_DAYS = 365;

const isMeasurement = (x: unknown): x is Measurement =>
  typeof x === 'object' && x !== null && typeof (x as Measurement).estado === 'string';

// To compare declared names and values: without case or accents and with folded spaces.
const folded = (text: string): string => stripAccents(text).replace(/\s+/g, ' ').trim();

const agentId = (text: string): string | undefined =>
  /^\d+$/.test(text.trim()) ? text.trim().padStart(3, '0') : undefined;

// A fact's agent ID, normalized: «24» and «024» are the same agent.
const factId = (e: ENSNormalizedEvent): string =>
  agentId(factField(e, 'agente_id')) || factField(e, 'agente_id');

// A link or reference from the `.example` template: it accredits nothing.
const isExample = (text: string): boolean => /ejemplo\.invalido|example\.invalid/i.test(text);

const figure = (n: number): string => String(Math.round(n * 10) / 10);

const date = (t: number): string => iso(t).slice(0, 10);

// Organization records. Each run emits first the READING of the record (exists, readable, required
// header, how many rows are valid and how many emitted) and then one row per fact. The reading
// anchors the run: only rows emitted with it count, and if fewer arrive than it says it emitted
// something is missing and nothing is asserted.

interface LogRow {
  lectura: ENSNormalizedEvent;
  t: number;
  filas: ENSNormalizedEvent[];
  validas: number;
  descartadas: number;
}

const record = (
  context: ENSPolicyContext,
  now: number,
  typeRead: string,
  typeRow: string,
  evidence: string,
  name: string,
  file: string
): LogRow | Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, typeRead, now);

  if (!current.length || last === undefined) {
    const inherited = INHERITS_DEGRADATION[evidence];

    return (
      degradation(context, evidence, now) ||
      (inherited ? degradation(context, inherited, now) : undefined) ||
      withoutFacts(context, evidence, now, last, `hecho de lectura del ${name}`)
    );
  }

  const read = current[current.length - 1];
  const t = eventTime(read);
  const path = factField(read, 'fichero') || file;
  const present = factField(read, 'presente');

  if (present === 'no') {
    return notMeasured(
      `No existe el ${name} (${path}): la organización no lo ha creado. Sin él no hay nada que juzgar, y un registro ausente no es un registro vacío. La plantilla con la cabecera exacta está junto a él, con extensión .example.`,
      'CONFIGURATION'
    );
  }

  if (present !== 'si') {
    return notMeasured(`La lectura del ${name} de ${iso(t)} no dice si el fichero existe (presente=${present || 'vacío'}).`, 'COLLECTION');
  }

  if (factField(read, 'legible') !== 'si') {
    return notMeasured(`El ${name} (${path}) existe, pero el recolector no lo ha podido leer en la pasada de ${iso(t)}.`, 'COLLECTION');
  }

  if (factField(read, 'formato') !== 'ok') {
    return notMeasured(
      `La primera línea del ${name} (${path}) no es la cabecera exigida (${factField(read, 'formato') || 'formato desconocido'}): no se interpreta ninguna fila. La cabecera exacta está en la plantilla .example.`,
      'CONFIGURATION'
    );
  }

  const valid = parseNumber(factField(read, 'filas_validas')) ?? 0;
  const discarded = parseNumber(factField(read, 'filas_descartadas')) ?? 0;
  const emitted = parseNumber(factField(read, 'filas_emitidas')) ?? valid;

  // Rows of THIS run, one per file line (if the run repeated, the last copy counts).
  const byLine = new Map<string, ENSNormalizedEvent>();

  facts(context, typeRow)
    .filter(e => eventTime(e) >= t - SAME_RUN_WINDOW_MS && eventTime(e) <= t + HOUR_MS)
    .sort((a, b) => eventTime(a) - eventTime(b))
    .forEach(e => byLine.set(factField(e, 'linea') || String(e.id), e));

  const runRows = Array.from(byLine.values());

  if (runRows.length < emitted) {
    return notMeasured(
      `De las ${emitted} filas del ${name} que el recolector emitió en la pasada de ${iso(t)} han llegado ${runRows.length}: con filas perdidas no se puede afirmar nada del registro.`,
      'COLLECTION'
    );
  }

  return { lectura: read, t, filas: runRows, validas: valid, descartadas: discarded };
};

const discardedNote = (reg: LogRow, name: string): string =>
  reg.descartadas > 0
    ? ` ${reg.descartadas} fila(s) del ${name} se descartaron por no tener el formato exigido (ver los avisos del recolector, regla 111398).`
    : '';


interface Cycle {
  periodo: string;
  fecha: number;
  implantacion?: number;
  horasInternas?: number;
  horasExternas?: number;
  presupuesto?: number;
  validadoPor: string;
  referencia: string;
  linea: string;
}

const READS_CYCLES = (context: ENSPolicyContext, now: number, evidence: string): LogRow | Measurement =>
  record(context, now, 'metrics_register_read', 'metrics_cycle_recorded', evidence, 'registro de ciclos de métricas', CYCLE_RECORD);

// Cycles that count, oldest to newest, and what was left out (template examples, future-dated,
// unreadable).
const cyclesOf = (reg: LogRow): { ciclos: Cycle[]; nota: string } => {
  const cycles: Cycle[] = [];
  const examples: string[] = [];
  const future: string[] = [];
  const unreadable: string[] = [];

  const amount = (e: ENSNormalizedEvent, name: string): number | undefined => {
    const text = factField(e, name).replace(/%$/, '').trim();

    return isEmptyField(text) ? undefined : parseNumber(text);
  };

  reg.filas.forEach(e => {
    const line = factField(e, 'linea') || '?';
    const t = parseInstant(factField(e, 'fecha_consolidacion'));
    const period = factField(e, 'periodo') || '?';

    if (t === undefined) {
      unreadable.push(`línea ${line}`);

      return;
    }

    if (isExample(factField(e, 'referencia'))) {
      examples.push(`${period} (línea ${line})`);

      return;
    }

    if (t > reg.t + FUTURE_TOLERANCE_MS) {
      future.push(`${period} del ${date(t)}`);

      return;
    }

    cycles.push({
      periodo: period,
      fecha: t,
      implantacion: amount(e, 'implantacion_global'),
      horasInternas: amount(e, 'horas_internas'),
      horasExternas: amount(e, 'horas_externas'),
      presupuesto: amount(e, 'presupuesto_ejecutado'),
      validadoPor: factField(e, 'validado_por'),
      referencia: factField(e, 'referencia'),
      linea: line,
    });
  });

  cycles.sort((a, b) => a.fecha - b.fecha);

  const note = [
    examples.length ? `No cuentan los ciclos con la referencia de ejemplo de la plantilla (EJEMPLO.invalido): ${formatList(examples)}.` : '',
    future.length ? `No cuentan los ciclos fechados en el futuro: ${formatList(future)}.` : '',
    unreadable.length ? `Sin fecha de consolidación legible: ${formatList(unreadable)}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return { ciclos: cycles, nota: note ? ` ${note}` : '' };
};

const describeCycle = (c: Cycle): string =>
  `${c.periodo} (consolidado el ${date(c.fecha)}${c.implantacion !== undefined ? `, implantación ${figure(c.implantacion)} %` : ''}${
    isEmptyField(c.validadoPor) ? ', sin validar' : `, validado por ${c.validadoPor}`
  })`;


interface Periodicity {
  nombre: string;
  dias: number;
  margen: number;
  plazoDias: number;
  cierre?: string;
}

const MONTH_DAY = /^(\d{2})-(\d{2})$/;

const periodicity = (context: ENSPolicyContext): Periodicity | Measurement => {
  const declared = tableParameterRows(context, 'P-02');

  if (!declared) {
    return missingParameter(context, 'P-02', 'cada cuánto se tiene que consolidar un ciclo de métricas');
  }

  if (declared.length > 1) {
    return notMeasured(`${parameterDisplayName(context, 'P-02')} declara ${declared.length} periodicidades: se declara una sola fila.`, 'CONFIGURATION');
  }

  const row = declared[0];
  const name = folded(row.periodicidad || '');
  const problems: string[] = [];

  if (!PERIODS[name]) {
    problems.push(`la periodicidad «${row.periodicidad || ''}» no es mensual, trimestral, semestral ni anual`);
  }

  const marginText = (row.margen_dias || '').trim();
  const margin = isEmptyField(marginText) ? 0 : /^\d+$/.test(marginText) ? Number(marginText) : undefined;

  if (margin === undefined) {
    problems.push(`el margen «${marginText}» no es un número entero de días`);
  }

  const closingText = (row.cierre_anual || '').trim();
  let closing: string | undefined;

  if (!isEmptyField(closingText)) {
    const m = MONTH_DAY.exec(closingText);
    const month = m ? Number(m[1]) : 0;
    const day = m ? Number(m[2]) : 0;
    const max = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] || 0;

    if (!m || day < 1 || day > max) {
      problems.push(`el cierre anual «${closingText}» no es una fecha MM-DD`);
    } else {
      closing = closingText;
    }
  }

  if (problems.length || margin === undefined) {
    return notMeasured(`${parameterDisplayName(context, 'P-02')}, fila «${[row.periodicidad, row.margen_dias, row.cierre_anual].filter(Boolean).join(' | ')}»: ${problems.join('; ')}.`, 'CONFIGURATION');
  }

  return { nombre: name, dias: PERIODS[name], margen: margin, plazoDias: PERIODS[name] + margin, cierre: closing };
};

const describeDeadline = (p: Periodicity): string =>
  `P-02 ${p.nombre}: ${p.dias} días${p.margen ? ` + ${p.margen} de margen` : ''} = ${p.plazoDias}`;


type Scope = 'metricas' | 'recursos';

const validators = (context: ENSPolicyContext, scope: Scope): Set<string> | Measurement => {
  const declared = tableParameterRows(context, 'P-05');
  const subject = scope === 'metricas' ? 'los ciclos de métricas' : 'los datos de recursos';

  if (!declared) {
    return missingParameter(context, 'P-05', `quién tiene que validar ${subject}`);
  }

  const bad = declared.filter(f => !['', 'metricas', 'recursos', 'ambos'].includes(folded(f.ambito || '')));

  if (bad.length) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-05')}: ámbito que no es metricas, recursos ni ambos en ${formatList(bad.map(f => `«${f.responsable} | ${f.cargo || ''} | ${f.ambito}»`))}.`,
      'CONFIGURATION'
    );
  }

  const their = declared.filter(f => ['', scope, 'ambos'].includes(folded(f.ambito || '')));
  const names = new Set<string>();

  their.forEach(f => {
    [f.responsable, f.cargo].filter(x => !isEmptyField((x || '').trim())).forEach(x => names.add(folded(x)));
  });

  if (!names.size) {
    return notMeasured(`${parameterDisplayName(context, 'P-05')} no designa a nadie para validar ${subject} (ámbito ${scope} o ambos).`, 'CONFIGURATION');
  }

  return names;
};

const designated = (context: ENSPolicyContext, scope: Scope): string =>
  (tableParameterRows(context, 'P-05') || [])
    .filter(f => ['', scope, 'ambos'].includes(folded(f.ambito || '')))
    .map(f => (f.cargo ? `${f.responsable} (${f.cargo})` : f.responsable))
    .join(', ');


// An ENS measure identifier: org.1, op.acc.1, mp.info.6.
const ENS_MEASUREMENT = /^(org\.\d+|(op|mp)\.[a-z]+\.\d+)$/;

export const parseStatementOfApplicability = (
  declared: Record<string, string>[]
): { aplicables: string[]; noAplicables: string[]; problemas: string[] } => {
  const applicable: string[] = [];
  const notApplicable: string[] = [];
  const problems: string[] = [];

  declared.forEach(f => {
    const measurement = (f.medida || '').trim().toLowerCase();
    const applies = folded(f.aplicable || '');

    if (!ENS_MEASUREMENT.test(measurement)) {
      problems.push(`«${f.medida}» no es el identificador de una medida del ENS (op.acc.1, mp.info.6, org.1)`);

      return;
    }

    if (applies === 'si') {
      applicable.push(measurement);
    } else if (applies === 'no') {
      notApplicable.push(measurement);
    } else {
      problems.push(`${measurement}: «${f.aplicable || ''}» no dice si aplica (sí/no)`);
    }
  });

  return { aplicables: applicable, noAplicables: notApplicable, problemas: problems };
};

const statement = (context: ENSPolicyContext): Measurement | undefined => {
  const declared = tableParameterRows(context, 'P-01');

  if (!declared) {
    return missingParameter(context, 'P-01', 'el grado de implantación (no hay relación de medidas aplicables contra la que calcularlo)');
  }

  const { aplicables: applicable, problemas: problems } = parseStatementOfApplicability(declared);

  if (problems.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-01')} tiene filas que no se pueden interpretar: ${formatList(problems)}.`, 'CONFIGURATION');
  }

  if (!applicable.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-01')} no declara ninguna medida aplicable: el grado de implantación no tiene base.`, 'CONFIGURATION');
  }

  return undefined;
};


type Sense = 'minimo' | 'maximo';

const METRICS: Record<string, { sentido: Sense; unidad: string; porcentaje?: boolean }> = {
  cobertura_monitorizacion: { sentido: 'minimo', unidad: '%', porcentaje: true },
  implantacion_global: { sentido: 'minimo', unidad: '%', porcentaje: true },
  controles_no_evaluables: { sentido: 'maximo', unidad: '' },
  tiempo_medio_contencion: { sentido: 'maximo', unidad: 'h' },
  tiempo_medio_resolucion: { sentido: 'maximo', unidad: 'h' },
};

export interface MetricTarget {
  metrica: string;
  objetivo: number;
  tolerancia: number;
  // The value from which the metric stops being acceptable.
  umbral: number;
  sentido: Sense;
  unidad: string;
}

// P-06 rows with their grammar: metric from the vocabulary, numeric target (optional unit) and
// numeric or empty tolerance.
export const parseMetricTargets = (
  declared: Record<string, string>[]
): { objetivos: Map<string, MetricTarget>; problemas: string[] } => {
  const targets = new Map<string, MetricTarget>();
  const problems: string[] = [];

  const amount = (text: string): number | undefined =>
    parseNumber(text.trim().replace(/\s*(%|h)$/i, ''));

  declared.forEach(f => {
    const metric = folded(f.metrica || '');
    const definition = METRICS[metric];
    const describe = `«${[f.metrica, f.objetivo, f.tolerancia].filter(x => x !== undefined && x !== '').join(' | ')}»`;

    if (!definition) {
      problems.push(`${describe}: la métrica no es ninguna de ${Object.keys(METRICS).join(', ')}`);

      return;
    }

    if (targets.has(metric)) {
      problems.push(`${describe}: ${metric} está declarada dos veces`);

      return;
    }

    const target = amount(f.objetivo || '');
    const tolerance = isEmptyField((f.tolerancia || '').trim()) ? 0 : amount(f.tolerancia || '');

    if (target === undefined || target < 0 || (definition.porcentaje && target > 100)) {
      problems.push(`${describe}: el objetivo no es un número${definition.porcentaje ? ' entre 0 y 100' : ' positivo'}`);

      return;
    }

    if (tolerance === undefined || tolerance < 0) {
      problems.push(`${describe}: la tolerancia no es un número positivo`);

      return;
    }

    // On a minimum metric, a tolerance equal to or above the target leaves the threshold at zero or
    // below: any value would comply.
    if (definition.sentido === 'minimo' && tolerance >= target) {
      problems.push(`${describe}: la tolerancia iguala o supera el objetivo, y cualquier valor lo cumpliría`);

      return;
    }

    targets.set(metric, {
      metrica: metric,
      objetivo: target,
      tolerancia: tolerance,
      umbral: definition.sentido === 'minimo' ? target - tolerance : target + tolerance,
      sentido: definition.sentido,
      unidad: definition.unidad,
    });
  });

  return { objetivos: targets, problemas: problems };
};

const targetOf = (context: ENSPolicyContext, metric: string, purpose: string): MetricTarget | Measurement => {
  const declared = tableParameterRows(context, 'P-06');

  if (!declared) {
    return missingParameter(context, 'P-06', purpose);
  }

  const { objetivos: targets, problemas: problems } = parseMetricTargets(declared);

  if (problems.length) {
    return notMeasured(`${parameterDisplayName(context, 'P-06')} tiene filas que no se pueden interpretar: ${formatList(problems)}.`, 'CONFIGURATION');
  }

  const target = targets.get(metric);

  return target || notMeasured(`${parameterDisplayName(context, 'P-06')} no declara el objetivo de ${metric}: no hay contra qué juzgar ${purpose}.`, 'CONFIGURATION');
};

const describeTarget = (o: MetricTarget): string =>
  `${o.sentido === 'minimo' ? '≥' : '≤'} ${figure(o.objetivo)}${o.unidad ? ` ${o.unidad}` : ''}${o.tolerancia ? `, tolerancia ${figure(o.tolerancia)}` : ''}`;


const judgesCycles = (reg: LogRow, per: Periodicity, who: Set<string>, whoText: string): Measurement => {
  const { ciclos: cycles, nota: note } = cyclesOf(reg);
  const notes = `${note}${discardedNote(reg, 'registro de ciclos')}`;
  const last = cycles[cycles.length - 1];
  const validated = cycles.filter(c => !isEmptyField(c.validadoPor) && who.has(folded(c.validadoPor)));
  const lastValidated = validated[validated.length - 1];
  const deadline = per.plazoDias * DAY_MS;

  if (!lastValidated) {
    return nonCompliant(
      `Ningún ciclo del registro está validado por un responsable de métricas de P-05 (${whoText}): el último, ${describeCycle(last)}, ${
        isEmptyField(last.validadoPor) ? 'no tiene quién lo validó' : `lo validó «${last.validadoPor}», que P-05 no designa`
      }. Un dato que se reporta fuera sin validación formal no tiene responsable.${notes}`
    );
  }

  const age = reg.t - lastValidated.fecha;

  if (age > deadline) {
    return nonCompliant(
      `El último ciclo validado es ${describeCycle(lastValidated)}, de hace ${wholeDays(age)} días: fuera del plazo (${describeDeadline(per)} días). Los datos del grado de implantación no se consolidan con la periodicidad declarada.${
        last !== lastValidated ? ` Después hay ${describeCycle(last)}, pendiente de una validación de P-05.` : ''
      }${notes}`
    );
  }

  const withDeployment = validated.filter(c => c.implantacion !== undefined);
  const trend =
    withDeployment.length >= 2
      ? ` Tendencia de la implantación: ${withDeployment
          .slice(-3)
          .map(c => `${c.periodo} ${figure(c.implantacion as number)} %`)
          .join(' → ')}.`
      : '';

  return compliant(
    `Último ciclo validado: ${describeCycle(lastValidated)}, hace ${wholeDays(age)} días, dentro del plazo (${describeDeadline(per)} días). Serie: ${cycles.length} ciclo(s) anotados.${trend}${
      last !== lastValidated ? ` El ciclo ${describeCycle(last)} está pendiente de validar.` : ''
    }${notes}`
  );
};

const ev02Facts = (context: ENSPolicyContext, now: number): Measurement => {
  const pieces: Measurement[] = [];
  const soa = statement(context);

  if (soa) {
    pieces.push(soa);
  }

  const reg = READS_CYCLES(context, now, 'EV-02');

  if (isMeasurement(reg)) {
    return combineMeasurements([...pieces, reg]);
  }

  const { ciclos: cycles, nota: note } = cyclesOf(reg);

  if (!cycles.length) {
    // Record present with no cycle: a measured fact, with no deadline that applies.
    return combineMeasurements([
      ...pieces,
      nonCompliant(
        `El registro de ciclos de métricas existe pero no tiene ningún ciclo anotado: los datos del grado de implantación no se consolidan con ninguna periodicidad y no hay serie histórica.${note}${discardedNote(reg, 'registro de ciclos')}`
      ),
    ]);
  }

  const per = periodicity(context);
  const who = validators(context, 'metricas');

  if (isMeasurement(per)) {
    pieces.push(per);
  }

  if (isMeasurement(who)) {
    pieces.push(who);
  }

  if (!isMeasurement(per) && !isMeasurement(who)) {
    pieces.push(judgesCycles(reg, per, who, designated(context, 'metricas')));
  }

  return combineMeasurements(pieces);
};

const ev02 = (context: ENSPolicyContext, now: number): Measurement =>
  withDegradation(context, now, 'EV-02', 'metrics_register_read', ev02Facts(context, now));


interface Run {
  control: string;
  t: number;
  resultado: string;
}

// `control|instant|result`, comma-separated; `-` if none. Any other shape is an unreadable list
// (undefined), never an empty one.
const runsOf = (text: string): Run[] | undefined => {
  if (isEmptyField(text)) {
    return [];
  }

  const runs: Run[] = [];

  for (const entry of text.split(',')) {
    const m = /^([^|\s]+)\|([^|]+)\|(completada|parcial|fallida|-)$/.exec(entry.trim());
    const t = m ? parseInstant(m[2].trim()) : undefined;

    if (!m || t === undefined) {
      return undefined;
    }

    runs.push({ control: m[1], t, resultado: m[3] });
  }

  return runs;
};

const inScope = (e: ENSNormalizedEvent): boolean =>
  factId(e) === MANAGER ||
  factField(e, 'grupos')
    .split(',')
    .map(g => folded(g))
    .includes(ENS_SCOPE_GROUP);

interface Coverage {
  medida: Measurement;
  porcentaje?: number;
  alcance: number;
  cubiertos: number;
}

const ev04Coverage = (context: ENSPolicyContext, now: number): Coverage => {
  const { vigentes: current, ultimo: last } = currentStatus(context, 'agent_keepalive_observed', now);

  if (!current.length) {
    return { medida: withoutFacts(context, 'EV-04', now, last, 'estado de los agentes leído en el manager'), alcance: 0, cubiertos: 0 };
  }

  // One fact per agent: the last, with its normalized ID.
  const agents = new Map<string, ENSNormalizedEvent>();

  current.forEach(e => agents.set(factId(e), e));

  // How many agents the collector says it emitted: if fewer arrive, lines are missing and a lost
  // agent cannot vanish from the scope unreported. They count as scope systems undetermined, the
  // safe bound (if outside the scope the real coverage could only be better).
  const emitted = Math.max(0, ...current.map(e => parseNumber(factField(e, 'agentes_emitidos')) ?? 0));
  const lost = Math.max(0, emitted - agents.size);

  const heartbeats = currentStatus(context, 'collector_heartbeat_observed', now).vigentes;
  const heartbeatOf = new Map<string, ENSNormalizedEvent>();

  heartbeats.forEach(e => heartbeatOf.set(factId(e), e));

  const scope = Array.from(agents.values()).filter(inScope);
  const outside = Array.from(agents.values()).filter(e => !inScope(e));
  const covered: string[] = [];
  const uncovered: string[] = [];
  const undetermined: Measurement[] = [];

  scope.forEach(e => {
    const id = factId(e);
    const name = `${factField(e, 'agente') || '?'} (${id})`;
    const status = factField(e, 'estado_conexion');

    if (status !== 'active') {
      uncovered.push(`${name}: agente ${status || 'en estado desconocido'}, último keepalive ${isEmptyField(factField(e, 'ultimo_keepalive')) ? 'nunca' : factField(e, 'ultimo_keepalive')}`);

      return;
    }

    if (!heartbeats.length) {
      undetermined.push(notMeasured(`${name}: no han llegado los latidos de los recolectores leídos en alerts.json`, 'COLLECTION'));

      return;
    }

    const heartbeat = heartbeatOf.get(id);

    if (!heartbeat) {
      undetermined.push(notMeasured(`${name}: no ha llegado su hecho de latidos (111306) en la última pasada`, 'COLLECTION'));

      return;
    }

    // In a Wazuh cluster, alerts.json is per node: the collector only sees heartbeats of agents
    // connected to ITS node. An agent of another node is neither covered nor uncovered: it could
    // not be looked at.
    const agentNode = factField(e, 'nodo');
    const localNode = factField(heartbeat, 'nodo');

    if (!isEmptyField(agentNode) && !isEmptyField(localNode) && !equalsIgnoreCase(agentNode, localNode)) {
      undetermined.push(
        notMeasured(
          `${name}: está conectado al nodo ${agentNode} del clúster, y op.mon.2 lee los latidos en el alerts.json del nodo ${localNode}, que no recibe los suyos`,
          'COLLECTION'
        )
      );

      return;
    }

    const runs = runsOf(factField(heartbeat, 'pasadas'));
    const read = eventTime(heartbeat);

    if (!runs) {
      undetermined.push(notMeasured(`${name}: su lista de pasadas no se puede interpretar («${factField(heartbeat, 'pasadas')}»)`, 'COLLECTION'));

      return;
    }

    if (!runs.length) {
      const since = parseInstant(factField(heartbeat, 'observado_desde'));

      if (since !== undefined && read - since > CURRENT_HEARTBEAT_MS) {
        uncovered.push(`${name}: ningún recolector de ENSFácil ha informado desde él desde ${date(since)}`);
      } else {
        undetermined.push(
          notMeasured(`${name}: todavía no ha informado ningún recolector de ENSFácil desde que op.mon.2 lee los latidos${since !== undefined ? ` (${iso(since)})` : ''}`)
        );
      }

      return;
    }

    // A run dated AFTER the read does not prove the collector is current: it is a fast clock (the
    // machine's, if the instant came from `data.ts`). What is measured against wins; with nothing
    // against, that machine stays undetermined.
    const future = runs.filter(p => p.t > read + FUTURE_TOLERANCE_MS);
    const stopped = runs.filter(
      p => p.t <= read + FUTURE_TOLERANCE_MS && (read - p.t > CURRENT_HEARTBEAT_MS || p.resultado === 'fallida')
    );

    if (stopped.length) {
      uncovered.push(
        `${name}: ${formatList(
          stopped.map(p =>
            p.resultado === 'fallida'
              ? `${p.control} falló en su última pasada (${iso(p.t)})`
              : `${p.control} sin pasada desde ${iso(p.t)}`
          )
        )}`
      );

      return;
    }

    if (future.length) {
      undetermined.push(
        notMeasured(
          `${name}: ${formatList(future.map(p => `${p.control} con su última pasada en el futuro (${iso(p.t)})`))}, después de la lectura de ${iso(read)}: reloj adelantado, no se puede afirmar que esté al día`
        )
      );

      return;
    }

    covered.push(`${name}, ${runs.length} recolector(es)`);
  });

  if (lost) {
    undetermined.push(
      notMeasured(
        `de los ${emitted} agentes que el recolector emitió en la última pasada han llegado ${agents.size}; los ${lost} que faltan se cuentan como del alcance y sin determinar`,
        'COLLECTION'
      )
    );
  }

  const n = scope.length + lost;
  const undeterminedCount = undetermined.length - (lost ? 1 : 0) + lost;
  const noteOutside = outside.length
    ? ` Fuera del alcance ENS (sin el grupo ${ENS_SCOPE_GROUP}) hay ${outside.length} agente(s) que no cuentan: ${formatList(outside.map(e => `${factField(e, 'agente')} (${factId(e)}) ${factField(e, 'estado_conexion')}`))}.`
    : '';

  if (!n) {
    return {
      medida: notMeasured(`La base de agentes del manager no tiene ningún sistema del alcance ENS (el grupo ${ENS_SCOPE_GROUP} y el manager).${noteOutside}`),
      alcance: 0,
      cubiertos: 0,
    };
  }

  const percentage = (covered.length / n) * 100;
  const max = ((covered.length + undeterminedCount) / n) * 100;
  const measured = `${figure(percentage)} % (${covered.length} de ${n} sistemas del alcance ENS con el agente conectado y todos sus recolectores al día)`;
  const target = targetOf(context, 'cobertura_monitorizacion', 'si la cobertura de la monitorización es suficiente');

  if (isMeasurement(target)) {
    return { medida: notMeasured(`${target.motivo} Cobertura medida: ${measured}.`, target.causa), porcentaje: percentage, alcance: n, cubiertos: covered.length };
  }

  const withoutCover = uncovered.length ? ` Sin cubrir: ${formatList(uncovered)}.` : '';
  const withoutDetermine = undetermined.length ? ` Sin determinar: ${formatList(undetermined.map(m => m.motivo))}.` : '';

  if (max < target.umbral) {
    return {
      medida: nonCompliant(
        `Cobertura de la monitorización ${measured}${undeterminedCount ? `, como mucho ${figure(max)} % con los ${undeterminedCount} sin determinar` : ''}: por debajo del objetivo de P-06 (${describeTarget(target)}). Un grado de implantación calculado sobre esta monitorización no es un dato sólido.${withoutCover}${withoutDetermine}${noteOutside}`
      ),
      porcentaje: percentage,
      alcance: n,
      cubiertos: covered.length,
    };
  }

  if (percentage >= target.umbral) {
    return {
      medida: compliant(
        `Cobertura de la monitorización ${measured}, frente al objetivo de P-06 (${describeTarget(target)})${
          percentage < target.objetivo ? ': por debajo del objetivo, dentro de la tolerancia' : ''
        }.${withoutCover}${withoutDetermine}${noteOutside}`
      ),
      porcentaje: percentage,
      alcance: n,
      cubiertos: covered.length,
    };
  }

  return {
    medida: notMeasured(
      `Cobertura de la monitorización ${measured}, por debajo del objetivo de P-06 (${describeTarget(target)}), pero ${undeterminedCount} sistema(s) sin determinar podrían alcanzarlo.${withoutCover}${withoutDetermine}${noteOutside}`,
      commonGapCause(undetermined)
    ),
    porcentaje: percentage,
    alcance: n,
    cubiertos: covered.length,
  };
};


export const INCIDENT_INDICATORS = [
  'incidentes_por_tipo',
  'incidentes_por_severidad',
  'tiempo_medio_contencion',
  'tiempo_medio_resolucion',
  'notificados_ccn_cert',
  'notificados_aepd',
];

const SEVERITIES = ['baja', 'media', 'alta', 'critica'];

interface Incident {
  id: string;
  severidad: string;
  // The earliest initial phase: the incident's record.
  apertura?: number;
  // The earliest date of any phase (for the window).
  primera: number;
  contencion?: number;
  cierre?: number;
  clasificacion?: string;
  datosPersonales: 'si' | 'no' | '-';
  aepd: boolean;
  ccnCert?: number;
}

const READS_INCIDENTS = (context: ENSPolicyContext, now: number): LogRow | Measurement =>
  record(context, now, 'incident_register_read', 'incident_registered', 'EV-03', 'registro de incidentes', INCIDENT_RECORD);

// Record phases grouped by incident with op.exp.7's rules: severity is the highest of its phases;
// containment, the first intermediate phase; closing, the last final one.
const incidentsOf = (reg: LogRow): Incident[] => {
  const byId = new Map<string, Incident>();

  reg.filas.forEach(e => {
    const id = factField(e, 'incidente_id');
    const t = parseInstant(factField(e, 'fecha'));

    if (!id || t === undefined) {
      return;
    }

    const actual: Incident = byId.get(id) || { id, severidad: '', primera: t, datosPersonales: '-', aepd: false };
    const severity = stripAccents(factField(e, 'severidad'));
    const phase = factField(e, 'fase');

    if (SEVERITIES.indexOf(severity) > SEVERITIES.indexOf(actual.severidad)) {
      actual.severidad = severity;
    }

    actual.primera = Math.min(actual.primera, t);

    if (phase === 'inicial') {
      actual.apertura = Math.min(actual.apertura ?? t, t);
    } else if (phase === 'intermedio') {
      actual.contencion = Math.min(actual.contencion ?? t, t);
    } else if (phase === 'final') {
      actual.cierre = Math.max(actual.cierre ?? t, t);
    }

    if (!isEmptyField(factField(e, 'clasificacion'))) {
      actual.clasificacion = factField(e, 'clasificacion');
    }

    const dp = factField(e, 'datos_personales');

    if (dp === 'si' || (dp === 'no' && actual.datosPersonales !== 'si')) {
      actual.datosPersonales = dp;
    }

    if (folded(factField(e, 'notificado_a')).includes('aepd')) {
      actual.aepd = true;
    }

    const ccn = parseInstant(factField(e, 'notificacion_ccn_cert'));

    if (ccn !== undefined) {
      actual.ccnCert = Math.min(actual.ccnCert ?? ccn, ccn);
    }

    byId.set(id, actual);
  });

  return Array.from(byId.values()).sort((a, b) => a.primera - b.primera);
};

// Alive in the window [desde, hasta]: started before its end and not closed before its start. A
// future-dated incident does not count.
const aliveIn = (incidents: Incident[], since: number, until: number): Incident[] =>
  incidents.filter(i => i.primera <= until + FUTURE_TOLERANCE_MS && (i.cierre === undefined || i.cierre >= since));

// What an incident lacks to compute an indicator, or undefined.
const missingFor = (indicator: string, i: Incident): string | undefined => {
  switch (indicator) {
    case 'incidentes_por_tipo':
      return i.clasificacion ? undefined : 'sin clasificación';
    case 'tiempo_medio_contencion':
      if (i.apertura === undefined) {
        return 'sin fase inicial';
      }

      if (i.contencion !== undefined && i.contencion < i.apertura) {
        return 'contención anterior a la fase inicial';
      }

      return i.cierre !== undefined && i.contencion === undefined ? 'cerrado sin fase intermedia (contención) anotada' : undefined;
    case 'tiempo_medio_resolucion':
      if (i.cierre === undefined) {
        return undefined;
      }

      if (i.apertura === undefined) {
        return 'cerrado sin fase inicial';
      }

      return i.cierre < i.apertura ? 'cierre anterior a la fase inicial' : undefined;
    case 'notificados_aepd':
      return i.datosPersonales === '-' ? 'sin indicar si afecta a datos personales' : undefined;
    default:
      return undefined;
  }
};

const average = (values: number[]): string =>
  values.length ? `${figure(values.reduce((a, b) => a + b, 0) / values.length / HOUR_MS)} h` : 'sin datos';

const account = (values: string[]): string => {
  const map = new Map<string, number>();

  values.forEach(v => map.set(v, (map.get(v) || 0) + 1));

  return map.size
    ? Array.from(map.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([v, n]) => `${v} ${n}`)
        .join(', ')
    : 'ninguno';
};

// An indicator's value over some incidents (those with the datum).
const indicatorValue = (indicator: string, incidents: Incident[]): string => {
  switch (indicator) {
    case 'incidentes_por_tipo':
      return account(incidents.map(i => i.clasificacion || 'sin clasificar'));
    case 'incidentes_por_severidad':
      return account(incidents.map(i => i.severidad || 'sin severidad'));
    case 'tiempo_medio_contencion': {
      const contents = incidents.filter(i => i.apertura !== undefined && i.contencion !== undefined && i.contencion >= i.apertura);

      return `${average(contents.map(i => (i.contencion as number) - (i.apertura as number)))} (${contents.length} contenidos)`;
    }
    case 'tiempo_medio_resolucion': {
      const closed = incidents.filter(i => i.apertura !== undefined && i.cierre !== undefined && i.cierre >= i.apertura);

      return `${average(closed.map(i => (i.cierre as number) - (i.apertura as number)))} (${closed.length} cerrados)`;
    }
    case 'notificados_ccn_cert':
      return `${incidents.filter(i => i.ccnCert !== undefined).length} de ${incidents.length}`;
    case 'notificados_aepd': {
      const personal = incidents.filter(i => i.datosPersonales === 'si');

      return `${personal.filter(i => i.aepd).length} de ${personal.length} con datos personales`;
    }
    default:
      return 'indicador desconocido';
  }
};

// P-03: a list of indicators from the vocabulary. Any other text leaves R1 unevaluated, naming it.
const indicators = (context: ENSPolicyContext): string[] | Measurement => {
  const p = findParameter(context, 'P-03');
  const items = p && p.value !== undefined ? toParameterListItems(p.value).map(x => x.trim()).filter(Boolean) : [];

  if (!items.length) {
    return missingParameter(context, 'P-03', 'qué indicadores de la gestión de incidentes se consolidan');
  }

  const bad = items.filter(x => !INCIDENT_INDICATORS.includes(folded(x)));

  if (bad.length) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-03')} tiene indicadores que ENSFácil no sabe calcular con el registro de incidentes: ${formatList(bad.map(x => `«${x}»`))}. Los que sabe: ${INCIDENT_INDICATORS.join(', ')}.`,
      'CONFIGURATION'
    );
  }

  return Array.from(new Set(items.map(folded)));
};

// Incident data are taken as consolidated if the last metrics cycle is within its deadline. The
// cycle record belongs to EV-02: it is read as EV-02 (its lack of facts looks for EV-02's
// degradation) and what the collector declares about it after its read is combined as in EV-02.
const cycleWithinDeadline = (context: ENSPolicyContext, now: number, per: Periodicity): Measurement =>
  withDegradation(context, now, 'EV-02', 'metrics_register_read', cycleWithinDeadlineFacts(context, now, per));

const cycleWithinDeadlineFacts = (context: ENSPolicyContext, now: number, per: Periodicity): Measurement => {
  const reg = READS_CYCLES(context, now, 'EV-02');

  if (isMeasurement(reg)) {
    return reg.estado === 'NO_EVALUABLE'
      ? notMeasured(`Sin el registro de ciclos de métricas no consta que los datos de incidentes se consoliden: ${reg.motivo}`, reg.causa)
      : reg;
  }

  const { ciclos: cycles } = cyclesOf(reg);
  const last = cycles[cycles.length - 1];

  if (!last) {
    return nonCompliant('El registro de ciclos de métricas no tiene ningún ciclo anotado: los datos de incidentes no se consolidan en ningún ciclo.');
  }

  const age = reg.t - last.fecha;

  return age > per.plazoDias * DAY_MS
    ? nonCompliant(`El último ciclo de métricas, ${describeCycle(last)}, es de hace ${wholeDays(age)} días: fuera del plazo (${describeDeadline(per)} días), así que los datos de incidentes no se están consolidando.`)
    : compliant(`Se consolidan en el ciclo ${describeCycle(last)}, dentro del plazo (${describeDeadline(per)} días).`);
};

const ev03Facts = (context: ENSPolicyContext, now: number): Measurement => {
  const reg = READS_INCIDENTS(context, now);

  if (isMeasurement(reg)) {
    return reg;
  }

  const pieces: Measurement[] = [];
  const declared = indicators(context);
  const per = periodicity(context);

  if (isMeasurement(declared)) {
    pieces.push(declared);
  }

  if (isMeasurement(per)) {
    pieces.push(per);
  }

  if (isMeasurement(declared) || isMeasurement(per)) {
    return combineMeasurements(pieces);
  }

  pieces.push(cycleWithinDeadline(context, now, per));

  const since = reg.t - per.dias * DAY_MS;
  const ofPeriod = aliveIn(incidentsOf(reg), since, reg.t);
  const window = `el periodo ${per.nombre} hasta la lectura (desde ${date(since)})`;

  if (reg.descartadas > 0) {
    pieces.push(
      notMeasured(
        `${reg.descartadas} fila(s) del registro de incidentes se descartaron por no tener el formato exigido (ver los avisos del recolector): no se puede afirmar que los indicadores estén completos.`
      )
    );
  }

  if (!ofPeriod.length) {
    pieces.push(
      compliant(
        `Ningún incidente registrado en ${window}: los indicadores de P-03 (${declared.join(', ')}) valen cero. Con el registro presente, cero incidentes es un dato.`
      )
    );

    return combineMeasurements(pieces);
  }

  const missing: string[] = [];

  declared.forEach(indicator => {
    const without = ofPeriod
      .map(i => ({ i, falta: missingFor(indicator, i) }))
      .filter(x => x.falta);

    if (without.length) {
      missing.push(`${indicator}: ${formatList(without.map(x => `${x.i.id} ${x.falta}`))}`);
    }
  });

  pieces.push(
    missing.length
      ? nonCompliant(
          `Faltan datos en el registro de incidentes para calcular los indicadores de P-03 de ${window} (${ofPeriod.length} incidente(s)): ${missing.join(' | ')}. Sin ellos no se puede evaluar el comportamiento de la gestión de incidentes.`
        )
      : compliant(
          `Indicadores de P-03 de ${window}, ${ofPeriod.length} incidente(s): ${declared.map(x => `${x}: ${indicatorValue(x, ofPeriod)}`).join('; ')}.`
        )
  );

  return combineMeasurements(pieces);
};

const ev03 = (context: ENSPolicyContext, now: number): Measurement =>
  withDegradation(context, now, 'EV-03', 'incident_register_read', ev03Facts(context, now));


const RESOURCE_COLUMNS = ['horas_internas', 'horas_externas', 'presupuesto_ejecutado'];

const entries = (context: ENSPolicyContext): Measurement | undefined => {
  const declared = tableParameterRows(context, 'P-04');

  if (!declared) {
    return missingParameter(context, 'P-04', 'qué partidas entran en las horas y el presupuesto que anota el registro');
  }

  const bad = declared.filter(f => !RESOURCE_COLUMNS.includes(folded(f.columna || '')));

  if (bad.length) {
    return notMeasured(
      `${parameterDisplayName(context, 'P-04')}: la columna de ${formatList(bad.map(f => `«${f.partida}» («${f.columna || ''}»)`))} no es ${RESOURCE_COLUMNS.join(', ')}.`,
      'CONFIGURATION'
    );
  }

  const missing = RESOURCE_COLUMNS.filter(c => !declared.some(f => folded(f.columna || '') === c));

  return missing.length
    ? notMeasured(`${parameterDisplayName(context, 'P-04')} no declara ninguna partida para ${missing.join(', ')}: esa cifra del registro no tiene un significado declarado.`, 'CONFIGURATION')
    : undefined;
};

const ev06Facts = (context: ENSPolicyContext, now: number): Measurement => {
  const pieces: Measurement[] = [];
  const reg = READS_CYCLES(context, now, 'EV-06');

  if (isMeasurement(reg)) {
    return reg;
  }

  const { ciclos: cycles, nota: note } = cyclesOf(reg);
  const notes = `${note}${discardedNote(reg, 'registro de ciclos')}`;
  const last = cycles[cycles.length - 1];
  const withoutEntries = entries(context);

  if (withoutEntries) {
    pieces.push(withoutEntries);
  }

  if (!last) {
    return combineMeasurements([...pieces, nonCompliant(`El registro de ciclos de métricas no tiene ningún ciclo anotado: no hay datos de horas ni de presupuesto.${notes}`)]);
  }

  const per = periodicity(context);
  const who = validators(context, 'recursos');

  if (isMeasurement(per)) {
    pieces.push(per);
  }

  if (isMeasurement(who)) {
    pieces.push(who);
  }

  if (isMeasurement(per) || isMeasurement(who)) {
    return combineMeasurements(pieces);
  }

  const age = reg.t - last.fecha;

  if (age > per.plazoDias * DAY_MS) {
    pieces.push(nonCompliant(`El último ciclo, ${describeCycle(last)}, es de hace ${wholeDays(age)} días: fuera del plazo (${describeDeadline(per)} días). Los datos de recursos no están al día.${notes}`));

    return combineMeasurements(pieces);
  }

  const missing = [
    last.horasInternas === undefined ? 'horas internas' : '',
    last.horasExternas === undefined ? 'horas externas' : '',
    last.presupuesto === undefined ? 'presupuesto ejecutado' : '',
  ].filter(Boolean);

  if (missing.length) {
    pieces.push(nonCompliant(`El último ciclo, ${describeCycle(last)}, no anota ${missing.join(', ')}: R2 pide los recursos consumidos en horas y presupuesto.${notes}`));
  } else if (isEmptyField(last.validadoPor) || !who.has(folded(last.validadoPor))) {
    pieces.push(
      nonCompliant(
        `Los recursos del último ciclo, ${describeCycle(last)}, no están validados por un responsable de recursos de P-05 (${designated(context, 'recursos')}).${notes}`
      )
    );
  } else {
    pieces.push(
      compliant(
        `Ciclo ${last.periodo}, consolidado el ${date(last.fecha)}: ${figure(last.horasInternas as number)} h internas, ${figure(last.horasExternas as number)} h externas y ${figure(last.presupuesto as number)} € de presupuesto ejecutado, validado por ${last.validadoPor} (P-05). DATO DECLARADO: ENSFácil lo registra y lo presenta, pero no lo verifica.${notes}`
      )
    );
  }

  return combineMeasurements(pieces);
};

// What the collector declares after the last read is combined with what was measured: EV-06's
// degradation if any, otherwise EV-02's (same record). Never both: the same line may name
// «EV-02,EV-06».
const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const measurement = ev06Facts(context, now);
  const own = withDegradation(context, now, 'EV-06', 'metrics_register_read', measurement);

  return own !== measurement
    ? own
    : withDegradation(context, now, INHERITS_DEGRADATION['EV-06'], 'metrics_register_read', measurement);
};


const REPORT_DATA: Record<string, string> = {
  'EV-01':
    'Dato del informe, sin veredicto: el grado de implantación de cada medida aplicable de P-01 es salida del motor sobre el resultado de todos los controles, y lo calcula el informe de op.mon.2. Que se consolida con su periodicidad lo acredita EV-02.',
  'EV-05':
    'Dato del informe, sin veredicto: los controles con requisitos sin evaluar por falta de configuración, con el parámetro que falta, salen del resultado de todos los controles y los presenta el informe de op.mon.2.',
  'EV-07':
    'Dato del informe, sin veredicto: los datos del informe anual del art. 32 son el propio informe de op.mon.2, que combina EV-01 a EV-06 con el origen de cada cifra.',
};

// The cycle series for the report, newest to oldest.
const cyclesSeries = (context: ENSPolicyContext, now: number): string[] => {
  const reg = READS_CYCLES(context, now, 'EV-02');

  if (isMeasurement(reg)) {
    return [];
  }

  return cyclesOf(reg)
    .ciclos.slice()
    .reverse()
    .map(c =>
      [
        describeCycle(c),
        c.horasInternas !== undefined || c.horasExternas !== undefined || c.presupuesto !== undefined
          ? `recursos: ${c.horasInternas !== undefined ? figure(c.horasInternas) : '-'} h internas, ${c.horasExternas !== undefined ? figure(c.horasExternas) : '-'} h externas, ${
              c.presupuesto !== undefined ? figure(c.presupuesto) : '-'
            } €`
          : '',
        isEmptyField(c.referencia) ? '' : `ref. ${c.referencia}`,
      ]
        .filter(Boolean)
        .join(' · ')
    );
};

// The six indicators over a window, for the report (with or without P-03).
const reportIndicators = (context: ENSPolicyContext, now: number, daysWindow: number | undefined): string[] => {
  const reg = READS_INCIDENTS(context, now);

  if (isMeasurement(reg) || daysWindow === undefined) {
    return [];
  }

  const since = reg.t - daysWindow * DAY_MS;
  const alive = aliveIn(incidentsOf(reg), since, reg.t);

  return [
    `Ventana: ${date(since)} a ${date(reg.t)}, ${alive.length} incidente(s)`,
    ...INCIDENT_INDICATORS.map(x => `${x}: ${alive.length ? indicatorValue(x, alive) : 'cero'}`),
  ];
};


interface Technician {
  requisito: string;
  evidencias: string[];
  parametros: string[];
  tipo: ENSDecisionRuleType;
  acreditado?: boolean;
}

const TECHNICIANS: Technician[] = [
  { requisito: 'op.mon.2.1', evidencias: ['EV-02', 'EV-04'], parametros: ['P-01', 'P-02', 'P-05', 'P-06'], tipo: 'MAX_AGE' },
  { requisito: 'op.mon.2.r1.1', evidencias: ['EV-03'], parametros: ['P-02', 'P-03'], tipo: 'COVERAGE_REQUIRED' },
  // R2 is declared data: its CUMPLE is marked accredited documentarily.
  { requisito: 'op.mon.2.r2.1', evidencias: ['EV-06'], parametros: ['P-02', 'P-04', 'P-05'], tipo: 'MAX_AGE', acreditado: true },
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
  const ev04: { cobertura?: Coverage } = {};

  const measurementOf = (evidence: string): Measurement => {
    if (!cache[evidence]) {
      switch (evidence) {
        case 'EV-02':
          cache[evidence] = ev02(context, now);
          break;
        case 'EV-03':
          cache[evidence] = ev03(context, now);
          break;
        case 'EV-04':
          ev04.cobertura = ev04Coverage(context, now);
          cache[evidence] = withDegradation(context, now, 'EV-04', 'agent_keepalive_observed', ev04.cobertura.medida);
          break;
        default:
          cache[evidence] = ev06(context, now);
      }
    }

    return cache[evidence];
  };

  const requirementDecisions: ENSPolicyDecision[] = [];
  const evidenceDecisions: ENSPolicyDecision[] = [];

  TECHNICIANS.filter(r => applies(r.requisito)).forEach(definition => {
    const own = definition.evidencias.map(id => ({ id, medida: measurementOf(id) }));
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
        definition.evidencias.map(id => `${id} CUMPLE`).join(' y '),
        commonGapCause(owners.map(p => p.medida)),
        Boolean(definition.acreditado)
      ), reasonPartsOf(own))
    );

    // And one per evidence, with ITS status. An accredited requirement's carries the same mark: the
    // bridge does not fill an evidence with an accreditation, so EV-06 is not presented as
    // measured.
    own.forEach(p =>
      evidenceDecisions.push(
        decide(
          definition.requisito,
          p.medida.estado,
          [p.id],
          definition.parametros,
          definition.tipo,
          `${definition.requisito}/${p.id}`,
          p.medida.motivo,
          `${p.id} CUMPLE`,
          p.medida.causa,
          Boolean(definition.acreditado)
        )
      )
    );
  });

  // EV-01, EV-05 and EV-07: report data, no verdict. op.mon.2.1 applies in the three categories.
  ['EV-01', 'EV-05', 'EV-07'].forEach(id =>
    evidenceDecisions.push(decide('op.mon.2.1', 'NO_APLICA', [id], ['P-01', 'P-06'], 'MAX_AGE', `op.mon.2.1/${id}`, REPORT_DATA[id], 'dato del informe'))
  );

  const per = periodicity(context);
  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(cache).map(([evidence, measurement]) => ({
      name: `medida_${evidence.replace('-', '')}`,
      value: measurement.estado,
      parameterIds: [],
      evidenceIds: [evidence],
      eventIds: [],
      description: measurement.motivo,
    })),
    {
      name: 'periodicidad_metricas',
      value: isMeasurement(per) ? undefined : per.nombre,
      parameterIds: ['P-02'],
      evidenceIds: ['EV-02'],
      eventIds: [],
      description: isMeasurement(per)
        ? per.motivo
        : `${describeDeadline(per)} días de plazo por ciclo${per.cierre ? `; cierre anual del art. 32 el ${per.cierre}` : ''}.`,
    },
    {
      name: 'serie_ciclos_metricas',
      value: cyclesSeries(context, now),
      parameterIds: ['P-02', 'P-05'],
      evidenceIds: ['EV-02', 'EV-06'],
      eventIds: [],
      description: 'Ciclos de métricas anotados en el registro de la organización, del más reciente al más antiguo.',
    },
    {
      name: 'indicadores_incidentes_periodo',
      value: reportIndicators(context, now, isMeasurement(per) ? undefined : per.dias),
      parameterIds: ['P-02', 'P-03'],
      evidenceIds: ['EV-03'],
      eventIds: [],
      description: 'Indicadores de la gestión de incidentes del periodo de P-02, calculados con el registro de incidentes de op.exp.7.',
    },
    {
      name: 'indicadores_incidentes_anual',
      value: reportIndicators(context, now, ANNUAL_DAYS),
      parameterIds: ['P-03'],
      evidenceIds: ['EV-03'],
      eventIds: [],
      description: 'Indicadores de la gestión de incidentes de los últimos 365 días, para el informe anual del art. 32.',
    },
  ];

  const coverage = ev04.cobertura;

  if (coverage && coverage.porcentaje !== undefined) {
    variables.push({
      name: 'cobertura_monitorizacion',
      value: Math.round(coverage.porcentaje * 10) / 10,
      parameterIds: ['P-06'],
      evidenceIds: ['EV-04'],
      eventIds: [],
      description: `${coverage.cubiertos} de ${coverage.alcance} sistemas del alcance ENS con el agente conectado y todos sus recolectores al día.`,
    });
  }

  return { decisions: [...requirementDecisions, ...evidenceDecisions], runtimeVariables: variables };
};

export const opMon2PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // By system category: base in all three; R1 and R2 from MEDIA, which requires the same as ALTA.
  requirements: [
    {
      requirementId: 'op.mon.2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-05', 'P-06'],
      evidenceIds: ['EV-02', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.mon.2.r1.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-03'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.mon.2.r2.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-04', 'P-05'],
      evidenceIds: ['EV-06'],
      ruleType: 'MAX_AGE',
    },
  ],
};
