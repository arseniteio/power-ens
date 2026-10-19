// op.cont.2 · Continuity plan.
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import { toParameterListItems } from '../../../configuration/services/parameter-value-validator';
import {
  DAY_MS,
  compliant,
  nonCompliant,
  notMeasured,
  commonGapCause,
  worstStatus,
  combineMeasurements,
  parseNumber,
  formatList,
  wholeDays,
  stripAccents,
  isEmptyField,
  findParameter,
  parameterDisplayName,
  tableParameterRows,
  missingParameter,
  decisionBuilderFor,
} from './policy-kit';
import type { ENSDecisionRuleType, Measurement } from './policy-kit';

const CONTROL = 'op.cont.2';
const POLICY = 'policy.op.cont.2';

const decide = decisionBuilderFor(POLICY);

// Declared dates: a screen date is YYYY-MM-DD and really exists (same grammar as the validator's
// `date` column); anything else is an unreadable declaration, reported with its row.

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Instant of 00:00 UTC of that date, or nothing if it is not a real date.
const date = (text: string): number | undefined => {
  const pieces = String(text).trim().match(DATE);

  if (!pieces) {
    return undefined;
  }

  const [year, month, day] = [Number(pieces[1]), Number(pieces[2]), Number(pieces[3])];
  const t = Date.UTC(year, month - 1, day);
  const d = new Date(t);

  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? t : undefined;
};

// The date N months later on the calendar: 31/01 + 1 month is 28/02 (or 29), not 03/03.
const mostMonths = (t: number, months: number): number => {
  const d = new Date(t);
  const destination = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(destination.getUTCFullYear(), destination.getUTCMonth() + 1, 0)).getUTCDate();

  return Date.UTC(destination.getUTCFullYear(), destination.getUTCMonth(), Math.min(d.getUTCDate(), lastDay));
};

const day = (t: number): string => new Date(t).toISOString().slice(0, 10);

// An «until» date is valid the whole day: it expires when the next begins.
const isExpired = (until: number, now: number): boolean => now >= until + DAY_MS;

// Days left until the end of the «until» day, or elapsed since it expired.
const daysUntil = (until: number, now: number): number => wholeDays(until + DAY_MS - now);
const daysSince = (until: number, now: number): number => wholeDays(now - (until + DAY_MS));

// P-02 durations: a number and its unit («30 min», «4 h», «2 d», «1,5 horas»), nothing else; an RTO
// «cuanto antes» or «4» cannot be checked.
const DURATION = /^\d+([.,]\d+)?\s*(min|mins|minuto|minutos|h|hora|horas|d|dia|dias)$/;

const isDuration = (text: string): boolean => DURATION.test(stripAccents(String(text).trim()));

// People: P-03 and P-05 name the same people by hand, compared without case, accents or extra
// spaces, never by similarity.
const person = (text: string): string => stripAccents(String(text)).replace(/\s+/g, ' ').trim();

const row = (n: number): string => `fila ${n + 1}`;


// What the report knows about the plan, besides the measurement.
type Plan = { medida: Measurement; vence?: number };

