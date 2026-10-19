// op.cont.2 · Plan de continuidad
//
// Por qué este control tiene policy propia. Es un control de DOCUMENTO: el plan
// se audita leyéndolo, y ninguna máquina emite nada que lo demuestre (no tiene
// runbook ni reglas: `tests/controls-without-runbook.json`). Lo que ENSFácil
// puede hacer, y hace aquí, es vigilar las VIGENCIAS de lo que la organización
// declara en la pantalla (spec 2026-10-09 §5): el plan dentro de su periodicidad
// de revisión, los contratos de los medios alternativos sin vencer y la
// formación de cada persona del plan en vigor, todo contra la fecha de la
// evaluación (`context.now`). Ninguna primitiva compara una fecha declarada con
// otra declarada, ni cruza dos tablas de la pantalla.
//
// Un requisito que cumple sale ACREDITADO DOCUMENTALMENTE (`attested`): es una
// declaración en vigor, no una medida, y la pantalla y el informe lo dicen así
// (decisión 1 del responsable, 09/10). No hay P-ATT a propósito: una atestación
// no caduca, y un plan de 2019 con su enlace acreditaría hoy.
//
// Qué decide cada requisito. Los cinco son contenidos del plan («dicho plan
// contemplará…»), así que todos exigen EV-01, el plan vigente:
//
//   op.cont.2.1  EV-01 y P-03: cada función con su responsable y sus actividades.
//   op.cont.2.2  EV-01 y P-02: cada servicio esencial con su RTO y su RPO, como
//                duraciones legibles (30 min, 4 h, 2 d).
//   op.cont.2.3  EV-01 y EV-04: cada medio alternativo de P-04 con su contrato,
//                en vigor.
//   op.cont.2.4  EV-01 y EV-06: cada responsable y suplente de P-03 con formación
//                vigente en P-05.
//   op.cont.2.5  EV-01 y P-06: al menos un plan de la organización con el que se
//                integra.
//   R1 y R2      definidos, no exigidos: sin niveles.
//
// EV-02, EV-05, EV-07 y EV-08 no se pueden medir hoy, y EV-03 es de R2: salen
// NO_APLICA con el motivo «dato del informe» para que no se pinten en gris.
//
// Se rige por el nivel de Disponibilidad (`levelDimension: 'D'`): con D en BAJO
// o MEDIO, `context.level` no es ALTO, ningún requisito aplica y no se emite
// ninguna decisión.
//
// Invariantes:
//   - sin la tabla, o con una fila a medias o una fecha ilegible, NO_EVALUABLE
//     con causa CONFIGURATION y la fila nombrada; nunca un CUMPLE por ausencia;
//   - una declaración que dice que algo falta o venció (un medio sin contrato,
//     una formación vencida, una persona sin formación) es NO_CUMPLE: es la
//     organización la que lo declara;
//   - la policy no inventa política: la periodicidad es P-08, y ninguna fecha
//     ni plazo tiene valor por defecto.
//
// Tipos y utilidades desde el fichero, nunca desde un barrel: por ahí vuelve el
// ciclo del TDZ de Settings.
// El motivo compuesto, en texto y por partes (`reasonParts`).
import { withReasonParts, compositeReason, reasonPartsOf } from './policy-kit';
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import { toParameterListItems } from '../../../configuration/services/parameter-value-validator';
// Por la ruta del fichero, nunca por el barrel (TDZ de Settings).
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

// --- fechas declaradas -----------------------------------------------------
//
// Una fecha de la pantalla es AAAA-MM-DD y existe de verdad: la misma gramática
// que la columna `date` del validador. Cualquier otra cosa es una declaración
// ilegible, y se dice con su fila.

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

// El instante de las 00:00 UTC de esa fecha, o nada si no es una fecha real.
const fecha = (texto: string): number | undefined => {
  const partes = String(texto).trim().match(FECHA);

  if (!partes) {
    return undefined;
  }

  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  const t = Date.UTC(anio, mes - 1, dia);
  const d = new Date(t);

  return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? t : undefined;
};

