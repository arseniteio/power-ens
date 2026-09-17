// op.acc.5 · Mecanismo de autenticación (usuarios externos)
//
// POR QUÉ TIENE EVALUADOR. Las evidencias de este control se juzgan con las
// primitivas del catálogo, como las de op.acc.4. Lo que ninguna primitiva puede
// expresar es QUÉ REQUISITOS CUENTAN, y aquí eso depende de un parámetro:
//
//   · Los refuerzos R1 a R4 son una ELECCIÓN («[R1 o R2 o R3 o R4]»), no una
//     acumulación. El catálogo solo sabe decir «aplica en estos niveles», así
//     que sin esta capa el denominador contaría los cuatro refuerzos a la vez y
//     el porcentaje bajaría por requisitos que nadie tiene que cumplir. El
//     refuerzo elegido en P-01 cuenta; los demás salen NO_APLICA.
//   · R1 (contraseña sola) deja de ser admisible desde nivel MEDIO. Con nivel
//     MEDIO o ALTO y P-01 = R1 el control incumple SIN MIRAR UN LOG: sus dos
//     requisitos salen NO_CUMPLE medidos, con el motivo escrito.
//   · op.acc.5.8 tiene una parte que ninguna primitiva ve: un bloqueo
//     DESACTIVADO (sin número que comparar) o que se levanta solo por tiempo
//     incumple, y el silencio de EV-03 solo vale con el latido declarándola.
//   · op.acc.5.r1.2 exige normas de complejidad además de robustez frente a la
//     adivinación, y op.acc.5.r5.2 se declara en P-09.
//
// LO QUE NO HACE. No vuelve a juzgar ninguna evidencia: lee el veredicto que la
// primitiva ya dio (`context.evidences`) y solo añade lo de arriba. Donde la
// policy decide un requisito técnico reproduce la regla de `resolveMeasurement`
// —un incumplimiento medido manda, un hueco no fabrica un verde, y la
// configuración obligatoria incompleta impide el CUMPLE—, porque una decisión
// sustituye a esa consolidación y no puede ser más generosa que ella.
//
// Tipos desde el fichero, nunca desde un barrel de alto nivel: por ahí vuelve
// el ciclo transitivo del TDZ de Settings.
import type {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyDefinition,
  ENSPolicyEvaluatorResult,
  ENSRuntimeVariable,
} from '../types';
import type { ENSComplianceStatus } from '../../evaluation/types';
import type { ENSEvidenceResolved } from '../../evidence/types';
import type { ENSNormalizedEvent } from '../../data-source/types';
import { validateControlConfiguration } from '../../../configuration/services/validation-engine';
import { resolveCollectorCoverage } from '../../evidence/judgment';
import { getEvidenceDefinitions } from '../../evidence/registry';

const POLICY_ID = 'policy.op.acc.5';
const CONTROL_ID = 'op.acc.5';

type Refuerzo = 'R1' | 'R2' | 'R3' | 'R4';

// Los requisitos de cada refuerzo. Es el texto del ENS, no una decisión de
// producto: cada bloque «REFUERZO Rn» de la plantilla.
export const OP_ACC_5_REQUISITOS_POR_REFUERZO: Record<Refuerzo, string[]> = {
  R1: ['op.acc.5.r1.1', 'op.acc.5.r1.2'],
  R2: ['op.acc.5.r2.1'],
  R3: ['op.acc.5.r3.1', 'op.acc.5.r3.2', 'op.acc.5.r3.3'],
  R4: ['op.acc.5.r4.1', 'op.acc.5.r4.2', 'op.acc.5.r4.3'],
};

const REFUERZOS: Refuerzo[] = ['R1', 'R2', 'R3', 'R4'];

const NOMBRE_REFUERZO: Record<Refuerzo, string> = {
  R1: 'R1 (contraseña)',
  R2: 'R2 (contraseña más OTP)',
  R3: 'R3 (certificado cualificado con segundo factor)',
  R4: 'R4 (certificado en soporte físico con segundo factor)',
};

// «R2», « r2 », «R2 (contraseña+OTP)»: lo que importa es la clave. Cualquier
// otra cosa no es una elección y no se adivina.
export const leerRefuerzoElegido = (value: unknown): Refuerzo | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.trim().toUpperCase().match(/^R([1-4])\b/);

  return match ? (`R${match[1]}` as Refuerzo) : undefined;
};

