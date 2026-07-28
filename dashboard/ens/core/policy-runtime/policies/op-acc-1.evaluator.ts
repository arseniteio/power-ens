import {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyEvaluatorResult,
  ENSPolicyTrace,
  ENSRuntimeVariable,
} from '../types';

const POLICY_ID = 'policy.op.acc.1';

type NormalizedEvent =
  ENSPolicyContext['events'][number];

type ComplianceStatus =
  ENSPolicyDecision['status'];

type RuleType =
  ENSPolicyTrace['ruleType'];

const isRealEvent = (
  event: NormalizedEvent
): boolean =>
  event.isSynthetic !== true;

const realEvents = (
  context: ENSPolicyContext
): NormalizedEvent[] =>
  context.events.filter(isRealEvent);

const eventMatches = (
  event: NormalizedEvent,
  eventTypes: readonly string[]
): boolean =>
  eventTypes.includes(event.eventType);

const eventsOf = (
  context: ENSPolicyContext,
  eventTypes: readonly string[]
): NormalizedEvent[] =>
  realEvents(context).filter(event =>
    eventMatches(event, eventTypes)
  );

const latestEvent = (
  context: ENSPolicyContext,
  eventTypes: readonly string[]
): NormalizedEvent | undefined =>
  eventsOf(context, eventTypes)
    .sort((left, right) =>
      right.timestamp.localeCompare(
        left.timestamp
      )
    )[0];

const eventIds = (
  events: NormalizedEvent[]
): string[] =>
  Array.from(
    new Set(
      events.map(event => event.id)
    )
  ).sort((left, right) =>
    left.localeCompare(right)
  );

const attribute = (
  event: NormalizedEvent | undefined,
  key: string
): unknown =>
  event?.attributes?.[key];

const toNumber = (
  value: unknown
): number | undefined => {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

const toBoolean = (
  value: unknown
): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (typeof value === 'string') {
    const normalized =
      value.trim().toLowerCase();

    if (
      ['true', '1', 'yes', 'si', 'sí']
        .includes(normalized)
    ) {
      return true;
    }

    if (
      ['false', '0', 'no']
        .includes(normalized)
    ) {
      return false;
    }
  }

  return undefined;
};

const toStringList = (
  value: unknown
): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(item => String(item).trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[;,\n]/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  return [];
};

const correlationString = (
  value: unknown
): string | undefined => {
  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    const normalized =
      String(value).trim();

    return normalized || undefined;
  }

  return undefined;
};

const RAW_OP_ACC_1_REQUIRED_ATTRIBUTES = [
  'event_id',
  'execution_id',
  'schema_version',
  'collector',
  'collector_version',
] as const;

const RAW_OP_ACC_1_FORBIDDEN_ATTRIBUTES = [
  'estado',
  'status',
  'score',
  'compliance',
  'nivel',
] as const;

const RAW_OP_ACC_1_FORBIDDEN_EVENT_TYPES = [
  'evidence_state',
  'control_state',
  'score_snapshot',
] as const;

const hasMeaningfulAttribute = (
  event: NormalizedEvent,
  key: string
): boolean =>
  correlationString(
    attribute(event, key)
  ) !== undefined;

const isExplicitFalseAttribute = (
  value: unknown
): boolean => {
  if (value === false || value === 0) {
    return true;
  }

  return (
    typeof value === 'string' &&
    [
      'false',
      '0',
      'no',
    ].includes(
      value.trim().toLowerCase()
    )
  );
};

const isRawOpAcc1TechnicalFact = (
  event: NormalizedEvent
): boolean =>
  isRealEvent(event) &&
  correlationString(
    attribute(event, 'ensfacil')
  ) === 'op.acc.1' &&
  correlationString(
    attribute(event, 'event_class')
  ) === 'technical_fact' &&
  isExplicitFalseAttribute(
    attribute(event, 'synthetic')
  ) &&
  RAW_OP_ACC_1_REQUIRED_ATTRIBUTES.every(
    key => hasMeaningfulAttribute(
      event,
      key
    )
  ) &&
  !RAW_OP_ACC_1_FORBIDDEN_ATTRIBUTES.some(
    key => hasMeaningfulAttribute(
      event,
      key
    )
  ) &&
  !RAW_OP_ACC_1_FORBIDDEN_EVENT_TYPES.includes(
    event.eventType as
      typeof RAW_OP_ACC_1_FORBIDDEN_EVENT_TYPES[number]
  );


const eventExecutionId = (
  event: NormalizedEvent | undefined
): string | undefined =>
  correlationString(
    attribute(event, 'execution_id')
  );

const eventScopeId = (
  event: NormalizedEvent | undefined
): string | undefined =>
  correlationString(
    attribute(event, 'host')
  ) ||
  correlationString(event?.agentId) ||
  correlationString(event?.agentName);

const areCorrelated = (
  candidates:
    Array<NormalizedEvent | undefined>
): boolean => {
  if (
    candidates.length === 0 ||
    candidates.some(
      event => event === undefined
    )
  ) {
    return false;
  }

  const events =
    candidates as NormalizedEvent[];

  const anchorExecution =
    eventExecutionId(events[0]);

  const anchorScope =
    eventScopeId(events[0]);

  if (!anchorExecution || !anchorScope) {
    return false;
  }

  return events.every(event =>
    eventExecutionId(event) ===
      anchorExecution &&
    eventScopeId(event) ===
      anchorScope
  );
};

// BEGIN OP.ACC.1 V4 CORRELATION SNAPSHOT
const REQUIRED_EXECUTION_EVIDENCES =
  [
    'EV-01',
    'EV-02',
    'EV-03',
    'EV-04',
    'EV-05',
    'EV-06',
    'EV-07',
    'EV-08',
  ] as const;

const eventEvidenceId = (
  event: NormalizedEvent | undefined
): string | undefined =>
  correlationString(
    attribute(event, 'evidence_id')
  );

const correlationKey = (
  event: NormalizedEvent
): string | undefined => {
  const executionId =
    eventExecutionId(event);

  const scopeId =
    eventScopeId(event);

  if (!executionId || !scopeId) {
    return undefined;
  }

  return `${executionId}\u0000${scopeId}`;
};

const groupEventsByCorrelation = (
  events: readonly NormalizedEvent[]
): NormalizedEvent[][] => {
  const groups =
    new Map<string, NormalizedEvent[]>();

  events
    .filter(isRealEvent)
    .forEach(event => {
      const key =
        correlationKey(event);

      if (!key) {
        return;
      }

      const group =
        groups.get(key) || [];

      group.push(event);
      groups.set(key, group);
    });

  return Array.from(
    groups.values()
  );
};