// La fecha N meses después, en el calendario: el 31/01 + 1 mes es el 28/02 (o
// 29), no el 03/03.
const masMeses = (t: number, meses: number): number => {
  const d = new Date(t);
  const destino = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();

  return Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth(), Math.min(d.getUTCDate(), ultimoDia));
};

const dia = (t: number): string => new Date(t).toISOString().slice(0, 10);

// Una fecha «hasta» vale todo ese día: vence al empezar el siguiente.
const vencida = (hasta: number, ahora: number): boolean => ahora >= hasta + DAY_MS;

// Días que quedan hasta el final del día «hasta», o que han pasado desde que
// venció.
const diasHasta = (hasta: number, ahora: number): number => wholeDays(hasta + DAY_MS - ahora);
const diasDesde = (hasta: number, ahora: number): number => wholeDays(ahora - (hasta + DAY_MS));

// --- duraciones de P-02 ------------------------------------------------------
//
// Un número y su unidad: «30 min», «4 h», «2 d», «1,5 horas». Nada más: un RTO
// «cuanto antes» o «4» no es un objetivo que se pueda contrastar con nada.
const DURACION = /^\d+([.,]\d+)?\s*(min|mins|minuto|minutos|h|hora|horas|d|dia|dias)$/;

const esDuracion = (texto: string): boolean => DURACION.test(stripAccents(String(texto).trim()));

// --- personas ----------------------------------------------------------------
//
// P-03 y P-05 nombran a las mismas personas a mano: se comparan sin mayúsculas,
// sin tildes y sin espacios de más, y nunca por parecido.
const persona = (texto: string): string => stripAccents(String(texto)).replace(/\s+/g, ' ').trim();

const fila = (n: number): string => `fila ${n + 1}`;

// --- EV-01 · el plan y su vigencia -------------------------------------------

// Lo que sabe el informe del plan, además de la medida.
type Plan = { medida: Measurement; vence?: number };

const ev01 = (context: ENSPolicyContext, ahora: number): Plan => {
  const planes = tableParameterRows(context, 'P-01');

  if (!planes) {
    return { medida: missingParameter(context, 'P-01', 'qué plan de continuidad está aprobado') };
  }

  const valor = findParameter(context, 'P-08')?.value;
  const meses = valor === undefined || valor === null || Array.isArray(valor) ? undefined : parseNumber(String(valor));

  if (meses === undefined || meses <= 0) {
    return { medida: missingParameter(context, 'P-08', 'la vigencia del plan (cada cuántos meses se revisa)') };
  }

  if (!Number.isInteger(meses)) {
    return {
      medida: notMeasured(`${parameterDisplayName(context, 'P-08')} vale ${valor}: tiene que ser un número entero de meses.`, 'CONFIGURATION'),
    };
  }

  const incompletas: string[] = [];
  const ilegibles: string[] = [];
  const leidas: { referencia: string; version: string; aprobado: number; por: string }[] = [];

  planes.forEach((p, i) => {
    if (isEmptyField(p.referencia) || isEmptyField(p.version) || isEmptyField(p.fecha_de_aprobacion)) {
      incompletas.push(`${fila(i)} (${p.referencia || 'sin referencia'})`);
      return;
    }

    const aprobado = fecha(p.fecha_de_aprobacion);

    if (aprobado === undefined) {
      ilegibles.push(`${fila(i)} (${p.referencia}): «${p.fecha_de_aprobacion}»`);
      return;
    }

    leidas.push({ referencia: p.referencia, version: p.version, aprobado, por: p.aprobado_por || '' });
  });

  if (incompletas.length || ilegibles.length) {
    return {
      medida: notMeasured(
        [
          incompletas.length ? `P-01 tiene filas sin referencia, versión o fecha de aprobación: ${formatList(incompletas)}.` : '',
          ilegibles.length ? `P-01 tiene fechas de aprobación que no son una fecha AAAA-MM-DD: ${formatList(ilegibles)}.` : '',
          'Sin la fecha de aprobación de cada versión no se puede medir la vigencia del plan.',
        ]
          .filter(Boolean)
          .join(' '),
        'CONFIGURATION'
      ),
    };
  }

  // Cuenta la última versión aprobada a la fecha de la evaluación. Una
  // aprobación posterior no existía todavía (la serie diaria evalúa días
  // pasados con la configuración de hoy).
  const aprobadas = leidas.filter(p => p.aprobado <= ahora).sort((a, b) => b.aprobado - a.aprobado);

  if (!aprobadas.length) {
    return {
      medida: notMeasured(
        `Ninguna versión de P-01 estaba aprobada el ${dia(ahora)}: la primera es de ${dia(Math.min(...leidas.map(p => p.aprobado)))}.`,
        'CONFIGURATION'
      ),
    };
  }

  const ultimo = aprobadas[0];
  const vence = masMeses(ultimo.aprobado, meses);
  const quien = ultimo.por ? ` por ${ultimo.por}` : '';
  const plan = `«${ultimo.referencia}» ${ultimo.version}, aprobado el ${dia(ultimo.aprobado)}${quien}`;

  if (vencida(vence, ahora)) {
    return {
      medida: nonCompliant(
        `El plan ${plan}, tenía que revisarse cada ${meses} meses (P-08): venció el ${dia(vence)}, hace ${diasDesde(vence, ahora)} días. Un plan sin revisar no acredita sus contenidos.`
      ),
      vence,
    };
  }

  return {
    medida: compliant(`Plan ${plan}: vigente hasta el ${dia(vence)} (quedan ${diasHasta(vence, ahora)} días) con una revisión cada ${meses} meses.`),
    vence,
  };
};