const decide = (
  requirementId: string,
  status: ENSComplianceStatus,
  reason: string,
  extra: {
    parameterIds?: string[];
    evidenceIds?: string[];
    eventIds?: string[];
    ruleType?: ENSPolicyDecision['trace']['ruleType'];
    expression?: string;
    expected?: string;
    actual?: string;
  } = {}
): ENSPolicyDecision => ({
  policyId: POLICY_ID,
  requirementId,
  status,
  parameterIds: extra.parameterIds || [],
  evidenceIds: extra.evidenceIds || [],
  eventIds: extra.eventIds || [],
  runtimeVariables: ['refuerzoElegido'],
  trace: {
    ruleId: `${requirementId}.policy`,
    ruleType: extra.ruleType || 'CONDITIONAL_REQUIRED',
    expression: extra.expression || '',
    expected: extra.expected || '',
    actual: extra.actual || '',
    result: status === 'CUMPLE',
  },
  reason,
});

const estadoDe = (
  context: ENSPolicyContext,
  evidenceId: string
): ENSEvidenceResolved | undefined =>
  context.evidences.find(evidence => evidence.id === evidenceId);

// La consolidación de `resolveMeasurement`, sobre las evidencias ya juzgadas.
const medirPorEvidencias = (
  context: ENSPolicyContext,
  evidenceIds: string[],
  configuracionIncompleta: boolean
): { status: ENSComplianceStatus; detalle: string } => {
  const evidencias = evidenceIds
    .map(id => estadoDe(context, id))
    .filter((evidence): evidence is ENSEvidenceResolved => Boolean(evidence))
    .filter(evidence => evidence.status !== 'NO_APLICA');

  const detalle = evidenceIds
    .map(id => `${id}=${estadoDe(context, id)?.status || 'SIN_DATOS'}`)
    .join('; ');

  if (!evidencias.length) {
    return { status: 'NO_EVALUABLE', detalle };
  }

  if (
    evidencias.some(
      evidence =>
        evidence.status === 'NO_CUMPLE' || evidence.status === 'PARCIAL'
    )
  ) {
    return { status: 'NO_CUMPLE', detalle };
  }

  if (
    evidencias.every(evidence => evidence.status === 'CUMPLE') &&
    !configuracionIncompleta
  ) {
    return { status: 'CUMPLE', detalle };
  }

  return { status: 'NO_EVALUABLE', detalle };
};

// Hechos del propio control, de una evidencia y un tipo.
const hechos = (
  context: ENSPolicyContext,
  evidenceId: string,
  eventType: string
): ENSNormalizedEvent[] =>
  context.events.filter(
    event =>
      !event.isSynthetic &&
      (!event.controlId || event.controlId === CONTROL_ID) &&
      (!event.evidenceId || event.evidenceId === evidenceId) &&
      event.eventType === eventType
  );

const atributo = (event: ENSNormalizedEvent, campo: string): string =>
  String(event.attributes?.[campo] ?? '')
    .trim()
    .toLowerCase();

const servicioDe = (event: ENSNormalizedEvent): string =>
  String(event.attributes?.servicio ?? 'sin servicio');