const isCompleteExecutionGroup = (
  events: readonly NormalizedEvent[]
): boolean => {
  if (events.length === 0) {
    return false;
  }

  const anchorExecutionId =
    eventExecutionId(events[0]);

  const anchorScopeId =
    eventScopeId(events[0]);

  if (
    !anchorExecutionId ||
    !anchorScopeId
  ) {
    return false;
  }

  if (
    !events.every(event =>
      eventExecutionId(event) ===
        anchorExecutionId &&
      eventScopeId(event) ===
        anchorScopeId
    )
  ) {
    return false;
  }

  const evidences = new Set(
    events
      .map(event =>
        eventEvidenceId(event)
      )
      .filter(
        (
          evidenceId
        ): evidenceId is string =>
          evidenceId !== undefined
      )
  );

  return REQUIRED_EXECUTION_EVIDENCES
    .every(evidenceId =>
      evidences.has(evidenceId)
    );
};

const latestTimestampOf = (
  events: readonly NormalizedEvent[]
): string =>
  events.reduce(
    (latest, event) =>
      event.timestamp > latest
        ? event.timestamp
        : latest,
    ''
  );

const correlationIdentityOf = (
  events: readonly NormalizedEvent[]
): string => {
  const first = events[0];

  return (
    `${eventExecutionId(first) || ''}` +
    '\u0000' +
    `${eventScopeId(first) || ''}`
  );
};

const selectLatestCompleteExecutionGroup = (
  events: readonly NormalizedEvent[]
): NormalizedEvent[] =>
  groupEventsByCorrelation(events)
    .filter(isCompleteExecutionGroup)
    .sort((left, right) => {
      const timestampOrder =
        latestTimestampOf(right)
          .localeCompare(
            latestTimestampOf(left)
          );

      if (timestampOrder !== 0) {
        return timestampOrder;
      }

      return correlationIdentityOf(right)
        .localeCompare(
          correlationIdentityOf(left)
        );
    })[0] || [];
// END OP.ACC.1 V4 CORRELATION SNAPSHOT


const parameterValue = (
  context: ENSPolicyContext,
  parameterId: string
): unknown =>
  context.configuration
    ?.parameters
    .find(
      parameter =>
        parameter.id === parameterId
    )
    ?.value;

const isConfiguredValue = (
  value: unknown
): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
};

const missingParameters = (
  context: ENSPolicyContext,
  parameterIds: readonly string[]
): string[] =>
  parameterIds.filter(
    parameterId =>
      !isConfiguredValue(
        parameterValue(
          context,
          parameterId
        )
      )
  );

const availableRuntimeVariables = (
  variables: ENSRuntimeVariable[],
  names: readonly string[]
): string[] => {
  const available = new Set(
    variables.map(variable => variable.name)
  );

  return names.filter(name =>
    available.has(name)
  );
};

const formatActual = (
  values: Record<string, unknown>
): string =>
  Object.entries(values)
    .map(
      ([key, value]) =>
        `${key}=${JSON.stringify(value)}`
    )
    .join('; ');

const decision = (
  variables: ENSRuntimeVariable[],
  requirementId: string,
  status: ComplianceStatus,
  parameterIds: string[],
  evidenceIds: string[],
  relevantEvents: NormalizedEvent[],
  runtimeVariableNames: string[],
  ruleType: RuleType,
  expression: string,
  expected: string,
  actual: string,
  reason: string
): ENSPolicyDecision => ({
  policyId: POLICY_ID,
  requirementId,
  status,
  parameterIds,
  evidenceIds,
  eventIds: eventIds(relevantEvents),
  runtimeVariables:
    availableRuntimeVariables(
      variables,
      runtimeVariableNames
    ),
  trace: {
    ruleId:
      `${POLICY_ID}:${requirementId}`,
    ruleType,
    expression,
    expected,
    actual,
    result:
      status === 'CUMPLE' ||
      status === 'NO_APLICA',
  },
  reason,
});

const parameterVariables = (
  context: ENSPolicyContext
): ENSRuntimeVariable[] => {
  const definitions = [
    {
      id: 'P-01',
      name: 'identitySource',
      evidenceIds: ['EV-01', 'EV-02', 'EV-03'],
      description:
        'Fuente de identidad declarada en P-01.',
    },
    {
      id: 'P-02',
      name: 'monitoredSystems',
      evidenceIds: ['EV-01', 'EV-02'],
      description:
        'Sistemas monitorizados declarados en P-02.',
    },
    {
      id: 'P-03',
      name: 'configuredServiceAccounts',
      evidenceIds: ['EV-05'],
      description:
        'Cuentas de servicio declaradas en P-03.',
    },
    {
      id: 'P-04',
      name: 'genericAccountsProhibited',
      evidenceIds: ['EV-03'],
      description:
        'Prohibición de cuentas genéricas declarada en P-04.',
    },
    {
      id: 'P-05',
      name: 'maximumDisableDays',
      evidenceIds: ['EV-04'],
      description:
        'Plazo máximo de deshabilitación declarado en P-05.',
    },
    {
      id: 'P-06',
      name: 'minimumRetentionDays',
      evidenceIds: ['EV-08'],
      description:
        'Periodo mínimo de retención declarado en P-06.',
    },
    {
      id: 'P-07',
      name: 'authorizedIdentities',
      evidenceIds: ['EV-07'],
      description:
        'Lista de usuarios autorizados declarada en P-07.',
    },
    {
      id: 'P-08',
      name: 'humanResourcesIntegration',
      evidenceIds: ['EV-04'],
      description:
        'Integración o fuente de bajas declarada en P-08.',
    },
  ] as const;

  return definitions.flatMap(definition => {
    const value = parameterValue(
      context,
      definition.id
    );

    if (!isConfiguredValue(value)) {
      return [];
    }

    return [{
      name: definition.name,
      value:
        value as ENSRuntimeVariable['value'],
      parameterIds: [definition.id],
      evidenceIds:
        [...definition.evidenceIds],
      eventIds: [],
      description:
        definition.description,
    }];
  });
};

const eventCountVariables = (
  context: ENSPolicyContext
): ENSRuntimeVariable[] => {
  const definitions = [
    {
      name: 'genericAccountLoginCount',
      events: ['generic_account_login'],
      evidenceIds: ['EV-03'],
    },
    {
      name: 'serviceAccountInteractiveCount',
      events: ['service_account_interactive'],
      evidenceIds: ['EV-05'],
    },
    {
      name: 'duplicateIdentifierCount',
      events: ['duplicate_identifier'],
      evidenceIds: ['EV-01'],
    },
    {
      name: 'offboardingOverdueCount',
      events: ['account_offboarding_overdue'],
      evidenceIds: ['EV-04'],
    },
    {
      name: 'missingAuthorizedIdentityCount',
      events: [
        'identity_missing_from_authorized_registry',
      ],
      evidenceIds: ['EV-07'],
    },
  ] as const;

  return definitions.map(definition => {
    const matched = eventsOf(
      context,
      definition.events
    );

    return {
      name: definition.name,
      value: matched.length,
      parameterIds: [],
      evidenceIds:
        [...definition.evidenceIds],
      eventIds: eventIds(matched),
      description:
        `Número de eventos reales ${definition.events.join(', ')} utilizados por el evaluador op.acc.1.`,
    };
  });
};

