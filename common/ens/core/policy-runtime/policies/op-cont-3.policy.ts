// op.cont.3 · Periodic tests.
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import {
  HOUR_MS,
  DAY_MS,
  SAME_RUN_WINDOW_MS,
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
  iso,
  stripAccents,
  isEmptyField,
  equalsIgnoreCase,
  findParameter,
  parameterDisplayName,
  tableParameterRows,
  positiveScalar,
  missingParameter,
  createFactReader,
  decisionBuilderFor,
} from './policy-kit';
import type { ENSDecisionRuleType, Measurement } from './policy-kit';

const CONTROL = 'op.cont.3';
const POLICY = 'policy.op.cont.3';
const REQUIREMENT = 'op.cont.3.1';

// op.cont.3 facts are all state, re-emitted whole every 6 h; the default freshness (26 h) tolerates
// three missed runs.
const { validos: valid, estadoVigente: currentStatus, sinHechos: withoutFacts } = createFactReader(CONTROL, {
  recolector: 'el recolector de op.cont.3 del manager',
});

const decide = decisionBuilderFor(POLICY);

// Must match the first option of P-04 and P-05.
const TEST_RECORD = 'Registro Power ENS (/etc/power-ens/continuity-test-register.tsv)';
const DEFICIENCY_RECORD = 'Registro Power ENS (/etc/power-ens/continuity-deficiency-register.tsv)';

// Vocabulary of the `tipo` column and the types that really exercise alternative means.
const TYPES = ['revision_documental', 'escritorio', 'parcial', 'simulacro'];
const EXERCISE_TYPES = ['parcial', 'simulacro'];
const RESULTS = ['satisfactorio', 'parcial', 'fallido'];

// P-02 admits months or the periodicity name.
const PERIODICITIES: Record<string, number> = {
  mensual: 1,
  bimestral: 2,
  trimestral: 3,
  cuatrimestral: 4,
  semestral: 6,
  anual: 12,
  bienal: 24,
};

const isMeasurement = (x: unknown): x is Measurement =>
  typeof x === 'object' && x !== null && typeof (x as Measurement).estado === 'string';


// `t` plus `meses` calendar months, in UTC: 31 March plus one month is 30 April, not 1 May.
const sumMonths = (t: number, months: number): number => {
  const d = new Date(t);
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds())
  );
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();

  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));

  return target.getTime();
};

// Whole calendar months between `desde` and `hasta`.
const monthsBetween = (since: number, until: number): number => {
  let k = 0;

  while (sumMonths(since, k + 1) <= until) {
    k += 1;
  }

  return k;
};

const date = (t: number): string => iso(t).slice(0, 10);

const duration = (ms: number): string => {
  const minutes = Math.round(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;

  return h ? `${h} h ${m} min` : `${m} min`;
};

// A deadline is a DATE: it expires at the end of that day (UTC).
const expiry = (text: string): number | undefined => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return undefined;
  }

  const t = parseInstant(text);

  return t === undefined ? undefined : t + DAY_MS;
};

const normalizes = (text: string): string => stripAccents(text).replace(/\s+/g, ' ').trim();

const listOf = (text: string): string[] =>
  isEmptyField(text) ? [] : text.split(',').map(x => x.trim()).filter(Boolean);


interface LogRow {
  t: number;
  fichero: string;
  filas: ENSNormalizedEvent[];
  // Valid rows the collector says it emitted in that read.
  declaradas?: number;
  // Rows it discarded for not following the format; without the datum, `undefined`: a count that
  // does not arrive is not zero.
  invalidas?: number;
  lineas: string[];
}

// Reading of a record in the last run, and the rows of THAT run. Anchored on the read fact, not the
// last row: with the record emptied, the last row is from an earlier run and describes nothing.
const readsRecord = (
  context: ENSPolicyContext,
  now: number,
  evidence: string,
  typeRead: string,
  typeRow: string,
  name: string,
  path: string
): LogRow | Measurement => {
  const { vigentes: current, ultimo: last } = currentStatus(context, typeRead, now);
  const read = current[current.length - 1];

  if (!read) {
    return withoutFacts(context, evidence, now, last, `lectura del registro de ${name}`);
  }

  const file = factField(read, 'fichero') || path;

  if (factField(read, 'presente') !== 'si') {
    return notMeasured(
      `No existe el registro de ${name} ${file} en el manager: un registro ausente no es un registro vacío, y sin él no hay contra qué juzgar. Créalo con la cabecera documentada (la plantilla está junto a él, en .example).`,
      'CONFIGURATION'
    );
  }

  if (factField(read, 'legible') !== 'si') {
    return notMeasured(`El registro de ${name} ${file} existe pero el recolector no lo pudo leer.`, 'COLLECTION');
  }

  if (factField(read, 'cabecera') !== 'ok') {
    return notMeasured(
      `La primera línea del registro de ${name} ${file} no es la cabecera documentada: no se interpreta un registro cuyas columnas no se conocen. Corrígela con la de la plantilla.`,
      'CONFIGURATION'
    );
  }

  const t = eventTime(read);

  return {
    t,
    fichero: file,
    filas: valid(context, typeRow, now).filter(e => eventTime(e) >= t - SAME_RUN_WINDOW_MS && eventTime(e) <= t + HOUR_MS),
    declaradas: parseNumber(factField(read, 'filas')),
    invalidas: parseNumber(factField(read, 'filas_invalidas')),
    lineas: listOf(factField(read, 'lineas_invalidas')),
  };
};

// Rows the collector discarded for not following the format: with them the record cannot be taken
// as complete. Named by line and column.
const discardedRows = (reg: LogRow, name: string): Measurement | undefined =>
  reg.invalidas === undefined
    ? notMeasured(
        `La lectura del registro de ${name} ${reg.fichero} no dice cuántas filas descartó el recolector por no seguir el formato (filas_invalidas): no se puede comprobar que no haya ninguna, y una fila descartada puede ser justo la que falta.`,
        'COLLECTION'
      )
    : reg.invalidas
    ? notMeasured(
        `El registro de ${name} ${reg.fichero} tiene ${reg.invalidas} fila(s) descartadas por no seguir el formato (${
          reg.lineas.length ? `línea:columna ${formatList(reg.lineas, 10)}` : 'ver los avisos del recolector'
        }): una fila ilegible puede ser justo la que falta, así que no se puede dar el registro por bueno. Corrígelas.`,
        'CONFIGURATION'
      )
    : undefined;

// Each row once, by its key (test `inicio`, `deficiencia_id`): a fact repeated in one run does not
// count twice. The LAST one is kept (most recent; on a tie, the later arrival).
const oneByKey = (readRows: ENSNormalizedEvent[], key: (e: ENSNormalizedEvent) => string): ENSNormalizedEvent[] => {
  const last = new Map<string, ENSNormalizedEvent>();

  [...readRows].sort((a, b) => eventTime(a) - eventTime(b)).forEach(e => last.set(key(e), e));

  return Array.from(last.values());
};

// Rows the read announced and did not arrive (a line lost by logcollector, an alert the indexer
// rejected): without them the record is not whole.
const lostRows = (reg: LogRow, received: number, name: string): Measurement | undefined =>
  reg.declaradas === undefined
    ? notMeasured(
        `La lectura del registro de ${name} ${reg.fichero} no dice cuántas filas válidas leyó el recolector (filas): no se puede comprobar que hayan llegado todas, y una fila perdida puede ser justo la que falta.`,
        'COLLECTION'
      )
    : received < reg.declaradas
    ? notMeasured(
        `El recolector leyó ${reg.declaradas} fila(s) válidas en el registro de ${name} ${reg.fichero} y solo han llegado ${received}: faltan ${reg.declaradas - received}, y una fila perdida puede ser justo la que falta.`,
        'COLLECTION'
      )
    : undefined;

// A finding resting on an ABSENCE («never tested», «expired», «empty», «declares N and still k»)
// cannot be asserted if rows are missing: the missing one may refute it. It becomes NO_EVALUABLE
// with the gap's cause. What rests on something PRESENT (an open deficiency past deadline, a
// measured discrepancy) still wins.
const byAbsence = (measurement: Measurement, incomplete: Measurement | undefined): Measurement =>
  measurement.estado === 'NO_CUMPLE' && incomplete
    ? notMeasured(`${measurement.motivo} No se puede afirmar: ${incomplete.motivo.charAt(0).toLowerCase()}${incomplete.motivo.slice(1)}`, incomplete.causa)
    : measurement;