// --- op.cont.2.1 · funciones del plan (P-03) ---------------------------------

const funciones = (context: ENSPolicyContext): Measurement => {
  const filasP03 = tableParameterRows(context, 'P-03');

  if (!filasP03) {
    return missingParameter(context, 'P-03', 'qué funciones, responsables y actividades identifica el plan');
  }

  const incompletas = filasP03
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => isEmptyField(f.funcion) || isEmptyField(f.responsable) || isEmptyField(f.actividades));

  if (incompletas.length) {
    return notMeasured(
      `P-03 tiene funciones sin responsable o sin actividades: ${formatList(incompletas.map(({ f, i }) => `${fila(i)} (${f.funcion || 'sin función'})`))}. op.cont.2.1 pide identificar las tres cosas.`,
      'CONFIGURATION'
    );
  }

  return compliant(
    `P-03 identifica ${filasP03.length} función(es), cada una con su responsable y sus actividades: ${formatList(
      filasP03.map(f => `${f.funcion} → ${f.responsable}${isEmptyField(f.suplente) ? '' : ` (suplente ${f.suplente})`}`)
    )}.`
  );
};

// --- op.cont.2.2 · servicios esenciales y objetivos (P-02) ---------------------

const servicios = (context: ENSPolicyContext): Measurement => {
  const filasP02 = tableParameterRows(context, 'P-02');

  if (!filasP02) {
    return missingParameter(context, 'P-02', 'qué servicios esenciales tiene que garantizar la previsión ni con qué objetivos de recuperación');
  }

  const incompletas: string[] = [];
  const ilegibles: string[] = [];

  filasP02.forEach((f, i) => {
    if (isEmptyField(f.servicio) || isEmptyField(f.rto) || isEmptyField(f.rpo)) {
      incompletas.push(`${fila(i)} (${f.servicio || 'sin servicio'})`);
      return;
    }

    const malas = [!esDuracion(f.rto) ? `RTO «${f.rto}»` : '', !esDuracion(f.rpo) ? `RPO «${f.rpo}»` : ''].filter(Boolean);

    if (malas.length) {
      ilegibles.push(`${fila(i)} (${f.servicio}): ${malas.join(', ')}`);
    }
  });

  if (incompletas.length || ilegibles.length) {
    return notMeasured(
      [
        incompletas.length ? `P-02 tiene servicios esenciales sin RTO o sin RPO: ${formatList(incompletas)}.` : '',
        ilegibles.length
          ? `P-02 tiene objetivos de recuperación que no son una duración (un número y su unidad: 30 min, 4 h, 2 d): ${formatList(ilegibles)}.`
          : '',
      ]
        .filter(Boolean)
        .join(' '),
      'CONFIGURATION'
    );
  }

  return compliant(
    `P-02 declara ${filasP02.length} servicio(s) esencial(es) con sus objetivos de recuperación: ${formatList(
      filasP02.map(f => `${f.servicio} (RTO ${f.rto}, RPO ${f.rpo})`)
    )}.`
  );
};

