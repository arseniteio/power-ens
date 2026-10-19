// op.acc.5 · Authentication mechanism (external users). Evidences are judged by the catalog
// primitives; what no primitive can express is WHICH REQUIREMENTS COUNT, which depends on a
// parameter:
// - Reinforcements R1 to R4 are a CHOICE («[R1 o R2 o R3 o R4]»), not cumulative: the one chosen in
// P-01 counts and the others are NO_APLICA, otherwise the percentage drops for requirements nobody
// must meet.
// - R1 (password only) is not admissible from level MEDIO: with MEDIO or ALTO and P-01 = R1 the
// control fails without reading a log.
// - op.acc.5.8 has a part no primitive sees: a DISABLED lockout (no number to compare) or one that
// lifts itself by time fails, and EV-03's silence only counts with the heartbeat declaring it.
// - op.acc.5.r1.2 requires complexity rules besides guess resistance; op.acc.5.r5.2 is declared in
// P-09.
// It does not re-judge any evidence: it reads the verdict the primitive gave (`context.evidences`).
// Where it decides a technical requirement it reproduces the `resolveMeasurement` rule (a measured
// failure wins, a gap makes no green, incomplete mandatory configuration blocks CUMPLE), since a
// decision replaces that consolidation and cannot be more generous.
// Types come from the file, never from a high-level barrel (Settings TDZ cycle).
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

type Reinforcement = 'R1' | 'R2' | 'R3' | 'R4';

// Requirements of each reinforcement: the ENS text, each «REFUERZO Rn» block of the template.
export const OP_ACC_5_REQUIREMENTS_BY_REINFORCEMENT: Record<Reinforcement, string[]> = {
  R1: ['op.acc.5.r1.1', 'op.acc.5.r1.2'],
  R2: ['op.acc.5.r2.1'],
  R3: ['op.acc.5.r3.1', 'op.acc.5.r3.2', 'op.acc.5.r3.3'],
  R4: ['op.acc.5.r4.1', 'op.acc.5.r4.2', 'op.acc.5.r4.3'],
};

const REINFORCEMENTS: Reinforcement[] = ['R1', 'R2', 'R3', 'R4'];

const REINFORCEMENT_NAME: Record<Reinforcement, string> = {
  R1: 'R1 (contraseña)',
  R2: 'R2 (contraseña más OTP)',
  R3: 'R3 (certificado cualificado con segundo factor)',
  R4: 'R4 (certificado en soporte físico con segundo factor)',
};

// «R2», « r2 », «R2 (contraseña+OTP)»: only the key matters; anything else is not a choice and is
// not guessed.
export const parseChosenReinforcement = (value: unknown): Reinforcement | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.trim().toUpperCase().match(/^R([1-4])\b/);

  return match ? (`R${match[1]}` as Reinforcement) : undefined;
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

const statusOf = (
  context: ENSPolicyContext,
  evidenceId: string
): ENSEvidenceResolved | undefined =>
  context.evidences.find(evidence => evidence.id === evidenceId);

// The `resolveMeasurement` consolidation, over the already judged evidences.
const measureByEvidences = (
  context: ENSPolicyContext,
  evidenceIds: string[],
  incompleteConfiguration: boolean
): { status: ENSComplianceStatus; detalle: string } => {
  const evidences = evidenceIds
    .map(id => statusOf(context, id))
    .filter((evidence): evidence is ENSEvidenceResolved => Boolean(evidence))
    .filter(evidence => evidence.status !== 'NO_APLICA');

  const detail = evidenceIds
    .map(id => `${id}=${statusOf(context, id)?.status || 'SIN_DATOS'}`)
    .join('; ');

  if (!evidences.length) {
    return { status: 'NO_EVALUABLE', detalle: detail };
  }

  if (
    evidences.some(
      evidence =>
        evidence.status === 'NO_CUMPLE' || evidence.status === 'PARCIAL'
    )
  ) {
    return { status: 'NO_CUMPLE', detalle: detail };
  }

  if (
    evidences.every(evidence => evidence.status === 'CUMPLE') &&
    !incompleteConfiguration
  ) {
    return { status: 'CUMPLE', detalle: detail };
  }

  return { status: 'NO_EVALUABLE', detalle: detail };
};