// P-04 or P-05: where it is recorded. Only the organization's own record can be read.
const declaresRecord = (
  context: ENSPolicyContext,
  id: string,
  option: string,
  subject: string,
  path: string
): Measurement | undefined => {
  const value = findParameter(context, id)?.value;
  const text = value === undefined || value === null || Array.isArray(value) ? '' : String(value).trim();

  if (!text) {
    return missingParameter(context, id, `dónde se registran ${subject}`);
  }

  if (text !== option) {
    return notMeasured(
      `${parameterDisplayName(context, id)} declara «${text}» como registro de ${subject}. Power ENS solo lee su registro TSV del manager (${path}); la integración con esa herramienta no existe, así que no se puede demostrar.`,
      'CONFIGURATION'
    );
  }

  return undefined;
};


interface Test {
  evento: ENSNormalizedEvent;
  linea: string;
  inicio: number;
  fin: number;
  tipo: string;
  escenario: string;
  sistemas: string[];
  resultado: string;
  deficiencias?: number;
  referencia: string;
  medicion: string;
  medidoHasta?: number;
  diasSinAlertas: string[];
  // How many availability facts (111705) the collector emitted for it.
  candidatos?: number;
  // The manager's `agents_disconnection_time`, in ms: how long before a 504 the outage could have
  // begun.
  desconexion?: number;
}

const describe = (p: Test): string => `${p.tipo} del ${iso(p.inicio)}${isEmptyField(p.escenario) ? '' : ` («${p.escenario}»)`}`;

// Rows of the test record, one per `inicio`. The collector already validated the format: a row
// still not understood is a COLLECTION failure, named with the failing column.
const testsOf = (reg: LogRow): { pruebas: Test[]; malas: string[]; inicioIlegibles: number[]; recibidas: number } => {
  const tests: Test[] = [];
  const bad: string[] = [];
  const unreadableStart: number[] = [];
  const unique = oneByKey(reg.filas, e => String(parseInstant(factField(e, 'inicio')) ?? factField(e, 'inicio')));

  unique.forEach(e => {
    const start = parseInstant(factField(e, 'inicio'));
    const end = parseInstant(factField(e, 'fin'));
    const type = factField(e, 'tipo');
    const line = factField(e, 'linea') || '?';
    const text = factField(e, 'deficiencias');
    const badly = [
      start === undefined ? `inicio «${factField(e, 'inicio')}»` : '',
      end === undefined || (start !== undefined && end < start) ? `fin «${factField(e, 'fin')}»` : '',
      !TYPES.includes(type) ? `tipo «${type}»` : '',
      !RESULTS.includes(factField(e, 'resultado')) ? `resultado «${factField(e, 'resultado')}»` : '',
      !/^\d+$/.test(text) ? `deficiencias «${text}»` : '',
    ].filter(Boolean);

    if (badly.length || start === undefined || end === undefined) {
      bad.push(`línea ${line} (${badly.join(', ')})`);

      if (start !== undefined) {
        unreadableStart.push(start);
      }

      return;
    }

    tests.push({
      evento: e,
      linea: line,
      inicio: start,
      fin: end,
      tipo: type,
      escenario: factField(e, 'escenario'),
      sistemas: listOf(factField(e, 'sistemas')),
      resultado: factField(e, 'resultado'),
      deficiencias: Number(text),
      referencia: factField(e, 'referencia'),
      medicion: factField(e, 'medicion'),
      medidoHasta: parseInstant(factField(e, 'medido_hasta')),
      diasSinAlertas: listOf(factField(e, 'dias_sin_alertas')),
      candidatos: /^\d+$/.test(factField(e, 'candidatos')) ? Number(factField(e, 'candidatos')) : undefined,
      desconexion: /^\d+$/.test(factField(e, 'agents_disconnection_time')) ? Number(factField(e, 'agents_disconnection_time')) * 1000 : undefined,
    });
  });

  return { pruebas: tests.sort((a, b) => a.inicio - b.inicio), malas: bad, inicioIlegibles: unreadableStart, recibidas: unique.length };
};

const unreadableRows = (bad: string[], name: string): Measurement | undefined =>
  bad.length
    ? notMeasured(`El recolector ha emitido ${bad.length} fila(s) del registro de ${name} que no se pueden interpretar: ${formatList(bad)}.`, 'COLLECTION')
    : undefined;

// Common to the test-record evidences: P-04, the record and its rows. If something is missing, that
// is the measurement.
interface BaseTests {
  reg: LogRow;
  pruebas: Test[];
  // Made at the instant of reading (the window has already ended).
  hechas: Test[];
  // What does not prevent judging but prevents accepting the record as good.
  reparos: Measurement[];
  // The same, as a measurement: if it exists, absence findings are not asserted (`byAbsence`).
  incompleto?: Measurement;
  // Start of the rows that arrived and cannot be interpreted, and whether rows the collector read
  // are missing: a deficiency pointing to one of them lacks its test because of COLLECTION, not
  // configuration.
  inicioIlegibles: number[];
  faltanFilas: boolean;
}

const baseTests = (context: ENSPolicyContext, now: number, evidence: string): BaseTests | Measurement => {
  const p04 = declaresRecord(context, 'P-04', TEST_RECORD, 'las pruebas', '/etc/power-ens/continuity-test-register.tsv');

  if (p04) {
    return p04;
  }

  const reg = readsRecord(
    context,
    now,
    evidence,
    'continuity_test_register_read',
    'continuity_test_recorded',
    'pruebas',
    '/etc/power-ens/continuity-test-register.tsv'
  );

  if (isMeasurement(reg)) {
    return reg;
  }

  const { pruebas: tests, malas: bad, inicioIlegibles: unreadableStart, recibidas: received } = testsOf(reg);
  const lost = lostRows(reg, received, 'pruebas');
  const objections = [discardedRows(reg, 'pruebas'), lost, unreadableRows(bad, 'pruebas')].filter(
    (m): m is Measurement => Boolean(m)
  );

  return {
    reg,
    pruebas: tests,
    hechas: tests.filter(p => p.fin <= reg.t),
    reparos: objections,
    ...(objections.length ? { incompleto: combineMeasurements(objections) } : {}),
    inicioIlegibles: unreadableStart,
    faltanFilas: Boolean(lost),
  };
};

// Those not yet finished when the record was read: they do not count but are reported.
const pending = (b: BaseTests): string => {
  const after = b.pruebas.filter(p => p.fin > b.reg.t);

  return after.length
    ? ` No cuentan todavía, porque su ventana no había terminado al leer el registro: ${formatList(after.map(describe))}.`
    : '';
};


type Months = { meses: number } | Measurement;

const periodicityP01 = (context: ENSPolicyContext, purpose: string): Months => {
  const n = positiveScalar(context, 'P-01');

  if (n === undefined) {
    return missingParameter(context, 'P-01', purpose);
  }

  if (!Number.isInteger(n)) {
    return notMeasured(`${parameterDisplayName(context, 'P-01')} vale ${n}: tiene que ser un número entero de meses.`, 'CONFIGURATION');
  }

  return { meses: n };
};

interface TypeExpected {
  tipo: string;
  meses?: number;
}

// P-02, strict grammar: type from the vocabulary; periodicity empty (P-01 applies), a number of
// months or its name. Anything else is rejected naming the row, not guessed.
const typesP02 = (context: ENSPolicyContext, purpose: string): { tipos: TypeExpected[]; reparo?: Measurement } | Measurement => {
  const declared = tableParameterRows(context, 'P-02');

  if (!declared) {
    return missingParameter(context, 'P-02', purpose);
  }

  const types: TypeExpected[] = [];
  const badly: string[] = [];

  declared.forEach(f => {
    const type = (f.tipo || '').trim();
    const text = (f.periodicidad_meses || '').trim();

    if (!TYPES.includes(type)) {
      badly.push(`«${f.tipo}» no es un tipo (${TYPES.join(', ')})`);

      return;
    }

    if (isEmptyField(text)) {
      types.push({ tipo: type });

      return;
    }

    const word = PERIODICITIES[normalizes(text)];
    const months = /^\d+$/.test(text) && Number(text) > 0 ? Number(text) : word;

    if (months === undefined) {
      badly.push(`fila «${type}»: periodicidad «${text}» (admite meses o ${Object.keys(PERIODICITIES).join(', ')})`);

      return;
    }

    types.push({ tipo: type, meses: months });
  });

  return {
    tipos: types,
    ...(badly.length
      ? { reparo: notMeasured(`${parameterDisplayName(context, 'P-02')} tiene filas que no se pueden leer: ${formatList(badly)}.`, 'CONFIGURATION') }
      : {}),
  };
};