// --- op.acc.5.8 ------------------------------------------------------------
const decidirLimiteDeIntentos = (
  context: ENSPolicyContext,
  configuracionIncompleta: boolean
): ENSPolicyDecision => {
  const politicas = hechos(context, 'EV-02', 'lockout_policy');

  const desactivados = politicas.filter(
    event => atributo(event, 'bloqueo') === 'desactivado'
  );

  const automaticos = politicas.filter(
    event => atributo(event, 'reactivacion') === 'automatica'
  );

  const ev02 = estadoDe(context, 'EV-02');
  const ev03 = estadoDe(context, 'EV-03');

  const parametros = ['P-02', 'P-03', 'P-04'];
  const evidencias = ['EV-02', 'EV-03'];

  const actual = `EV-02=${ev02?.status || 'SIN_DATOS'}; EV-03=${
    ev03?.status || 'SIN_DATOS'
  }; políticas observadas=${politicas.length}; sin límite=${
    desactivados.length
  }; reactivación automática=${automaticos.length}`;

  const traza = {
    parameterIds: parametros,
    evidenceIds: evidencias,
    ruleType: 'CONDITIONAL_REQUIRED' as const,
    expression:
      'bloqueo activado && reactivación por intervención && EV-02 CUMPLE && (EV-03 CUMPLE || EV-03 sin fallos con cobertura confirmada) && P-04 declarado',
    expected:
      'límite de intentos activo y no superior a P-03, reactivación por intervención documentada en P-04, y ningún origen por encima de P-03',
    actual,
  };

  // Lo medido manda sobre cualquier hueco, igual que en la consolidación.
  if (desactivados.length) {
    return decide(
      'op.acc.5.8',
      'NO_CUMPLE',
      `El servicio ${Array.from(new Set(desactivados.map(servicioDe))).join(
        ', '
      )} declara el bloqueo por intentos DESACTIVADO: el número de intentos no está limitado, que es exactamente lo que op.acc.5.8 exige.`,
      { ...traza, eventIds: desactivados.map(event => event.id) }
    );
  }

  if (automaticos.length) {
    return decide(
      'op.acc.5.8',
      'NO_CUMPLE',
      `El servicio ${Array.from(new Set(automaticos.map(servicioDe))).join(
        ', '
      )} reactiva las cuentas bloqueadas solo, por tiempo: op.acc.5.8 exige una intervención específica para reactivarlas.`,
      { ...traza, eventIds: automaticos.map(event => event.id) }
    );
  }

  if (ev02?.status === 'NO_CUMPLE' || ev03?.status === 'NO_CUMPLE') {
    return decide(
      'op.acc.5.8',
      'NO_CUMPLE',
      `El límite de intentos no es operativo: ${[
        ev02?.status === 'NO_CUMPLE' ? 'EV-02 supera P-03' : '',
        ev03?.status === 'NO_CUMPLE'
          ? 'EV-03 observa un origen por encima de P-03'
          : '',
      ]
        .filter(Boolean)
        .join(' y ')}.`,
      traza
    );
  }

  if (configuracionIncompleta) {
    return decide(
      'op.acc.5.8',
      'NO_EVALUABLE',
      'Falta configuración obligatoria del control (entre ella P-02, P-03 o P-04, el procedimiento de reactivación): sin ella no se puede afirmar que el límite de intentos conforme.',
      traza
    );
  }

  // Las rachas solas pueden dejar EV-02 en verde —ninguna supera P-03— sin
  // que conste límite alguno: cero fallos, o pocos, no demuestran que el
  // servicio bloquee. El límite lo acredita la POLÍTICA, y tiene que estar.
  const activadas = politicas.filter(
    event =>
      atributo(event, 'bloqueo') === 'activado' &&
      Number.isFinite(Number(event.attributes?.intentos)) &&
      Number(event.attributes?.intentos) > 0
  );

  if (ev02?.status !== 'CUMPLE' || !activadas.length) {
    return decide(
      'op.acc.5.8',
      'NO_EVALUABLE',
      'EV-02 no acredita el límite de intentos: hace falta la política de bloqueo del servicio, activada y con un número de intentos no superior a P-03. Que no haya fallos, o que las rachas observadas sean cortas, no demuestra que haya límite.',
      traza
    );
  }

  if (ev03?.status === 'CUMPLE') {
    return decide(
      'op.acc.5.8',
      'CUMPLE',
      'El límite de intentos está activo y dentro de P-03, se reactiva por intervención, ningún origen supera P-03 y el procedimiento de reactivación está declarado en P-04.',
      traza
    );
  }

  // EV-03 sin hechos: sin fallos no hay umbral que superar. Solo vale si
  // consta que el recolector miró los registros de todos los servicios.
  const definicionEv03 = getEvidenceDefinitions(CONTROL_ID).find(
    definition => definition.id === 'EV-03'
  );

  const sinHechosEv03 =
    hechos(context, 'EV-03', 'auth_failures_by_origin').length === 0;

  const cobertura =
    definicionEv03?.judgment && sinHechosEv03
      ? resolveCollectorCoverage(
          definicionEv03,
          definicionEv03.judgment,
          context.events.filter(
            event => !event.controlId || event.controlId === CONTROL_ID
          ),
          context.now || new Date()
        )
      : undefined;

  if (cobertura?.coverage === 'CONFIRMADA') {
    return decide(
      'op.acc.5.8',
      'CUMPLE',
      `El límite de intentos está activo y dentro de P-03, se reactiva por intervención y el procedimiento está declarado en P-04. EV-03 no registra ningún fallo en la ventana y consta que el recolector miró: ${cobertura.reason}`,
      {
        ...traza,
        eventIds: cobertura.event ? [cobertura.event.id] : [],
      }
    );
  }

  return decide(
    'op.acc.5.8',
    'NO_EVALUABLE',
    `EV-03 no permite afirmar que ningún ataque haya superado el límite${
      cobertura ? `: ${cobertura.reason}` : '.'
    }`,
    traza
  );
};