const buildRuntimeVariables = (
  context: ENSPolicyContext
): ENSRuntimeVariable[] => [
  ...parameterVariables(context),
  ...eventCountVariables(context),
];

const evaluateRequirement1 = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision => {
  const parameterIds = ['P-01', 'P-04'];
  const evidenceIds = ['EV-03'];

  const relevant = eventsOf(context, [
    'auth_success',
    'authentication_cursor_initialized',
    'authentication_log_batch',
    'authentication_source_unavailable',
    'generic_account_login',
  ]);

  const adverse = eventsOf(
    context,
    ['generic_account_login']
  );

  const unavailable = eventsOf(
    context,
    ['authentication_source_unavailable']
  );

  const missing =
    missingParameters(
      context,
      parameterIds
    );

  const batch = latestEvent(
    context,
    ['authentication_log_batch']
  );

  const genericCount = toNumber(
    attribute(
      batch,
      'generic_account_authentications'
    )
  );

  const genericProhibited = toBoolean(
    parameterValue(context, 'P-04')
  );

  const recordsScanned = toNumber(
    attribute(
      batch,
      'records_scanned'
    )
  );

  if (
    adverse.length > 0 ||
    (
      genericCount !== undefined &&
      genericCount > 0
    )
  ) {
    return decision(
      variables,
      'op.acc.1.1',
      'NO_CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'genericAccountsProhibited',
        'genericAccountLoginCount',
      ],
      'COVERAGE_REQUIRED',
      'P-01 configurado AND P-04=true AND generic_account_login=0',
      'No se observan autenticaciones mediante cuentas genéricas.',
      formatActual({
        missingParameters: missing,
        genericProhibited,
        genericAccountLoginEvents:
          adverse.length,
        genericAccountAuthentications:
          genericCount,
      }),
      'Se ha observado una autenticación satisfactoria mediante una cuenta genérica o compartida.'
    );
  }

  if (missing.length > 0) {
    return decision(
      variables,
      'op.acc.1.1',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'P-01 y P-04 configurados',
      'Los parámetros obligatorios están configurados.',
      formatActual({
        missingParameters: missing,
      }),
      `No se puede evaluar el requisito porque faltan los parámetros: ${missing.join(', ')}.`
    );
  }

  if (genericProhibited === undefined) {
    return decision(
      variables,
      'op.acc.1.1',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'P-04 contiene un valor booleano válido',
      'La prohibición de cuentas genéricas está declarada de forma explícita.',
      formatActual({
        genericProhibited,
      }),
      'P-04 no contiene un valor booleano válido y no permite concluir cumplimiento o incumplimiento.'
    );
  }

  if (genericProhibited === false) {
    return decision(
      variables,
      'op.acc.1.1',
      'NO_CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'P-04=true',
      'Las cuentas genéricas están expresamente prohibidas.',
      formatActual({
        genericProhibited,
      }),
      'La configuración permite cuentas genéricas y contradice la prohibición requerida.'
    );
  }

  if (unavailable.length > 0) {
    return decision(
      variables,
      'op.acc.1.1',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'Fuente de autenticación disponible',
      'La fuente permite revisar autenticaciones.',
      formatActual({
        unavailableEvents:
          unavailable.length,
      }),
      'La fuente de autenticación no está disponible.'
    );
  }

  if (
    batch &&
    recordsScanned !== undefined &&
    recordsScanned > 0 &&
    genericCount === 0
  ) {
    return decision(
      variables,
      'op.acc.1.1',
      'CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'genericAccountsProhibited',
        'genericAccountLoginCount',
      ],
      'COVERAGE_REQUIRED',
      'P-01 configurado AND P-04=true AND lote EV-03 completo sin cuentas genéricas',
      'La fuente está configurada y el lote revisado no contiene autenticaciones genéricas.',
      formatActual({
        genericProhibited,
        recordsScanned,
        genericAccountAuthentications:
          genericCount,
      }),
      'La evidencia disponible no muestra autenticaciones mediante cuentas genéricas.'
    );
  }

  return decision(
    variables,
    'op.acc.1.1',
    relevant.length > 0
      ? 'PARCIAL'
      : 'NO_EVALUABLE',
    parameterIds,
    evidenceIds,
    relevant,
    [
      'identitySource',
      'genericAccountsProhibited',
    ],
    'COVERAGE_REQUIRED',
    'Lote EV-03 completo',
    'Debe existir una revisión completa de la fuente de autenticación.',
    formatActual({
      eventsObserved: relevant.length,
      genericAccountAuthentications:
        genericCount,
    }),
    relevant.length > 0
      ? 'Existe evidencia técnica, pero no una revisión concluyente de la fuente de autenticación.'
      : 'No existe evidencia EV-03 suficiente para evaluar el requisito.'
  );
};