interface Rto {
  sistema: string;
  limite: number;
  texto: string;
}

// P-07: RTO in hours (decimals with comma or dot) and tolerance in minutes (empty, 0). `*` is for
// systems without their own row.
const rtosP07 = (context: ENSPolicyContext): { rtos: Rto[]; reparo?: Measurement } | Measurement => {
  const declared = tableParameterRows(context, 'P-07');

  if (!declared) {
    return missingParameter(context, 'P-07', 'la indisponibilidad medida de cada sistema en las pruebas (su RTO)');
  }

  const rtos: Rto[] = [];
  const badly: string[] = [];

  declared.forEach(f => {
    const rto = parseNumber(f.rto_horas || '');
    const tol = isEmptyField((f.tolerancia_minutos || '').trim()) ? 0 : /^\d+$/.test(f.tolerancia_minutos.trim()) ? Number(f.tolerancia_minutos.trim()) : undefined;

    if (!f.sistema || rto === undefined || rto <= 0 || tol === undefined) {
      badly.push(`fila «${f.sistema || '(sin sistema)'}»: RTO «${f.rto_horas || ''}», tolerancia «${f.tolerancia_minutos || ''}»`);

      return;
    }

    rtos.push({
      sistema: f.sistema.trim(),
      limite: rto * HOUR_MS + tol * 60000,
      texto: `RTO ${String(rto).replace('.', ',')} h${tol ? ` + ${tol} min` : ''}`,
    });
  });

  return {
    rtos,
    ...(badly.length
      ? { reparo: notMeasured(`${parameterDisplayName(context, 'P-07')} tiene filas que no se pueden leer (RTO en horas mayor que 0, tolerancia en minutos enteros): ${formatList(badly)}.`, 'CONFIGURATION') }
      : {}),
  };
};


const ev01 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = baseTests(context, now, 'EV-01');

  if (isMeasurement(b)) {
    return b;
  }

  const pieces: Measurement[] = [...b.reparos];

  if (!b.hechas.length) {
    pieces.push(
      byAbsence(
        nonCompliant(
          `El registro de pruebas ${b.reg.fichero} está leído (${iso(b.reg.t)}) y no consta ninguna prueba realizada del plan de continuidad: el control queda sin cumplimiento acreditable.${pending(b)}`
        ),
        b.incompleto
      )
    );

    return combineMeasurements(pieces);
  }

  const byType = TYPES.map(t => `${b.hechas.filter(p => p.tipo === t).length} ${t}`).join(', ');
  const last = b.hechas[b.hechas.length - 1];
  const real = b.hechas.filter(p => EXERCISE_TYPES.includes(p.tipo));
  const expected = typesP02(context, 'si las modalidades previstas ejercitan los medios alternativos');

  if (isMeasurement(expected)) {
    pieces.push(expected);
  } else {
    if (expected.reparo) {
      pieces.push(expected.reparo);
    }

    if (!expected.tipos.some(t => EXERCISE_TYPES.includes(t.tipo))) {
      pieces.push(
        nonCompliant(
          `${parameterDisplayName(context, 'P-02')} solo prevé ${expected.tipos.map(t => t.tipo).join(', ') || 'nada legible'}: ninguna modalidad (parcial o simulacro) ejercita los medios alternativos, y una revisión de escritorio no demuestra que funcionen.`
        )
      );
    }

  }

  if (!real.length) {
    pieces.push(
      byAbsence(
        nonCompliant(
          `Las ${b.hechas.length} pruebas registradas son solo revisiones documentales o de escritorio (${byType}): ninguna ejercita realmente los medios alternativos (parcial o simulacro).`
        ),
        b.incompleto
      )
    );
  } else {
    pieces.push(
      compliant(
        `${b.hechas.length} prueba(s) registrada(s) (${byType}); la última, ${describe(last)}, resultado declarado ${last.resultado || '-'}. La última que ejercita los medios alternativos: ${describe(real[real.length - 1])}.${pending(b)}`
      )
    );
  }

  return combineMeasurements(pieces);
};


const lastOf = (tests: Test[], filter: (p: Test) => boolean): Test | undefined =>
  tests.filter(filter).slice(-1)[0];

const ev02 = (context: ENSPolicyContext, now: number): Measurement => {
  const b = baseTests(context, now, 'EV-02');

  if (isMeasurement(b)) {
    return b;
  }

  const pieces: Measurement[] = [...b.reparos];
  const p01 = periodicityP01(context, 'cada cuánto hay que probar el plan');
  const t = b.reg.t;

  if (isMeasurement(p01)) {
    pieces.push(p01);

    return combineMeasurements(pieces);
  }

  if (!b.hechas.length) {
    pieces.push(byAbsence(nonCompliant(`No consta ninguna prueba realizada en el registro: la periodicidad de ${p01.meses} meses (P-01) no se cumple.`), b.incompleto));

    return combineMeasurements(pieces);
  }

  const outside: string[] = [];
  const ok: string[] = [];
  const expiries: number[] = [];

  // `que`: what is measured; `p`: its last test; `meses`: its periodicity.
  const checkAge = (subject: string, p: Test | undefined, months: number, parameterId: string): void => {
    if (!p) {
      outside.push(`${subject}: nunca se ha probado`);

      return;
    }

    const expires = sumMonths(p.inicio, months);

    if (t > expires) {
      outside.push(`${subject}: la última es del ${date(p.inicio)}, hace ${monthsBetween(p.inicio, t)} meses (${parameterId} = ${months})`);
    } else {
      ok.push(`${subject} ${date(p.inicio)}`);
      expiries.push(expires);
    }
  };

  checkAge('el plan', b.hechas[b.hechas.length - 1], p01.meses, 'P-01');

  const expected = typesP02(context, 'la periodicidad de cada tipo de prueba');

  if (isMeasurement(expected)) {
    pieces.push(expected);
  } else {
    if (expected.reparo) {
      pieces.push(expected.reparo);
    }

    expected.tipos.forEach(tp =>
      checkAge(`tipo ${tp.tipo}`, lastOf(b.hechas, p => p.tipo === tp.tipo), tp.meses ?? p01.meses, tp.meses ? 'P-02' : 'P-01')
    );
  }

  const scenarios = tableParameterRows(context, 'P-03');

  if (!scenarios) {
    pieces.push(missingParameter(context, 'P-03', 'qué escenarios de interrupción hay que probar'));
  } else {
    scenarios.forEach(f =>
      checkAge(`escenario «${f.escenario}»`, lastOf(b.hechas, p => normalizes(p.escenario) === normalizes(f.escenario)), p01.meses, 'P-01')
    );
  }

  if (outside.length) {
    // «Never» and «expired» are absences: a lost row may be the missing test.
    pieces.push(byAbsence(nonCompliant(`Pruebas fuera de periodicidad a ${date(t)}, cuando se leyó el registro: ${formatList(outside, 8)}.`), b.incompleto));
  } else {
    const next = Math.min(...expiries);

    pieces.push(
      compliant(
        `A ${date(t)}, cuando se leyó el registro, todo está dentro de periodicidad: ${formatList(ok, 8)}. El próximo vencimiento es el ${date(next)}.`
      )
    );
  }

  return combineMeasurements(pieces);
};


const agentId = (text: string): string | undefined =>
  /^\d+$/.test(text.trim()) ? text.trim().padStart(3, '0') : undefined;