// --- EV-04 · contratos de los medios alternativos (P-04) ---------------------

const ev04 = (context: ENSPolicyContext, ahora: number): Measurement => {
  const medios = tableParameterRows(context, 'P-04');

  if (!medios) {
    return missingParameter(context, 'P-04', 'qué medios alternativos hay ni con qué contrato');
  }

  const sinContrato: string[] = [];
  const vencidos: string[] = [];
  // Filas que no permiten afirmar nada: sin nombre, o con contrato y sin una
  // fecha de vigencia legible.
  const ilegibles: string[] = [];
  const enVigor: string[] = [];

  medios.forEach((m, i) => {
    const nombre = m.medio;

    if (isEmptyField(m.medio)) {
      ilegibles.push(`${fila(i)}: sin nombre del medio`);
      return;
    }

    if (isEmptyField(m.contrato)) {
      sinContrato.push(nombre);
      return;
    }

    if (isEmptyField(m.vigencia)) {
      ilegibles.push(`${nombre} (${m.contrato}): sin fecha de vigencia`);
      return;
    }

    const hasta = fecha(m.vigencia);

    if (hasta === undefined) {
      ilegibles.push(`${nombre} (${m.contrato}): vigencia «${m.vigencia}», que no es una fecha AAAA-MM-DD`);
      return;
    }

    if (vencida(hasta, ahora)) {
      vencidos.push(`${nombre} (${m.contrato}) venció el ${dia(hasta)}, hace ${diasDesde(hasta, ahora)} días`);
      return;
    }

    enVigor.push(`${nombre} → ${m.contrato}${m.proveedor ? ` con ${m.proveedor}` : ''}, hasta el ${dia(hasta)} (quedan ${diasHasta(hasta, ahora)} días)`);
  });

  const partes: Measurement[] = [];

  if (sinContrato.length) {
    partes.push(nonCompliant(`Medios alternativos sin acuerdo ni contrato: ${formatList(sinContrato)}. op.cont.2.3 exige que TODOS estén materializados en uno.`));
  }

  if (vencidos.length) {
    partes.push(nonCompliant(`Contratos de medios alternativos vencidos: ${formatList(vencidos)}.`));
  }

  if (ilegibles.length) {
    partes.push(notMeasured(`P-04 no permite afirmar que estén en vigor: ${formatList(ilegibles)}.`, 'CONFIGURATION'));
  }

  if (enVigor.length) {
    partes.push(compliant(`Medios alternativos con contrato en vigor: ${formatList(enVigor)}.`));
  }

  return combineMeasurements(partes);
};

// --- EV-06 · formación de las personas del plan (P-03 contra P-05) -----------