// --- op.acc.5.r1.2 ---------------------------------------------------------
const decidirComplejidad = (
  context: ENSPolicyContext,
  configuracionIncompleta: boolean
): ENSPolicyDecision => {
  const politicas = hechos(context, 'EV-02', 'password_policy');

  const sinNormas = politicas.filter(event => {
    const longitud = Number(event.attributes?.longitud_minima);

    return (
      atributo(event, 'complejidad') === 'desactivada' ||
      (Number.isFinite(longitud) && longitud <= 0)
    );
  });

  const conNormas = politicas.filter(event => {
    const longitud = Number(event.attributes?.longitud_minima);

    return (
      atributo(event, 'complejidad') === 'activada' &&
      Number.isFinite(longitud) &&
      longitud > 0
    );
  });

  const robustez = medirPorEvidencias(context, ['EV-02'], configuracionIncompleta);

  const traza = {
    parameterIds: ['P-01', 'P-03'],
    evidenceIds: ['EV-02'],
    expression:
      'normas de complejidad activadas con longitud mínima && EV-02 (robustez frente a la adivinación) CUMPLE',
    expected:
      'política de contraseñas con complejidad y longitud mínima, y límite de intentos dentro de P-03',
    actual: `${robustez.detalle}; políticas de contraseña=${politicas.length}; sin normas=${sinNormas.length}`,
  };

  if (sinNormas.length) {
    return decide(
      'op.acc.5.r1.2',
      'NO_CUMPLE',
      `El servicio ${Array.from(new Set(sinNormas.map(servicioDe))).join(
        ', '
      )} no impone normas de complejidad a la contraseña.`,
      { ...traza, eventIds: sinNormas.map(event => event.id) }
    );
  }

  if (robustez.status === 'NO_CUMPLE') {
    return decide(
      'op.acc.5.r1.2',
      'NO_CUMPLE',
      'La contraseña no está protegida frente a ataques de adivinación: EV-02 supera el límite de intentos de P-03.',
      traza
    );
  }

  if (!conNormas.length) {
    return decide(
      'op.acc.5.r1.2',
      'NO_EVALUABLE',
      'No consta ninguna política de contraseñas del servicio con complejidad activada y longitud mínima: la robustez frente a la adivinación sola no demuestra las normas de complejidad.',
      traza
    );
  }

  return decide(
    'op.acc.5.r1.2',
    robustez.status,
    robustez.status === 'CUMPLE'
      ? 'El servicio impone complejidad y longitud mínima a la contraseña, y el límite de intentos la protege frente a la adivinación.'
      : 'Constan normas de complejidad, pero EV-02 no acredita la robustez frente a la adivinación.',
    traza
  );
};

// --- op.acc.5.r5.2 ---------------------------------------------------------
//
// Documental: si hay atestación en P-ATT el motor la aplica ANTES de mirar esta
// decisión, así que aquí solo se llega sin documento.
const decidirUltimoAcceso = (
  context: ENSPolicyContext
): ENSPolicyDecision => {
  const valor = context.configuration?.parameters.find(
    parameter => parameter.id === 'P-09'
  )?.value;

  const texto = String(valor ?? '').trim().toLowerCase();

  const declaradoNo =
    valor === false || ['false', 'no', '0'].includes(texto);

  const declaradoSi =
    valor === true || ['true', 'sí', 'si', 'yes', '1'].includes(texto);

  const traza = {
    parameterIds: ['P-09'],
    ruleType: 'COVERAGE_REQUIRED' as const,
    expression: 'P-09 = sí && fila de op.acc.5.r5.2 en P-ATT',
    expected: 'el servicio informa del último acceso y hay un documento que lo acredita',
    actual: `P-09=${valor === undefined ? 'SIN_CONFIGURAR' : String(valor)}`,
  };

  if (declaradoNo) {
    return decide(
      'op.acc.5.r5.2',
      'NO_CUMPLE',
      'P-09 declara que el servicio NO informa al usuario del último acceso efectuado con su identidad, que R5 exige en MEDIO y ALTO.',
      traza
    );
  }

  if (declaradoSi) {
    return decide(
      'op.acc.5.r5.2',
      'NO_EVALUABLE',
      'P-09 declara que el servicio informa del último acceso, pero no hay ninguna fila de op.acc.5.r5.2 en P-ATT con el documento o la captura que lo acredite.',
      traza
    );
  }

  return decide(
    'op.acc.5.r5.2',
    'NO_EVALUABLE',
    'P-09 no está declarado: no consta si el servicio informa del último acceso.',
    traza
  );
};