// A fact's agent ID, normalized like the record's: a collector emitting «24» instead of «024» must
// not leave the system without agent.
const factId = (e: ENSNormalizedEvent): string => agentId(factField(e, 'agente_id')) || factField(e, 'agente_id');

type Resolution =
  | { tipo: 'unico'; hecho: ENSNormalizedEvent }
  | { tipo: 'ninguno' }
  | { tipo: 'ambiguo'; ids: string[] };

// A record system is the NAME or the ID of its agent: first by ID (24 is agent 024), then by EXACT
// name ignoring case; never by similarity. If the name matches two agents, none is chosen.
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

const nameOf = (system: string, e: ENSNormalizedEvent): string => {
  const id = factId(e);
  const agent = factField(e, 'agente');

  return equalsIgnoreCase(agent, system) ? `${system} (${id})` : `${system} (${agent}, ${id})`;
};

const OUTAGE_TYPES = ['parada', 'desconexion'];
const RETURN_TYPES = ['arranque', 'actividad'];

type Item = { tipo: string; t: number };

// The `tipo@instante,...` chronology of a fact. `undefined` if not understood.
const timeline = (text: string): Item[] | undefined => {
  const items: Item[] = [];

  for (const part of listOf(text)) {
    const m = /^([a-z]+)@(.+)$/.exec(part);
    const t = m ? parseInstant(m[2]) : undefined;

    if (!m || t === undefined || ![...OUTAGE_TYPES, ...RETURN_TYPES].includes(m[1])) {
      return undefined;
    }

    items.push({ tipo: m[1], t });
  }

  return items.sort((a, b) => a.t - b.t);
};

// An outage as an INTERVAL: what is known of when it began and when the system came back.
// - A stop (506) dates it exactly. A disconnection (504) is emitted by the manager
// `agents_disconnection_time` after the last keepalive: it began between that instant minus that
// time and the 504; without the time the earliest start is unknown.
// - A boot (503) dates the return exactly. The agent's first own alert (`actividad`) only says it
// was already back: an upper bound.
// - Without an observed return by the end of what was measured the outage stays open: the agent may
// have returned silently (a quiet server does not alert).
interface Span {
  desdeMin?: number;
  desdeMax: number;
  hastaMin: number;
  hastaMax?: number;
  cierre: 'arranque' | 'actividad' | 'abierta';
  inicial: string;
}

const minOf = (x: Span): number => Math.max(0, x.hastaMin - x.desdeMax);

const maxOf = (x: Span): number | undefined =>
  x.desdeMin === undefined || x.hastaMax === undefined ? undefined : x.hastaMax - x.desdeMin;

const CLOSING: Record<Span['cierre'], string> = {
  arranque: 'restablecido (arranque)',
  actividad: 'de vuelta antes de su primera alerta propia',
  abierta: 'sin vuelta observada',
};

const describeSpan = (x: Span): string => {
  const min = minOf(x);
  const max = maxOf(x);
  const amount = max === undefined ? `al menos ${duration(min)}` : min === max ? duration(min) : `entre ${duration(min)} y ${duration(max)}`;

  return `${x.inicial} ${iso(x.desdeMax)}: ${amount}, ${CLOSING[x.cierre]}`;
};

interface System {
  nombre: string;
  // With agent and readable chronology: there is a measurement, conclusive or not.
  medido: boolean;
  // Not a Wazuh agent: reported, and blocks only if no system of the test is measured.
  noAgente?: boolean;
  // No conclusive measurement: cause and reason.
  hueco?: Measurement;
  tramos: Span[];
  rto?: Rto;
  // true: the LOWER bound of an outage closed by a boot exceeds the RTO; false: the UPPER bound of
  // all fits it. No value: unknown.
  excede?: boolean;
  // The outage that proves it, if it exceeds.
  culpable?: Span;
  texto: string;
}

interface Analysis {
  prueba: Test;
  sistemas: System[];
  restauraciones: ENSNormalizedEvent[];
  fallidas: ENSNormalizedEvent[];
  cambios: ENSNormalizedEvent[];
  // What prevents concluding about the whole test: incomplete or pending measurement, or
  // availability facts lost on the way.
  huecos: Measurement[];
}

// Measured data of ONE test in the same run as its row: by start AND end, so an edited row does not
// inherit the previous window's measurement.
const sameStepEvents = (context: ENSPolicyContext, now: number, type: string, t: number, test: Test): ENSNormalizedEvent[] =>
  valid(context, type, now).filter(
    e =>
      eventTime(e) >= t - SAME_RUN_WINDOW_MS &&
      eventTime(e) <= t + HOUR_MS &&
      parseInstant(factField(e, 'prueba_inicio')) === test.inicio &&
      parseInstant(factField(e, 'prueba_fin')) === test.fin
  );

const rtoOf = (rtos: Rto[], system: string, fact: ENSNormalizedEvent): Rto | undefined =>
  rtos.find(r => r.sistema !== '*' && (equalsIgnoreCase(r.sistema, system) || (agentId(r.sistema) && agentId(r.sistema) === factId(fact)) || equalsIgnoreCase(r.sistema, factField(fact, 'agente')))) ||
  rtos.find(r => r.sistema === '*');

const MEASUREMENT: Record<string, string> = {
  parcial: 'faltan alertas de algunos días de su rango en el manager',
  sin_alertas: 'las alertas de los días de su rango ya no están en el manager',
  error: 'el recolector no pudo leer las alertas de su rango',
  no_aplica: 'el recolector no la midió',
};

// Is it one of the test's systems? By ID or exact name.
const ofTest = (e: ENSNormalizedEvent, test: Test): boolean =>
  test.sistemas.some(s => (agentId(s) !== undefined && agentId(s) === factId(e)) || equalsIgnoreCase(s, factField(e, 'agente')));

// Outage spans of a chronology, and returns without an observed prior outage (from the test start).
const spansOf = (items: Item[], test: Test, until: number): { tramos: Span[]; huerfanas: Item[] } => {
  const spans: Span[] = [];
  const orphan: Item[] = [];
  let open: { desdeMin?: number; desdeMax: number; t: number; tipo: string } | undefined;

  items.forEach(item => {
    if (OUTAGE_TYPES.includes(item.tipo)) {
      if (!open) {
        open = {
          desdeMin: item.tipo === 'parada' ? item.t : test.desconexion === undefined ? undefined : item.t - test.desconexion,
          desdeMax: item.t,
          t: item.t,
          tipo: item.tipo,
        };
      }
    } else if (open) {
      spans.push({
        desdeMin: open.desdeMin,
        desdeMax: open.desdeMax,
        hastaMin: item.tipo === 'arranque' ? item.t : open.t,
        hastaMax: item.t,
        cierre: item.tipo as Span['cierre'],
        inicial: open.tipo,
      });
      open = undefined;
    } else if (item.t >= test.inicio && item.t <= until) {
      orphan.push(item);
    }
  });

  if (open) {
    spans.push({ desdeMin: open.desdeMin, desdeMax: open.desdeMax, hastaMin: Math.max(until, open.t), cierre: 'abierta', inicial: open.tipo });
  }

  return { tramos: spans, huerfanas: orphan };
};