const evaluateRequirement2 = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision => {
  const parameterIds = ['P-03'];
  const evidenceIds = ['EV-05', 'EV-06'];

  const relevant = eventsOf(context, [
    'service_account_interactive',
    'service_account_inventory',
    'service_account_missing',
    'service_account_observed',
    'service_account_registry_unavailable',
    'service_account_state_unknown',
    'service_authentication_log_batch',
    'service_authentication_source_unavailable',
    'privileged_group_missing',
    'privileged_group_policy_unavailable',
    'privileged_membership_inventory',
    'privileged_membership_observed',
    'administrative_identifier_observed',
  ]);

  const adverse = eventsOf(
    context,
    ['service_account_interactive']
  );

  const unavailable = eventsOf(context, [
    'service_account_registry_unavailable',
    'service_account_state_unknown',
    'service_authentication_source_unavailable',
    'privileged_group_policy_unavailable',
  ]);

  const missing =
    missingParameters(
      context,
      parameterIds
    );

  if (adverse.length > 0) {
    return decision(
      variables,
      'op.acc.1.2',
      'NO_CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'configuredServiceAccounts',
        'serviceAccountInteractiveCount',
      ],
      'COVERAGE_REQUIRED',
      'service_account_interactive=0',
      'Las cuentas de servicio no se utilizan interactivamente.',
      formatActual({
        interactiveServiceAccounts:
          adverse.length,
      }),
      'Se ha observado una autenticación interactiva mediante una cuenta configurada como cuenta de servicio.'
    );
  }

  if (missing.length > 0) {
    return decision(
      variables,
      'op.acc.1.2',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      ['configuredServiceAccounts'],
      'COVERAGE_REQUIRED',
      'P-03 configurado',
      'Existe una relación declarada de cuentas de servicio.',
      formatActual({
        missingParameters: missing,
      }),
      'No existe una relación de cuentas de servicio configurada.'
    );
  }

  if (unavailable.length > 0) {
    return decision(
      variables,
      'op.acc.1.2',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      ['configuredServiceAccounts'],
      'COVERAGE_REQUIRED',
      'EV-05 y EV-06 disponibles',
      'Las fuentes de cuentas de servicio y privilegios están disponibles.',
      formatActual({
        unavailableEvents:
          unavailable.length,
      }),
      'Al menos una fuente necesaria para evaluar roles, cuentas de servicio o privilegios no está disponible.'
    );
  }

  const serviceInventory = latestEvent(
    context,
    ['service_account_inventory']
  );

  const privilegeInventory = latestEvent(
    context,
    ['privileged_membership_inventory']
  );

  const missingServices = toNumber(
    attribute(
      serviceInventory,
      'missing_service_accounts'
    )
  );

  const missingGroups = toNumber(
    attribute(
      privilegeInventory,
      'missing_privileged_group_count'
    )
  );

  const unmatchedPrivileged = toNumber(
    attribute(
      privilegeInventory,
      'privileged_accounts_not_matching_admin_pattern'
    )
  );

  const adminWithoutPrivileges = toNumber(
    attribute(
      privilegeInventory,
      'administrative_identifiers_without_privileged_membership'
    )
  );

  const configuredPrivilegedGroupCount =
    toNumber(
      attribute(
        privilegeInventory,
        'configured_privileged_group_count'
      )
    );

  const existingPrivilegedGroupCount =
    toNumber(
      attribute(
        privilegeInventory,
        'existing_privileged_group_count'
      )
    );

  const summariesCorrelated =
    areCorrelated([
      serviceInventory,
      privilegeInventory,
    ]);

  if (
    serviceInventory &&
    privilegeInventory &&
    summariesCorrelated &&
    configuredPrivilegedGroupCount !==
      undefined &&
    configuredPrivilegedGroupCount > 0 &&
    existingPrivilegedGroupCount !==
      undefined &&
    existingPrivilegedGroupCount ===
      configuredPrivilegedGroupCount &&
    missingServices !== undefined &&
    missingServices === 0 &&
    missingGroups !== undefined &&
    missingGroups === 0 &&
    unmatchedPrivileged !== undefined &&
    unmatchedPrivileged === 0 &&
    adminWithoutPrivileges !== undefined &&
    adminWithoutPrivileges === 0
  ) {
    return decision(
      variables,
      'op.acc.1.2',
      'CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      ['configuredServiceAccounts'],
      'COVERAGE_REQUIRED',
      'Inventarios EV-05 y EV-06 completos sin desviaciones',
      'Las cuentas de servicio y administrativas están diferenciadas y no existe uso interactivo de cuentas de servicio.',
      formatActual({
        summariesCorrelated,
        configuredPrivilegedGroupCount,
        existingPrivilegedGroupCount,
        missingServices,
        missingGroups,
        unmatchedPrivileged,
        adminWithoutPrivileges,
      }),
      'Los inventarios técnicos disponibles no muestran desviaciones en la separación de cuentas de servicio y administrativas.'
    );
  }

  return decision(
    variables,
    'op.acc.1.2',
    relevant.length > 0
      ? 'PARCIAL'
      : 'NO_EVALUABLE',
    parameterIds,
    evidenceIds,
    relevant,
    ['configuredServiceAccounts'],
    'COVERAGE_REQUIRED',
    'Inventarios EV-05 y EV-06 completos',
    'Deben estar disponibles y ser coherentes los inventarios de servicio y privilegios.',
    formatActual({
      serviceInventory:
        Boolean(serviceInventory),
      privilegeInventory:
        Boolean(privilegeInventory),
      missingServices,
      missingGroups,
      unmatchedPrivileged,
      adminWithoutPrivileges,
    }),
    relevant.length > 0
      ? 'Existe soporte técnico, pero no es suficiente para acreditar completamente la separación de identificadores por rol.'
      : 'No existe evidencia suficiente para evaluar la separación de identificadores por rol.'
  );
};