const ev01 = (context: ENSPolicyContext, now: number): Plan => {
  const plans = tableParameterRows(context, 'P-01');

  if (!plans) {
    return { medida: missingParameter(context, 'P-01', 'qué plan de continuidad está aprobado') };
  }

  const value = findParameter(context, 'P-08')?.value;
  const months = value === undefined || value === null || Array.isArray(value) ? undefined : parseNumber(String(value));

  if (months === undefined || months <= 0) {
    return { medida: missingParameter(context, 'P-08', 'la vigencia del plan (cada cuántos meses se revisa)') };
  }

  if (!Number.isInteger(months)) {
    return {
      medida: notMeasured(`${parameterDisplayName(context, 'P-08')} vale ${value}: tiene que ser un número entero de meses.`, 'CONFIGURATION'),
    };
  }

  const incomplete: string[] = [];
  const unreadable: string[] = [];
  const read: { referencia: string; version: string; aprobado: number; por: string }[] = [];

  plans.forEach((p, i) => {
    if (isEmptyField(p.referencia) || isEmptyField(p.version) || isEmptyField(p.fecha_de_aprobacion)) {
      incomplete.push(`${row(i)} (${p.referencia || 'sin referencia'})`);
      return;
    }

    const approvedAt = date(p.fecha_de_aprobacion);

    if (approvedAt === undefined) {
      unreadable.push(`${row(i)} (${p.referencia}): «${p.fecha_de_aprobacion}»`);
      return;
    }

    read.push({ referencia: p.referencia, version: p.version, aprobado: approvedAt, por: p.aprobado_por || '' });
  });

  if (incomplete.length || unreadable.length) {
    return {
      medida: notMeasured(
        [
          incomplete.length ? `P-01 tiene filas sin referencia, versión o fecha de aprobación: ${formatList(incomplete)}.` : '',
          unreadable.length ? `P-01 tiene fechas de aprobación que no son una fecha AAAA-MM-DD: ${formatList(unreadable)}.` : '',
          'Sin la fecha de aprobación de cada versión no se puede medir la vigencia del plan.',
        ]
          .filter(Boolean)
          .join(' '),
        'CONFIGURATION'
      ),
    };
  }

  // The last approved version at the evaluation date counts; a later approval did not exist yet
  // (the daily series evaluates past days with today's configuration).
  const approvedRows = read.filter(p => p.aprobado <= now).sort((a, b) => b.aprobado - a.aprobado);

  if (!approvedRows.length) {
    return {
      medida: notMeasured(
        `Ninguna versión de P-01 estaba aprobada el ${day(now)}: la primera es de ${day(Math.min(...read.map(p => p.aprobado)))}.`,
        'CONFIGURATION'
      ),
    };
  }

  const last = approvedRows[0];
  const expires = mostMonths(last.aprobado, months);
  const who = last.por ? ` por ${last.por}` : '';
  const plan = `«${last.referencia}» ${last.version}, aprobado el ${day(last.aprobado)}${who}`;

  if (isExpired(expires, now)) {
    return {
      medida: nonCompliant(
        `El plan ${plan}, tenía que revisarse cada ${months} meses (P-08): venció el ${day(expires)}, hace ${daysSince(expires, now)} días. Un plan sin revisar no acredita sus contenidos.`
      ),
      vence: expires,
    };
  }

  return {
    medida: compliant(`Plan ${plan}: vigente hasta el ${day(expires)} (quedan ${daysUntil(expires, now)} días) con una revisión cada ${months} meses.`),
    vence: expires,
  };
};


const functions = (context: ENSPolicyContext): Measurement => {
  const rowsP03 = tableParameterRows(context, 'P-03');

  if (!rowsP03) {
    return missingParameter(context, 'P-03', 'qué funciones, responsables y actividades identifica el plan');
  }

  const incomplete = rowsP03
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => isEmptyField(f.funcion) || isEmptyField(f.responsable) || isEmptyField(f.actividades));

  if (incomplete.length) {
    return notMeasured(
      `P-03 tiene funciones sin responsable o sin actividades: ${formatList(incomplete.map(({ f, i }) => `${row(i)} (${f.funcion || 'sin función'})`))}. op.cont.2.1 pide identificar las tres cosas.`,
      'CONFIGURATION'
    );
  }

  return compliant(
    `P-03 identifica ${rowsP03.length} función(es), cada una con su responsable y sus actividades: ${formatList(
      rowsP03.map(f => `${f.funcion} → ${f.responsable}${isEmptyField(f.suplente) ? '' : ` (suplente ${f.suplente})`}`)
    )}.`
  );
};