const analyze = (context: ENSPolicyContext, now: number, t: number, test: Test, rtos: Rto[] | undefined): Analysis => {
  const availability = oneByKey(sameStepEvents(context, now, 'availability_event_observed', t, test), factId);
  const restores = sameStepEvents(context, now, 'backup_restore_observed', t, test);
  const changes = sameStepEvents(context, now, 'post_test_change_observed', t, test);
  // Only an EXPLICIT failure, and only if it belongs to the test: in its window or of one of its
  // systems.
  const failed = restores.filter(e => {
    const when = parseInstant(factField(e, 'instante')) ?? eventTime(e);

    return (
      (factField(e, 'resultado') === 'error' || factField(e, 'coincide') === 'no') &&
      ((when >= test.inicio && when <= test.fin) || ofTest(e, test))
    );
  });
  const until = test.medidoHasta ?? test.fin;
  const complete = test.medicion === 'completa';
  // All days read of what has been measured so far (complete or still open).
  const everyDay = (complete || test.medicion === 'pendiente') && !test.diasSinAlertas.length;
  const blanks: Measurement[] = [];

  if (test.medicion === 'pendiente') {
    blanks.push(notMeasured(`La medición de la prueba ${describe(test)} sigue abierta hasta las 24 h siguientes a su fin (leída hasta ${iso(until)}): todavía no es concluyente.`));
  } else if (complete && test.diasSinAlertas.length) {
    // Contradictory: «complete» but with days without alerts read. An outage in those days would
    // not have been seen, so it cannot be CUMPLE.
    blanks.push(
      notMeasured(
        `La medición de la prueba ${describe(test)} se declara completa, pero hay días sin alertas leídas (${test.diasSinAlertas.join(', ')}): una caída de esos días no se habría visto.`,
        'COLLECTION'
      )
    );
  } else if (!complete) {
    blanks.push(
      notMeasured(
        `La medición de la prueba ${describe(test)} está incompleta (${test.medicion || 'sin dato'}: ${MEASUREMENT[test.medicion] || 'estado desconocido'}${
          test.diasSinAlertas.length ? `; días sin alertas: ${test.diasSinAlertas.join(', ')}` : ''
        }).`,
        'COLLECTION'
      )
    );
  }

  // A system without fact is «not an agent» only if all the candidates the collector says it
  // emitted arrived.
  const lost = test.candidatos === undefined ? undefined : Math.max(0, test.candidatos - availability.length);

  if (lost === undefined) {
    blanks.push(notMeasured(`La fila de la prueba ${describe(test)} no dice cuántos agentes candidatos midió el recolector (candidatos): no se distingue un hecho perdido de un sistema que no es agente.`, 'COLLECTION'));
  } else if (lost > 0) {
    blanks.push(
      notMeasured(
        `De los ${test.candidatos} hechos de disponibilidad que el recolector emitió para la prueba ${describe(test)} solo han llegado ${availability.length}: faltan ${lost}.`,
        'COLLECTION'
      )
    );
  }

  const systems: System[] = test.sistemas.map(system => {
    const r = resolves(system, availability);
    const withoutMeasurement: System = { nombre: system, medido: false, tramos: [], texto: '' };

    if (r.tipo === 'ambiguo') {
      return {
        ...withoutMeasurement,
        hueco: notMeasured(`«${system}» casa con ${r.ids.length} agentes (${r.ids.join(', ')}): no se elige uno. Decláralo por su ID en el registro.`, 'CONFIGURATION'),
        texto: `${system}: ambiguo`,
      };
    }

    if (r.tipo === 'ninguno') {
      return {
        ...withoutMeasurement,
        noAgente: true,
        hueco: notMeasured(`«${system}» no es un agente de Wazuh en el manager: su disponibilidad durante la prueba no se puede medir.`),
        texto: `${system}: no es un agente de Wazuh, sin medida`,
      };
    }

    const e = r.hecho;
    const name = nameOf(system, e);
    const items = timeline(factField(e, 'eventos'));
    const total = parseNumber(factField(e, 'eventos_total'));
    const own = parseNumber(factField(e, 'alertas_propias'));

    if (!items) {
      return { ...withoutMeasurement, nombre: name, hueco: notMeasured(`${name}: el recolector emitió una cronología que no se puede leer («${factField(e, 'eventos')}»).`, 'COLLECTION'), texto: `${name}: cronología ilegible` };
    }

    const { tramos: all, huerfanas: orphan } = spansOf(items, test, until);
    // Sure: began at the latest by its end and was still down at its start. Possible: may have
    // begun in its window or stayed down in it.
    const safe = all.filter(x => x.desdeMax <= test.fin && x.hastaMin >= test.inicio);
    const possible = all.filter(x => (x.desdeMin ?? -Infinity) <= test.fin && (x.hastaMax ?? Infinity) >= test.inicio);
    const rto = rtos ? rtoOf(rtos, system, e) : undefined;
    // Without `eventos_total` it is unknown whether the chronology arrived whole: not taken as
    // whole.
    const withoutTotal = total === undefined;
    const truncated = withoutTotal || (total as number) > items.length;
    const text = `${name}: ${
      possible.length ? `${possible.length} caída(s): ${possible.map(describeSpan).join('; ')}` : `sin caídas observadas${own !== undefined ? ` (${own} alertas propias en el rango)` : ''}`
    }${rto ? ` (${rto.texto})` : ''}`;
    const base: System = { nombre: name, medido: true, tramos: possible, rto, texto: text };

    if (!rtos) {
      return base;
    }

    if (!rto) {
      return { ...base, hueco: notMeasured(`${parameterDisplayName(context, 'P-07')} no declara el RTO de «${system}» ni uno general (*): no hay contra qué juzgar su indisponibilidad.`, 'CONFIGURATION') };
    }

    // NO_CUMPLE only with the LOWER bound of an outage closed by a boot, with all days read and the
    // chronology whole: a missing day could split a long outage into two short ones.
    const culprit = safe
      .filter(x => x.cierre === 'arranque' && minOf(x) > rto.limite)
      .sort((a, b) => minOf(b) - minOf(a))[0];

    if (culprit && everyDay && !truncated) {
      return { ...base, excede: true, culpable: culprit };
    }

    if (orphan.length) {
      return {
        ...base,
        hueco: notMeasured(
          `${name}: volvió (${orphan.map(x => `${x.tipo} ${iso(x.t)}`).join(', ')}) sin ninguna caída observada antes: no se sabe cuándo empezó a no estar disponible.`
        ),
      };
    }

    if (truncated) {
      return {
        ...base,
        hueco: notMeasured(
          withoutTotal
            ? `${name}: la fila no dice cuántos eventos tiene su cronología (eventos_total): no se puede afirmar que llegó entera ni que no hubo una caída más larga.`
            : `${name}: la cronología llegó truncada (${items.length} de ${total} eventos): no se puede afirmar que no hubo una caída más larga.`,
          'COLLECTION'
        ),
      };
    }

    if (!complete) {
      // The test's gap says it.
      return base;
    }

    if (!possible.length) {
      if (own === undefined) {
        return { ...base, hueco: notMeasured(`${name}: el recolector no dice cuántas alertas propias envió en el rango (alertas_propias).`, 'COLLECTION') };
      }

      if (own === 0) {
        return {
          ...base,
          hueco: notMeasured(`${name}: sin caídas observadas, pero tampoco envió ninguna alerta propia en todo el rango medido: no se puede afirmar que estuviera en marcha.`),
        };
      }

      return { ...base, excede: false };
    }

    const max = possible.map(maxOf);

    if (max.some(x => x === undefined)) {
      const open = possible.find(x => x.cierre === 'abierta');

      return {
        ...base,
        hueco: open
          ? notMeasured(`${name}: no se observó su vuelta (ni un arranque ni ninguna alerta propia) hasta ${iso(until)}: no se puede afirmar ni negar que se restableciera dentro de su ${rto.texto}.`)
          : notMeasured(
              `${name}: la fila de la prueba no trae agents_disconnection_time del manager, así que no se sabe cuánto antes de la desconexión (504) empezó la caída.`,
              'COLLECTION'
            ),
      };
    }

    const worstCase = Math.max(...(max as number[]));

    if (worstCase <= rto.limite) {
      return { ...base, excede: false };
    }

    return {
      ...base,
      hueco: notMeasured(`${name}: su caída más larga duró entre ${duration(Math.max(...possible.map(minOf)))} y ${duration(worstCase)}, y su ${rto.texto} cae dentro: no se puede afirmar ni negar.`),
    };
  });

  return { prueba: test, sistemas: systems, restauraciones: restores, fallidas: failed, cambios: changes, huecos: blanks };
};

const describeRestore = (e: ENSNormalizedEvent): string =>
  `${factField(e, 'agente') || '-'} (${factId(e) || '-'}) ${factField(e, 'instante') || iso(eventTime(e))}: ${factField(e, 'resultado') || '-'}${factField(e, 'coincide') === 'no' ? ', el contenido no coincide' : ''}`;

// What the test revealed by measurement: an exceeded RTO or a failed restore. EV-05 requires it to
// be recorded as a deficiency.
const reveals = (a: Analysis): string[] => [
  ...a.sistemas.filter(s => s.excede === true).map(s => `${s.nombre} por encima de su ${s.rto?.texto}`),
  ...a.fallidas.map(e => `restauración fallida en ${describeRestore(e)}`),
];