const evaluateRequirement3 = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision => {
  const parameterIds = [
    'P-01',
    'P-02',
    'P-03',
    'P-04',
  ];

  const evidenceIds = [
    'EV-01',
    'EV-02',
    'EV-03',
    'EV-05',
  ];

  const relevant = eventsOf(context, [
    'account_active',
    'account_inventory',
    'account_state_unknown',
    'identity_baseline_compared',
    'identity_baseline_initialized',
    'account_created',
    'account_modified',
    'authentication_log_batch',
    'authentication_source_unavailable',
    'generic_account_login',
    'service_account_inventory',
    'service_account_registry_unavailable',
    'service_account_state_unknown',
    'service_authentication_source_unavailable',
    'service_account_interactive',
  ]);

  const adverse = eventsOf(context, [
    'generic_account_login',
    'service_account_interactive',
  ]);

  const unavailable = eventsOf(context, [
    'account_state_unknown',
    'authentication_source_unavailable',
    'service_account_registry_unavailable',
    'service_account_state_unknown',
    'service_authentication_source_unavailable',
  ]);

  const missing =
    missingParameters(
      context,
      parameterIds
    );

  const genericProhibited = toBoolean(
    parameterValue(context, 'P-04')
  );

  if (adverse.length > 0) {
    return decision(
      variables,
      'op.acc.1.3',
      'NO_CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'configuredServiceAccounts',
        'genericAccountsProhibited',
        'genericAccountLoginCount',
        'serviceAccountInteractiveCount',
      ],
      'COVERAGE_REQUIRED',
      'Identificadores singulares sin cuentas genéricas ni servicio interactivo',
      'Cada identidad observada se vincula singularmente con su uso.',
      formatActual({
        adverseEvents:
          adverse.map(
            event => event.eventType
          ),
      }),
      'Se ha observado una cuenta genérica o una cuenta de servicio utilizada interactivamente.'
    );
  }

  if (genericProhibited === false) {
    return decision(
      variables,
      'op.acc.1.3',
      'NO_CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'configuredServiceAccounts',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'P-04=true',
      'Las cuentas genéricas están expresamente prohibidas.',
      formatActual({
        genericProhibited,
      }),
      'La configuración permite cuentas genéricas y no satisface la singularidad exigida para las identidades.'
    );
  }

  if (missing.length > 0) {
    return decision(
      variables,
      'op.acc.1.3',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'configuredServiceAccounts',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'P-01, P-02, P-03 y P-04 configurados',
      'Los parámetros de alcance e identidad están completos.',
      formatActual({
        missingParameters: missing,
      }),
      `No se puede evaluar la singularidad de la identidad porque faltan: ${missing.join(', ')}.`
    );
  }

  if (unavailable.length > 0) {
    return decision(
      variables,
      'op.acc.1.3',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'configuredServiceAccounts',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'Fuentes EV-01, EV-02, EV-03 y EV-05 disponibles',
      'Las fuentes permiten evaluar la singularidad del identificador.',
      formatActual({
        unavailableEvents:
          unavailable.map(
            event => event.eventType
          ),
      }),
      'Una o más fuentes necesarias presentan estados desconocidos o no disponibles.'
    );
  }

  const inventory = latestEvent(
    context,
    ['account_inventory']
  );

  const baseline = latestEvent(
    context,
    ['identity_baseline_compared']
  );

  const authBatch = latestEvent(
    context,
    ['authentication_log_batch']
  );

  const serviceInventory = latestEvent(
    context,
    ['service_account_inventory']
  );

  const inventoryComplete = toBoolean(
    attribute(
      inventory,
      'inventory_complete'
    )
  );

  const genericCount = toNumber(
    attribute(
      authBatch,
      'generic_account_authentications'
    )
  );

  const missingServices = toNumber(
    attribute(
      serviceInventory,
      'missing_service_accounts'
    )
  );

  const recordsScanned = toNumber(
    attribute(
      authBatch,
      'records_scanned'
    )
  );

  const createdAccounts = toNumber(
    attribute(
      baseline,
      'created_accounts'
    )
  );

  const modifiedAccounts = toNumber(
    attribute(
      baseline,
      'modified_accounts'
    )
  );

  const missingAccounts = toNumber(
    attribute(
      baseline,
      'missing_accounts'
    )
  );

  const unresolvedIdentityChanges =
    eventsOf(context, [
      'account_created',
      'account_modified',
    ]);

  const summariesCorrelated =
    areCorrelated([
      inventory,
      baseline,
      authBatch,
      serviceInventory,
    ]);

  if (
    unresolvedIdentityChanges.length > 0 ||
    (
      createdAccounts !== undefined &&
      createdAccounts > 0
    ) ||
    (
      modifiedAccounts !== undefined &&
      modifiedAccounts > 0
    )
  ) {
    return decision(
      variables,
      'op.acc.1.3',
      'PARCIAL',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'configuredServiceAccounts',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'Cambios de identidad revisados y autorizados',
      'No existen altas o modificaciones pendientes de justificar.',
      formatActual({
        unresolvedIdentityChanges:
          unresolvedIdentityChanges.length,
        createdAccounts,
        modifiedAccounts,
      }),
      'Se han observado altas o modificaciones de identidad cuya autorización no puede acreditarse automáticamente.'
    );
  }

  if (
    summariesCorrelated &&
    inventoryComplete === true &&
    baseline &&
    createdAccounts !== undefined &&
    createdAccounts === 0 &&
    modifiedAccounts !== undefined &&
    modifiedAccounts === 0 &&
    missingAccounts !== undefined &&
    missingAccounts === 0 &&
    authBatch &&
    recordsScanned !== undefined &&
    recordsScanned > 0 &&
    genericCount === 0 &&
    serviceInventory &&
    missingServices !== undefined &&
    missingServices === 0
  ) {
    return decision(
      variables,
      'op.acc.1.3',
      'CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'configuredServiceAccounts',
        'genericAccountsProhibited',
      ],
      'COVERAGE_REQUIRED',
      'Inventario, baseline, autenticaciones y cuentas de servicio completos',
      'La cobertura técnica confirma identificadores singulares en el alcance declarado.',
      formatActual({
        summariesCorrelated,
        inventoryComplete,
        baselineCompared:
          Boolean(baseline),
        authenticationBatch:
          Boolean(authBatch),
        recordsScanned,
        genericCount,
        createdAccounts,
        modifiedAccounts,
        missingAccounts,
        serviceInventory:
          Boolean(serviceInventory),
        missingServices,
      }),
      'Las fuentes técnicas requeridas están completas y no muestran cuentas genéricas ni cuentas de servicio interactivas.'
    );
  }

  return decision(
    variables,
    'op.acc.1.3',
    relevant.length > 0
      ? 'PARCIAL'
      : 'NO_EVALUABLE',
    parameterIds,
    evidenceIds,
    relevant,
    [
      'identitySource',
      'monitoredSystems',
      'configuredServiceAccounts',
      'genericAccountsProhibited',
    ],
    'COVERAGE_REQUIRED',
    'Cobertura completa EV-01, EV-02, EV-03 y EV-05',
    'Todas las fuentes deben aportar información concluyente.',
    formatActual({
      inventoryComplete,
      baselineCompared:
        Boolean(baseline),
      authenticationBatch:
        Boolean(authBatch),
      serviceInventory:
        Boolean(serviceInventory),
    }),
    relevant.length > 0
      ? 'Existe cobertura parcial, pero todavía no se puede acreditar completamente la singularidad de las identidades.'
      : 'No existe evidencia suficiente para evaluar la singularidad de las identidades.'
  );
};