// --- el evaluador ------------------------------------------------------------

const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const decisions: ENSPolicyDecision[] = [];

  const valorP01 = context.configuration?.parameters.find(
    parameter => parameter.id === 'P-01'
  )?.value;

  const elegido = leerRefuerzoElegido(valorP01);

  const validacion = context.configuration
    ? validateControlConfiguration(context.configuration, context.level)
    : undefined;

  const configuracionIncompleta =
    !validacion ||
    validacion.missingRequired.length > 0 ||
    validacion.invalidRequired.length > 0;

  const variables: ENSRuntimeVariable[] = [
    {
      name: 'refuerzoElegido',
      value: elegido || 'SIN_DECLARAR',
      parameterIds: ['P-01'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description:
        'Refuerzo de autenticación declarado en P-01. Decide qué requisitos de R1 a R4 cuentan en el denominador.',
    },
  ];

  const aplica = (requirementId: string): boolean =>
    Boolean(
      context.control.requirements
        .find(requirement => requirement.id === requirementId)
        ?.applicability.levels.includes(context.level)
    );

  // Primero lo que no es de refuerzos. El orden importa aguas abajo: cuando
  // dos decisiones tocan la misma evidencia con la misma gravedad, el puente
  // hacia las evidencias se queda con la primera, y la de .8 es la que habla
  // de EV-02 y EV-03 con sentido propio.
  decisions.push(decidirLimiteDeIntentos(context, configuracionIncompleta));

  if (aplica('op.acc.5.r5.2')) {
    decisions.push(decidirUltimoAcceso(context));
  }

  const elegidas: ENSPolicyDecision[] = [];
  const noElegidas: ENSPolicyDecision[] = [];

  REFUERZOS.forEach(refuerzo => {
    OP_ACC_5_REQUISITOS_POR_REFUERZO[refuerzo].forEach(requirementId => {
      if (!aplica(requirementId)) {
        return;
      }

      const requisito = context.control.requirements.find(
        requirement => requirement.id === requirementId
      );

      const evidenceIds = requisito?.evidenceIds || [];

      // Sin elección no hay refuerzo que contar ni que descartar: todos se
      // quedan en el denominador, sin demostrar, que es el «control no
      // evaluable» de la plantilla. Descartarlos daría un 100 % sin haber
      // declarado nunca el mecanismo.
      if (!elegido) {
        elegidas.push(
          decide(
            requirementId,
            'NO_EVALUABLE',
            `P-01 no declara un refuerzo válido (R1, R2, R3 o R4)${
              valorP01 === undefined ? '' : `: se recibió '${String(valorP01)}'`
            }. Sin saber qué mecanismo usa el servicio no se puede decir qué requisitos de refuerzo rigen ni verificarlos.`,
            {
              parameterIds: ['P-01'],
              expression: 'P-01 ∈ {R1, R2, R3, R4}',
              expected: 'un refuerzo declarado en P-01',
              actual: `P-01=${valorP01 === undefined ? 'SIN_CONFIGURAR' : String(valorP01)}`,
            }
          )
        );

        return;
      }

      if (refuerzo !== elegido) {
        noElegidas.push(
          decide(
            requirementId,
            'NO_APLICA',
            `No es el refuerzo elegido: P-01 declara ${NOMBRE_REFUERZO[elegido]}. Los refuerzos de op.acc.5 son una elección, no una acumulación, y solo cuenta el declarado.`,
            {
              parameterIds: ['P-01'],
              // Solo las evidencias que son EXCLUSIVAS de refuerzos no
              // elegidos pueden verse arrastradas a NO_APLICA; la compartida
              // (EV-07) la protege la decisión del refuerzo elegido.
              evidenceIds,
              expression: `P-01 === ${refuerzo}`,
              expected: `${refuerzo} declarado en P-01`,
              actual: `P-01=${elegido}`,
            }
          )
        );

        return;
      }

      // R1 elegido en MEDIO o ALTO: incumplimiento directo, sin mirar un log.
      if (refuerzo === 'R1' && context.level !== 'BAJO') {
        elegidas.push(
          decide(
            requirementId,
            'NO_CUMPLE',
            `P-01 declara R1 (contraseña sola) y el sistema es de nivel ${context.level}: desde MEDIO la contraseña sola no figura entre las opciones del ENS, hay que emplear R2, R3 o R4. Incumplimiento directo, que no depende de ningún registro.`,
            {
              parameterIds: ['P-01'],
              // El incumplimiento es del MECANISMO: se ancla en EV-07 y no en
              // EV-02, que es la evidencia de op.acc.5.8 y no tiene nada que
              // ver con la elección.
              evidenceIds: ['EV-07'],
              expression: `nivel ${context.level} && P-01 === R1`,
              expected: 'R2, R3 o R4 en nivel MEDIO o ALTO',
              actual: `P-01=R1; nivel=${context.level}`,
            }
          )
        );

        return;
      }

      // Documentales del refuerzo elegido (r3.3, r4.3): los decide la
      // atestación, que el motor aplica antes que cualquier decisión.
      if (!evidenceIds.length) {
        return;
      }

      if (requirementId === 'op.acc.5.r1.2') {
        elegidas.push(decidirComplejidad(context, configuracionIncompleta));

        return;
      }

      const medida = medirPorEvidencias(
        context,
        evidenceIds,
        configuracionIncompleta
      );

      elegidas.push(
        decide(
          requirementId,
          medida.status,
          medida.status === 'CUMPLE'
            ? `Refuerzo elegido (${NOMBRE_REFUERZO[elegido]}): ${evidenceIds.join(', ')} lo acreditan.`
            : medida.status === 'NO_CUMPLE'
            ? `Refuerzo elegido (${NOMBRE_REFUERZO[elegido]}): ${evidenceIds.join(', ')} incumple.`
            : `Refuerzo elegido (${NOMBRE_REFUERZO[elegido]}): ${evidenceIds.join(', ')} no permite demostrarlo${
                configuracionIncompleta
                  ? ' y falta configuración obligatoria del control'
                  : ''
              }.`,
          {
            parameterIds: requisito?.parameterIds || ['P-01'],
            evidenceIds,
            expression: `P-01 === ${refuerzo} && ${evidenceIds.join(' && ')} CUMPLE`,
            expected: `${evidenceIds.join(', ')} en CUMPLE`,
            actual: medida.detalle,
          }
        )
      );
    });
  });

  // Las del refuerzo elegido antes que las NO_APLICA, por el mismo motivo que
  // arriba: EV-07 la comparten R1, R2, R3 y R4, y no puede acabar pintada como
  // «no aplica» cuando el refuerzo elegido la necesita.
  decisions.push(...elegidas, ...noElegidas);

  return { decisions, runtimeVariables: variables };
};