// Judgment of ONE test: declared against measured.
const judgesTest = (a: Analysis): Measurement => {
  const p = a.prueba;
  const title = `Prueba ${describe(p)}, declarada ${p.resultado || '-'}`;
  const exceeded = a.sistemas.filter(s => s.excede === true);
  const satisfactory = p.resultado === 'satisfactorio';
  const measuredText = a.sistemas.map(s => s.texto).join('; ');
  const pieces: Measurement[] = [];

  if (satisfactory && exceeded.length) {
    pieces.push(
      nonCompliant(
        `${title}, y la medida la desmiente: ${exceeded
          .map(s => {
            const x = s.culpable as Span;
            const exact = maxOf(x) === minOf(x);

            return `${s.nombre} estuvo ${exact ? '' : 'al menos '}${duration(minOf(x))} sin servicio (${x.inicial} ${iso(x.desdeMax)} → arranque ${iso(x.hastaMin)}), por encima de su ${s.rto?.texto}`;
          })
          .join('; ')}.`
      )
    );
  }

  if (satisfactory && a.fallidas.length) {
    pieces.push(nonCompliant(`${title}, y en su ventana falló la restauración de copias: ${formatList(a.fallidas.map(describeRestore))}.`));
  }

  if (pieces.length) {
    // A measured discrepancy wins over what could not be measured.
    return combineMeasurements(pieces);
  }

  pieces.push(...a.huecos);

  // Systems that are not agents are reported; they block only if none of the test is measured.
  const measuredSystems = a.sistemas.filter(s => s.medido);
  const notAgents = a.sistemas.filter(s => s.noAgente);

  a.sistemas.filter(s => s.hueco && !s.noAgente).forEach(s => pieces.push(s.hueco as Measurement));

  if (!measuredSystems.length && notAgents.length) {
    pieces.push(notMeasured(`${title}: ninguno de sus sistemas (${formatList(notAgents.map(s => s.nombre))}) es un agente de Wazuh, así que su resultado no se puede contrastar con lo medido.`));
  }

  if (pieces.length) {
    return combineMeasurements(pieces);
  }

  const notAgentsNote = notAgents.length && measuredSystems.length ? ` Sin medida, porque no son agentes de Wazuh: ${formatList(notAgents.map(s => s.nombre))}.` : '';

  return compliant(
    `${
      satisfactory
        ? `${title}, y lo medido lo confirma: ${measuredText}.`
        : exceeded.length || a.fallidas.length
        ? `${title}, y lo medido es coherente con lo declarado: ${measuredText}${a.fallidas.length ? `; restauraciones fallidas: ${formatList(a.fallidas.map(describeRestore))}` : ''}. Lo que la prueba reveló se juzga en EV-05.`
        : `${title}; lo medido no muestra ningún objetivo incumplido: ${measuredText}.`
    }${notAgentsNote}`
  );
};

// Tests whose result is contrasted: the parcial and simulacro ones that ended in the P-01 period
// before the read; with none in the period, the last (EV-02 judges periodicity). Without P-01, the
// last.
const ofPeriod = (b: BaseTests, months: number | undefined): Test[] => {
  const real = b.hechas.filter(p => EXERCISE_TYPES.includes(p.tipo));

  if (months !== undefined) {
    const since = sumMonths(b.reg.t, -months);
    const inPeriod = real.filter(p => p.inicio >= since);

    if (inPeriod.length) {
      return inPeriod;
    }
  }

  return real.slice(-1);
};

interface Measurements {
  base: BaseTests | Measurement;
  analisis: Analysis[];
  sinSistemas: Test[];
  rtos?: Rto[];
  reparoRto?: Measurement;
  faltaRto?: Measurement;
}

const measurements = (context: ENSPolicyContext, now: number, evidence: string): Measurements => {
  const base = baseTests(context, now, evidence);

  if (isMeasurement(base)) {
    return { base, analisis: [], sinSistemas: [] };
  }

  const p01 = positiveScalar(context, 'P-01');
  const judged = ofPeriod(base, p01 !== undefined && Number.isInteger(p01) ? p01 : undefined);
  const p07 = rtosP07(context);
  const rtos = isMeasurement(p07) ? undefined : p07.rtos;

  return {
    base,
    analisis: judged.filter(p => p.sistemas.length).map(p => analyze(context, now, base.reg.t, p, rtos)),
    sinSistemas: judged.filter(p => !p.sistemas.length),
    rtos,
    reparoRto: isMeasurement(p07) ? undefined : p07.reparo,
    faltaRto: isMeasurement(p07) ? p07 : undefined,
  };
};

const ev04 = (context: ENSPolicyContext, now: number, m: Measurements): Measurement => {
  if (isMeasurement(m.base)) {
    return m.base;
  }

  const pieces: Measurement[] = [...m.base.reparos];

  if (m.faltaRto) {
    pieces.push(m.faltaRto);
  }

  if (m.reparoRto) {
    pieces.push(m.reparoRto);
  }

  if (!m.analisis.length && !m.sinSistemas.length) {
    pieces.push(notMeasured('No consta ninguna prueba parcial ni simulacro realizado: no hay ningún resultado que contrastar con lo medido (lo juzga EV-01).'));

    return combineMeasurements(pieces);
  }

  m.analisis.forEach(a => pieces.push(judgesTest(a)));

  // A test exercising alternative means without declaring systems does not escape the contrast: its
  // result cannot be proven.
  m.sinSistemas.forEach(p =>
    pieces.push(notMeasured(`La prueba ${describe(p)}, declarada ${p.resultado || '-'}, no declara ningún sistema: su resultado no se puede contrastar con lo que pasó en los sistemas.`))
  );

  return combineMeasurements(pieces);
};


interface Deficiency {
  id: string;
  linea: string;
  prueba: number;
  pruebaTexto: string;
  situacion: string;
  vence?: number;
  plazo: string;
  cierre: string;
  versionPlan: string;
  responsable: string;
  // Declared closed without a valid, already happened closing: judged open.
  nota: string;
}

// Rows of the deficiency record, one per `deficiencia_id`. A `cerrada` without closing date, or
// with one after the read, is not closed: judged open and reported.
const deficienciesOf = (reg: LogRow): { lista: Deficiency[]; malas: string[]; recibidas: number } => {
  const output: Deficiency[] = [];
  const bad: string[] = [];
  const unique = oneByKey(reg.filas, e => factField(e, 'deficiencia_id'));

  unique.forEach(e => {
    const test = parseInstant(factField(e, 'prueba_inicio'));
    const declared = factField(e, 'situacion');
    const expires = expiry(factField(e, 'plazo'));
    const id = factField(e, 'deficiencia_id');
    const closing = expiry(factField(e, 'cierre'));

    if (!id || test === undefined || !['abierta', 'cerrada'].includes(declared) || expires === undefined) {
      bad.push(`línea ${factField(e, 'linea') || '?'} (${id || 'sin id'})`);

      return;
    }

    // `vencimiento` gives the END of the day: the closing happened at the start of that day.
    const trulyClosed = declared === 'cerrada' && closing !== undefined && closing - DAY_MS <= reg.t;
    const situation = declared === 'cerrada' && !trulyClosed ? 'abierta' : declared;

    output.push({
      id,
      linea: factField(e, 'linea'),
      prueba: test,
      pruebaTexto: factField(e, 'prueba_inicio'),
      situacion: situation,
      nota:
        declared !== situation
          ? ` (declarada cerrada ${closing === undefined ? 'sin fecha de cierre' : `con cierre el ${factField(e, 'cierre')}, posterior a la lectura`}: se juzga abierta)`
          : '',
      vence: expires,
      plazo: factField(e, 'plazo'),
      cierre: factField(e, 'cierre'),
      versionPlan: factField(e, 'version_plan'),
      responsable: factField(e, 'responsable'),
    });
  });

  return { lista: output, malas: bad, recibidas: unique.length };
};

interface BaseDeficiencies {
  reg: LogRow;
  deficiencias: Deficiency[];
  reparos: Measurement[];
  incompleto?: Measurement;
}