// Facts of the control itself, of one evidence and type.
const facts = (
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

const attribute = (event: ENSNormalizedEvent, field: string): string =>
  String(event.attributes?.[field] ?? '')
    .trim()
    .toLowerCase();

const serviceOf = (event: ENSNormalizedEvent): string =>
  String(event.attributes?.servicio ?? 'sin servicio');

const decideAttemptLimit = (
  context: ENSPolicyContext,
  incompleteConfiguration: boolean
): ENSPolicyDecision => {
  const policies = facts(context, 'EV-02', 'lockout_policy');

  const disabled = policies.filter(
    event => attribute(event, 'bloqueo') === 'desactivado'
  );

  const automatic = policies.filter(
    event => attribute(event, 'reactivacion') === 'automatica'
  );

  const ev02 = statusOf(context, 'EV-02');
  const ev03 = statusOf(context, 'EV-03');

  const parameters = ['P-02', 'P-03', 'P-04'];
  const evidences = ['EV-02', 'EV-03'];

  const actual = `EV-02=${ev02?.status || 'SIN_DATOS'}; EV-03=${
    ev03?.status || 'SIN_DATOS'
  }; políticas observadas=${policies.length}; sin límite=${
    disabled.length
  }; reactivación automática=${automatic.length}`;

  const trace = {
    parameterIds: parameters,
    evidenceIds: evidences,
    ruleType: 'CONDITIONAL_REQUIRED' as const,
    expression:
      'bloqueo activado && reactivación por intervención && EV-02 CUMPLE && (EV-03 CUMPLE || EV-03 sin fallos con cobertura confirmada) && P-04 declarado',
    expected:
      'límite de intentos activo y no superior a P-03, reactivación por intervención documentada en P-04, y ningún origen por encima de P-03',
    actual,
  };

  // What was measured wins over any gap, as in the consolidation.
  if (disabled.length) {
    return decide(
      'op.acc.5.8',
      'NO_CUMPLE',
      `El servicio ${Array.from(new Set(disabled.map(serviceOf))).join(
        ', '
      )} declara el bloqueo por intentos DESACTIVADO: el número de intentos no está limitado, que es exactamente lo que op.acc.5.8 exige.`,
      { ...trace, eventIds: disabled.map(event => event.id) }
    );
  }

  if (automatic.length) {
    return decide(
      'op.acc.5.8',
      'NO_CUMPLE',
      `El servicio ${Array.from(new Set(automatic.map(serviceOf))).join(
        ', '
      )} reactiva las cuentas bloqueadas solo, por tiempo: op.acc.5.8 exige una intervención específica para reactivarlas.`,
      { ...trace, eventIds: automatic.map(event => event.id) }
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
      trace
    );
  }

  if (incompleteConfiguration) {
    return decide(
      'op.acc.5.8',
      'NO_EVALUABLE',
      'Falta configuración obligatoria del control (entre ella P-02, P-03 o P-04, el procedimiento de reactivación): sin ella no se puede afirmar que el límite de intentos conforme.',
      trace
    );
  }

  // Streaks alone can leave EV-02 green (none exceeds P-03) with no limit recorded: zero or few
  // failures do not prove the service locks. The POLICY accredits the limit and it must exist.
  const enabled = policies.filter(
    event =>
      attribute(event, 'bloqueo') === 'activado' &&
      Number.isFinite(Number(event.attributes?.intentos)) &&
      Number(event.attributes?.intentos) > 0
  );

  if (ev02?.status !== 'CUMPLE' || !enabled.length) {
    return decide(
      'op.acc.5.8',
      'NO_EVALUABLE',
      'EV-02 no acredita el límite de intentos: hace falta la política de bloqueo del servicio, activada y con un número de intentos no superior a P-03. Que no haya fallos, o que las rachas observadas sean cortas, no demuestra que haya límite.',
      trace
    );
  }

  if (ev03?.status === 'CUMPLE') {
    return decide(
      'op.acc.5.8',
      'CUMPLE',
      'El límite de intentos está activo y dentro de P-03, se reactiva por intervención, ningún origen supera P-03 y el procedimiento de reactivación está declarado en P-04.',
      trace
    );
  }

  // EV-03 without facts: no failures means no threshold to exceed. Valid only if the collector is
  // recorded as having looked at all services' logs.
  const definitionEv03 = getEvidenceDefinitions(CONTROL_ID).find(
    definition => definition.id === 'EV-03'
  );

  const withoutFactsEv03 =
    facts(context, 'EV-03', 'auth_failures_by_origin').length === 0;

  const coverage =
    definitionEv03?.judgment && withoutFactsEv03
      ? resolveCollectorCoverage(
          definitionEv03,
          definitionEv03.judgment,
          context.events.filter(
            event => !event.controlId || event.controlId === CONTROL_ID
          ),
          context.now || new Date()
        )
      : undefined;

  if (coverage?.coverage === 'CONFIRMADA') {
    return decide(
      'op.acc.5.8',
      'CUMPLE',
      `El límite de intentos está activo y dentro de P-03, se reactiva por intervención y el procedimiento está declarado en P-04. EV-03 no registra ningún fallo en la ventana y consta que el recolector miró: ${coverage.reason}`,
      {
        ...trace,
        eventIds: coverage.event ? [coverage.event.id] : [],
      }
    );
  }

  return decide(
    'op.acc.5.8',
    'NO_EVALUABLE',
    `EV-03 no permite afirmar que ningún ataque haya superado el límite${
      coverage ? `: ${coverage.reason}` : '.'
    }`,
    trace
  );
};

const decideComplexity = (
  context: ENSPolicyContext,
  incompleteConfiguration: boolean
): ENSPolicyDecision => {
  const policies = facts(context, 'EV-02', 'password_policy');

  const withoutRules = policies.filter(event => {
    const length = Number(event.attributes?.longitud_minima);

    return (
      attribute(event, 'complejidad') === 'desactivada' ||
      (Number.isFinite(length) && length <= 0)
    );
  });

  const withRules = policies.filter(event => {
    const length = Number(event.attributes?.longitud_minima);

    return (
      attribute(event, 'complejidad') === 'activada' &&
      Number.isFinite(length) &&
      length > 0
    );
  });

  const robustness = measureByEvidences(context, ['EV-02'], incompleteConfiguration);

  const trace = {
    parameterIds: ['P-01', 'P-03'],
    evidenceIds: ['EV-02'],
    expression:
      'normas de complejidad activadas con longitud mínima && EV-02 (robustez frente a la adivinación) CUMPLE',
    expected:
      'política de contraseñas con complejidad y longitud mínima, y límite de intentos dentro de P-03',
    actual: `${robustness.detalle}; políticas de contraseña=${policies.length}; sin normas=${withoutRules.length}`,
  };

  if (withoutRules.length) {
    return decide(
      'op.acc.5.r1.2',
      'NO_CUMPLE',
      `El servicio ${Array.from(new Set(withoutRules.map(serviceOf))).join(
        ', '
      )} no impone normas de complejidad a la contraseña.`,
      { ...trace, eventIds: withoutRules.map(event => event.id) }
    );
  }

  if (robustness.status === 'NO_CUMPLE') {
    return decide(
      'op.acc.5.r1.2',
      'NO_CUMPLE',
      'La contraseña no está protegida frente a ataques de adivinación: EV-02 supera el límite de intentos de P-03.',
      trace
    );
  }

  if (!withRules.length) {
    return decide(
      'op.acc.5.r1.2',
      'NO_EVALUABLE',
      'No consta ninguna política de contraseñas del servicio con complejidad activada y longitud mínima: la robustez frente a la adivinación sola no demuestra las normas de complejidad.',
      trace
    );
  }

  return decide(
    'op.acc.5.r1.2',
    robustness.status,
    robustness.status === 'CUMPLE'
      ? 'El servicio impone complejidad y longitud mínima a la contraseña, y el límite de intentos la protege frente a la adivinación.'
      : 'Constan normas de complejidad, pero EV-02 no acredita la robustez frente a la adivinación.',
    trace
  );
};

// Documentary: if P-ATT has an attestation the engine applies it BEFORE this decision, so it is
// only reached without a document.
const decideLastAccess = (
  context: ENSPolicyContext
): ENSPolicyDecision => {
  const value = context.configuration?.parameters.find(
    parameter => parameter.id === 'P-09'
  )?.value;

  const text = String(value ?? '').trim().toLowerCase();

  const declaredNot =
    value === false || ['false', 'no', '0'].includes(text);

  const declaredYes =
    value === true || ['true', 'sí', 'si', 'yes', '1'].includes(text);

  const trace = {
    parameterIds: ['P-09'],
    ruleType: 'COVERAGE_REQUIRED' as const,
    expression: 'P-09 = sí && fila de op.acc.5.r5.2 en P-ATT',
    expected: 'el servicio informa del último acceso y hay un documento que lo acredita',
    actual: `P-09=${value === undefined ? 'SIN_CONFIGURAR' : String(value)}`,
  };

  if (declaredNot) {
    return decide(
      'op.acc.5.r5.2',
      'NO_CUMPLE',
      'P-09 declara que el servicio NO informa al usuario del último acceso efectuado con su identidad, que R5 exige en MEDIO y ALTO.',
      trace
    );
  }

  if (declaredYes) {
    return decide(
      'op.acc.5.r5.2',
      'NO_EVALUABLE',
      'P-09 declara que el servicio informa del último acceso, pero no hay ninguna fila de op.acc.5.r5.2 en P-ATT con el documento o la captura que lo acredite.',
      trace
    );
  }

  return decide(
    'op.acc.5.r5.2',
    'NO_EVALUABLE',
    'P-09 no está declarado: no consta si el servicio informa del último acceso.',
    trace
  );
};


const evaluate = (context: ENSPolicyContext): ENSPolicyEvaluatorResult => {
  const decisions: ENSPolicyDecision[] = [];

  const valueP01 = context.configuration?.parameters.find(
    parameter => parameter.id === 'P-01'
  )?.value;

  const chosen = parseChosenReinforcement(valueP01);

  const validation = context.configuration
    ? validateControlConfiguration(context.configuration, context.level)
    : undefined;

  const incompleteConfiguration =
    !validation ||
    validation.missingRequired.length > 0 ||
    validation.invalidRequired.length > 0;

  const variables: ENSRuntimeVariable[] = [
    {
      name: 'refuerzoElegido',
      value: chosen || 'SIN_DECLARAR',
      parameterIds: ['P-01'],
      evidenceIds: ['EV-07'],
      eventIds: [],
      description:
        'Refuerzo de autenticación declarado en P-01. Decide qué requisitos de R1 a R4 cuentan en el denominador.',
    },
  ];

  const applies = (requirementId: string): boolean =>
    Boolean(
      context.control.requirements
        .find(requirement => requirement.id === requirementId)
        ?.applicability.levels.includes(context.level)
    );

  // Non-reinforcement items first. Order matters downstream: when two decisions touch the same
  // evidence with the same severity the bridge keeps the first, and .8's is the one that speaks of
  // EV-02 and EV-03.
  decisions.push(decideAttemptLimit(context, incompleteConfiguration));

  if (applies('op.acc.5.r5.2')) {
    decisions.push(decideLastAccess(context));
  }

  const chosenDecisions: ENSPolicyDecision[] = [];
  const notChosen: ENSPolicyDecision[] = [];

  REINFORCEMENTS.forEach(reinforcement => {
    OP_ACC_5_REQUIREMENTS_BY_REINFORCEMENT[reinforcement].forEach(requirementId => {
      if (!applies(requirementId)) {
        return;
      }

      const requirementDefinition = context.control.requirements.find(
        requirement => requirement.id === requirementId
      );

      const evidenceIds = requirementDefinition?.evidenceIds || [];

      // Without a choice there is no reinforcement to count or discard: all stay in the
      // denominator, unproven (the template's «control not evaluable»). Discarding them would give
      // 100 % without the mechanism ever being declared.
      if (!chosen) {
        chosenDecisions.push(
          decide(
            requirementId,
            'NO_EVALUABLE',
            `P-01 no declara un refuerzo válido (R1, R2, R3 o R4)${
              valueP01 === undefined ? '' : `: se recibió '${String(valueP01)}'`
            }. Sin saber qué mecanismo usa el servicio no se puede decir qué requisitos de refuerzo rigen ni verificarlos.`,
            {
              parameterIds: ['P-01'],
              expression: 'P-01 ∈ {R1, R2, R3, R4}',
              expected: 'un refuerzo declarado en P-01',
              actual: `P-01=${valueP01 === undefined ? 'SIN_CONFIGURAR' : String(valueP01)}`,
            }
          )
        );

        return;
      }

      if (reinforcement !== chosen) {
        notChosen.push(
          decide(
            requirementId,
            'NO_APLICA',
            `No es el refuerzo elegido: P-01 declara ${REINFORCEMENT_NAME[chosen]}. Los refuerzos de op.acc.5 son una elección, no una acumulación, y solo cuenta el declarado.`,
            {
              parameterIds: ['P-01'],
              // Only evidences EXCLUSIVE to non-chosen reinforcements may fall to NO_APLICA; the
              // shared one (EV-07) is protected by the chosen reinforcement's decision.
              evidenceIds,
              expression: `P-01 === ${reinforcement}`,
              expected: `${reinforcement} declarado en P-01`,
              actual: `P-01=${chosen}`,
            }
          )
        );

        return;
      }

      // R1 chosen at MEDIO or ALTO: direct failure, no log read.
      if (reinforcement === 'R1' && context.level !== 'BAJO') {
        chosenDecisions.push(
          decide(
            requirementId,
            'NO_CUMPLE',
            `P-01 declara R1 (contraseña sola) y el sistema es de nivel ${context.level}: desde MEDIO la contraseña sola no figura entre las opciones del ENS, hay que emplear R2, R3 o R4. Incumplimiento directo, que no depende de ningún registro.`,
            {
              parameterIds: ['P-01'],
              // The failure belongs to the MECHANISM: anchored on EV-07, not EV-02 (op.acc.5.8's
              // evidence, unrelated to the choice).
              evidenceIds: ['EV-07'],
              expression: `nivel ${context.level} && P-01 === R1`,
              expected: 'R2, R3 o R4 en nivel MEDIO o ALTO',
              actual: `P-01=R1; nivel=${context.level}`,
            }
          )
        );

        return;
      }

      // Documentary ones of the chosen reinforcement (r3.3, r4.3): decided by the attestation,
      // which the engine applies before any decision.
      if (!evidenceIds.length) {
        return;
      }

      if (requirementId === 'op.acc.5.r1.2') {
        chosenDecisions.push(decideComplexity(context, incompleteConfiguration));

        return;
      }

      const measurement = measureByEvidences(
        context,
        evidenceIds,
        incompleteConfiguration
      );

      chosenDecisions.push(
        decide(
          requirementId,
          measurement.status,
          measurement.status === 'CUMPLE'
            ? `Refuerzo elegido (${REINFORCEMENT_NAME[chosen]}): ${evidenceIds.join(', ')} lo acreditan.`
            : measurement.status === 'NO_CUMPLE'
            ? `Refuerzo elegido (${REINFORCEMENT_NAME[chosen]}): ${evidenceIds.join(', ')} incumple.`
            : `Refuerzo elegido (${REINFORCEMENT_NAME[chosen]}): ${evidenceIds.join(', ')} no permite demostrarlo${
                incompleteConfiguration
                  ? ' y falta configuración obligatoria del control'
                  : ''
              }.`,
          {
            parameterIds: requirementDefinition?.parameterIds || ['P-01'],
            evidenceIds,
            expression: `P-01 === ${reinforcement} && ${evidenceIds.join(' && ')} CUMPLE`,
            expected: `${evidenceIds.join(', ')} en CUMPLE`,
            actual: measurement.detalle,
          }
        )
      );
    });
  });

  // The chosen reinforcement's before the NO_APLICA ones, for the same reason: EV-07 is shared by
  // R1 to R4 and must not end up «not applicable» when the chosen reinforcement needs it.
  decisions.push(...chosenDecisions, ...notChosen);

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
    // R1 to R4 carry the three levels: which reinforcement counts is decided by P-01 in the
    // evaluator, not by level. R1 outside BAJO is NO_CUMPLE if chosen.
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
    // The ENS requires R6 and R7 at no level of op.acc.5: without levels the engine evaluates them
    // NO_APLICA, outside the denominator.
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