const services = (context: ENSPolicyContext): Measurement => {
  const rowsP02 = tableParameterRows(context, 'P-02');

  if (!rowsP02) {
    return missingParameter(context, 'P-02', 'qué servicios esenciales tiene que garantizar la previsión ni con qué objetivos de recuperación');
  }

  const incomplete: string[] = [];
  const unreadable: string[] = [];

  rowsP02.forEach((f, i) => {
    if (isEmptyField(f.servicio) || isEmptyField(f.rto) || isEmptyField(f.rpo)) {
      incomplete.push(`${row(i)} (${f.servicio || 'sin servicio'})`);
      return;
    }

    const bad = [!isDuration(f.rto) ? `RTO «${f.rto}»` : '', !isDuration(f.rpo) ? `RPO «${f.rpo}»` : ''].filter(Boolean);

    if (bad.length) {
      unreadable.push(`${row(i)} (${f.servicio}): ${bad.join(', ')}`);
    }
  });

  if (incomplete.length || unreadable.length) {
    return notMeasured(
      [
        incomplete.length ? `P-02 tiene servicios esenciales sin RTO o sin RPO: ${formatList(incomplete)}.` : '',
        unreadable.length
          ? `P-02 tiene objetivos de recuperación que no son una duración (un número y su unidad: 30 min, 4 h, 2 d): ${formatList(unreadable)}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      'CONFIGURATION'
    );
  }

  return compliant(
    `P-02 declara ${rowsP02.length} servicio(s) esencial(es) con sus objetivos de recuperación: ${formatList(
      rowsP02.map(f => `${f.servicio} (RTO ${f.rto}, RPO ${f.rpo})`)
    )}.`
  );
};


const ev04 = (context: ENSPolicyContext, now: number): Measurement => {
  const average = tableParameterRows(context, 'P-04');

  if (!average) {
    return missingParameter(context, 'P-04', 'qué medios alternativos hay ni con qué contrato');
  }

  const withoutContract: string[] = [];
  const expiredList: string[] = [];
  // Rows that allow no claim: without name, or with contract and no readable validity date.
  const unreadable: string[] = [];
  const inForce: string[] = [];

  average.forEach((m, i) => {
    const name = m.medio;

    if (isEmptyField(m.medio)) {
      unreadable.push(`${row(i)}: sin nombre del medio`);
      return;
    }

    if (isEmptyField(m.contrato)) {
      withoutContract.push(name);
      return;
    }

    if (isEmptyField(m.vigencia)) {
      unreadable.push(`${name} (${m.contrato}): sin fecha de vigencia`);
      return;
    }

    const until = date(m.vigencia);

    if (until === undefined) {
      unreadable.push(`${name} (${m.contrato}): vigencia «${m.vigencia}», que no es una fecha AAAA-MM-DD`);
      return;
    }

    if (isExpired(until, now)) {
      expiredList.push(`${name} (${m.contrato}) venció el ${day(until)}, hace ${daysSince(until, now)} días`);
      return;
    }

    inForce.push(`${name} → ${m.contrato}${m.proveedor ? ` con ${m.proveedor}` : ''}, hasta el ${day(until)} (quedan ${daysUntil(until, now)} días)`);
  });

  const pieces: Measurement[] = [];

  if (withoutContract.length) {
    pieces.push(nonCompliant(`Medios alternativos sin acuerdo ni contrato: ${formatList(withoutContract)}. op.cont.2.3 exige que TODOS estén materializados en uno.`));
  }

  if (expiredList.length) {
    pieces.push(nonCompliant(`Contratos de medios alternativos vencidos: ${formatList(expiredList)}.`));
  }

  if (unreadable.length) {
    pieces.push(notMeasured(`P-04 no permite afirmar que estén en vigor: ${formatList(unreadable)}.`, 'CONFIGURATION'));
  }

  if (inForce.length) {
    pieces.push(compliant(`Medios alternativos con contrato en vigor: ${formatList(inForce)}.`));
  }

  return combineMeasurements(pieces);
};


const ev06 = (context: ENSPolicyContext, now: number): Measurement => {
  const rowsP03 = tableParameterRows(context, 'P-03');

  if (!rowsP03) {
    return missingParameter(context, 'P-03', 'quién tiene función en el plan y, por tanto, quién tiene que estar formado');
  }

  // Each person once, with the name as first written.
  const people = new Map<string, string>();

  rowsP03.forEach(f =>
    [f.responsable, f.suplente].forEach(name => {
      if (!isEmptyField(name) && !people.has(person(name))) {
        people.set(person(name), name);
      }
    })
  );

  if (!people.size) {
    return notMeasured('P-03 no nombra a ninguna persona (responsable o suplente): no se sabe quién tiene que estar formado.', 'CONFIGURATION');
  }

  const training = tableParameterRows(context, 'P-05');

  if (!training) {
    return missingParameter(context, 'P-05', 'qué formación ha recibido cada persona del plan');
  }

  // Unreadable rows are kept with their person: an unreadable row may be exactly someone's current
  // training, so that person is not «untrained» but unproven. Rows naming nobody go apart.
  const withoutReadByPerson = new Map<string, string[]>();
  const withoutReadWithoutPerson: string[] = [];
  const byPerson = new Map<string, { formacion: string; desde?: number; hasta: number }[]>();

  training.forEach((f, i) => {
    const withoutRead = (motive: string): void => {
      if (isEmptyField(f.persona)) {
        withoutReadWithoutPerson.push(`${row(i)}: ${motive}`);
        return;
      }

      const key = person(f.persona);

      withoutReadByPerson.set(key, [...(withoutReadByPerson.get(key) || []), `${row(i)} (${f.persona}): ${motive}`]);
    };

    if (isEmptyField(f.persona) || isEmptyField(f.formacion) || isEmptyField(f.vigencia)) {
      withoutRead('sin persona, formación o vigencia');
      return;
    }

    const until = date(f.vigencia);
    const since = isEmptyField(f.fecha) ? undefined : date(f.fecha);

    if (until === undefined || (!isEmptyField(f.fecha) && since === undefined)) {
      withoutRead(`${until === undefined ? `vigencia «${f.vigencia}»` : `fecha «${f.fecha}»`}, que no es una fecha AAAA-MM-DD`);
      return;
    }

    const key = person(f.persona);

    byPerson.set(key, [...(byPerson.get(key) || []), { formacion: f.formacion, desde: since, hasta: until }]);
  });

  const withoutTraining: string[] = [];
  const lapsedList: string[] = [];
  const formed: string[] = [];
  // People without readable current training and with some unreadable row: unproven, never
  // NO_CUMPLE.
  const withoutProve: string[] = [];

  people.forEach((name, key) => {
    const their = byPerson.get(key) || [];
    const withoutRead = withoutReadByPerson.get(key) || [];

    // Training already received and still valid at the evaluation date counts.
    const current = their
      .filter(s => (s.desde === undefined || s.desde <= now) && !isExpired(s.hasta, now))
      .sort((a, b) => b.hasta - a.hasta)[0];

    if (current) {
      formed.push(`${name} (${current.formacion}, hasta el ${day(current.hasta)})`);
      return;
    }

    if (withoutRead.length) {
      withoutProve.push(...withoutRead);
      return;
    }

    if (!their.length) {
      withoutTraining.push(name);
      return;
    }

    const last = [...their].sort((a, b) => b.hasta - a.hasta)[0];

    lapsedList.push(
      last.desde !== undefined && last.desde > now
        ? `${name} (${last.formacion}, recibida el ${day(last.desde)}, después de la fecha de la evaluación)`
        : `${name} (${last.formacion}, venció el ${day(last.hasta)}, hace ${daysSince(last.hasta, now)} días)`
    );
  });

  const pieces: Measurement[] = [];

  if (withoutTraining.length) {
    pieces.push(nonCompliant(`Personas con función en el plan (P-03) sin formación registrada en P-05: ${formatList(withoutTraining)}.`));
  }

  if (lapsedList.length) {
    pieces.push(nonCompliant(`Personas del plan sin formación vigente: ${formatList(lapsedList)}.`));
  }

  if (withoutProve.length) {
    pieces.push(
      notMeasured(`Personas del plan cuya formación vigente no se puede leer en P-05: ${formatList(withoutProve)}.`, 'CONFIGURATION')
    );
  }

  // Other unreadable rows (of someone already trained, not in P-03, or without person) are also
  // reported: the screen rejects the table anyway.
  const other = [
    ...withoutReadWithoutPerson,
    ...Array.from(withoutReadByPerson.values())
      .reduce<string[]>((all, rowsOf) => all.concat(rowsOf), [])
      .filter(description => !withoutProve.includes(description)),
  ];

  if (other.length) {
    pieces.push(notMeasured(`P-05 tiene filas que no se pueden leer: ${formatList(other)}.`, 'CONFIGURATION'));
  }

  if (formed.length) {
    const outside = Array.from(byPerson.keys()).filter(key => !people.has(key));

    pieces.push(
      compliant(
        `Las ${formed.length} persona(s) del plan con formación vigente: ${formatList(formed)}.${
          outside.length ? ` P-05 registra además a ${outside.length} persona(s) sin función en P-03, que no cuentan.` : ''
        }`
      )
    );
  }

  return combineMeasurements(pieces);
};


const integration = (context: ENSPolicyContext): Measurement => {
  const plans = toParameterListItems(findParameter(context, 'P-06')?.value);

  if (!plans.length) {
    return missingParameter(context, 'P-06', 'con qué planes de la organización se integra el de continuidad');
  }

  return compliant(
    `P-06 declara ${plans.length} plan(es) de la organización con los que se integra: ${formatList(plans)}. Que la integración sea «armónica» es revisión documental.`
  );
};


const REPORT_DATA: Record<string, { requisito: string; parametros: string[]; motivo: string }> = {
  'EV-02': {
    requisito: 'op.cont.2.2',
    parametros: ['P-02'],
    motivo:
      'Dato del informe, sin veredicto: op.cont.2.2 pide una PREVISIÓN para los medios alternativos, no la ausencia de caídas, y las interrupciones reales no se recogen en esta versión (op.cont.2 no tiene recolector).',
  },
  'EV-03': {
    requisito: 'op.cont.2.r2.1',
    parametros: ['P-07'],
    motivo:
      'Dato del informe, sin veredicto: R2 no se exige en ningún nivel. La comprobación de integridad en el arranque la mide op.exp.6 en cada agente (su EV-06).',
  },
  'EV-05': {
    requisito: 'op.cont.2.1',
    parametros: ['P-03'],
    motivo:
      'Dato del informe, sin veredicto: no hay directorio corporativo integrado con el que contrastar a las personas de P-03 (las bajas de op.acc.1 son cuentas de sistema, no personas). La declaración de P-03 se juzga en op.cont.2.1; que esas personas sigan en su puesto lo revisa el auditor.',
  },
  'EV-07': {
    requisito: 'op.cont.2.2',
    parametros: ['P-02'],
    motivo:
      'Dato del informe, sin veredicto: la disponibilidad real frente a los RTO de P-02 depende de las interrupciones de EV-02, que no se recogen en esta versión.',
  },
  'EV-08': {
    requisito: 'op.cont.2.2',
    parametros: ['P-04'],
    motivo:
      'Dato del informe, sin veredicto: no hay un hecho genérico que distinga la entrada en servicio de un medio alternativo del arranque de cualquier máquina.',
  },
};


// A declaration is not a measurement: each judged evidence's reason says so, since the bridge
// carries it to the evidence table. What could not be judged already says what is missing.
const asStatement = (measurement: Measurement): string =>
  measurement.estado === 'CUMPLE' || measurement.estado === 'NO_CUMPLE'
    ? `Declaración de la pantalla, no medida: ${measurement.motivo}`
    : measurement.motivo;

type Definition = {
  requisito: string;
  evidencias: string[];
  parametros: string[];
  tipo: ENSDecisionRuleType;
  // The requirement's own declaration that is not an evidence (P-03, P-02, P-06).
  propia?: { etiqueta: string; medir: (context: ENSPolicyContext) => Measurement };
  esperado: string;
};

const REQUIREMENTS: Definition[] = [
  {
    requisito: 'op.cont.2.1',
    evidencias: ['EV-01'],
    parametros: ['P-01', 'P-08', 'P-03'],
    tipo: 'COVERAGE_REQUIRED',
    propia: { etiqueta: 'P-03', medir: functions },
    esperado: 'plan vigente (P-01 con P-08) y cada función de P-03 con responsable y actividades',
  },
  {
    requisito: 'op.cont.2.2',
    evidencias: ['EV-01'],
    parametros: ['P-01', 'P-08', 'P-02'],
    tipo: 'COVERAGE_REQUIRED',
    propia: { etiqueta: 'P-02', medir: services },
    esperado: 'plan vigente (P-01 con P-08) y cada servicio esencial de P-02 con RTO y RPO',
  },
  {
    requisito: 'op.cont.2.3',
    evidencias: ['EV-01', 'EV-04'],
    parametros: ['P-01', 'P-08', 'P-04'],
    tipo: 'MAX_AGE',
    esperado: 'plan vigente (P-01 con P-08) y cada medio de P-04 con contrato en vigor',
  },
  {
    requisito: 'op.cont.2.4',
    evidencias: ['EV-01', 'EV-06'],
    parametros: ['P-01', 'P-08', 'P-03', 'P-05'],
    tipo: 'MAX_AGE',
    esperado: 'plan vigente (P-01 con P-08) y cada persona de P-03 con formación vigente en P-05',
  },
  {
    requisito: 'op.cont.2.5',
    evidencias: ['EV-01'],
    parametros: ['P-01', 'P-08', 'P-06'],
    tipo: 'COVERAGE_REQUIRED',
    propia: { etiqueta: 'P-06', medir: integration },
    esperado: 'plan vigente (P-01 con P-08) y P-06 con algún plan de la organización',
  },
];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const now = (context.now || new Date()).getTime();
  const applies = (requirement: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requirement)
        ?.applicability.levels.includes(context.level)
    );

  const applicable = REQUIREMENTS.filter(r => applies(r.requisito));

  // With D at BAJO or MEDIO nothing applies: no decisions or variables; the evidences are already
  // NO_APLICA by level.
  if (!applicable.length) {
    return { decisions: [], runtimeVariables: [] };
  }

  const plan = ev01(context, now);
  const evidences: Record<string, Measurement> = {
    'EV-01': plan.medida,
    'EV-04': ev04(context, now),
    'EV-06': ev06(context, now),
  };
  // Each requirement's own declaration, for the report.
  const own: { requisito: string; parametro: string; medida: Measurement }[] = [];

  const requirementDecisions: ENSPolicyDecision[] = [];
  const evidenceDecisions: ENSPolicyDecision[] = [];

  applicable.forEach(definition => {
    const pieces = [
      ...definition.evidencias.map(id => ({ id, medida: evidences[id] })),
      ...(definition.propia ? [{ id: definition.propia.etiqueta, medida: definition.propia.medir(context) }] : []),
    ];

    if (definition.propia) {
      own.push({ requisito: definition.requisito, parametro: definition.propia.etiqueta, medida: pieces[pieces.length - 1].medida });
    }

    const status = worstStatus(pieces.map(p => p.medida));
    const owners = pieces.filter(p => p.medida.estado === status);

    // The REQUIREMENT's decision goes first (the one `evaluateRequirement` reads); if it complies,
    // it complies ACCREDITED DOCUMENTARILY since everything behind it is a declaration in force.
    requirementDecisions.push(
      withReasonParts(decide(
        definition.requisito,
        status,
        owners.map(p => p.id).filter(id => id.startsWith('EV-')),
        definition.parametros,
        definition.tipo,
        definition.requisito,
        compositeReason(pieces),
        definition.esperado,
        commonGapCause(owners.map(p => p.medida)),
        true
      ), reasonPartsOf(pieces))
    );

    // And one per evidence, with ITS status, said as what it is.
    definition.evidencias.forEach(id => {
      const measurement = evidences[id];

      evidenceDecisions.push(
        decide(
          definition.requisito,
          measurement.estado,
          [id],
          definition.parametros,
          definition.tipo,
          `${definition.requisito}/${id}`,
          asStatement(measurement),
          `${id} CUMPLE`,
          measurement.causa
        )
      );
    });
  });

  // Report data, without verdict.
  Object.entries(REPORT_DATA).forEach(([id, data]) =>
    evidenceDecisions.push(
      decide(data.requisito, 'NO_APLICA', [id], data.parametros, 'COVERAGE_REQUIRED', `${data.requisito}/${id}`, data.motivo, 'dato del informe')
    )
  );

  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(evidences).map(([id, measurement]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: measurement.estado,
      parameterIds: id === 'EV-01' ? ['P-01', 'P-08'] : id === 'EV-04' ? ['P-04'] : ['P-03', 'P-05'],
      evidenceIds: [id],
      eventIds: [],
      description: measurement.motivo,
    })),
    ...own.map(({ requisito: requirement, parametro: id, medida: measurement }) => ({
      name: `declaracion_${requirement.replace(/\./g, '_')}`,
      value: measurement.estado,
      parameterIds: [id],
      evidenceIds: [],
      eventIds: [],
      description: measurement.motivo,
    })),
    {
      name: 'plan_vigente_hasta',
      value: plan.vence === undefined ? undefined : day(plan.vence),
      parameterIds: ['P-01', 'P-08'],
      evidenceIds: ['EV-01'],
      eventIds: [],
      description:
        plan.vence === undefined
          ? 'Sin fecha: el plan no está declarado o no se puede leer.'
          : 'Último día de vigencia del plan aprobado más recientemente, con la periodicidad de P-08.',
    },
  ];

  // All DOCUMENTARY: they come from screen tables and their validity, not machine facts. A scope
  // without machines (or a stopped collector) does not erase them: an expired plan stays expired
  // (see `documental` in `ENSPolicyDecision`).
  return {
    decisions: [...requirementDecisions, ...evidenceDecisions].map(decision => ({ ...decision, documental: true })),
    runtimeVariables: variables,
  };
};

export const opCont2PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // By Availability level: the five base requirements only in ALTO; R1 and R2 in none.
  requirements: [
    {
      requirementId: 'op.cont.2.1',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-08'],
      evidenceIds: ['EV-01'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.cont.2.2',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-02', 'P-08'],
      evidenceIds: ['EV-01'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.cont.2.3',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-04', 'P-08'],
      evidenceIds: ['EV-01', 'EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.cont.2.4',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-03', 'P-05', 'P-08'],
      evidenceIds: ['EV-01', 'EV-06'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.cont.2.5',
      levels: ['ALTO'],
      parameterIds: ['P-01', 'P-06', 'P-08'],
      evidenceIds: ['EV-01'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.cont.2.r1.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.cont.2.r2.1',
      levels: [],
      parameterIds: ['P-07'],
      evidenceIds: ['EV-03'],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