const baseDeficiencies = (context: ENSPolicyContext, now: number, evidence: string): BaseDeficiencies | Measurement => {
  const p05 = declaresRecord(context, 'P-05', DEFICIENCY_RECORD, 'las deficiencias', '/etc/power-ens/continuity-deficiency-register.tsv');

  if (p05) {
    return p05;
  }

  const reg = readsRecord(
    context,
    now,
    evidence,
    'continuity_deficiency_register_read',
    'continuity_deficiency_recorded',
    'deficiencias',
    '/etc/power-ens/continuity-deficiency-register.tsv'
  );

  if (isMeasurement(reg)) {
    return reg;
  }

  const { lista: deficiencies, malas: bad, recibidas: received } = deficienciesOf(reg);
  const objections = [
    discardedRows(reg, 'deficiencias'),
    lostRows(reg, received, 'deficiencias'),
    unreadableRows(bad, 'deficiencias'),
  ].filter((m): m is Measurement => Boolean(m));

  return { reg, deficiencias: deficiencies, reparos: objections, ...(objections.length ? { incompleto: combineMeasurements(objections) } : {}) };
};

const ev05 = (context: ENSPolicyContext, now: number, m: Measurements): Measurement => {
  const d = baseDeficiencies(context, now, 'EV-05');

  if (isMeasurement(d)) {
    return d;
  }

  const t = d.reg.t;
  const pieces: Measurement[] = [...d.reparos];
  const open = d.deficiencias.filter(x => x.situacion === 'abierta');
  const closed = d.deficiencias.filter(x => x.situacion === 'cerrada');

  // Past deadline, at the instant the record was read.
  const expired = open.filter(x => (x.vence as number) <= t);

  if (expired.length) {
    pieces.push(
      nonCompliant(
        `Deficiencias abiertas fuera de plazo a ${date(t)}: ${formatList(expired.map(x => `${x.id} (prueba del ${date(x.prueba)}, plazo ${x.plazo}, ${x.responsable || 'sin responsable'})${x.nota}`))}. Probar sin corregir no cumple.`
      )
    );
  }

  // What the test record needs: the next test and what each test declares. Without it that part
  // stays unmeasured with ITS cause.
  const b = baseTests(context, now, 'EV-05');

  if (isMeasurement(b)) {
    pieces.push(b);
  } else {
    // What prevents accepting the test record also prevents accepting the correction: the next test
    // or what each test declares may be in the missing row.
    pieces.push(...b.reparos);

    const done = b.hechas;
    // «The next test» is the next of the SAME scenario (or type, if the origin has no scenario): a
    // later test of something else need not correct it. Its deadline covers the rest.
    const nextOf = (x: Deficiency): Test | undefined => {
      const origin = b.pruebas.find(p => p.inicio === x.prueba);

      return origin
        ? done.find(
            p =>
              p.inicio > origin.inicio &&
              p.fin <= t &&
              (isEmptyField(origin.escenario) ? p.tipo === origin.tipo : normalizes(p.escenario) === normalizes(origin.escenario))
          )
        : undefined;
    };
    const alive = open.map(x => ({ x, siguiente: nextOf(x) })).filter(v => v.siguiente);

    if (alive.length) {
      pieces.push(
        nonCompliant(
          `Deficiencias que siguen abiertas después de la prueba siguiente: ${formatList(alive.map(v => `${v.x.id} (de la prueba del ${date(v.x.prueba)}; la siguiente fue ${describe(v.siguiente as Test)})`))}. Es la señal de que el ciclo de mejora no se cierra.`
        )
      );
    }

    const orphan = d.deficiencias.filter(x => !b.pruebas.some(p => p.inicio === x.prueba));
    const describeOrphan = (x: Deficiency): string => `${x.id} (${x.pruebaTexto}, línea ${x.linea || '?'})`;
    // Its test arrived, but in a row that cannot be interpreted: COLLECTION.
    const inUnreadableRow = orphan.filter(x => b.inicioIlegibles.includes(x.prueba));
    const withoutTest = orphan.filter(x => !b.inicioIlegibles.includes(x.prueba));

    if (inUnreadableRow.length) {
      pieces.push(
        notMeasured(
          `Deficiencias cuya prueba está en una fila del registro de pruebas que no se puede interpretar: ${formatList(inUnreadableRow.map(describeOrphan))}. Sin su prueba no se sabe cuál es la siguiente.`,
          'COLLECTION'
        )
      );
    }

    if (withoutTest.length) {
      // Why its test may be missing without the record's writer being wrong: unknown rows read or
      // discarded by the collector, or rows it read are missing.
      const byCollection =
        b.reg.declaradas === undefined
          ? 'La lectura del registro de pruebas no dice cuántas filas leyó el recolector, así que no se puede comprobar que hayan llegado todas, y su prueba puede ser una de las que faltan.'
          : b.faltanFilas
          ? 'Al registro de pruebas le faltan filas que el recolector leyó, y su prueba puede ser una de ellas.'
          : b.reg.invalidas === undefined
          ? 'La lectura del registro de pruebas no dice cuántas filas descartó el recolector, y su prueba puede estar en una de ellas.'
          : undefined;

      pieces.push(
        byCollection
          ? notMeasured(
              `Deficiencias cuyo prueba_inicio no es el inicio de ninguna prueba recibida: ${formatList(withoutTest.map(describeOrphan))}. ${byCollection}`,
              'COLLECTION'
            )
          : notMeasured(
              `Deficiencias cuyo prueba_inicio no es el inicio de ninguna prueba del registro: ${formatList(withoutTest.map(describeOrphan))}. Copia en prueba_inicio el inicio exacto de su prueba${
                b.reg.invalidas ? ', o corrige su fila si es una de las descartadas del registro de pruebas' : ''
              }.`,
              'CONFIGURATION'
            )
      );
    }

    const p01 = positiveScalar(context, 'P-01');
    const months = p01 !== undefined && Number.isInteger(p01) ? p01 : undefined;
    const since = months !== undefined ? sumMonths(t, -months) : -Infinity;
    const withoutFollow = done
      .filter(p => p.inicio >= since && (p.deficiencias || 0) > 0)
      .map(p => ({ p, seguidas: d.deficiencias.filter(x => x.prueba === p.inicio).length }))
      .filter(v => v.seguidas < (v.p.deficiencias as number));

    // An absence in the deficiency record: with lost or discarded rows it is not asserted.
    if (withoutFollow.length) {
      pieces.push(
        byAbsence(
          nonCompliant(
            `Pruebas${months !== undefined ? ` del periodo de P-01 (${months} meses)` : ''} que declaran más deficiencias de las que el registro sigue: ${formatList(withoutFollow.map(v => `${describe(v.p)}: declara ${v.p.deficiencias}, en seguimiento ${v.seguidas}`))}. Una deficiencia localizada y no registrada no se corrige.`
          ),
          d.incompleto
        )
      );
    }

    // The duty to correct is not dodged by declaring zero: a test of the period declared parcial or
    // failed, or whose measurement exceeded an RTO or had a failed restore, with no deficiency
    // declared or in follow-up, has not corrected what it revealed.
    const revealed = done
      .filter(p => p.inicio >= since && (p.deficiencias || 0) === 0 && !d.deficiencias.some(x => x.prueba === p.inicio))
      .map(p => {
        const a = m.analisis.find(x => x.prueba.inicio === p.inicio);
        const subject = [...(p.resultado !== 'satisfactorio' ? [`declarada ${p.resultado}`] : []), ...(a ? reveals(a) : [])];

        return { p, que: subject };
      })
      .filter(v => v.que.length);

    if (revealed.length) {
      pieces.push(
        byAbsence(
          nonCompliant(
            `Pruebas que revelaron algo que corregir y no tienen ninguna deficiencia, ni declarada ni en seguimiento: ${formatList(revealed.map(v => `${describe(v.p)} (${v.que.join('; ')})`))}. Localizar sin corregir no cumple.`
          ),
          d.incompleto
        )
      );
    }
  }

  if (!pieces.some(x => x.estado !== 'CUMPLE')) {
    const late = closed.filter(x => {
      const c = expiry(x.cierre);

      return c !== undefined && x.vence !== undefined && c > x.vence;
    });

    pieces.push(
      compliant(
        d.deficiencias.length
          ? `${d.deficiencias.length} deficiencia(s) en seguimiento a ${date(t)}: ${closed.length} cerrada(s)${late.length ? ` (${late.length} fuera de su plazo: ${formatList(late.map(x => x.id))})` : ''} y ${open.length} abierta(s) dentro de plazo${open.length ? ` (${formatList(open.map(x => `${x.id} hasta ${x.plazo}`))})` : ''}.`
          : `El registro de deficiencias está leído (${date(t)}) y vacío, y ninguna prueba del periodo declara deficiencias: no hay nada que corregir.`
      )
    );
  }

  return combineMeasurements(pieces);
};