const ev06 = (context: ENSPolicyContext, ahora: number): Measurement => {
  const filasP03 = tableParameterRows(context, 'P-03');

  if (!filasP03) {
    return missingParameter(context, 'P-03', 'quién tiene función en el plan y, por tanto, quién tiene que estar formado');
  }

  // Cada persona una vez, con el nombre como se escribió la primera vez.
  const personas = new Map<string, string>();

  filasP03.forEach(f =>
    [f.responsable, f.suplente].forEach(nombre => {
      if (!isEmptyField(nombre) && !personas.has(persona(nombre))) {
        personas.set(persona(nombre), nombre);
      }
    })
  );

  if (!personas.size) {
    return notMeasured('P-03 no nombra a ninguna persona (responsable o suplente): no se sabe quién tiene que estar formado.', 'CONFIGURATION');
  }

  const formacion = tableParameterRows(context, 'P-05');

  if (!formacion) {
    return missingParameter(context, 'P-05', 'qué formación ha recibido cada persona del plan');
  }

  // Las filas que no se pueden leer se guardan con su persona: una fila ilegible
  // puede ser justo la formación vigente de alguien, y entonces esa persona no
  // está «sin formación», está sin demostrar. Las que no nombran a nadie van
  // aparte.
  const sinLeerPorPersona = new Map<string, string[]>();
  const sinLeerSinPersona: string[] = [];
  const porPersona = new Map<string, { formacion: string; desde?: number; hasta: number }[]>();

  formacion.forEach((f, i) => {
    const sinLeer = (motivo: string): void => {
      if (isEmptyField(f.persona)) {
        sinLeerSinPersona.push(`${fila(i)}: ${motivo}`);
        return;
      }

      const clave = persona(f.persona);

      sinLeerPorPersona.set(clave, [...(sinLeerPorPersona.get(clave) || []), `${fila(i)} (${f.persona}): ${motivo}`]);
    };

    if (isEmptyField(f.persona) || isEmptyField(f.formacion) || isEmptyField(f.vigencia)) {
      sinLeer('sin persona, formación o vigencia');
      return;
    }

    const hasta = fecha(f.vigencia);
    const desde = isEmptyField(f.fecha) ? undefined : fecha(f.fecha);

    if (hasta === undefined || (!isEmptyField(f.fecha) && desde === undefined)) {
      sinLeer(`${hasta === undefined ? `vigencia «${f.vigencia}»` : `fecha «${f.fecha}»`}, que no es una fecha AAAA-MM-DD`);
      return;
    }

    const clave = persona(f.persona);

    porPersona.set(clave, [...(porPersona.get(clave) || []), { formacion: f.formacion, desde, hasta }]);
  });

  const sinFormacion: string[] = [];
  const caducadas: string[] = [];
  const formadas: string[] = [];
  // Personas sin formación vigente legible y con alguna fila ilegible: no
  // demostrado, nunca NO_CUMPLE.
  const sinDemostrar: string[] = [];

  personas.forEach((nombre, clave) => {
    const suyas = porPersona.get(clave) || [];
    const sinLeer = sinLeerPorPersona.get(clave) || [];

    // Vale la formación ya recibida y todavía vigente a la fecha de la evaluación.
    const vigente = suyas
      .filter(s => (s.desde === undefined || s.desde <= ahora) && !vencida(s.hasta, ahora))
      .sort((a, b) => b.hasta - a.hasta)[0];

    if (vigente) {
      formadas.push(`${nombre} (${vigente.formacion}, hasta el ${dia(vigente.hasta)})`);
      return;
    }

    if (sinLeer.length) {
      sinDemostrar.push(...sinLeer);
      return;
    }

    if (!suyas.length) {
      sinFormacion.push(nombre);
      return;
    }

    const ultima = [...suyas].sort((a, b) => b.hasta - a.hasta)[0];

    caducadas.push(
      ultima.desde !== undefined && ultima.desde > ahora
        ? `${nombre} (${ultima.formacion}, recibida el ${dia(ultima.desde)}, después de la fecha de la evaluación)`
        : `${nombre} (${ultima.formacion}, venció el ${dia(ultima.hasta)}, hace ${diasDesde(ultima.hasta, ahora)} días)`
    );
  });

  const partes: Measurement[] = [];

  if (sinFormacion.length) {
    partes.push(nonCompliant(`Personas con función en el plan (P-03) sin formación registrada en P-05: ${formatList(sinFormacion)}.`));
  }

  if (caducadas.length) {
    partes.push(nonCompliant(`Personas del plan sin formación vigente: ${formatList(caducadas)}.`));
  }

  if (sinDemostrar.length) {
    partes.push(
      notMeasured(`Personas del plan cuya formación vigente no se puede leer en P-05: ${formatList(sinDemostrar)}.`, 'CONFIGURATION')
    );
  }

  // Y las demás filas ilegibles (de quien ya está formado, de quien no está en
  // P-03 o sin persona) también se dicen: la pantalla rechaza la tabla igual.
  const otras = [
    ...sinLeerSinPersona,
    ...Array.from(sinLeerPorPersona.values())
      .reduce<string[]>((todas, filasDe) => todas.concat(filasDe), [])
      .filter(descripcion => !sinDemostrar.includes(descripcion)),
  ];

  if (otras.length) {
    partes.push(notMeasured(`P-05 tiene filas que no se pueden leer: ${formatList(otras)}.`, 'CONFIGURATION'));
  }

  if (formadas.length) {
    const fuera = Array.from(porPersona.keys()).filter(clave => !personas.has(clave));

    partes.push(
      compliant(
        `Las ${formadas.length} persona(s) del plan con formación vigente: ${formatList(formadas)}.${
          fuera.length ? ` P-05 registra además a ${fuera.length} persona(s) sin función en P-03, que no cuentan.` : ''
        }`
      )
    );
  }

  return combineMeasurements(partes);
};