const evaluateRequirement4 = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision => {
  const parameterIds = [
    'P-01',
    'P-02',
    'P-05',
    'P-06',
    'P-08',
  ];

  const evidenceIds = [
    'EV-01',
    'EV-02',
    'EV-04',
    'EV-08',
  ];

  const relevant = eventsOf(context, [
    'account_inventory',
    'identity_baseline_compared',
    'duplicate_identifier',
    'account_missing_from_inventory',
    'account_offboarding_overdue',
    'offboarding_account_locked',
    'offboarding_account_missing',
    'offboarding_account_state_unknown',
    'offboarding_pending',
    'offboarding_record_invalid',
    'offboarding_registry_checked',
    'offboarding_registry_unavailable',
    'account_deleted',
    'account_deletion_record_invalid',
    'account_deletion_unconfirmed',
    'account_retention_registry_checked',
    'confirmed_deletion_registry_unavailable',
    'retention_period_unavailable',
  ]);

  const directAdverse = eventsOf(context, [
    'duplicate_identifier',
    'account_offboarding_overdue',
  ]);

  const deletedEvents = eventsOf(
    context,
    ['account_deleted']
  );

  const prematureDeletionEvents =
    deletedEvents.filter(event => {
      const reached = toBoolean(
        attribute(
          event,
          'retention_period_reached'
        )
      );

      const shortfall = toNumber(
        attribute(
          event,
          'retention_shortfall_days'
        )
      );

      return (
        reached === false ||
        (shortfall !== undefined && shortfall > 0)
      );
    });

  const missingInventoryEvents =
    eventsOf(
      context,
      ['account_missing_from_inventory']
    ).filter(
      event =>
        toBoolean(
          attribute(
            event,
            'deletion_confirmed'
          )
        ) !== true
    );

  const unavailable = [
    ...eventsOf(context, [
      'offboarding_account_state_unknown',
      'offboarding_record_invalid',
      'offboarding_registry_unavailable',
      'account_deletion_record_invalid',
      'account_deletion_unconfirmed',
      'confirmed_deletion_registry_unavailable',
      'retention_period_unavailable',
    ]),
    ...missingInventoryEvents,
  ];

  const missing =
    missingParameters(
      context,
      parameterIds
    );

  const retentionSummary = latestEvent(
    context,
    ['account_retention_registry_checked']
  );

  const beforePeriod = toNumber(
    attribute(
      retentionSummary,
      'confirmed_deletions_before_period'
    )
  );

  const adverse = [
    ...directAdverse,
    ...prematureDeletionEvents,
  ];

  if (
    adverse.length > 0 ||
    (beforePeriod !== undefined && beforePeriod > 0)
  ) {
    return decision(
      variables,
      'op.acc.1.4',
      'NO_CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'maximumDisableDays',
        'minimumRetentionDays',
        'humanResourcesIntegration',
        'duplicateIdentifierCount',
        'offboardingOverdueCount',
      ],
      'MAX_AGE',
      'Sin identificadores duplicados, bajas fuera de plazo ni eliminaciones prematuras',
      'La gestión de cuentas respeta unicidad, deshabilitación y retención.',
      formatActual({
        directAdverseEvents:
          directAdverse.length,
        prematureDeletionEvents:
          prematureDeletionEvents.length,
        confirmedDeletionsBeforePeriod:
          beforePeriod,
      }),
      'Se ha confirmado una desviación en la unicidad, deshabilitación o retención de una cuenta.'
    );
  }

  if (missing.length > 0) {
    return decision(
      variables,
      'op.acc.1.4',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'maximumDisableDays',
        'minimumRetentionDays',
        'humanResourcesIntegration',
      ],
      'MAX_AGE',
      'P-01, P-02, P-05, P-06 y P-08 configurados',
      'Los parámetros de gestión de cuentas están completos.',
      formatActual({
        missingParameters: missing,
      }),
      `No se puede evaluar la gestión de cuentas porque faltan: ${missing.join(', ')}.`
    );
  }

  if (unavailable.length > 0) {
    return decision(
      variables,
      'op.acc.1.4',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'maximumDisableDays',
        'minimumRetentionDays',
        'humanResourcesIntegration',
      ],
      'MAX_AGE',
      'Registros de bajas y retención disponibles y válidos',
      'La gestión de cuentas puede verificarse con fuentes fiables.',
      formatActual({
        unavailableEvents:
          unavailable.map(
            event => event.eventType
          ),
      }),
      'Existen registros inválidos, eliminaciones no confirmadas o fuentes no disponibles.'
    );
  }

  const inventory = latestEvent(
    context,
    ['account_inventory']
  );

  const baseline = latestEvent(
    context,
    ['identity_baseline_compared']
  );

  const offboarding = latestEvent(
    context,
    ['offboarding_registry_checked']
  );

  const inventoryComplete = toBoolean(
    attribute(
      inventory,
      'inventory_complete'
    )
  );

  const duplicateUidGroups = toNumber(
    attribute(
      inventory,
      'duplicate_uid_groups'
    )
  );

  const createdAccounts = toNumber(
    attribute(
      baseline,
      'created_accounts'
    )
  );

  const modifiedAccounts = toNumber(
    attribute(
      baseline,
      'modified_accounts'
    )
  );

  const missingAccounts = toNumber(
    attribute(
      baseline,
      'missing_accounts'
    )
  );

  const offboardingInvalid = toNumber(
    attribute(
      offboarding,
      'invalid_records'
    )
  );

  const offboardingOverdue = toNumber(
    attribute(
      offboarding,
      'overdue_accounts'
    )
  );

  const offboardingUnknown = toNumber(
    attribute(
      offboarding,
      'unknown_accounts'
    )
  );

  const retentionInvalid = toNumber(
    attribute(
      retentionSummary,
      'invalid_records'
    )
  );

  const retentionUnconfirmed = toNumber(
    attribute(
      retentionSummary,
      'unconfirmed_deletions'
    )
  );

  const summariesCorrelated =
    areCorrelated([
      inventory,
      baseline,
      offboarding,
      retentionSummary,
    ]);

  if (
    summariesCorrelated &&
    inventoryComplete === true &&
    duplicateUidGroups !== undefined &&
    baseline &&
    createdAccounts !== undefined &&
    createdAccounts === 0 &&
    modifiedAccounts !== undefined &&
    modifiedAccounts === 0 &&
    missingAccounts !== undefined &&
    missingAccounts === 0 &&
    duplicateUidGroups === 0 &&
    offboarding &&
    offboardingInvalid !== undefined &&
    offboardingInvalid === 0 &&
    offboardingOverdue !== undefined &&
    offboardingOverdue === 0 &&
    offboardingUnknown !== undefined &&
    offboardingUnknown === 0 &&
    retentionSummary &&
    retentionInvalid !== undefined &&
    retentionInvalid === 0 &&
    retentionUnconfirmed !== undefined &&
    retentionUnconfirmed === 0 &&
    beforePeriod !== undefined &&
    beforePeriod === 0
  ) {
    return decision(
      variables,
      'op.acc.1.4',
      'CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'identitySource',
        'monitoredSystems',
        'maximumDisableDays',
        'minimumRetentionDays',
        'humanResourcesIntegration',
        'duplicateIdentifierCount',
        'offboardingOverdueCount',
      ],
      'MAX_AGE',
      'Inventarios EV-01, EV-04 y EV-08 completos sin desviaciones',
      'No hay duplicidad, bajas vencidas, estados desconocidos ni eliminaciones prematuras.',
      formatActual({
        summariesCorrelated,
        inventoryComplete,
        duplicateUidGroups,
        createdAccounts,
        modifiedAccounts,
        missingAccounts,
        offboardingInvalid,
        offboardingOverdue,
        offboardingUnknown,
        retentionInvalid,
        retentionUnconfirmed,
        beforePeriod,
      }),
      'La evidencia disponible acredita la correcta gestión, deshabilitación y retención de cuentas.'
    );
  }

  return decision(
    variables,
    'op.acc.1.4',
    relevant.length > 0
      ? 'PARCIAL'
      : 'NO_EVALUABLE',
    parameterIds,
    evidenceIds,
    relevant,
    [
      'identitySource',
      'monitoredSystems',
      'maximumDisableDays',
      'minimumRetentionDays',
      'humanResourcesIntegration',
    ],
    'MAX_AGE',
    'Cobertura completa EV-01, EV-02, EV-04 y EV-08',
    'La gestión de cuentas debe estar cubierta completamente.',
    formatActual({
      inventoryComplete,
      offboardingSummary:
        Boolean(offboarding),
      retentionSummary:
        Boolean(retentionSummary),
    }),
    relevant.length > 0
      ? 'La evidencia cubre parcialmente la gestión de cuentas, pero no permite una conclusión completa.'
      : 'No existe evidencia suficiente para evaluar la gestión de cuentas.'
  );
};