export const opAcc5PolicyDefinition: ENSPolicyDefinition = {
  id: POLICY_ID,
  controlId: CONTROL_ID,
  version: '1.0.0',
  evaluator: evaluate,
  requirements: [
    {
      requirementId: 'op.acc.5.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.4',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-05'],
      evidenceIds: ['EV-04'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.5.5',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.5.6',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-06'],
      evidenceIds: ['EV-05'],
      ruleType: 'MAX_AGE',
    },
    {
      requirementId: 'op.acc.5.7',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02'],
      evidenceIds: ['EV-06'],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.8',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-03', 'P-04'],
      evidenceIds: ['EV-02', 'EV-03'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.9',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    // R1 a R4 llevan los tres niveles: qué refuerzo cuenta lo decide P-01 en
    // el evaluador, no el nivel. R1 fuera de BAJO sale NO_CUMPLE si se elige.
    {
      requirementId: 'op.acc.5.r1.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r1.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-03'],
      evidenceIds: ['EV-02'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r2.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r3.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-07'],
      evidenceIds: ['EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r3.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r3.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r4.1',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01', 'P-07'],
      evidenceIds: ['EV-08'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r4.2',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: ['EV-07'],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r4.3',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      parameterIds: ['P-01'],
      evidenceIds: [],
      ruleType: 'CONDITIONAL_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r5.1',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-02', 'P-08'],
      evidenceIds: ['EV-01', 'EV-09'],
      ruleType: 'MIN_RETENTION',
    },
    {
      requirementId: 'op.acc.5.r5.2',
      levels: ['MEDIO', 'ALTO'],
      parameterIds: ['P-09'],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    // R6 y R7 no los exige el ENS en ningún nivel de op.acc.5: sin niveles, el
    // motor los evalúa NO_APLICA y quedan fuera del denominador.
    {
      requirementId: 'op.acc.5.r6.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
    {
      requirementId: 'op.acc.5.r7.1',
      levels: [],
      parameterIds: [],
      evidenceIds: [],
      ruleType: 'COVERAGE_REQUIRED',
    },
  ],
};