const DATA = 'Dato del informe, sin veredicto propio';

const report = (motive: string): string => `${DATA}: ${motive}`;

const ev03Report = (m: Measurements): string => {
  if (isMeasurement(m.base)) {
    return report(`no hay medida, porque ${m.base.motivo.charAt(0).toLowerCase()}${m.base.motivo.slice(1)}`);
  }

  if (!m.analisis.length) {
    return report('ninguna prueba parcial ni simulacro del periodo declara sistemas que medir.');
  }

  return report(
    `alimenta EV-04. ${m.analisis
      .map(a => `${describe(a.prueba)} (medición ${a.prueba.medicion || 'sin dato'}): ${a.sistemas.map(s => s.texto).join('; ') || 'sin sistemas'}`)
      .join(' | ')}. La ventana es la real de cada fila del registro, no la prevista en P-06.`
  );
};

const ev08Report = (m: Measurements): string => {
  if (isMeasurement(m.base)) {
    return report(`no hay medida, porque ${m.base.motivo.charAt(0).toLowerCase()}${m.base.motivo.slice(1)}`);
  }

  if (!m.analisis.length) {
    return report('ninguna prueba parcial ni simulacro del periodo con sistemas.');
  }

  const withRestores = m.analisis.filter(a => a.restauraciones.length);
  const without = m.analisis.filter(a => !a.restauraciones.length);

  return report(
    `alimenta EV-04. ${withRestores.length ? `Restauraciones de mp.info.6 en la ventana: ${withRestores.map(a => `${describe(a.prueba)}: ${formatList(a.restauraciones.map(describeRestore))}`).join(' | ')}.` : 'Ninguna prueba del periodo incluyó una restauración de copias de mp.info.6.'}${
      withRestores.length && without.length ? ` Sin restauración: ${formatList(without.map(a => describe(a.prueba)))}.` : ''
    }`
  );
};

const ev06Report = (context: ENSPolicyContext, now: number, m: Measurements): string => {
  if (isMeasurement(m.base)) {
    return report(`no hay medida, porque ${m.base.motivo.charAt(0).toLowerCase()}${m.base.motivo.slice(1)}`);
  }

  const withChanges = m.analisis.filter(a => a.cambios.length);

  if (!withChanges.length) {
    return report(
      m.analisis.length
        ? `sin cambios de FIM en los sistemas de ${formatList(m.analisis.map(a => describe(a.prueba)))} en las 24 h siguientes a su ventana.`
        : 'ninguna prueba parcial ni simulacro del periodo con sistemas.'
    );
  }

  const d = baseDeficiencies(context, now, 'EV-06');
  const recorded = (p: Test): string =>
    isMeasurement(d) ? '' : ` (${d.deficiencias.filter(x => x.prueba === p.inicio).length} deficiencia(s) registradas de esa prueba)`;

  return report(
    `cambios de FIM en las 24 h siguientes a la ventana, que deberían constar como deficiencia si la prueba los dejó: ${withChanges
      .map(
        a =>
          `${describe(a.prueba)}${recorded(a.prueba)}: ${a.cambios
            .map(e => `${factField(e, 'agente')} (${factId(e)}) ${factField(e, 'cambios')} cambio(s) entre ${factField(e, 'primera')} y ${factField(e, 'ultima')}${isEmptyField(factField(e, 'rutas')) ? '' : `, ${factField(e, 'rutas')}`}`)
            .join('; ')}`
      )
      .join(' | ')}.`
  );
};

const ev07Report = (context: ENSPolicyContext, now: number): string => {
  const d = baseDeficiencies(context, now, 'EV-07');

  if (isMeasurement(d)) {
    return report(`no hay medida, porque ${d.motivo.charAt(0).toLowerCase()}${d.motivo.slice(1)}`);
  }

  const closed = d.deficiencias.filter(x => x.situacion === 'cerrada');
  const withVersion = closed.filter(x => !isEmptyField(x.versionPlan));
  const nominal = closed.filter(x => isEmptyField(x.versionPlan));

  if (!closed.length) {
    return report('ninguna deficiencia cerrada todavía.');
  }

  return report(
    `${withVersion.length ? `cerradas con el plan actualizado: ${formatList(withVersion.map(x => `${x.id} → versión ${x.versionPlan}`))}.` : ''}${
      nominal.length
        ? ` Cerradas sin versión del plan, corrección posiblemente nominal: ${formatList(nominal.map(x => x.id))}. No toda corrección cambia el plan; la versión vigente es la de op.cont.2.`
        : ''
    }`.trim()
  );
};


const TYPE: ENSDecisionRuleType = 'MAX_AGE';
const PARAMETERS = ['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-07'];
const JUDGED_EVIDENCES = ['EV-01', 'EV-02', 'EV-04', 'EV-05'];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const applies = Boolean(
    context.control.requirements.find(r => r.id === REQUIREMENT)?.applicability.levels.includes(context.level)
  );

  if (!applies) {
    return { decisions: [], runtimeVariables: [] };
  }

  const m = measurements(context, now, 'EV-04');
  const own: { id: string; medida: Measurement }[] = [
    { id: 'EV-01', medida: ev01(context, now) },
    { id: 'EV-02', medida: ev02(context, now) },
    { id: 'EV-04', medida: ev04(context, now, m) },
    { id: 'EV-05', medida: ev05(context, now, m) },
  ];
  const status = worstStatus(own.map(p => p.medida));
  const owners = own.filter(p => p.medida.estado === status);

  // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads).
  const decisiones = [
    withReasonParts(decide(
      REQUIREMENT,
      status,
      owners.map(p => p.id),
      PARAMETERS,
      TYPE,
      REQUIREMENT,
      compositeReason(own),
      JUDGED_EVIDENCES.map(id => `${id} CUMPLE`).join(' y '),
      commonGapCause(owners.map(p => p.medida))
    ), reasonPartsOf(own)),
    // One per evidence, with ITS status.
    ...own.map(p =>
      decide(REQUIREMENT, p.medida.estado, [p.id], PARAMETERS, TYPE, `${REQUIREMENT}/${p.id}`, p.medida.motivo, `${p.id} CUMPLE`, p.medida.causa)
    ),
  ];

  const informational: [string, string][] = [
    ['EV-03', ev03Report(m)],
    ['EV-06', ev06Report(context, now, m)],
    ['EV-07', ev07Report(context, now)],
    ['EV-08', ev08Report(m)],
  ];

  informational.forEach(([id, motive]) =>
    decisiones.push(decide(REQUIREMENT, 'NO_APLICA', [id], PARAMETERS, TYPE, `${REQUIREMENT}/${id}`, motive, 'dato del informe'))
  );

  const variables: ENSRuntimeVariable[] = [
    ...own.map(p => ({
      name: `medida_${p.id.replace('-', '')}`,
      value: p.medida.estado,
      parameterIds: [],
      evidenceIds: [p.id],
      eventIds: [],
      description: p.medida.motivo,
    })),
    ...informational.map(([id, motive]) => ({
      name: `informe_${id.replace('-', '')}`,
      value: 'NO_APLICA',
      parameterIds: [],
      evidenceIds: [id],
      eventIds: [],
      description: motive,
    })),
  ];

  return { decisions: decisiones, runtimeVariables: variables };
};

export const opCont3PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // By Availability level: only with D at ALTO.
  requirements: [
    {
      requirementId: REQUIREMENT,
      levels: ['ALTO'],
      parameterIds: PARAMETERS,
      evidenceIds: JUDGED_EVIDENCES,
      ruleType: TYPE,
    },
  ],
};