const evaluateRequirement5 = (
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision =>
  decision(
    variables,
    'op.acc.1.5',
    'NO_EVALUABLE',
    [],
    [],
    [],
    [],
    'COVERAGE_REQUIRED',
    'Evidencia externa o manual eIDAS disponible',
    'La identificación electrónica debe acreditarse conforme a la legislación aplicable.',
    'No existe una evidencia externa o manual eIDAS configurada en el modelo actual.',
    'El inventario local de cuentas no acredita los niveles de identificación electrónica exigidos por op.acc.1.5.'
  );

const evaluateR11 = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision => {
  if (context.level === 'BAJO') {
    return decision(
      variables,
      'op.acc.1.r1.1',
      'NO_APLICA',
      [],
      [],
      [],
      [],
      'COVERAGE_REQUIRED',
      'Nivel MEDIO o ALTO',
      'R1 solo resulta exigible en MEDIO y ALTO.',
      `level=${context.level}`,
      'El refuerzo R1 no resulta aplicable al nivel BAJO.'
    );
  }

  return decision(
    variables,
    'op.acc.1.r1.1',
    'NO_EVALUABLE',
    [],
    [],
    [],
    [],
    'COVERAGE_REQUIRED',
    'Evidencia de asociación identidad-persona-responsabilidades',
    'La identidad debe permitir singularizar a la persona y sus responsabilidades.',
    'No existe evidencia automática ni parámetro documental suficiente.',
    'EV-01 no acredita por sí solo la relación entre identidad, persona y responsabilidades.'
  );
};

const evaluateR12 = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision => {
  if (context.level === 'BAJO') {
    return decision(
      variables,
      'op.acc.1.r1.2',
      'NO_APLICA',
      [],
      ['EV-01', 'EV-06'],
      [],
      [],
      'COVERAGE_REQUIRED',
      'Nivel MEDIO o ALTO',
      'R1 solo resulta exigible en MEDIO y ALTO.',
      `level=${context.level}`,
      'El refuerzo R1 no resulta aplicable al nivel BAJO.'
    );
  }

  const relevant = eventsOf(context, [
    'account_inventory',
    'administrative_identifier_observed',
    'privileged_group_missing',
    'privileged_group_policy_unavailable',
    'privileged_membership_inventory',
    'privileged_membership_observed',
  ]);

  const unavailable = eventsOf(
    context,
    ['privileged_group_policy_unavailable']
  );

  if (unavailable.length > 0) {
    return decision(
      variables,
      'op.acc.1.r1.2',
      'NO_EVALUABLE',
      [],
      ['EV-01', 'EV-06'],
      relevant,
      [],
      'COVERAGE_REQUIRED',
      'Política documental de privilegios disponible',
      'Los datos de identificación se contrastan con la documentación de control de acceso.',
      formatActual({
        unavailableEvents:
          unavailable.length,
      }),
      'La política necesaria para interpretar los privilegios no está disponible.'
    );
  }

  if (relevant.length > 0) {
    return decision(
      variables,
      'op.acc.1.r1.2',
      'PARCIAL',
      [],
      ['EV-01', 'EV-06'],
      relevant,
      [],
      'COVERAGE_REQUIRED',
      'Evidencia técnica y documentación de control de acceso',
      'La identificación determina privilegios conforme a documentación aprobada.',
      formatActual({
        technicalEvents:
          relevant.length,
        documentationEvidence:
          false,
      }),
      'EV-01 y EV-06 aportan soporte técnico, pero no acreditan por sí solos la relación formal entre identidad y privilegios.'
    );
  }

  return decision(
    variables,
    'op.acc.1.r1.2',
    'NO_EVALUABLE',
    [],
    ['EV-01', 'EV-06'],
    [],
    [],
    'COVERAGE_REQUIRED',
    'Evidencia técnica y documentación de control de acceso',
    'La identificación determina privilegios conforme a documentación aprobada.',
    'No existe soporte técnico ni documental suficiente.',
    'No se dispone de información suficiente para evaluar el refuerzo.'
  );
};

const evaluateR13 = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision => {
  const parameterIds = ['P-07'];
  const evidenceIds = ['EV-01', 'EV-07'];

  if (context.level === 'BAJO') {
    return decision(
      variables,
      'op.acc.1.r1.3',
      'NO_APLICA',
      parameterIds,
      evidenceIds,
      [],
      [],
      'WHITELIST',
      'Nivel MEDIO o ALTO',
      'R1 solo resulta exigible en MEDIO y ALTO.',
      `level=${context.level}`,
      'El refuerzo R1 no resulta aplicable al nivel BAJO.'
    );
  }

  const relevant = eventsOf(context, [
    'account_inventory',
    'authorized_identity_not_observed',
    'authorized_identity_outside_declared_scope',
    'authorized_identity_password_locked',
    'authorized_identity_registry_compared',
    'authorized_identity_registry_unavailable',
    'identity_authorization_state_unknown',
    'identity_missing_from_authorized_registry',
    'identity_present_in_authorized_registry',
  ]);

  const missing =
    missingParameters(
      context,
      parameterIds
    );

  if (missing.length > 0) {
    return decision(
      variables,
      'op.acc.1.r1.3',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      ['authorizedIdentities'],
      'WHITELIST',
      'P-07 configurado',
      'Existe una lista maestra de usuarios autorizados.',
      formatActual({
        missingParameters: missing,
      }),
      'No existe una lista P-07 disponible para realizar la comparación.'
    );
  }

  const summary = latestEvent(
    context,
    ['authorized_identity_registry_compared']
  );

  const inventory = latestEvent(
    context,
    ['account_inventory']
  );

  const inventoryComplete = toBoolean(
    attribute(
      inventory,
      'inventory_complete'
    )
  );

  const inventoryTotalAccounts = toNumber(
    attribute(
      inventory,
      'total_accounts'
    )
  );

  const registryEntries = toNumber(
    attribute(
      summary,
      'registry_entries'
    )
  );

  const activeAccountsInScope = toNumber(
    attribute(
      summary,
      'active_accounts_in_scope'
    )
  );

  const activeAuthorizedAccounts =
    toNumber(
      attribute(
        summary,
        'active_authorized_accounts'
      )
    );

  const authorizedIdentities =
    toStringList(
      parameterValue(context, 'P-07')
    );

  const summariesCorrelated =
    areCorrelated([
      inventory,
      summary,
    ]);

  const missingFromRegistry = toNumber(
    attribute(
      summary,
      'active_accounts_missing_from_registry'
    )
  );

  const notObserved = toNumber(
    attribute(
      summary,
      'authorized_identities_not_observed'
    )
  );

  const outsideScope = toNumber(
    attribute(
      summary,
      'authorized_identities_outside_scope'
    )
  );

  const passwordLocked = toNumber(
    attribute(
      summary,
      'authorized_password_locked_accounts'
    )
  );

  const unknownAuthorized = toNumber(
    attribute(
      summary,
      'authorized_unknown_state_accounts'
    )
  );

  const unknownInScope = toNumber(
    attribute(
      summary,
      'unknown_state_accounts_in_scope'
    )
  );

  const directMissing = eventsOf(
    context,
    ['identity_missing_from_authorized_registry']
  );

  if (
    directMissing.length > 0 ||
    (
      missingFromRegistry !== undefined &&
      missingFromRegistry > 0
    ) ||
    (
      notObserved !== undefined &&
      notObserved > 0
    ) ||
    (
      outsideScope !== undefined &&
      outsideScope > 0
    )
  ) {
    return decision(
      variables,
      'op.acc.1.r1.3',
      'NO_CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'authorizedIdentities',
        'missingAuthorizedIdentityCount',
      ],
      'WHITELIST',
      'P-07 actualizada y coincidente con las cuentas activas en alcance',
      'No existen cuentas activas ausentes ni identidades autorizadas obsoletas.',
      formatActual({
        directMissing:
          directMissing.length,
        missingFromRegistry,
        notObserved,
        outsideScope,
      }),
      'La comparación confirma que la lista de usuarios autorizados está incompleta o desactualizada.'
    );
  }

  const unavailable = eventsOf(context, [
    'authorized_identity_registry_unavailable',
    'identity_authorization_state_unknown',
  ]);

  if (
    unavailable.length > 0 ||
    (
      unknownAuthorized !== undefined &&
      unknownAuthorized > 0
    ) ||
    (
      unknownInScope !== undefined &&
      unknownInScope > 0
    )
  ) {
    return decision(
      variables,
      'op.acc.1.r1.3',
      'NO_EVALUABLE',
      parameterIds,
      evidenceIds,
      relevant,
      ['authorizedIdentities'],
      'WHITELIST',
      'Comparación P-07 completa y sin estados desconocidos',
      'Todos los usuarios en alcance tienen un estado determinable.',
      formatActual({
        unavailableEvents:
          unavailable.length,
        unknownAuthorized,
        unknownInScope,
      }),
      'La fuente de usuarios autorizados no está disponible o existen estados de identidad desconocidos.'
    );
  }

  if (
    inventory &&
    inventoryComplete === true &&
    inventoryTotalAccounts !== undefined &&
    inventoryTotalAccounts > 0 &&
    summary &&
    summariesCorrelated &&
    authorizedIdentities.length > 0 &&
    registryEntries !== undefined &&
    registryEntries ===
      authorizedIdentities.length &&
    activeAccountsInScope !== undefined &&
    activeAccountsInScope > 0 &&
    activeAuthorizedAccounts !== undefined &&
    activeAuthorizedAccounts ===
      activeAccountsInScope &&
    activeAuthorizedAccounts <=
      registryEntries &&
    activeAccountsInScope <=
      inventoryTotalAccounts &&
    missingFromRegistry !== undefined &&
    missingFromRegistry === 0 &&
    notObserved !== undefined &&
    notObserved === 0 &&
    outsideScope !== undefined &&
    outsideScope === 0 &&
    passwordLocked !== undefined &&
    passwordLocked === 0 &&
    unknownAuthorized !== undefined &&
    unknownAuthorized === 0 &&
    unknownInScope !== undefined &&
    unknownInScope === 0
  ) {
    return decision(
      variables,
      'op.acc.1.r1.3',
      'CUMPLE',
      parameterIds,
      evidenceIds,
      relevant,
      [
        'authorizedIdentities',
        'missingAuthorizedIdentityCount',
      ],
      'WHITELIST',
      'P-07 coincidente con EV-01 y EV-07',
      'La lista autorizada está actualizada y coincide con las identidades activas.',
      formatActual({
        summariesCorrelated,
        inventoryComplete,
        inventoryTotalAccounts,
        authorizedIdentityCount:
          authorizedIdentities.length,
        registryEntries,
        activeAccountsInScope,
        activeAuthorizedAccounts,
        missingFromRegistry,
        notObserved,
        outsideScope,
        passwordLocked,
        unknownAuthorized,
        unknownInScope,
      }),
      'La comparación completa no muestra identidades activas no autorizadas ni entradas obsoletas.'
    );
  }

  return decision(
    variables,
    'op.acc.1.r1.3',
    relevant.length > 0
      ? 'PARCIAL'
      : 'NO_EVALUABLE',
    parameterIds,
    evidenceIds,
    relevant,
    ['authorizedIdentities'],
    'WHITELIST',
    'Comparación completa P-07 contra EV-01 y EV-07',
    'La lista autorizada debe estar actualizada y completamente contrastada.',
    formatActual({
      comparisonAvailable:
        Boolean(summary),
      passwordLocked,
    }),
    relevant.length > 0
      ? 'Existe evidencia parcial, pero la comparación no permite declarar conformidad completa.'
      : 'No existe una comparación suficiente de la lista de usuarios autorizados.'
  );
};

export const opAcc1PolicyEvaluator = (
  context: ENSPolicyContext
): ENSPolicyEvaluatorResult => {
  const rawTechnicalEvents =
    context.events.filter(
      isRawOpAcc1TechnicalFact
    );

  const selectedExecutionEvents =
    selectLatestCompleteExecutionGroup(
      rawTechnicalEvents
    );

  const evaluationContext:
    ENSPolicyContext = {
      ...context,
      events: selectedExecutionEvents,
    };

  const runtimeVariables =
    buildRuntimeVariables(
      evaluationContext
    );

  return {
    runtimeVariables,
    decisions: [
      evaluateRequirement1(
        evaluationContext,
        runtimeVariables
      ),
      evaluateRequirement2(
        evaluationContext,
        runtimeVariables
      ),
      evaluateRequirement3(
        evaluationContext,
        runtimeVariables
      ),
      evaluateRequirement4(
        evaluationContext,
        runtimeVariables
      ),
      evaluateRequirement5(
        runtimeVariables
      ),
      evaluateR11(
        evaluationContext,
        runtimeVariables
      ),
      evaluateR12(
        evaluationContext,
        runtimeVariables
      ),
      evaluateR13(
        evaluationContext,
        runtimeVariables
      ),
    ],
  };
};
