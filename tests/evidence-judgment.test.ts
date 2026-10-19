/** Tests of the engine's judgment primitives. */
import {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../common/ens/configuration/types';
import { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { consolidateAgentComplianceResults } from '../common/ens/core/compliance-state/consolidation';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { buildOpAcc1ReportModel } from '../public/ens/reports/op-acc-1-report-model';
import {
  judgeEvidence,
  parseReferenceList,
  parseReferenceRows,
  resolveCollectorCoverage,
  splitRowCells,
} from '../common/ens/core/evidence/judgment';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import {
  ENSEvidenceBaseFields,
  ENSEvidenceDefinition,
  ENSEvidenceJudgment,
  ENSEvidenceResolved,
} from '../common/ens/core/evidence/types';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail: string = ''
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const section = (title: string): void =>
  console.log(`\n${title}`);

let eventCounter = 0;

const event = (
  eventType: string,
  attributes: Record<string, unknown>,
  extra: Partial<ENSNormalizedEvent> = {}
): ENSNormalizedEvent => ({
  id: `evt-${(eventCounter += 1)}`,
  controlId: 'op.acc.1',
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-07-30T10:00:00Z',
  ruleId: '106801',
  attributes,
  ...extra,
});

const JUDGMENT_NONE: ENSEvidenceJudgment = {
  primitive: 'NINGUNO_EN_LISTA',
  parameterId: 'P-04',
  factEventTypes: ['generic_account_login'],
  factField: 'usuario',
};

const JUDGMENT_ALL: ENSEvidenceJudgment = {
  primitive: 'TODOS_EN_LISTA',
  parameterId: 'P-04',
  factEventTypes: ['auth_success'],
  factField: 'usuario',
};

const JUDGMENT_THRESHOLD: ENSEvidenceJudgment = {
  primitive: 'UMBRAL_MAXIMO',
  parameterId: 'P-05',
  factEventTypes: ['account_offboarding'],
  factField: 'dias_desde_baja',
};

const catalogDefinition = (
  judgment: ENSEvidenceJudgment,
  extra: Partial<ENSEvidenceDefinition> = {}
): ENSEvidenceDefinition => ({
  id: 'EV-XX',
  controlId: 'op.acc.1',
  title: 'Evidencia de prueba',
  description: 'Evidencia de prueba',
  requirements: ['op.acc.1.1'],
  levels: ['BAJO', 'MEDIO', 'ALTO'],
  category: 'ACCESS_CONTROL',
  criticality: 'HIGH',
  sourceTypes: ['WAZUH_ALERT', 'LOCAL_JSON', 'SCRIPT'],
  expectedEventTypes: ['evidence_state'],
  relatedRules: ['106801'],
  auditQuestion: '¿Pregunta de auditoría?',
  judgment,
  ...extra,
});

const base = (
  definition: ENSEvidenceDefinition
): ENSEvidenceBaseFields => ({
  id: definition.id,
  controlId: definition.controlId,
  title: definition.title,
  description: definition.description,
  requirements: definition.requirements,
  levels: definition.levels,
  category: definition.category,
  criticality: definition.criticality,
  sourceTypes: definition.sourceTypes,
  expectedEventTypes: definition.expectedEventTypes,
  relatedRules: definition.relatedRules,
  auditQuestion: definition.auditQuestion,
  qualityRequirements: definition.qualityRequirements,
});

const configuration = (
  parameterId: string,
  value: ENSControlParameter['value'],
  name: string = 'cuentas_genericas_prohibidas'
): ENSControlConfiguration => ({
  controlId: 'op.acc.1',
  controlName: 'Identificación',
  family: 'op',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: [
    {
      id: parameterId,
      controlId: 'op.acc.1',
      name: name,
      label: name,
      description: '',
      levels: ['BAJO', 'MEDIO', 'ALTO'],
      requirements: ['op.acc.1.1'],
      type: 'list',
      required: true,
      wazuhUsage: '',
      ensfacilUsage: '',
      evidenceIds: ['EV-XX'],
      ruleIds: ['106801'],
      ifNotConfigured: '',
      value,
    },
  ],
});

const parameter = (
  overrides: Partial<ENSControlParameter> & {
    id: string;
  }
): ENSControlParameter => {
  const merged = {
    controlId: 'op.acc.1',
    label: '',
    description: '',
    levels: ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[],
    requirements: ['op.acc.1.1'],
    type: 'list' as ENSControlParameter['type'],
    required: true,
    wazuhUsage: '',
    ensfacilUsage: '',
    evidenceIds: ['EV-XX'],
    ruleIds: ['106801'],
    ifNotConfigured: '',
    name: overrides.id,
    ...overrides,
  };

  return {
    ...merged,
    name: merged.name || merged.id,
  };
};

const config = (
  ...parameters: ENSControlParameter[]
): ENSControlConfiguration => ({
  controlId: 'op.acc.1',
  controlName: 'Identificación',
  family: 'op',
  enabled: true,
  applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
  parameters: parameters,
});

const judges = (
  judgment: ENSEvidenceJudgment,
  events: ENSNormalizedEvent[],
  config?: ENSControlConfiguration,
  extra: Partial<ENSEvidenceDefinition> = {},
  now?: Date
): ENSEvidenceResolved => {
  const definition = catalogDefinition(judgment, extra);

  return judgeEvidence(
    definition,
    judgment,
    base(definition),
    events,
    config,
    now
  );
};

const motives = (
  result: ENSEvidenceResolved
): string => result.observations.join(' | ');

section('NINGUNO_EN_LISTA');

{
  const breaches = judges(
    JUDGMENT_NONE,
    [event('generic_account_login', { usuario: 'admin' })],
    configuration('P-04', ['admin', 'guest'])
  );

  check(
    'fact in the list · NO_CUMPLE',
    breaches.status === 'NO_CUMPLE',
    breaches.status
  );

  check(
    'fact in the list · the motive names the specific account',
    motives(breaches).includes("'admin'"),
    motives(breaches)
  );

  check(
    'fact in the list · traceability points to the fact\'s event',
    breaches.resolvedEventType === 'generic_account_login' &&
      Boolean(breaches.resolvedEventId),
    String(breaches.resolvedEventId)
  );

  const complies = judges(
    JUDGMENT_NONE,
    [event('generic_account_login', { usuario: 'jgomez' })],
    configuration('P-04', ['admin', 'guest'])
  );

  check(
    'fact outside the list · CUMPLE',
    complies.status === 'CUMPLE',
    complies.status
  );

  const withoutParameter = judges(
    JUDGMENT_NONE,
    [event('generic_account_login', { usuario: 'admin' })],
    undefined
  );

  check(
    'fact without parameter · NO_EVALUABLE, never a verdict',
    withoutParameter.status === 'NO_EVALUABLE',
    withoutParameter.status
  );

  check(
    'fact without parameter · the motive says the parameter is missing',
    motives(withoutParameter).includes('P-04'),
    motives(withoutParameter)
  );

  const emptyParameter = judges(
    JUDGMENT_NONE,
    [event('generic_account_login', { usuario: 'admin' })],
    configuration('P-04', [])
  );

  check(
    'fact with empty parameter · NO_EVALUABLE',
    emptyParameter.status === 'NO_EVALUABLE',
    emptyParameter.status
  );

  const withoutFact = judges(
    JUDGMENT_NONE,
    [],
    configuration('P-04', ['admin', 'guest'])
  );

  check(
    'parameter without fact · NO_EVALUABLE, NOT the false green',
    withoutFact.status === 'NO_EVALUABLE',
    withoutFact.status
  );

  check(
    'parameter without fact · the motive explains why nothing is asserted',
    motives(withoutFact).includes('ningún hecho observado'),
    motives(withoutFact)
  );

  const none = judges(JUDGMENT_NONE, [], undefined);

  check(
    'neither fact nor parameter · NO_EVALUABLE',
    none.status === 'NO_EVALUABLE',
    none.status
  );

  check(
    'neither fact nor parameter · the motive names both absences',
    motives(none).includes('ningún hecho observado') &&
      motives(none).includes('P-04'),
    motives(none)
  );
}

section('TODOS_EN_LISTA');

{
  const breaches = judges(
    JUDGMENT_ALL,
    [
      event('auth_success', { usuario: 'jgomez' }),
      event('auth_success', { usuario: 'intruso' }),
    ],
    configuration('P-04', ['jgomez', 'mlopez'])
  );

  check(
    'fact outside the list · NO_CUMPLE',
    breaches.status === 'NO_CUMPLE',
    breaches.status
  );

  check(
    'fact outside the list · the motive names the one that breaches and not the one that complies',
    motives(breaches).includes("'intruso'") &&
      !motives(breaches).includes("'jgomez'"),
    motives(breaches)
  );

  const complies = judges(
    JUDGMENT_ALL,
    [
      event('auth_success', { usuario: 'jgomez' }),
      event('auth_success', { usuario: 'mlopez' }),
    ],
    configuration('P-04', ['jgomez', 'mlopez'])
  );

  check(
    'all in the list · CUMPLE',
    complies.status === 'CUMPLE',
    complies.status
  );

  const withoutParameter = judges(
    JUDGMENT_ALL,
    [event('auth_success', { usuario: 'jgomez' })],
    undefined
  );

  check(
    'fact without parameter · NO_EVALUABLE',
    withoutParameter.status === 'NO_EVALUABLE',
    withoutParameter.status
  );

  const withoutFact = judges(
    JUDGMENT_ALL,
    [],
    configuration('P-04', ['jgomez'])
  );

  check(
    'parameter without fact · NO_EVALUABLE',
    withoutFact.status === 'NO_EVALUABLE',
    withoutFact.status
  );

  const none = judges(JUDGMENT_ALL, [], undefined);

  check(
    'neither fact nor parameter · NO_EVALUABLE',
    none.status === 'NO_EVALUABLE',
    none.status
  );
}

section('UMBRAL_MAXIMO');

{
  const breaches = judges(
    JUDGMENT_THRESHOLD,
    [
      event('account_offboarding', { dias_desde_baja: 1 }),
      event('account_offboarding', { dias_desde_baja: 30 }),
    ],
    configuration('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  check(
    'value above the threshold · NO_CUMPLE',
    breaches.status === 'NO_CUMPLE',
    breaches.status
  );

  check(
    'value above the threshold · the motive names the specific value',
    motives(breaches).includes("'30'"),
    motives(breaches)
  );

  const complies = judges(
    JUDGMENT_THRESHOLD,
    [event('account_offboarding', { dias_desde_baja: 7 })],
    configuration('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  check(
    'value equal to the threshold · CUMPLE (does not exceed it)',
    complies.status === 'CUMPLE',
    complies.status
  );

  const withoutParameter = judges(
    JUDGMENT_THRESHOLD,
    [event('account_offboarding', { dias_desde_baja: 30 })],
    undefined
  );

  check(
    'fact without parameter · NO_EVALUABLE, even with a huge value',
    withoutParameter.status === 'NO_EVALUABLE',
    withoutParameter.status
  );

  const nonNumericParameter = judges(
    JUDGMENT_THRESHOLD,
    [event('account_offboarding', { dias_desde_baja: 30 })],
    configuration('P-05', 'abc', 'plazo_max_deshabilitar_dias')
  );

  check(
    'non-numeric parameter · NO_EVALUABLE with motive',
    nonNumericParameter.status === 'NO_EVALUABLE' &&
      motives(nonNumericParameter).includes('P-05'),
    motives(nonNumericParameter)
  );

  const withoutFact = judges(
    JUDGMENT_THRESHOLD,
    [],
    configuration('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  check(
    'parameter without fact · NO_EVALUABLE',
    withoutFact.status === 'NO_EVALUABLE',
    withoutFact.status
  );

  const none = judges(JUDGMENT_THRESHOLD, [], undefined);

  check(
    'neither fact nor parameter · NO_EVALUABLE',
    none.status === 'NO_EVALUABLE',
    none.status
  );

  const unreadableValue = judges(
    JUDGMENT_THRESHOLD,
    [event('account_offboarding', { dias_desde_baja: 'muchos' })],
    configuration('P-05', 7, 'plazo_max_deshabilitar_dias')
  );

  check(
    'non-numeric observed value · NO_EVALUABLE, not CUMPLE',
    unreadableValue.status === 'NO_EVALUABLE',
    unreadableValue.status
  );
}

section('List comparison');

{
  const upperCase = judges(
    JUDGMENT_NONE,
    [event('generic_account_login', { usuario: '  ADMIN ' })],
    configuration('P-04', ['admin'])
  );

  check(
    'case-insensitive and with trimmed spaces',
    upperCase.status === 'NO_CUMPLE',
    upperCase.status
  );

  const legacyString = judges(
    JUDGMENT_NONE,
    [event('generic_account_login', { usuario: 'test' })],
    configuration('P-04', 'admin, guest\ntest')
  );

  check(
    'parameter stored as a string · split by commas and line breaks',
    legacyString.status === 'NO_CUMPLE',
    legacyString.status
  );

  check(
    "parseReferenceList · NEVER splits on '|' (it separates the fields of an element)",
    parseReferenceList('srv-dc01 | Windows').length === 1 &&
      parseReferenceList('srv-dc01 | Windows')[0] ===
        'srv-dc01 | Windows',
    JSON.stringify(parseReferenceList('srv-dc01 | Windows'))
  );

  const listInFact = judges(
    JUDGMENT_NONE,
    [
      event('generic_account_login', {
        usuario: ['jgomez', 'guest'],
      }),
    ],
    configuration('P-04', ['admin', 'guest'])
  );

  check(
    'a field with several values counts as several facts',
    listInFact.status === 'NO_CUMPLE' &&
      motives(listInFact).includes("'guest'"),
    motives(listInFact)
  );
}

section('Unreadable facts');

{
  const sinCampo = judges(
    JUDGMENT_NONE,
    [event('generic_account_login', { otro_campo: 'x' })],
    configuration('P-04', ['admin'])
  );

  check(
    'fact event without the field · NO_EVALUABLE, not CUMPLE',
    sinCampo.status === 'NO_EVALUABLE',
    sinCampo.status
  );

  const mix = judges(
    JUDGMENT_NONE,
    [
      event('generic_account_login', { usuario: 'jgomez' }),
      event('generic_account_login', { otro_campo: 'x' }),
    ],
    configuration('P-04', ['admin'])
  );

  check(
    'readable non-breaching fact + unreadable fact · NO_EVALUABLE, what was observed is incomplete',
    mix.status === 'NO_EVALUABLE',
    mix.status
  );

  const synthetic = judges(
    JUDGMENT_NONE,
    [
      event(
        'generic_account_login',
        { usuario: 'admin' },
        { isSynthetic: true }
      ),
    ],
    configuration('P-04', ['admin']),
    { qualityRequirements: { rejectSynthetic: true } }
  );

  check(
    'synthetic event with rejectSynthetic · produces no NO_CUMPLE',
    synthetic.status === 'NO_EVALUABLE',
    synthetic.status
  );
}

section('Collector coverage (T1.3)');

{
  const NOW = new Date(
    '2026-07-30T12:00:00Z'
  );

  const heartbeat = (
    attributes: Record<string, unknown>,
    timestamp: string = '2026-07-30T11:30:00Z'
  ): ENSNormalizedEvent =>
    event(
      'collector_run',
      attributes,
      { timestamp }
    );

  const healthyHeartbeat = () =>
    heartbeat({
      resultado: 'completada',
      evidencias_cubiertas:
        'EV-XX,EV-05,EV-06',
    });

  const coverage = (
    events: ENSNormalizedEvent[]
  ) =>
    resolveCollectorCoverage(
      catalogDefinition(JUDGMENT_NONE),
      JUDGMENT_NONE,
      events,
      NOW
    );

  check(
    'without any collector_run · DESCONOCIDA',
    coverage([]).coverage === 'DESCONOCIDA',
    coverage([]).coverage
  );

  check(
    'correct heartbeat declaring the evidence · CONFIRMADA',
    coverage([healthyHeartbeat()]).coverage ===
      'CONFIRMADA',
    coverage([healthyHeartbeat()]).reason
  );

  const withFailure = coverage([
    heartbeat({
      resultado: 'sin_evidencias',
      evidencias_cubiertas: 'EV-XX',
    }),
  ]);

  check(
    'heartbeat declaring failure · AUSENTE',
    withFailure.coverage === 'AUSENTE',
    withFailure.reason
  );

  const notCovered = coverage([
    heartbeat({
      resultado: 'completada',
      evidencias_cubiertas: 'EV-05,EV-06',
    }),
  ]);

  check(
    'correct heartbeat that does NOT declare this evidence · AUSENTE',
    notCovered.coverage === 'AUSENTE',
    notCovered.reason
  );

  check(
    'correct heartbeat that does not declare this evidence · the motive explains it',
    notCovered.reason.includes('EV-XX'),
    notCovered.reason
  );

  const withoutCoverageField = coverage([
    heartbeat({ resultado: 'completada' }),
  ]);

  check(
    'heartbeat from an agent predating the contract (without evidencias_cubiertas) · DESCONOCIDA',
    withoutCoverageField.coverage ===
      'DESCONOCIDA',
    withoutCoverageField.reason
  );

  const withoutResult = coverage([
    heartbeat({
      evidencias_cubiertas: 'EV-XX',
    }),
  ]);

  check(
    'heartbeat that declares no result · DESCONOCIDA, CONFIRMADA has to be earned',
    withoutResult.coverage === 'DESCONOCIDA',
    withoutResult.reason
  );

  const tooOld = coverage([
    heartbeat(
      {
        resultado: 'completada',
        evidencias_cubiertas: 'EV-XX',
      },
      '2026-07-28T11:30:00Z'
    ),
  ]);

  check(
    'lower bound · a two-day-old heartbeat does not cover the window',
    tooOld.coverage ===
      'DESCONOCIDA',
    tooOld.reason
  );

  const inFuture = coverage([
    heartbeat(
      {
        resultado: 'completada',
        evidencias_cubiertas: 'EV-XX',
      },
      '2099-01-01T00:00:00Z'
    ),
  ]);

  check(
    'upper bound · a heartbeat dated 2099 is NOT valid as a perpetual heartbeat',
    inFuture.coverage === 'DESCONOCIDA',
    `${inFuture.coverage} — ${inFuture.reason}`
  );

  check(
    'upper bound · the motive names the future date, it does not silently discard',
    inFuture.reason.includes('2099'),
    inFuture.reason
  );

  const slightSkew = coverage([
    heartbeat(
      {
        resultado: 'completada',
        evidencias_cubiertas: 'EV-XX',
      },
      '2026-07-30T12:02:00Z'
    ),
  ]);

  check(
    'upper bound · two minutes of clock skew are still coverage',
    slightSkew.coverage === 'CONFIRMADA',
    slightSkew.reason
  );

  const green = judges(
    JUDGMENT_NONE,
    [healthyHeartbeat()],
    configuration('P-04', ['admin']),
    {},
    NOW
  );

  check(
    'NINGUNO_EN_LISTA · coverage CONFIRMADA and zero facts · CUMPLE',
    green.status === 'CUMPLE',
    `${green.status} — ${motives(green)}`
  );

  check(
    'CUMPLE by absence · the motive says which heartbeat it rests on',
    motives(green).includes(
      'Cobertura del recolector: CONFIRMADA'
    ),
    motives(green)
  );

  const gris = judges(
    JUDGMENT_NONE,
    [],
    configuration('P-04', ['admin']),
    {},
    NOW
  );

  check(
    'NINGUNO_EN_LISTA · no heartbeat and zero facts · still NO_EVALUABLE',
    gris.status === 'NO_EVALUABLE',
    gris.status
  );

  check(
    'the «parámetro sin hechos» motive declares the collector\'s coverage',
    motives(gris).includes(
      'Cobertura del recolector: DESCONOCIDA'
    ),
    motives(gris)
  );

  const greyFuture = judges(
    JUDGMENT_NONE,
    [
      heartbeat(
        {
          resultado: 'completada',
          evidencias_cubiertas: 'EV-XX',
        },
        '2099-01-01T00:00:00Z'
      ),
    ],
    configuration('P-04', ['admin']),
    {},
    NOW
  );

  check(
    'a heartbeat from the future does NOT turn the absence of facts into CUMPLE',
    greyFuture.status === 'NO_EVALUABLE',
    `${greyFuture.status} — ${motives(greyFuture)}`
  );

  const allWithoutFacts = judges(
    JUDGMENT_ALL,
    [healthyHeartbeat()],
    configuration('P-04', ['jgomez']),
    {},
    NOW
  );

  check(
    'TODOS_EN_LISTA · coverage CONFIRMADA and zero facts · NO_EVALUABLE, not CUMPLE',
    allWithoutFacts.status === 'NO_EVALUABLE',
    `${allWithoutFacts.status} — ${motives(allWithoutFacts)}`
  );

  const thresholdWithoutFacts = judges(
    JUDGMENT_THRESHOLD,
    [healthyHeartbeat()],
    configuration(
      'P-05',
      7,
      'plazo_max_deshabilitar_dias'
    ),
    {},
    NOW
  );

  check(
    'UMBRAL_MAXIMO · coverage CONFIRMADA and zero facts · NO_EVALUABLE, not CUMPLE',
    thresholdWithoutFacts.status === 'NO_EVALUABLE',
    `${thresholdWithoutFacts.status} — ${motives(thresholdWithoutFacts)}`
  );

  const coveredWithUnreadable = judges(
    JUDGMENT_NONE,
    [
      healthyHeartbeat(),
      event('generic_account_login', {
        otro_campo: 'x',
      }),
    ],
    configuration('P-04', ['admin']),
    {},
    NOW
  );

  check(
    'coverage CONFIRMADA + unreadable facts · NO_EVALUABLE, what was observed is incomplete',
    coveredWithUnreadable.status ===
      'NO_EVALUABLE',
    `${coveredWithUnreadable.status} — ${motives(coveredWithUnreadable)}`
  );
}

section('Integration with the engine');

{
  const definitions = getEvidenceDefinitions('op.acc.1');

  const ev03 = definitions.find(
    candidate => candidate.id === 'EV-03'
  );

  if (!ev03) {
    check('op.acc.1 EV-03 exists in the catalog', false);
  } else {
    check(
      'op.acc.1 EV-03 declares judgment in the catalog (T1.3)',
      ev03.judgment?.primitive ===
        'NINGUNO_EN_LISTA' &&
        ev03.judgment?.parameterId === 'P-04',
      JSON.stringify(ev03.judgment)
    );

    check(
      'EV-03 points to the raw fact the agent emits',
      Boolean(
        ev03.judgment?.factEventTypes.includes(
          'account_authenticated'
        ) &&
          ev03.judgment?.factField === 'usuario'
      ),
      JSON.stringify(ev03.judgment)
    );

    const events: ENSNormalizedEvent[] = [
      event(
        'evidence_state',
        {},
        {
          evidenceId: 'EV-03',
          status: 'CUMPLE',
          timestamp: '2026-07-30T11:00:00Z',
        }
      ),
      event('account_authenticated', {
        usuario: 'admin',
      }),
    ];

    const judged = resolveEvidenceForControl(
      'op.acc.1',
      events,
      undefined,
      'ALTO',
      configuration('P-04', ['admin', 'guest'])
    ).find(evidence => evidence.id === 'EV-03');

    check(
      'the agent\'s evidence_state CUMPLE no longer overrides EV-03',
      judged?.status === 'NO_CUMPLE',
      String(judged?.status)
    );

    check(
      'the motive names the specific account of the raw fact',
      Boolean(judged && motives(judged).includes("'admin'")),
      judged ? motives(judged) : ''
    );

    check(
      'traceability points to the raw fact\'s event, not to the evidence_state',
      judged?.resolvedEventType ===
        'account_authenticated',
      String(judged?.resolvedEventType)
    );

    const withoutConfiguration = resolveEvidenceForControl(
      'op.acc.1',
      events,
      undefined,
      'ALTO'
    ).find(evidence => evidence.id === 'EV-03');

    check(
      'without configuration · NO_EVALUABLE, even with the evidence_state CUMPLE in front',
      withoutConfiguration?.status === 'NO_EVALUABLE',
      String(withoutConfiguration?.status)
    );

    const legacy = resolveEvidenceForControl(
      'op.acc.1',
      [
        event(
          'auth_success',
          { usuario: 'guest' },
          { status: 'CUMPLE' }
        ),
      ],
      undefined,
      'ALTO',
      configuration('P-04', ['admin', 'guest'])
    ).find(evidence => evidence.id === 'EV-03');

    check(
      "an old agent's 'auth_success' is re-judged with today's P-04 (it said CUMPLE)",
      legacy?.status === 'NO_CUMPLE',
      String(legacy?.status)
    );
  }
}

section('Acceptance · P-04 prevails over EV-03 without touching the agent');

{
  const AGENT_FACT: ENSNormalizedEvent[] = [
    event('account_authenticated', {
      usuario: 'jgomez',
      origen: '10.0.0.12',
    }),
  ];

  const verdict = (
    p04: string[]
  ): ENSEvidenceResolved | undefined =>
    resolveEvidenceForControl(
      'op.acc.1',
      AGENT_FACT,
      undefined,
      'ALTO',
      configuration('P-04', p04)
    ).find(
      evidence => evidence.id === 'EV-03'
    );

  const withDefault = verdict([
    'admin',
    'administrador',
    'guest',
    'test',
    'temp',
    'usuario1',
  ]);

  const withJgomezForbidden = verdict([
    'admin',
    'jgomez',
  ]);

  check(
    'default P-04 · jgomez is not in the list · CUMPLE',
    withDefault?.status === 'CUMPLE',
    `${withDefault?.status} — ${withDefault ? motives(withDefault) : ''}`
  );

  check(
    'jgomez added to P-04 · SAME agent event · becomes NO_CUMPLE',
    withJgomezForbidden?.status === 'NO_CUMPLE',
    `${withJgomezForbidden?.status} — ${withJgomezForbidden ? motives(withJgomezForbidden) : ''}`
  );

  check(
    'the NO_CUMPLE motive names the account, it does not say «algo falló»',
    Boolean(
      withJgomezForbidden &&
        motives(
          withJgomezForbidden
        ).includes("'jgomez'")
    ),
    withJgomezForbidden
      ? motives(withJgomezForbidden)
      : ''
  );

  check(
    'jgomez removed from P-04 · the verdict goes back to CUMPLE',
    verdict(['admin', 'guest'])?.status ===
      'CUMPLE',
    String(verdict(['admin', 'guest'])?.status)
  );

  const breachScenario = resolveEvidenceForControl(
    'op.acc.1',
    [
      event('account_authenticated', {
        usuario: 'admin',
        origen: '10.0.0.55',
      }),
    ],
    undefined,
    'ALTO',
    configuration('P-04', [
      'admin',
      'administrador',
      'guest',
      'test',
      'temp',
      'usuario1',
    ])
  ).find(evidence => evidence.id === 'EV-03');

  check(
    'simulator scenario `incumple` · NO_CUMPLE with the default P-04',
    breachScenario?.status === 'NO_CUMPLE',
    String(breachScenario?.status)
  );
}

section('NINGUNO_FUERA_DE_LISTA');

{
  const NOW = new Date('2026-08-05T12:00:00Z');

  const JUDGMENT_SWEEP: ENSEvidenceJudgment = {
    primitive: 'NINGUNO_FUERA_DE_LISTA',
    parameterId: 'P-10',
    factEventTypes: ['suid_sgid'],
    factField: 'ruta',
  };

  const JUDGMENT_ACCREDITS: ENSEvidenceJudgment = {
    ...JUDGMENT_SWEEP,
    primitive: 'TODOS_EN_LISTA',
  };

  const BASE_SUID = config(
    parameter({
      id: 'P-10',
      name: 'suid_autorizados',
      value: ['/usr/bin/sudo', '/usr/bin/passwd'],
    })
  );

  const finding = (ruta: string) => [
    event('suid_sgid', { ruta }),
  ];

  const sweepHeartbeat = event(
    'collector_run',
    {
      resultado: 'completada',
      evidencias_cubiertas: 'EV-XX',
    },
    { timestamp: '2026-08-05T11:30:00Z' }
  );

  const inside = judges(
    JUDGMENT_SWEEP,
    finding('/usr/bin/sudo'),
    BASE_SUID
  );

  check(
    'finding in the baseline · CUMPLE',
    inside.status === 'CUMPLE',
    `${inside.status} — ${motives(inside)}`
  );

  const outside = judges(
    JUDGMENT_SWEEP,
    finding('/tmp/puerta-trasera'),
    BASE_SUID
  );

  check(
    'finding outside the baseline · NO_CUMPLE',
    outside.status === 'NO_CUMPLE',
    outside.status
  );

  check(
    'the motive names the specific binary, it does not say «hay hallazgos»',
    motives(outside).includes(
      "'/tmp/puerta-trasera'"
    ),
    motives(outside)
  );

  check(
    'with facts · NINGUNO_FUERA_DE_LISTA and TODOS_EN_LISTA agree (complying)',
    judges(
      JUDGMENT_ACCREDITS,
      finding('/usr/bin/sudo'),
      BASE_SUID
    ).status === inside.status,
    inside.status
  );

  check(
    'with facts · NINGUNO_FUERA_DE_LISTA and TODOS_EN_LISTA agree (breaching)',
    judges(
      JUDGMENT_ACCREDITS,
      finding('/tmp/puerta-trasera'),
      BASE_SUID
    ).status === outside.status,
    outside.status
  );

  const cleanSweep = judges(
    JUDGMENT_SWEEP,
    [sweepHeartbeat],
    BASE_SUID,
    {},
    NOW
  );

  check(
    'sweep without findings and coverage CONFIRMADA · CUMPLE',
    cleanSweep.status === 'CUMPLE',
    `${cleanSweep.status} — ${motives(cleanSweep)}`
  );

  check(
    'the clean-sweep motive says it was swept, not that the list was «looked at»',
    motives(cleanSweep).includes(
      'el recolector barrió'
    ),
    motives(cleanSweep)
  );

  const accreditsWithoutFacts = judges(
    JUDGMENT_ACCREDITS,
    [sweepHeartbeat],
    BASE_SUID,
    {},
    NOW
  );

  check(
    'SAME case with TODOS_EN_LISTA · NO_EVALUABLE (there they do differ)',
    accreditsWithoutFacts.status === 'NO_EVALUABLE',
    `${accreditsWithoutFacts.status} — ${motives(accreditsWithoutFacts)}`
  );

  const sweepWithoutHeartbeat = judges(
    JUDGMENT_SWEEP,
    [],
    BASE_SUID,
    {},
    NOW
  );

  check(
    'sweep without findings and WITHOUT heartbeat · NO_EVALUABLE, not the false green',
    sweepWithoutHeartbeat.status === 'NO_EVALUABLE',
    sweepWithoutHeartbeat.status
  );

  const sweepWithoutParameter = judges(
    JUDGMENT_SWEEP,
    finding('/usr/bin/sudo'),
    undefined
  );

  check(
    'finding without parameter · NO_EVALUABLE',
    sweepWithoutParameter.status ===
      'NO_EVALUABLE',
    sweepWithoutParameter.status
  );

  const sweepNeither = judges(
    JUDGMENT_SWEEP,
    [],
    undefined
  );

  check(
    'neither finding nor parameter · NO_EVALUABLE',
    sweepNeither.status === 'NO_EVALUABLE',
    sweepNeither.status
  );
}

section(
  'Case · forbidden list versus authorized list'
);

{
  const JUDGMENT_AUTHORIZED: ENSEvidenceJudgment = {
    primitive: 'TODOS_EN_LISTA',
    parameterId: 'P-07',
    factEventTypes: ['account_active'],
    factField: 'usuario',
  };

  const LIST = config(
    parameter({
      id: 'P-07',
      name: 'lista_usuarios_autorizados',
      value: ['jgomez'],
    })
  );

  const exact = judges(
    JUDGMENT_AUTHORIZED,
    [event('account_active', { usuario: 'jgomez' })],
    LIST
  );

  check(
    'authorized list · the exact name CUMPLE',
    exact.status === 'CUMPLE',
    exact.status
  );

  const otherCase = judges(
    JUDGMENT_AUTHORIZED,
    [event('account_active', { usuario: 'Jgomez' })],
    LIST
  );

  check(
    "authorized list · 'Jgomez' does NOT pass for the authorized 'jgomez'",
    otherCase.status === 'NO_CUMPLE',
    `${otherCase.status} — ${motives(otherCase)}`
  );

  const forbiddenOtherCase = judges(
    JUDGMENT_NONE,
    [
      event('generic_account_login', {
        usuario: 'Admin',
      }),
    ],
    configuration('P-04', ['admin'])
  );

  check(
    "forbidden list · 'Admin' DOES count as the forbidden account 'admin'",
    forbiddenOtherCase.status === 'NO_CUMPLE',
    forbiddenOtherCase.status
  );
}

section('UMBRAL_MINIMO');

{
  const JUDGMENT_MINIMUM: ENSEvidenceJudgment = {
    primitive: 'UMBRAL_MINIMO',
    parameterId: 'P-06',
    factEventTypes: ['account_deleted'],
    factField: 'dias_retenida',
  };

  const RETENTION = config(
    parameter({
      id: 'P-06',
      name: 'periodo_retencion_cuentas_dias',
      type: 'duration_days',
      value: 365,
    })
  );

  const pronto = judges(
    JUDGMENT_MINIMUM,
    [
      event('account_deleted', {
        dias_retenida: 200,
      }),
    ],
    RETENTION
  );

  check(
    'value below the minimum · NO_CUMPLE',
    pronto.status === 'NO_CUMPLE',
    pronto.status
  );

  check(
    'the motive names the specific value and says it does not reach the minimum',
    motives(pronto).includes("'200'") &&
      motives(pronto).includes('no llega al mínimo'),
    motives(pronto)
  );

  check(
    'value equal to the minimum · CUMPLE (not below)',
    judges(
      JUDGMENT_MINIMUM,
      [
        event('account_deleted', {
          dias_retenida: 365,
        }),
      ],
      RETENTION
    ).status === 'CUMPLE',
    ''
  );

  check(
    'value above the minimum · CUMPLE',
    judges(
      JUDGMENT_MINIMUM,
      [
        event('account_deleted', {
          dias_retenida: 400,
        }),
      ],
      RETENTION
    ).status === 'CUMPLE',
    ''
  );

  const sameFactAsMaximum = judges(
    {
      ...JUDGMENT_MINIMUM,
      primitive: 'UMBRAL_MAXIMO',
    },
    [
      event('account_deleted', {
        dias_retenida: 200,
      }),
    ],
    RETENTION
  );

  check(
    'the SAME 200 against the SAME 365 · UMBRAL_MAXIMO says CUMPLE and UMBRAL_MINIMO NO_CUMPLE',
    sameFactAsMaximum.status === 'CUMPLE' &&
      pronto.status === 'NO_CUMPLE',
    `${sameFactAsMaximum.status} / ${pronto.status}`
  );

  check(
    'fact without parameter · NO_EVALUABLE',
    judges(
      JUDGMENT_MINIMUM,
      [
        event('account_deleted', {
          dias_retenida: 1,
        }),
      ],
      undefined
    ).status === 'NO_EVALUABLE',
    ''
  );

  check(
    'parameter without fact · NO_EVALUABLE, not CUMPLE',
    judges(JUDGMENT_MINIMUM, [], RETENTION).status ===
      'NO_EVALUABLE',
    ''
  );

  check(
    'neither fact nor parameter · NO_EVALUABLE',
    judges(JUDGMENT_MINIMUM, [], undefined).status ===
      'NO_EVALUABLE',
    ''
  );

  check(
    'non-numeric observed value · NO_EVALUABLE, not CUMPLE',
    judges(
      JUDGMENT_MINIMUM,
      [
        event('account_deleted', {
          dias_retenida: 'muchos',
        }),
      ],
      RETENTION
    ).status === 'NO_EVALUABLE',
    ''
  );
}

section('ANTIGUEDAD_MAXIMA');

{
  const NOW = new Date('2026-08-05T12:00:00Z');

  const JUDGMENT_AGE: ENSEvidenceJudgment = {
    primitive: 'ANTIGUEDAD_MAXIMA',
    parameterId: 'P-01',
    factEventTypes: ['backup_ok'],
    factField: 'fin_copia',
  };

  const FREQUENCY = config(
    parameter({
      id: 'P-01',
      name: 'frecuencia_backup_horas',
      type: 'duration_hours',
      value: 24,
    })
  );

  const copy = (fin: string) => [
    event('backup_ok', { fin_copia: fin }),
  ];

  const recent = judges(
    JUDGMENT_AGE,
    copy('2026-08-05T04:00:00Z'),
    FREQUENCY,
    {},
    NOW
  );

  check(
    'copy from 8 h ago with a 24 h deadline · CUMPLE',
    recent.status === 'CUMPLE',
    `${recent.status} — ${motives(recent)}`
  );

  const old2 = judges(
    JUDGMENT_AGE,
    copy('2026-08-03T04:00:00Z'),
    FREQUENCY,
    {},
    NOW
  );

  check(
    'copy from 56 h ago with a 24 h deadline · NO_CUMPLE',
    old2.status === 'NO_CUMPLE',
    `${old2.status} — ${motives(old2)}`
  );

  check(
    'the motive states the measured age and the deadline',
    motives(old2).includes('56.0 h') &&
      motives(old2).includes('24 h'),
    motives(old2)
  );

  const sameCopyThreeDaysLater = judges(
    JUDGMENT_AGE,
    copy('2026-08-05T04:00:00Z'),
    FREQUENCY,
    {},
    new Date('2026-08-08T12:00:00Z')
  );

  check(
    'the SAME fact, three days later · goes from CUMPLE to NO_CUMPLE without touching the agent',
    recent.status === 'CUMPLE' &&
      sameCopyThreeDaysLater.status ===
        'NO_CUMPLE',
    `${recent.status} -> ${sameCopyThreeDaysLater.status}`
  );

  const oldAndRecent = judges(
    JUDGMENT_AGE,
    [
      ...copy('2026-08-03T04:00:00Z'),
      ...copy('2026-08-05T04:00:00Z'),
    ],
    FREQUENCY,
    {},
    NOW
  );

  check(
    'an old copy AND a recent one · CUMPLE (it is existential: one is enough)',
    oldAndRecent.status === 'CUMPLE',
    `${oldAndRecent.status} — ${motives(oldAndRecent)}`
  );

  check(
    'the verdict rests on the recent one, not on the old one',
    motives(oldAndRecent).includes(
      '2026-08-05T04:00:00Z'
    ) &&
      !motives(oldAndRecent).includes(
        '2026-08-03T04:00:00Z'
      ),
    motives(oldAndRecent)
  );

  const inDays = judges(
    JUDGMENT_AGE,
    copy('2026-08-03T04:00:00Z'),
    config(
      parameter({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'duration_days',
        value: 24,
      })
    ),
    {},
    NOW
  );

  check(
    'the SAME 24 as duration_days admits what it does not as duration_hours',
    inDays.status === 'CUMPLE' &&
      old2.status === 'NO_CUMPLE',
    `${inDays.status} / ${old2.status}`
  );

  const withoutUnit = judges(
    JUDGMENT_AGE,
    copy('2026-08-05T04:00:00Z'),
    config(
      parameter({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'number',
        value: 24,
      })
    ),
    {},
    NOW
  );

  check(
    'parameter without time unit · NO_EVALUABLE with motive, hours are not guessed',
    withoutUnit.status === 'NO_EVALUABLE' &&
      motives(withoutUnit).includes('plazo'),
    `${withoutUnit.status} — ${motives(withoutUnit)}`
  );

  const fromFuture = judges(
    JUDGMENT_AGE,
    copy('2099-01-01T00:00:00Z'),
    FREQUENCY,
    {},
    NOW
  );

  check(
    'copy dated 2099 · NO_EVALUABLE, never CUMPLE',
    fromFuture.status === 'NO_EVALUABLE',
    `${fromFuture.status} — ${motives(fromFuture)}`
  );

  check(
    'unreadable timestamp · NO_EVALUABLE, not CUMPLE',
    judges(
      JUDGMENT_AGE,
      copy('anteayer por la tarde'),
      FREQUENCY,
      {},
      NOW
    ).status === 'NO_EVALUABLE',
    ''
  );

  check(
    'fact without parameter · NO_EVALUABLE',
    judges(
      JUDGMENT_AGE,
      copy('2026-08-05T04:00:00Z'),
      undefined,
      {},
      NOW
    ).status === 'NO_EVALUABLE',
    ''
  );

  check(
    'parameter without fact · NO_EVALUABLE even if coverage is confirmed',
    judges(
      JUDGMENT_AGE,
      [
        event(
          'collector_run',
          {
            resultado: 'completada',
            evidencias_cubiertas: 'EV-XX',
          },
          { timestamp: '2026-08-05T11:30:00Z' }
        ),
      ],
      FREQUENCY,
      {},
      NOW
    ).status === 'NO_EVALUABLE',
    ''
  );

  check(
    'neither fact nor parameter · NO_EVALUABLE',
    judges(
      JUDGMENT_AGE,
      [],
      undefined,
      {},
      NOW
    ).status === 'NO_EVALUABLE',
    ''
  );

  const JUDGMENT_WITH_MARGIN: ENSEvidenceJudgment = {
    ...JUDGMENT_AGE,
    toleranceParameterId: 'P-02',
  };

  const COPY_FROM_26H = copy(
    '2026-08-04T10:00:00Z'
  );

  const withoutMargin = judges(
    JUDGMENT_WITH_MARGIN,
    COPY_FROM_26H,
    FREQUENCY,
    {},
    NOW
  );

  check(
    'margin declared but not configured · applied WITHOUT margin (strict bound)',
    withoutMargin.status === 'NO_CUMPLE',
    `${withoutMargin.status} — ${motives(withoutMargin)}`
  );

  const withMargin = judges(
    JUDGMENT_WITH_MARGIN,
    COPY_FROM_26H,
    config(
      parameter({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'duration_hours',
        value: 24,
      }),
      parameter({
        id: 'P-02',
        name: 'margen_tolerancia_horas',
        type: 'duration_hours',
        required: false,
        value: 4,
      })
    ),
    {},
    NOW
  );

  check(
    'the SAME fact with P-02 = 4 h · becomes CUMPLE (the margin is added)',
    withMargin.status === 'CUMPLE',
    `${withMargin.status} — ${motives(withMargin)}`
  );

  check(
    'the motive names the margin that was applied',
    motives(withMargin).includes('P-02'),
    motives(withMargin)
  );

  const unreadableMargin = judges(
    JUDGMENT_WITH_MARGIN,
    COPY_FROM_26H,
    config(
      parameter({
        id: 'P-01',
        name: 'frecuencia_backup_horas',
        type: 'duration_hours',
        value: 24,
      }),
      parameter({
        id: 'P-02',
        name: 'margen_tolerancia_horas',
        type: 'duration_hours',
        required: false,
        value: 'un poco',
      })
    ),
    {},
    NOW
  );

  check(
    'margin configured but unreadable · NO_EVALUABLE, not taken as absent',
    unreadableMargin.status === 'NO_EVALUABLE',
    `${unreadableMargin.status} — ${motives(unreadableMargin)}`
  );

  const marginWhereIrrelevant = judges(
    {
      ...JUDGMENT_NONE,
      toleranceParameterId: 'P-02',
    },
    [
      event('generic_account_login', {
        usuario: 'jgomez',
      }),
    ],
    configuration('P-04', ['admin'])
  );

  check(
    'margin declared on a list primitive · NO_EVALUABLE with motive',
    marginWhereIrrelevant.status ===
      'NO_EVALUABLE' &&
      motives(marginWhereIrrelevant).includes(
        'margen'
      ),
    `${marginWhereIrrelevant.status} — ${motives(marginWhereIrrelevant)}`
  );
}

section(
  'The parameter\'s column · tables compared against a single value'
);

{
  const P07 = (valor: string[]) =>
    config(
      parameter({
        id: 'P-07',
        name: 'lista_usuarios_autorizados',
        type: 'table',
        value: valor,
        columns: [
          {
            name: 'usuario',
            label: 'Usuario',
            type: 'identifier',
            required: true,
          },
          {
            name: 'sistema',
            label: 'Sistema',
            type: 'string',
            required: false,
          },
          {
            name: 'rol',
            label: 'Rol',
            type: 'string',
            required: false,
          },
        ],
      })
    );

  const ROWS = [
    'jgomez | srv01 | ops',
    'mlopez | srv02 | auditor',
  ];

  const ACTIVE_ACCOUNT = [
    event('account_active', {
      usuario: 'jgomez',
    }),
  ];

  const JUDGMENT_P07: ENSEvidenceJudgment = {
    primitive: 'TODOS_EN_LISTA',
    parameterId: 'P-07',
    factEventTypes: ['account_active'],
    factField: 'usuario',
    parameterColumn: 'usuario',
  };

  check(
    'the trap · parseReferenceList on a row returns the whole row',
    parseReferenceList(ROWS)[0] ===
      'jgomez | srv01 | ops',
    JSON.stringify(parseReferenceList(ROWS))
  );

  const projected = judges(
    JUDGMENT_P07,
    ACTIVE_ACCOUNT,
    P07(ROWS)
  );

  check(
    "declaring the column 'usuario' · the authorized account CUMPLE",
    projected.status === 'CUMPLE',
    `${projected.status} — ${motives(projected)}`
  );

  const columnUndeclared = judges(
    { ...JUDGMENT_P07, parameterColumn: undefined },
    ACTIVE_ACCOUNT,
    P07(ROWS)
  );

  check(
    'without declaring the column · NO_EVALUABLE, and NEVER a verdict on the whole row',
    columnUndeclared.status ===
      'NO_EVALUABLE',
    `${columnUndeclared.status} — ${motives(columnUndeclared)}`
  );

  check(
    'without declaring the column · the motive says exactly what is missing',
    motives(columnUndeclared).includes(
      'parameterColumn'
    ),
    motives(columnUndeclared)
  );

  check(
    'and that text does NOT come out through the normal path (negative control of the motive itself)',
    !motives(projected).includes(
      'parameterColumn'
    ),
    motives(projected)
  );

  const wrongColumn = judges(
    { ...JUDGMENT_P07, parameterColumn: 'rol' },
    ACTIVE_ACCOUNT,
    P07(ROWS)
  );

  check(
    "projecting the column 'rol' · 'jgomez' is not in it · NO_CUMPLE",
    wrongColumn.status === 'NO_CUMPLE',
    `${wrongColumn.status} — ${motives(wrongColumn)}`
  );

  const missingColumn = judges(
    { ...JUDGMENT_P07, parameterColumn: 'usuarios' },
    ACTIVE_ACCOUNT,
    P07(ROWS)
  );

  check(
    'declared column that the table lacks · NO_EVALUABLE with motive',
    missingColumn.status ===
      'NO_EVALUABLE' &&
      motives(missingColumn).includes(
        "'usuarios'"
      ),
    `${missingColumn.status} — ${motives(missingColumn)}`
  );

  const tableWithoutColumns = judges(
    JUDGMENT_P07,
    ACTIVE_ACCOUNT,
    config(
      parameter({
        id: 'P-07',
        name: 'lista_usuarios_autorizados',
        type: 'table',
        value: ROWS,
      })
    )
  );

  check(
    'block seeded before the columns existed · NO_EVALUABLE, the position is not guessed',
    tableWithoutColumns.status === 'NO_EVALUABLE',
    `${tableWithoutColumns.status} — ${motives(tableWithoutColumns)}`
  );

  const singleColumnList = judges(
    {
      primitive: 'NINGUNO_FUERA_DE_LISTA',
      parameterId: 'P-10',
      factEventTypes: ['suid_sgid'],
      factField: 'ruta',
    },
    [event('suid_sgid', { ruta: '/usr/bin/sudo' })],
    config(
      parameter({
        id: 'P-10',
        name: 'suid_autorizados',
        value: ['/usr/bin/sudo'],
        columns: [
          {
            name: 'ruta',
            label: 'Binario autorizado',
            type: 'path',
            required: true,
          },
        ],
      })
    )
  );

  check(
    'list of ONE column · still read flat, declaring nothing',
    singleColumnList.status === 'CUMPLE',
    `${singleColumnList.status} — ${motives(singleColumnList)}`
  );

  check(
    'parseReferenceRows · splits on line breaks and not on commas',
    parseReferenceRows(
      'ops | /srv/datos | lectura,escritura\nauditor | /srv/datos | lectura'
    ).length === 2,
    JSON.stringify(
      parseReferenceRows(
        'ops | /srv/datos | lectura,escritura\nauditor | /srv/datos | lectura'
      )
    )
  );

  check(
    'splitRowCells · distributes the row among the declared columns',
    splitRowCells('jgomez | srv01 | ops', [
      {
        name: 'usuario',
        label: '',
        type: 'identifier',
        required: true,
      },
      {
        name: 'sistema',
        label: '',
        type: 'string',
        required: false,
      },
      {
        name: 'rol',
        label: '',
        type: 'string',
        required: false,
      },
    ]).rol === 'ops',
    ''
  );

  check(
    'splitRowCells · a short row leaves empty the columns it lacks',
    splitRowCells('jgomez', [
      {
        name: 'usuario',
        label: '',
        type: 'identifier',
        required: true,
      },
      {
        name: 'sistema',
        label: '',
        type: 'string',
        required: false,
      },
    ]).sistema === '',
    ''
  );
}

section('CONFORME_A_TABLA');

{
  const NOW = new Date('2026-08-05T12:00:00Z');

  const P08_COLUMNS = [
    {
      name: 'recurso',
      label: 'Recurso',
      type: 'path' as const,
      required: true,
    },
    {
      name: 'modo',
      label: 'Modo',
      type: 'octal' as const,
      required: true,
    },
    {
      name: 'propietario_grupo',
      label: 'Propietario:grupo',
      type: 'string' as const,
      required: false,
    },
    {
      name: 'acl_esperada',
      label: 'ACL esperada',
      type: 'string' as const,
      required: false,
    },
  ];

  const P08 = (rows: string[]) =>
    config(
      parameter({
        id: 'P-08',
        name: 'acl_declarada',
        type: 'table',
        value: rows,
        columns: P08_COLUMNS,
      })
    );

  const JUDGMENT_ACL: ENSEvidenceJudgment = {
    primitive: 'CONFORME_A_TABLA',
    parameterId: 'P-08',
    factEventTypes: ['resource_permissions'],
    factField: '',
    tableKeyColumn: 'recurso',
    factKeyField: 'recurso',
    tableChecks: [
      { column: 'modo', factField: 'modo' },
      {
        column: 'propietario_grupo',
        factField: 'propietario_grupo',
      },
      { column: 'acl_esperada', factField: 'acl' },
    ],
  };

  const measure = (
    attrs: Record<string, unknown>
  ) => [event('resource_permissions', attrs)];

  const FULL_ROW = [
    '/srv/datos | 750 | root:ops | user:auditor:r-x',
  ];

  const compliant2 = judges(
    JUDGMENT_ACL,
    measure({
      recurso: '/srv/datos',
      modo: '750',
      propietario_grupo: 'root:ops',
      acl: 'user:auditor:r-x',
    }),
    P08(FULL_ROW)
  );

  check(
    'the three axes match their row · CUMPLE',
    compliant2.status === 'CUMPLE',
    `${compliant2.status} — ${motives(compliant2)}`
  );

  const morePermissive = judges(
    JUDGMENT_ACL,
    measure({
      recurso: '/srv/datos',
      modo: '777',
      propietario_grupo: 'root:ops',
      acl: 'user:auditor:r-x',
    }),
    P08(FULL_ROW)
  );

  check(
    'more permissive mode than declared · NO_CUMPLE',
    morePermissive.status === 'NO_CUMPLE',
    morePermissive.status
  );

  check(
    'the motive names the resource, the axis and both values',
    motives(morePermissive).includes('/srv/datos') &&
      motives(morePermissive).includes("modo='777'") &&
      motives(morePermissive).includes("'750'"),
    motives(morePermissive)
  );

  check(
    'MORE restrictive mode than declared · CUMPLE (creates no risk)',
    judges(
      JUDGMENT_ACL,
      measure({
        recurso: '/srv/datos',
        modo: '700',
        propietario_grupo: 'root:ops',
        acl: 'user:auditor:r-x',
      }),
      P08(FULL_ROW)
    ).status === 'CUMPLE',
    ''
  );

  check(
    "the leading zero does not change the mode · '0750' matches '750'",
    judges(
      JUDGMENT_ACL,
      measure({
        recurso: '/srv/datos',
        modo: '0750',
        propietario_grupo: 'root:ops',
        acl: 'user:auditor:r-x',
      }),
      P08(FULL_ROW)
    ).status === 'CUMPLE',
    ''
  );

  check(
    'owner different from declared · NO_CUMPLE',
    judges(
      JUDGMENT_ACL,
      measure({
        recurso: '/srv/datos',
        modo: '750',
        propietario_grupo: 'root:root',
        acl: 'user:auditor:r-x',
      }),
      P08(FULL_ROW)
    ).status === 'NO_CUMPLE',
    ''
  );

  const withEmptyCell = judges(
    JUDGMENT_ACL,
    measure({
      recurso: '/srv/datos',
      modo: '750',
      propietario_grupo: 'root:root',
      acl: 'user:auditor:r-x',
    }),
    P08([
      '/srv/datos | 750 |  | user:auditor:r-x',
    ])
  );

  check(
    'empty cell · that axis is NOT judged, and the same fact becomes CUMPLE',
    withEmptyCell.status === 'CUMPLE',
    `${withEmptyCell.status} — ${motives(withEmptyCell)}`
  );

  const silentRow = judges(
    { ...JUDGMENT_ACL, tableChecks: [
      {
        column: 'propietario_grupo',
        factField: 'propietario_grupo',
      },
    ] },
    measure({
      recurso: '/srv/datos',
      propietario_grupo: 'root:ops',
    }),
    P08(['/srv/datos | 750 |  | '])
  );

  check(
    'row with no declared contrasted axis · NO_EVALUABLE, not CUMPLE',
    silentRow.status === 'NO_EVALUABLE',
    `${silentRow.status} — ${motives(silentRow)}`
  );

  const withoutRow = judges(
    JUDGMENT_ACL,
    measure({
      recurso: '/srv/secreto',
      modo: '777',
      propietario_grupo: 'root:root',
      acl: '-',
    }),
    P08(FULL_ROW)
  );

  check(
    'resource without a row in the policy · NO_EVALUABLE, never a measured NO_CUMPLE',
    withoutRow.status === 'NO_EVALUABLE',
    `${withoutRow.status} — ${motives(withoutRow)}`
  );

  check(
    'resource without a row · the cause is CONFIGURATION (the decision is missing, not the measure)',
    withoutRow.gapCause === 'CONFIGURATION',
    String(withoutRow.gapCause)
  );

  const unobservedAxis = judges(
    JUDGMENT_ACL,
    measure({
      recurso: '/srv/datos',
      modo: '750',
      propietario_grupo: 'root:ops',
    }),
    P08(FULL_ROW)
  );

  check(
    'the policy declares the ACL and the fact does not bring it · NO_EVALUABLE, not CUMPLE',
    unobservedAxis.status === 'NO_EVALUABLE',
    `${unobservedAxis.status} — ${motives(unobservedAxis)}`
  );

  const mix = judges(
    JUDGMENT_ACL,
    [
      ...measure({
        recurso: '/srv/datos',
        modo: '777',
        propietario_grupo: 'root:ops',
        acl: 'user:auditor:r-x',
      }),
      ...measure({
        recurso: '/srv/secreto',
        modo: '700',
        propietario_grupo: 'root:root',
        acl: '-',
      }),
    ],
    P08(FULL_ROW)
  );

  check(
    'proven deviation + resource without a row · NO_CUMPLE (the finding prevails)',
    mix.status === 'NO_CUMPLE',
    `${mix.status} — ${motives(mix)}`
  );

  const unreadableMode = judges(
    JUDGMENT_ACL,
    measure({
      recurso: '/srv/datos',
      modo: 'rwxr-x---',
      propietario_grupo: 'root:ops',
      acl: 'user:auditor:r-x',
    }),
    P08(FULL_ROW)
  );

  check(
    'observed mode that is not octal · NO_EVALUABLE, neither CUMPLE nor NO_CUMPLE',
    unreadableMode.status === 'NO_EVALUABLE',
    `${unreadableMode.status} — ${motives(unreadableMode)}`
  );

  check(
    'unreadable mode · the cause is EVIDENCE, not CONFIGURATION (the policy is there)',
    unreadableMode.gapCause === 'EVIDENCE',
    String(unreadableMode.gapCause)
  );

  const sinClave = judges(
    JUDGMENT_ACL,
    measure({ modo: '750' }),
    P08(FULL_ROW)
  );

  check(
    'fact without the field that identifies its row · NO_EVALUABLE',
    sinClave.status === 'NO_EVALUABLE',
    `${sinClave.status} — ${motives(sinClave)}`
  );

  check(
    'fact without parameter · NO_EVALUABLE',
    judges(
      JUDGMENT_ACL,
      measure({
        recurso: '/srv/datos',
        modo: '777',
      }),
      undefined
    ).status === 'NO_EVALUABLE',
    ''
  );

  check(
    'table without declared columns · NO_EVALUABLE with motive',
    judges(
      JUDGMENT_ACL,
      measure({
        recurso: '/srv/datos',
        modo: '750',
      }),
      config(
        parameter({
          id: 'P-08',
          name: 'acl_declarada',
          type: 'table',
          value: FULL_ROW,
        })
      )
    ).status === 'NO_EVALUABLE',
    ''
  );

  check(
    'parameter without fact · NO_EVALUABLE even if coverage is confirmed',
    judges(
      JUDGMENT_ACL,
      [
        event(
          'collector_run',
          {
            resultado: 'completada',
            evidencias_cubiertas: 'EV-XX',
          },
          { timestamp: '2026-08-05T11:30:00Z' }
        ),
      ],
      P08(FULL_ROW),
      {},
      NOW
    ).status === 'NO_EVALUABLE',
    ''
  );

  check(
    'neither fact nor parameter · NO_EVALUABLE',
    judges(JUDGMENT_ACL, [], undefined).status ===
      'NO_EVALUABLE',
    ''
  );

  const P06 = config(
    parameter({
      id: 'P-06',
      name: 'tipos_acceso_permitidos_por_perfil',
      type: 'table',
      value: [
        'ops | /srv/datos | lectura,escritura',
      ],
      columns: [
        {
          name: 'perfil',
          label: 'Perfil',
          type: 'identifier',
          required: true,
        },
        {
          name: 'recurso',
          label: 'Recurso',
          type: 'path',
          required: true,
        },
        {
          name: 'tipos_permitidos',
          label: 'Tipos de acceso',
          type: 'multiselect',
          required: true,
          options: [
            'lectura',
            'escritura',
            'ejecucion',
            'modificacion',
          ],
        },
      ],
    })
  );

  const JUDGMENT_TYPES: ENSEvidenceJudgment = {
    primitive: 'CONFORME_A_TABLA',
    parameterId: 'P-06',
    factEventTypes: ['object_access'],
    factField: '',
    tableKeyColumn: 'perfil',
    factKeyField: 'perfil',
    tableChecks: [
      {
        column: 'tipos_permitidos',
        factField: 'acceso',
      },
    ],
  };

  check(
    "multiselect · 'escritura' is among the allowed ones · CUMPLE",
    judges(
      JUDGMENT_TYPES,
      [
        event('object_access', {
          perfil: 'ops',
          acceso: 'escritura',
        }),
      ],
      P06
    ).status === 'CUMPLE',
    ''
  );

  const disallowedType = judges(
    JUDGMENT_TYPES,
    [
      event('object_access', {
        perfil: 'ops',
        acceso: 'ejecucion',
      }),
    ],
    P06
  );

  check(
    "multiselect · 'ejecucion' is not among the allowed ones · NO_CUMPLE",
    disallowedType.status === 'NO_CUMPLE',
    `${disallowedType.status} — ${motives(disallowedType)}`
  );
}

section('op.acc.1 / EV-05 · two evidences on the same fact');

{
  const definitions = getEvidenceDefinitions('op.acc.1');

  const ev05 = definitions.find(
    candidate => candidate.id === 'EV-05'
  );

  check(
    'EV-05 declares NINGUNO_EN_LISTA against P-03',
    ev05?.judgment?.primitive ===
      'NINGUNO_EN_LISTA' &&
      ev05?.judgment?.parameterId === 'P-03',
    JSON.stringify(ev05?.judgment)
  );

  check(
    'EV-05 reads the same raw fact as EV-03',
    Boolean(
      ev05?.judgment?.factEventTypes.includes(
        'account_authenticated'
      ) && ev05?.judgment?.factField === 'usuario'
    ),
    JSON.stringify(ev05?.judgment)
  );

  const rawAlert = (
    user: string
  ): unknown => ({
    _id: 'alerta-compartida',
    _source: {
      '@timestamp': '2026-07-30T10:00:00Z',
      rule: {
        id: '106873',
        description:
          'op.acc.1 · HECHO (EV-03, EV-05) · Autenticación observada',
      },
      agent: { id: '001', name: 'srv01' },
      data: {
        ensfacil: 'op.acc.1',
        event: 'account_authenticated',
        evidence_id: 'EV-03,EV-05',
        requisito: 'op.acc.1.1,op.acc.1.2',
        usuario: user,
        origen: '10.0.0.12',
      },
    },
  });

  const distributed = normalizeWazuhAlerts([
    rawAlert('svc_backup'),
  ]);

  check(
    'the alert with two evidences splits into two normalized events',
    distributed.length === 2 &&
      distributed.some(
        item => item.evidenceId === 'EV-03'
      ) &&
      distributed.some(
        item => item.evidenceId === 'EV-05'
      ),
    distributed
      .map(item => String(item.evidenceId))
      .join(', ')
  );

  const twoLists = config(
    parameter({
      id: 'P-03',
      name: 'cuentas_servicio_definidas',
      type: 'list',
      value: ['svc_backup', 'svc_web'],
    }),
    parameter({
      id: 'P-04',
      name: 'cuentas_genericas_prohibidas',
      type: 'list',
      value: ['admin', 'guest'],
    })
  );

  const resolved = resolveEvidenceForControl(
    'op.acc.1',
    distributed,
    undefined,
    'ALTO',
    twoLists
  );

  const ev03Resolved = resolved.find(
    evidence => evidence.id === 'EV-03'
  );

  const ev05Resolved = resolved.find(
    evidence => evidence.id === 'EV-05'
  );

  check(
    'svc_backup is not in P-04 · EV-03 CUMPLE',
    ev03Resolved?.status === 'CUMPLE',
    `${ev03Resolved?.status} — ${ev03Resolved ? motives(ev03Resolved) : ''}`
  );

  check(
    'the SAME fact is in P-03 · EV-05 NO_CUMPLE',
    ev05Resolved?.status === 'NO_CUMPLE',
    `${ev05Resolved?.status} — ${ev05Resolved ? motives(ev05Resolved) : ''}`
  );

  check(
    'EV-05\'s motive names the service account, it does not say «algo falló»',
    Boolean(
      ev05Resolved &&
        motives(ev05Resolved).includes(
          "'svc_backup'"
        )
    ),
    ev05Resolved ? motives(ev05Resolved) : ''
  );

  const withoutSvcInP03 = resolveEvidenceForControl(
    'op.acc.1',
    distributed,
    undefined,
    'ALTO',
    config(
      parameter({
        id: 'P-03',
        name: 'cuentas_servicio_definidas',
        type: 'list',
        value: ['svc_web'],
      }),
      parameter({
        id: 'P-04',
        name: 'cuentas_genericas_prohibidas',
        type: 'list',
        value: ['admin', 'guest'],
      })
    )
  ).find(evidence => evidence.id === 'EV-05');

  check(
    'svc_backup removed from P-03 · SAME event · EV-05 goes back to CUMPLE',
    withoutSvcInP03?.status === 'CUMPLE',
    `${withoutSvcInP03?.status} — ${withoutSvcInP03 ? motives(withoutSvcInP03) : ''}`
  );

  const legacyEv05 = resolveEvidenceForControl(
    'op.acc.1',
    [
      event(
        'interactive_login',
        { usuario: 'svc_backup' },
        {
          evidenceId: 'EV-05',
          status: 'CUMPLE',
        }
      ),
    ],
    undefined,
    'ALTO',
    twoLists
  ).find(evidence => evidence.id === 'EV-05');

  check(
    "an old agent's 'interactive_login' is re-judged with today's P-03 (it said CUMPLE)",
    legacyEv05?.status === 'NO_CUMPLE',
    String(legacyEv05?.status)
  );
}

section('op.acc.1 / EV-07 · TODOS_EN_LISTA against the P-07 table');

{
  const definitions = getEvidenceDefinitions('op.acc.1');

  const ev07 = definitions.find(
    candidate => candidate.id === 'EV-07'
  );

  check(
    'EV-07 declares TODOS_EN_LISTA against P-07\'s usuario column',
    ev07?.judgment?.primitive ===
      'TODOS_EN_LISTA' &&
      ev07?.judgment?.parameterId === 'P-07' &&
      ev07?.judgment?.parameterColumn === 'usuario',
    JSON.stringify(ev07?.judgment)
  );

  const authorizedList = (
    rows: string[]
  ): ENSControlConfiguration =>
    config(
      parameter({
        id: 'P-07',
        name: 'lista_usuarios_autorizados',
        type: 'table',
        columns: [
          { name: 'usuario', type: 'text' },
          { name: 'sistema', type: 'text' },
          { name: 'rol', type: 'text' },
        ],
        value: rows,
      })
    );

  const activeAccounts = (
    ...users: string[]
  ): ENSNormalizedEvent[] =>
    users.map(user =>
      event(
        'account_active',
        { usuario: user, uid: 1001, tipo: 'persona' },
        { evidenceId: 'EV-07', status: 'CUMPLE' }
      )
    );

  const compliant2 = resolveEvidenceForControl(
    'op.acc.1',
    activeAccounts('jgomez', 'mlopez'),
    undefined,
    'ALTO',
    authorizedList([
      'jgomez | srv01 | ops',
      'mlopez | srv01 | dev',
    ])
  ).find(evidence => evidence.id === 'EV-07');

  check(
    'both active accounts are in the usuario column · CUMPLE',
    compliant2?.status === 'CUMPLE',
    `${compliant2?.status} — ${compliant2 ? motives(compliant2) : ''}`
  );

  const intruder = resolveEvidenceForControl(
    'op.acc.1',
    activeAccounts('jgomez', 'exempleado'),
    undefined,
    'ALTO',
    authorizedList([
      'jgomez | srv01 | ops',
      'mlopez | srv01 | dev',
    ])
  ).find(evidence => evidence.id === 'EV-07');

  check(
    'an active account that is not in the table · NO_CUMPLE',
    intruder?.status === 'NO_CUMPLE',
    `${intruder?.status} — ${intruder ? motives(intruder) : ''}`
  );

  check(
    'the motive names the unauthorized account',
    Boolean(
      intruder &&
        motives(intruder).includes("'exempleado'")
    ),
    intruder ? motives(intruder) : ''
  );

  check(
    'the comparison projects the column, not the whole row',
    Boolean(
      compliant2?.status === 'CUMPLE' &&
        motives(compliant2).includes(
          "la columna 'usuario'"
        )
    ),
    compliant2 ? motives(compliant2) : ''
  );

  const withoutAccounts = resolveEvidenceForControl(
    'op.acc.1',
    [
      event(
        'collector_run',
        {
          resultado: 'completada',
          evidencias_cubiertas:
            'EV-03,EV-05,EV-06,EV-07',
        },
        { timestamp: '2026-07-30T09:59:00Z' }
      ),
    ],
    undefined,
    'ALTO',
    authorizedList(['jgomez | srv01 | ops']),
    new Date('2026-07-30T10:00:00Z')
  ).find(evidence => evidence.id === 'EV-07');

  check(
    'zero observed accounts with confirmed coverage · NO_EVALUABLE, not CUMPLE',
    withoutAccounts?.status === 'NO_EVALUABLE',
    `${withoutAccounts?.status} — ${withoutAccounts ? motives(withoutAccounts) : ''}`
  );

  const onlyLegacyOffender = resolveEvidenceForControl(
    'op.acc.1',
    [
      event(
        'unauthorized_user',
        { usuario: 'jgomez' },
        {
          evidenceId: 'EV-07',
          status: 'NO_CUMPLE',
        }
      ),
    ],
    undefined,
    'ALTO',
    authorizedList(['jgomez | srv01 | ops'])
  ).find(evidence => evidence.id === 'EV-07');

  check(
    "a loose 'unauthorized_user' does NOT accredit EV-07 (biased sample)",
    onlyLegacyOffender?.status !== 'CUMPLE',
    String(onlyLegacyOffender?.status)
  );
}

section('Migration status');

{
  const declaredOnes = ENSEvidenceCatalog.filter(
    definition => definition.judgment !== undefined
  ).map(
    definition =>
      `${definition.controlId}/${definition.id}`
  );

  const MIGRATED = [
    'op.acc.1/EV-03',
    'op.acc.1/EV-05',
    'op.acc.1/EV-07',
    'op.acc.4/EV-01',
    'op.acc.4/EV-02',
    'op.acc.4/EV-03',
    'op.acc.4/EV-04',
    'op.acc.4/EV-05',
    'op.acc.4/EV-06',
    'op.acc.4/EV-07',
    'op.acc.4/EV-08',
    'op.exp.1/EV-01',
    'op.exp.1/EV-02',
    'op.exp.1/EV-03',
    'op.exp.1/EV-04',
    'op.exp.1/EV-05',
    'op.exp.1/EV-06',
    'op.exp.1/EV-07',
    'op.exp.2/EV-01',
    'op.exp.2/EV-02',
    'op.exp.2/EV-03',
    'op.exp.2/EV-04',
    'op.exp.2/EV-05',
    'op.exp.2/EV-06',
    'op.acc.6/EV-01',
    'op.acc.6/EV-05',
    'op.acc.6/EV-06',
    'op.acc.6/EV-07',
    'op.acc.6/EV-08',
    'op.acc.6/EV-09',
    'op.acc.6/EV-10',
    'op.acc.6/EV-12',
    'op.acc.5/EV-01',
    'op.acc.5/EV-02',
    'op.acc.5/EV-03',
    'op.acc.5/EV-04',
    'op.acc.5/EV-05',
    'op.acc.5/EV-06',
    'op.acc.5/EV-07',
    'op.acc.5/EV-08',
    'op.acc.5/EV-09',
    'op.exp.3/EV-02',
    'op.exp.3/EV-03',
    'op.exp.3/EV-04',
    'op.exp.3/EV-08',
    'op.exp.3/EV-09',
    'op.exp.3/EV-11',
    'op.exp.4/EV-04',
    'op.exp.4/EV-06',
    'op.exp.4/EV-11',
    'op.exp.6/EV-01',
    'op.exp.6/EV-03',
    'op.exp.8/EV-02',
    'op.exp.10/EV-02',
    'op.exp.10/EV-08',
  ];

  check(
    `the migrated ones are exactly ${MIGRATED.join(', ')}`,
    declaredOnes.length === MIGRATED.length &&
      MIGRATED.every(expected =>
        declaredOnes.includes(expected)
      ),
    declaredOnes.join(', ') || '(ninguna)'
  );

  const withStateAmongFacts = ENSEvidenceCatalog.filter(
    definition =>
      definition.judgment?.factEventTypes.includes(
        'evidence_state'
      )
  ).map(
    definition =>
      `${definition.controlId}/${definition.id}`
  );

  check(
    'no migrated evidence reads `evidence_state` as a fact',
    withStateAmongFacts.length === 0,
    withStateAmongFacts.join(', ')
  );

  const tablesWithoutColumn = ENSEvidenceCatalog.filter(
    definition =>
      definition.judgment &&
      definition.judgment.primitive !==
        'CONFORME_A_TABLA' &&
      definition.judgment.parameterId ===
        'P-07' &&
      !definition.judgment.parameterColumn
  ).map(
    definition =>
      `${definition.controlId}/${definition.id}`
  );

  check(
    'no evidence compares P-07 without declaring its column',
    tablesWithoutColumn.length === 0,
    tablesWithoutColumn.join(', ')
  );
}

section('The motive reaches the auditor (T1.5)');

{
  const MOTIVE =
    "Se ha observado 'admin', que figura en la lista del parámetro P-04 (cuentas_genericas_prohibidas).";

  const resultEvidence = (
    id: string,
    observations: string[]
  ) => ({
    id,
    controlId: 'op.acc.1',
    status: 'NO_CUMPLE' as const,
    description: 'Evidencia de prueba',
    observations,
    requirements: ['op.acc.1.1'],
    levels: ['BAJO' as const],
    category: 'ACCESS_CONTROL' as const,
    criticality: 'HIGH' as const,
    sourceTypes: ['WAZUH_ALERT' as const],
    expectedEventTypes: [
      'account_authenticated',
    ],
    relatedRules: ['106873'],
    auditQuestion: '¿Pregunta?',
  });

  const result = (
    observations: string[]
  ) =>
    ({
      control: {
        id: 'op.acc.1',
        name: 'Identificación',
        family: 'op',
        category: 'acc',
        description: '',
      },
      level: 'BAJO',
      status: 'NO_CUMPLE',
      score: 0,
      coverage: 0,
      applicableRequirements: 1,
      measuredRequirements: 1,
      unmeasuredRequirements: [],
      evaluatedAt: '2026-07-30T12:00:00Z',
      requirements: [],
      parameters: [],
      evidences: [
        resultEvidence(
          'EV-03',
          observations
        ),
      ],
      missingParameters: [],
      missingEvidences: [],
      relatedRules: [],
      nonConformities: [],
      measurementGaps: [],
      observations: [],
      traceability: [],
    }) as any;

  const report = buildOpAcc1ReportModel(
    result([MOTIVE])
  );

  const fieldEv03 = report.fields.find(
    campo =>
      campo.evidenceIds.length === 1 &&
      campo.evidenceIds[0] === 'EV-03'
  );

  check(
    'op.acc.1\'s report has a field fed by EV-03',
    Boolean(fieldEv03),
    report.fields
      .map(campo => campo.id)
      .join(', ')
  );

  check(
    'EV-03\'s motive reaches the report and names the specific account',
    Boolean(
      fieldEv03?.details.some(detail =>
        detail.includes("'admin'")
      )
    ),
    JSON.stringify(fieldEv03?.details)
  );

  const reportWithoutMotive = buildOpAcc1ReportModel(
    result([])
  );

  const fieldWithoutMotive =
    reportWithoutMotive.fields.find(
      campo => campo.id === fieldEv03?.id
    );

  check(
    'without a motive in the evidence, the report invents none',
    !fieldWithoutMotive?.details.some(detail =>
      detail.includes("'admin'")
    ),
    JSON.stringify(fieldWithoutMotive?.details)
  );

  const consolidated =
    consolidateAgentComplianceResults([
      {
        agentId: '001',
        agentName: 'srv-dc01',
        results: [result([MOTIVE])],
        summary: [],
      },
      {
        agentId: '002',
        agentName: 'srv-web01',
        results: [
          result([
            "Se ha observado 'guest', que figura en la lista del parámetro P-04 (cuentas_genericas_prohibidas).",
          ]),
        ],
        summary: [],
      },
    ] as any);

  const ev03Consolidated = consolidated[0]?.evidences.find(
    evidence => evidence.id === 'EV-03'
  );

  check(
    'consolidating two agents, the motive of BOTH survives',
    Boolean(
      ev03Consolidated?.observations.some(o =>
        o.includes("'admin'")
      ) &&
        ev03Consolidated?.observations.some(o =>
          o.includes("'guest'")
        )
    ),
    JSON.stringify(
      ev03Consolidated?.observations
    )
  );

  check(
    'each consolidated motive says which machine it comes from',
    Boolean(
      ev03Consolidated?.observations.every(o =>
        o.startsWith('[srv-')
      )
    ),
    JSON.stringify(
      ev03Consolidated?.observations
    )
  );
}

console.log('');

if (failures.length) {
  console.log(
    `${failures.length} failed test(s): ${failures.join(', ')}`
  );

  process.exit(1);
}

console.log('all tests pass');