// --- op.cont.2.5 · integración con los demás planes (P-06) -------------------

const integracion = (context: ENSPolicyContext): Measurement => {
  const planes = toParameterListItems(findParameter(context, 'P-06')?.value);

  if (!planes.length) {
    return missingParameter(context, 'P-06', 'con qué planes de la organización se integra el de continuidad');
  }

  return compliant(
    `P-06 declara ${planes.length} plan(es) de la organización con los que se integra: ${formatList(planes)}. Que la integración sea «armónica» es revisión documental.`
  );
};

// --- datos del informe --------------------------------------------------------

const DATO_DEL_INFORME: Record<string, { requisito: string; parametros: string[]; motivo: string }> = {
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

// --- decisiones ------------------------------------------------------------

// Una declaración no es una medida: el motivo de cada evidencia juzgada lo dice,
// porque el puente lo lleva a la tabla de evidencias. Lo que no se ha podido
// juzgar ya dice qué falta.
const comoDeclaracion = (medida: Measurement): string =>
  medida.estado === 'CUMPLE' || medida.estado === 'NO_CUMPLE'
    ? `Declaración de la pantalla, no medida: ${medida.motivo}`
    : medida.motivo;

type Definicion = {
  requisito: string;
  evidencias: string[];
  parametros: string[];
  tipo: ENSDecisionRuleType;
  // La declaración propia del requisito que no es una evidencia (P-03, P-02, P-06).
  propia?: { etiqueta: string; medir: (context: ENSPolicyContext) => Measurement };
  esperado: string;
};

const REQUISITOS: Definicion[] = [
  {
    requisito: 'op.cont.2.1',
    evidencias: ['EV-01'],
    parametros: ['P-01', 'P-08', 'P-03'],
    tipo: 'COVERAGE_REQUIRED',
    propia: { etiqueta: 'P-03', medir: funciones },
    esperado: 'plan vigente (P-01 con P-08) y cada función de P-03 con responsable y actividades',
  },
  {
    requisito: 'op.cont.2.2',
    evidencias: ['EV-01'],
    parametros: ['P-01', 'P-08', 'P-02'],
    tipo: 'COVERAGE_REQUIRED',
    propia: { etiqueta: 'P-02', medir: servicios },
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
    propia: { etiqueta: 'P-06', medir: integracion },
    esperado: 'plan vigente (P-01 con P-08) y P-06 con algún plan de la organización',
  },
];

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const ahora = (context.now || new Date()).getTime();
  const aplica = (requisito: string): boolean =>
    Boolean(
      context.control.requirements
        .find(r => r.id === requisito)
        ?.applicability.levels.includes(context.level)
    );

  const aplicables = REQUISITOS.filter(r => aplica(r.requisito));

  // Con D en BAJO o MEDIO no aplica nada: ni decisiones ni variables. Las
  // evidencias ya salen NO_APLICA por su nivel.
  if (!aplicables.length) {
    return { decisions: [], runtimeVariables: [] };
  }

  const plan = ev01(context, ahora);
  const evidencias: Record<string, Measurement> = {
    'EV-01': plan.medida,
    'EV-04': ev04(context, ahora),
    'EV-06': ev06(context, ahora),
  };
  // La declaración propia de cada requisito que la tiene, para el informe.
  const propias: { requisito: string; parametro: string; medida: Measurement }[] = [];

  const requisitoDecisions: ENSPolicyDecision[] = [];
  const evidenciaDecisions: ENSPolicyDecision[] = [];

  aplicables.forEach(definicion => {
    const partes = [
      ...definicion.evidencias.map(id => ({ id, medida: evidencias[id] })),
      ...(definicion.propia ? [{ id: definicion.propia.etiqueta, medida: definicion.propia.medir(context) }] : []),
    ];

    if (definicion.propia) {
      propias.push({ requisito: definicion.requisito, parametro: definicion.propia.etiqueta, medida: partes[partes.length - 1].medida });
    }

    const estado = worstStatus(partes.map(p => p.medida));
    const responsables = partes.filter(p => p.medida.estado === estado);

    // La decisión del REQUISITO va primero: es la que lee `evaluateRequirement`.
    // Si cumple, cumple ACREDITADO DOCUMENTALMENTE: todo lo que la sostiene son
    // declaraciones en vigor.
    requisitoDecisions.push(
      withReasonParts(decide(
        definicion.requisito,
        estado,
        responsables.map(p => p.id).filter(id => id.startsWith('EV-')),
        definicion.parametros,
        definicion.tipo,
        definicion.requisito,
        compositeReason(partes),
        definicion.esperado,
        commonGapCause(responsables.map(p => p.medida)),
        true
      ), reasonPartsOf(partes))
    );

    // Y una por evidencia, con SU estado y dicho como lo que es.
    definicion.evidencias.forEach(id => {
      const medida = evidencias[id];

      evidenciaDecisions.push(
        decide(
          definicion.requisito,
          medida.estado,
          [id],
          definicion.parametros,
          definicion.tipo,
          `${definicion.requisito}/${id}`,
          comoDeclaracion(medida),
          `${id} CUMPLE`,
          medida.causa
        )
      );
    });
  });

  // Los datos del informe, sin veredicto.
  Object.entries(DATO_DEL_INFORME).forEach(([id, dato]) =>
    evidenciaDecisions.push(
      decide(dato.requisito, 'NO_APLICA', [id], dato.parametros, 'COVERAGE_REQUIRED', `${dato.requisito}/${id}`, dato.motivo, 'dato del informe')
    )
  );

  const variables: ENSRuntimeVariable[] = [
    ...Object.entries(evidencias).map(([id, medida]) => ({
      name: `medida_${id.replace('-', '')}`,
      value: medida.estado,
      parameterIds: id === 'EV-01' ? ['P-01', 'P-08'] : id === 'EV-04' ? ['P-04'] : ['P-03', 'P-05'],
      evidenceIds: [id],
      eventIds: [],
      description: medida.motivo,
    })),
    ...propias.map(({ requisito, parametro: id, medida }) => ({
      name: `declaracion_${requisito.replace(/\./g, '_')}`,
      value: medida.estado,
      parameterIds: [id],
      evidenceIds: [],
      eventIds: [],
      description: medida.motivo,
    })),
    {
      name: 'plan_vigente_hasta',
      value: plan.vence === undefined ? undefined : dia(plan.vence),
      parameterIds: ['P-01', 'P-08'],
      evidenceIds: ['EV-01'],
      eventIds: [],
      description:
        plan.vence === undefined
          ? 'Sin fecha: el plan no está declarado o no se puede leer.'
          : 'Último día de vigencia del plan aprobado más recientemente, con la periodicidad de P-08.',
    },
  ];

  // Todas DOCUMENTALES: salen de las tablas de la pantalla y su vigencia, no de
  // los hechos de ninguna máquina. Un alcance sin máquinas (o un recolector
  // parado, si algún día lo hubiera) no las borra: un plan vencido sigue
  // vencido (ver `documental` en `ENSPolicyDecision`).
  return {
    decisions: [...requisitoDecisions, ...evidenciaDecisions].map(decision => ({ ...decision, documental: true })),
    runtimeVariables: variables,
  };
};

export const opCont2PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY,
  controlId: CONTROL,
  version: '1.0.0',
  evaluator: evaluate,
  // Por el nivel de Disponibilidad: los cinco requisitos base solo en ALTO; R1
  // y R2 en ninguno.
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
