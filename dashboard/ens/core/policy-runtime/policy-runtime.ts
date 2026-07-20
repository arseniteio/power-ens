import {
  ENSPolicyContext,
  ENSPolicyDecision,
  ENSPolicyRuntimeResult,
  ENSRuntimeVariable,
} from './types';

const getParameterValue = (
  context: ENSPolicyContext,
  parameterId: string
): string | number | boolean | string[] | number[] | undefined =>
  context.configuration?.parameters.find(parameter => parameter.id === parameterId)
    ?.value;

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBoolean = (value: unknown): boolean =>
  value === true ||
  String(value).toLowerCase() === 'true' ||
  String(value).toLowerCase() === 'sí' ||
  String(value).toLowerCase() === 'si' ||
  String(value).toLowerCase() === 'yes';

const normalizeStringList = (
  value: unknown
): string[] => {
  const sourceValues: unknown[] =
    Array.isArray(value)
      ? value
      : typeof value === 'string'
      ? value.split(/[;\n]+/)
      : [];

  return Array.from(
    new Set(
      sourceValues
        .map(item =>
          String(item).trim()
        )
        .filter(Boolean)
    )
  );
};

type ENSSystemCriticality =
  | 'ALTA'
  | 'MEDIA'
  | 'BAJA'
  | 'SIN_DEFINIR';

interface ENSRestoreThresholdContract {
  global?: number;
  byCriticality: string[];
  invalidEntries: string[];
}

const normalizeSystemCriticality = (
  value?: string
): ENSSystemCriticality => {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (
    normalized === 'ALTA' ||
    normalized === 'MEDIA' ||
    normalized === 'BAJA'
  ) {
    return normalized;
  }

  return 'SIN_DEFINIR';
};

const parseMonitoredSystemsWithCriticality = (
  value: unknown
): string[] => {
  const systems: string[] = [];

  normalizeStringList(value).forEach(entry => {
    const parts = entry.split('|', 2);
    const system = String(parts[0] || '').trim();

    if (!system) {
      return;
    }

    const criticality =
      normalizeSystemCriticality(parts[1]);

    const canonicalEntry =
      `${system} | ${criticality}`;

    if (!systems.includes(canonicalEntry)) {
      systems.push(canonicalEntry);
    }
  });

  return systems;
};

const toPositiveNumber = (
  value: unknown
): number | undefined => {
  const parsed = Number(value);

  return Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : undefined;
};

const toPositiveInteger = (
  value: unknown
): number | undefined => {
  if (
    typeof value !== 'number' &&
    typeof value !== 'string'
  ) {
    return undefined;
  }

  const normalized =
    typeof value === 'string'
      ? value.trim()
      : value;

  if (
    typeof normalized === 'string' &&
    !/^\d+$/.test(normalized)
  ) {
    return undefined;
  }

  const parsed = Number(normalized);

  return Number.isInteger(parsed) &&
    parsed > 0
    ? parsed
    : undefined;
};

const parseRestoreThresholdContract = (
  value: unknown
): ENSRestoreThresholdContract => {
  const result: ENSRestoreThresholdContract = {
    byCriticality: [],
    invalidEntries: [],
  };

  if (
    typeof value === 'number'
  ) {
    result.global =
      toPositiveNumber(value);

    return result;
  }

  if (
    typeof value === 'string' &&
    /^\s*\d+(?:\.\d+)?\s*$/.test(value)
  ) {
    result.global =
      toPositiveNumber(value);

    if (result.global === undefined) {
      result.invalidEntries.push(
        value.trim()
      );
    }

    return result;
  }

  const thresholds = new Map<
    'ALTA' | 'MEDIA' | 'BAJA',
    number
  >();

  normalizeStringList(value).forEach(entry => {
    const numericEntry =
      /^\d+(?:\.\d+)?$/.test(entry)
        ? toPositiveNumber(entry)
        : undefined;

    if (numericEntry !== undefined) {
      result.global = numericEntry;
      return;
    }

    const match = entry.match(
      /^(ALTA|MEDIA|BAJA)\s*=\s*(\d+(?:\.\d+)?)$/i
    );

    if (!match) {
      result.invalidEntries.push(entry);
      return;
    }

    const criticality =
      match[1].toUpperCase() as
        'ALTA' | 'MEDIA' | 'BAJA';

    const threshold =
      toPositiveNumber(match[2]);

    if (threshold === undefined) {
      result.invalidEntries.push(entry);
      return;
    }

    thresholds.set(
      criticality,
      threshold
    );
  });

  (
    ['ALTA', 'MEDIA', 'BAJA'] as const
  ).forEach(criticality => {
    const threshold =
      thresholds.get(criticality);

    if (threshold !== undefined) {
      result.byCriticality.push(
        `${criticality}=${threshold}`
      );
    }
  });

  return result;
};

const hoursSince = (timestamp?: string): number | undefined => {
  if (!timestamp) return undefined;

  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return undefined;

  return Math.round((Date.now() - time) / 36000) / 100;
};

const daysSince = (timestamp?: string): number | undefined => {
  const hours = hoursSince(timestamp);
  return hours === undefined ? undefined : Math.round((hours / 24) * 100) / 100;
};

const normalizeRepositoryValue = (
  value: unknown
): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > 1
    ? trimmed.replace(/[\\/]+$/, '')
    : trimmed;
};

const getLatestRetentionEvent = (
  context: ENSPolicyContext
) =>
  [...context.events]
    .filter(event =>
      !event.isSynthetic &&
      (!event.controlId ||
        event.controlId === 'mp.info.6') &&
      (!event.evidenceId ||
        event.evidenceId === 'EV-03') &&
      event.eventType === 'retention_configured' &&
      [
        'WAZUH_ALERT',
        'LOCAL_JSON',
        'SCRIPT',
        'API',
        'SCA',
      ].includes(event.sourceType)
    )
    .sort((left, right) => {
      const rightTimestamp =
        Date.parse(right.timestamp);

      const leftTimestamp =
        Date.parse(left.timestamp);

      return (
        (
          Number.isFinite(rightTimestamp)
            ? rightTimestamp
            : 0
        ) -
        (
          Number.isFinite(leftTimestamp)
            ? leftTimestamp
            : 0
        )
      );
    })[0];

const buildRuntimeVariables = (
  context: ENSPolicyContext
): ENSRuntimeVariable[] => {
  if (context.control.id !== 'mp.info.6') {
    return [];
  }

  const backupFrequencyHours = toNumber(getParameterValue(context, 'P-01'));
  const toleranceHours = toNumber(getParameterValue(context, 'P-02'), 0);

  const configuredBackupToolValue =
    getParameterValue(
      context,
      'P-10'
    );

  const configuredBackupTool =
    (
      typeof configuredBackupToolValue ===
        'string' ||
      typeof configuredBackupToolValue ===
        'number'
    )
      ? String(
          configuredBackupToolValue
        ).trim()
      : '';

  const restoreThresholdContract =
    parseRestoreThresholdContract(
      getParameterValue(context, 'P-05')
    );
  const restoreThresholdDays =
    restoreThresholdContract.global;
  const offsiteEnabled = toBoolean(getParameterValue(context, 'P-08'));
  const offsiteRepository = getParameterValue(context, 'P-09');
  const monitoredSystems = normalizeStringList(
    getParameterValue(context, 'P-04')
  );
  const monitoredSystemsByCriticality =
    parseMonitoredSystemsWithCriticality(
      getParameterValue(context, 'P-04')
    );
  const authorizedUsersAndProcesses = normalizeStringList(
    getParameterValue(context, 'P-07')
  );

  const retentionThresholdDays =
    toPositiveInteger(
      getParameterValue(context, 'P-03')
    );

  const configuredBackupRepository =
    normalizeRepositoryValue(
      getParameterValue(context, 'P-06')
    );

  const retentionEvent =
    getLatestRetentionEvent(context);

  const observedRetentionDays =
    toPositiveInteger(
      retentionEvent
        ?.attributes
        ?.['retention_days']
    );

  const observedBackupRepository =
    normalizeRepositoryValue(
      retentionEvent
        ?.attributes
        ?.['backup_path']
    );

  const variables: ENSRuntimeVariable[] = [];

  if (configuredBackupTool) {
    variables.push({
      name:
        'configuredBackupTool',
      value:
        configuredBackupTool,
      parameterIds:
        ['P-10'],
      evidenceIds:
        ['EV-01', 'EV-02', 'EV-07'],
      eventIds: [],
      description:
        'Herramienta de copias configurada en P-10, utilizada como requisito de configuración y trazabilidad sin realizar todavía una comparación TOOL_MATCH.',
    });
  }

  if (retentionThresholdDays !== undefined) {
    variables.push({
      name: 'retentionThresholdDays',
      value: retentionThresholdDays,
      parameterIds: ['P-03'],
      evidenceIds: ['EV-03'],
      eventIds: [],
      description:
        'Retención mínima exigida por P-03, normalizada como número entero positivo de días.',
    });
  }

  if (configuredBackupRepository) {
    variables.push({
      name: 'configuredBackupRepository',
      value: configuredBackupRepository,
      parameterIds: ['P-06'],
      evidenceIds: ['EV-03'],
      eventIds: [],
      description:
        'Repositorio local de copias configurado en P-06 y normalizado para la comparación con la evidencia.',
    });
  }

  if (
    retentionEvent &&
    !retentionEvent.isSynthetic &&
    observedRetentionDays !== undefined
  ) {
    variables.push({
      name: 'observedRetentionDays',
      value: observedRetentionDays,
      parameterIds: [],
      evidenceIds: ['EV-03'],
      eventIds: [retentionEvent.id],
      description:
        'Retención observada en el último evento real retention_configured de EV-03.',
    });
  }

  if (
    retentionEvent &&
    !retentionEvent.isSynthetic &&
    observedBackupRepository
  ) {
    variables.push({
      name: 'observedBackupRepository',
      value: observedBackupRepository,
      parameterIds: [],
      evidenceIds: ['EV-03'],
      eventIds: [retentionEvent.id],
      description:
        'Repositorio observado en el mismo evento retention_configured utilizado para evaluar la retención.',
    });
  }

  if (monitoredSystems.length) {
    variables.push({
      name: 'monitoredSystems',
      value: monitoredSystems,
      parameterIds: ['P-04'],
      evidenceIds: ['EV-01', 'EV-05'],
      eventIds: [],
      description:
        'Sistemas incluidos en el alcance declarados por P-04, normalizados como lista sin interpretar todavía su criticidad.',
    });
  }

  if (monitoredSystemsByCriticality.length) {
    variables.push({
      name: 'monitoredSystemsByCriticality',
      value: monitoredSystemsByCriticality,
      parameterIds: ['P-04'],
      evidenceIds: ['EV-01', 'EV-05'],
      eventIds: [],
      description:
        'Sistemas de P-04 normalizados como sistema y criticidad; los valores heredados conservan criticidad SIN_DEFINIR.',
    });
  }

  if (authorizedUsersAndProcesses.length) {
    variables.push({
      name: 'authorizedUsersAndProcesses',
      value: authorizedUsersAndProcesses,
      parameterIds: ['P-07'],
      evidenceIds: ['EV-04'],
      eventIds: [],
      description:
        'Usuarios y procesos autorizados declarados por P-07, normalizados como lista para una futura comparación con evidencia real.',
    });
  }

  if (backupFrequencyHours) {
    variables.push({
      name: 'backupThresholdHours',
      value: backupFrequencyHours + toleranceHours,
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-02'],
      eventIds: [],
      description:
        'Umbral máximo permitido entre copias de seguridad calculado desde P-01 y P-02.',
    });
  }

  if (restoreThresholdDays) {
    variables.push({
      name: 'restoreThresholdDays',
      value: restoreThresholdDays,
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      eventIds: [],
      description:
        'Periodo máximo permitido sin prueba de restauración calculado desde P-05.',
    });
  }

  if (restoreThresholdContract.byCriticality.length) {
    variables.push({
      name: 'restoreThresholdsByCriticality',
      value: restoreThresholdContract.byCriticality,
      parameterIds: ['P-05'],
      evidenceIds: ['EV-05'],
      eventIds: [],
      description:
        'Umbrales máximos de restauración de P-05 normalizados por criticidad, sin habilitar todavía una decisión R1 por sistema.',
    });
  }

  if (context.level === 'ALTO') {
    variables.push({
      name: 'offsiteRepositoryActive',
      value: offsiteEnabled,
      parameterIds: ['P-08'],
      evidenceIds: ['EV-06'],
      eventIds: [],
      description:
        'Indica si la política del cliente declara activo el repositorio offsite para R2.',
    });

    if (offsiteRepository !== undefined) {
      variables.push({
        name: 'offsiteRepository',
        value: offsiteRepository,
        parameterIds: ['P-09'],
        evidenceIds: ['EV-06'],
        eventIds: [],
        description:
          'Ruta, URL o ubicación declarada para el repositorio offsite.',
      });
    }
  }

  const backupEvidence = context.evidences.find(evidence =>
    ['EV-01', 'EV-02'].includes(evidence.id)
  );

  const lastBackupAgeHours = hoursSince(backupEvidence?.lastSeen);

  if (lastBackupAgeHours !== undefined) {
    variables.push({
      name: 'lastBackupAgeHours',
      value: lastBackupAgeHours,
      parameterIds: [],
      evidenceIds: backupEvidence ? [backupEvidence.id] : [],
      eventIds: [],
      description:
        'Horas transcurridas desde la última evidencia de copia de seguridad.',
    });
  }

  const restoreEvidence = context.evidences.find(
    evidence => evidence.id === 'EV-05'
  );

  const lastRestoreAgeDays = daysSince(restoreEvidence?.lastSeen);

  if (lastRestoreAgeDays !== undefined) {
    variables.push({
      name: 'lastRestoreAgeDays',
      value: lastRestoreAgeDays,
      parameterIds: [],
      evidenceIds: restoreEvidence ? [restoreEvidence.id] : [],
      eventIds: [],
      description:
        'Días transcurridos desde la última evidencia de prueba de restauración.',
    });
  }

  return variables;
};

const getVariableNumber = (
  variables: ENSRuntimeVariable[],
  name: string
): number | undefined => {
  const value = variables.find(variable => variable.name === name)?.value;
  return typeof value === 'number' ? value : undefined;
};

const getVariableBoolean = (
  variables: ENSRuntimeVariable[],
  name: string
): boolean | undefined => {
  const value = variables.find(variable => variable.name === name)?.value;
  return typeof value === 'boolean' ? value : undefined;
};

const getVariableValue = (
  variables: ENSRuntimeVariable[],
  name: string
): string | number | boolean | string[] | number[] | undefined =>
  variables.find(variable => variable.name === name)?.value;

const getResolvedRealCoverageEvent = (
  context: ENSPolicyContext,
  evidenceId:
    | 'EV-01'
    | 'EV-02'
    | 'EV-07'
) => {
  const evidence =
    context.evidences.find(
      item =>
        item.id === evidenceId
    );

  if (!evidence?.resolvedEventId) {
    return undefined;
  }

  return context.events.find(
    event => {
      const isGenericStateEvent =
        [
          'evidence_state',
          'control_state',
        ].includes(
          event.eventType
        );

      return (
        !event.isSynthetic &&
        event.id ===
          evidence.resolvedEventId &&
        (
          !event.controlId ||
          event.controlId ===
            'mp.info.6'
        ) &&
        (
          isGenericStateEvent
            ? event.evidenceId ===
                evidenceId
            : (
                !event.evidenceId ||
                event.evidenceId ===
                  evidenceId
              )
        )
      );
    }
  );
};

const buildBackupCoverageDecision = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  const backupThresholdHours =
    toNumber(
      getVariableValue(
        variables,
        'backupThresholdHours'
      )
    );

  const retentionThresholdDays =
    toPositiveInteger(
      getVariableValue(
        variables,
        'retentionThresholdDays'
      )
    );

  const monitoredSystems =
    normalizeStringList(
      getVariableValue(
        variables,
        'monitoredSystems'
      )
    );

  const configuredBackupToolValue =
    getVariableValue(
      variables,
      'configuredBackupTool'
    );

  const configuredBackupTool =
    (
      typeof configuredBackupToolValue ===
        'string' ||
      typeof configuredBackupToolValue ===
        'number'
    )
      ? String(
          configuredBackupToolValue
        ).trim()
      : '';

  const requiredEvidenceIds = [
    'EV-01',
    'EV-02',
    'EV-07',
  ] as const;

  const resolvedEvidences =
    requiredEvidenceIds.map(
      evidenceId => ({
        evidenceId,

        evidence:
          context.evidences.find(
            evidence =>
              evidence.id ===
                evidenceId
          ),

        event:
          getResolvedRealCoverageEvent(
            context,
            evidenceId
          ),
      })
    );

  const eventIds =
    resolvedEvidences.flatMap(
      item =>
        item.event
          ? [item.event.id]
          : []
    );

  const runtimeVariables = [
    ...(backupThresholdHours !==
      undefined
      ? ['backupThresholdHours']
      : []),

    ...(retentionThresholdDays !==
      undefined
      ? ['retentionThresholdDays']
      : []),

    ...(monitoredSystems.length
      ? ['monitoredSystems']
      : []),

    ...(configuredBackupTool
      ? ['configuredBackupTool']
      : []),
  ];

  const evidenceSummary =
    resolvedEvidences
      .map(
        item =>
          `${item.evidenceId}=${
            item.evidence?.status
              || 'SIN_DATOS'
          }; evento=${
            item.event?.id
              || 'SIN_DATOS'
          }`
      )
      .join('; ');

  const buildDecision = (
    status:
      ENSPolicyDecision['status'],
    reason: string,
    result: boolean
  ): ENSPolicyDecision[] => [
    {
      policyId:
        'policy.mp.info.6',
      requirementId:
        'mp.info.6.1',
      status,
      parameterIds: [
        'P-01',
        'P-02',
        'P-03',
        'P-04',
        'P-10',
      ],
      evidenceIds: [
        'EV-01',
        'EV-02',
        'EV-07',
      ],
      eventIds,
      runtimeVariables,
      trace: {
        ruleId:
          'mp.info.6.1.coverage_required',
        ruleType:
          'COVERAGE_REQUIRED',
        expression:
          'P-01 + optional P-02 + P-03 + P-04 + P-10 configured && EV-01, EV-02 and EV-07 resolved from real events',
        expected:
          'Configuración completa de realización de copias y evidencias reales EV-01, EV-02 y EV-07 con estados concluyentes.',
        actual:
          `umbral=${
            backupThresholdHours ??
            'SIN_DATOS'
          }; retención=${
            retentionThresholdDays ??
            'SIN_DATOS'
          }; sistemas=${
            monitoredSystems.length
          }; herramienta=${
            configuredBackupTool ||
            'SIN_DATOS'
          }; ${evidenceSummary}`,
        result,
      },
      reason,
    },
  ];

  if (
    backupThresholdHours ===
      undefined
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar mp.info.6.1 porque P-01 no permite construir el umbral de periodicidad; P-02 se mantiene opcional con valor predeterminado cero.',
      false
    );
  }

  if (
    retentionThresholdDays ===
      undefined
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar mp.info.6.1 porque P-03 no contiene una retención mínima válida.',
      false
    );
  }

  if (!monitoredSystems.length) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar mp.info.6.1 porque P-04 no define los sistemas incluidos en el alcance.',
      false
    );
  }

  if (!configuredBackupTool) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar mp.info.6.1 porque P-10 no identifica la herramienta de copias utilizada.',
      false
    );
  }

  if (
    resolvedEvidences.some(
      item => !item.evidence
    )
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'No están disponibles todas las resoluciones requeridas de EV-01, EV-02 y EV-07.',
      false
    );
  }

  if (
    resolvedEvidences.some(
      item => !item.event
    )
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'Alguna evidencia requerida no está vinculada a un evento real, no sintético y correctamente acotado.',
      false
    );
  }

  const evidenceStatuses =
    resolvedEvidences.map(
      item =>
        item.evidence?.status
    );

  if (
    evidenceStatuses.includes(
      'NO_CUMPLE'
    )
  ) {
    return buildDecision(
      'NO_CUMPLE',
      'Al menos una de las evidencias EV-01, EV-02 o EV-07 contiene un incumplimiento explícito.',
      false
    );
  }

  if (
    evidenceStatuses.includes(
      'NO_EVALUABLE'
    ) ||
    evidenceStatuses.includes(
      'NO_APLICA'
    )
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'Al menos una evidencia requerida contiene un estado no concluyente.',
      false
    );
  }

  if (
    evidenceStatuses.includes(
      'PARCIAL'
    )
  ) {
    return buildDecision(
      'PARCIAL',
      'La realización de copias únicamente dispone de cobertura parcial en alguna evidencia requerida.',
      false
    );
  }

  if (
    evidenceStatuses.every(
      status =>
        status === 'CUMPLE'
    )
  ) {
    return buildDecision(
      'CUMPLE',
      'La configuración requerida está completa y EV-01, EV-02 y EV-07 se encuentran respaldadas por eventos reales conformes.',
      true
    );
  }

  return buildDecision(
    'NO_EVALUABLE',
    'La combinación de estados de EV-01, EV-02 y EV-07 no permite una evaluación concluyente.',
    false
  );
};

const buildBackupAgeDecision = (
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  const backupThresholdHours = getVariableNumber(
    variables,
    'backupThresholdHours'
  );
  const lastBackupAgeHours = getVariableNumber(
    variables,
    'lastBackupAgeHours'
  );

  if (
    backupThresholdHours === undefined ||
    lastBackupAgeHours === undefined
  ) {
    return [];
  }

  const result = lastBackupAgeHours <= backupThresholdHours;

  return [
    {
      policyId: 'policy.mp.info.6',
      requirementId: 'mp.info.6.2.a',
      status: result ? 'CUMPLE' : 'NO_CUMPLE',
      parameterIds: ['P-01', 'P-02'],
      evidenceIds: ['EV-01', 'EV-02'],
      eventIds: [],
      runtimeVariables: ['backupThresholdHours', 'lastBackupAgeHours'],
      trace: {
        ruleId: 'mp.info.6.2.a.max_backup_age',
        ruleType: 'MAX_AGE',
        expression: `${lastBackupAgeHours} <= ${backupThresholdHours}`,
        expected: `<= ${backupThresholdHours} horas`,
        actual: `${lastBackupAgeHours} horas`,
        result,
      },
      reason: result
        ? 'La última copia de seguridad está dentro del umbral configurado por P-01 y P-02.'
        : 'La última copia de seguridad supera el umbral configurado por P-01 y P-02.',
    },
  ];
};

const buildRetentionDecision = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  const retentionThresholdDays =
    getVariableNumber(
      variables,
      'retentionThresholdDays'
    );

  const configuredBackupRepository =
    normalizeRepositoryValue(
      getVariableValue(
        variables,
        'configuredBackupRepository'
      )
    );

  const retentionEvent =
    getLatestRetentionEvent(context);

  const observedRetentionDays =
    toPositiveInteger(
      retentionEvent
        ?.attributes
        ?.['retention_days']
    );

  const observedBackupRepository =
    normalizeRepositoryValue(
      retentionEvent
        ?.attributes
        ?.['backup_path']
    );

  const eventStatus = String(
    retentionEvent?.status || ''
  ).toUpperCase();

  const eventIds = retentionEvent
    ? [retentionEvent.id]
    : [];

  const runtimeVariables = [
    ...(retentionThresholdDays !== undefined
      ? ['retentionThresholdDays']
      : []),

    ...(configuredBackupRepository
      ? ['configuredBackupRepository']
      : []),

    ...(observedRetentionDays !== undefined
      ? ['observedRetentionDays']
      : []),

    ...(observedBackupRepository
      ? ['observedBackupRepository']
      : []),
  ];

  const expected =
    `retención >= ${
      retentionThresholdDays ??
      'SIN_CONFIGURAR'
    } días; repositorio=${
      configuredBackupRepository ||
      'SIN_CONFIGURAR'
    }`;

  const actual =
    `retención=${
      observedRetentionDays ??
      'SIN_DATOS'
    }; repositorio=${
      observedBackupRepository ||
      'SIN_DATOS'
    }; estado=${
      eventStatus ||
      'SIN_ESTADO'
    }; evento=${
      retentionEvent?.id ||
      'SIN_DATOS'
    }`;

  const buildDecision = (
    status: ENSPolicyDecision['status'],
    reason: string,
    result: boolean
  ): ENSPolicyDecision[] => [
    {
      policyId: 'policy.mp.info.6',
      requirementId: 'mp.info.6.2.b',
      status,
      parameterIds: ['P-03', 'P-06'],
      evidenceIds: ['EV-03', 'EV-07'],
      eventIds,
      runtimeVariables,
      trace: {
        ruleId:
          'mp.info.6.2.b.min_retention',
        ruleType: 'MIN_RETENTION',
        expression:
          'observedRetentionDays >= retentionThresholdDays && observedBackupRepository === configuredBackupRepository',
        expected,
        actual,
        result,
      },
      reason,
    },
  ];

  if (
    retentionThresholdDays === undefined ||
    !configuredBackupRepository
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar la retención porque P-03 o P-06 no contiene una configuración válida.',
      false
    );
  }

  if (!retentionEvent) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se ha recibido ningún evento retention_configured compatible con EV-03.',
      false
    );
  }

  if (retentionEvent.isSynthetic) {
    return buildDecision(
      'NO_EVALUABLE',
      'El último evento retention_configured es sintético o de demostración y no puede utilizarse como evidencia real.',
      false
    );
  }

  if (eventStatus === 'NO_CUMPLE') {
    return buildDecision(
      'NO_CUMPLE',
      'El evento real de configuración de retención declara un estado NO_CUMPLE.',
      false
    );
  }

  if (eventStatus === 'PARCIAL') {
    return buildDecision(
      'PARCIAL',
      'El evento real de configuración de retención declara un cumplimiento parcial.',
      false
    );
  }

  if (
    eventStatus === 'NO_EVALUABLE' ||
    eventStatus === 'NO_APLICA'
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El estado del evento de configuración de retención no permite realizar una comparación concluyente.',
      false
    );
  }

  if (
    observedRetentionDays === undefined ||
    !observedBackupRepository
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El evento retention_configured no contiene retention_days como entero positivo o no identifica backup_path.',
      false
    );
  }

  if (
    observedBackupRepository !==
    configuredBackupRepository
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El repositorio observado no coincide con P-06, por lo que la retención recibida no puede atribuirse de forma segura al repositorio configurado.',
      false
    );
  }

  const complies =
    observedRetentionDays >=
    retentionThresholdDays;

  return buildDecision(
    complies
      ? 'CUMPLE'
      : 'NO_CUMPLE',

    complies
      ? 'La retención observada cumple o supera el mínimo configurado en P-03 para el repositorio de P-06.'
      : 'La retención observada es inferior al mínimo configurado en P-03.',

    complies
  );
};

const buildOtherLocationsDecision = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  const retentionThresholdDays =
    getVariableNumber(
      variables,
      'retentionThresholdDays'
    );

  const backupLogEvidence =
    context.evidences.find(
      evidence =>
        evidence.id === 'EV-07'
    );

  const resolvedEvent =
    backupLogEvidence?.resolvedEventId
      ? context.events.find(
          event =>
            event.id ===
            backupLogEvidence.resolvedEventId
        )
      : undefined;

  const eventIds =
    backupLogEvidence?.resolvedEventId
      ? [backupLogEvidence.resolvedEventId]
      : [];

  const runtimeVariables =
    retentionThresholdDays !== undefined
      ? ['retentionThresholdDays']
      : [];

  const actualStatus =
    backupLogEvidence?.status
      || 'SIN_DATOS';

  const buildDecision = (
    status: ENSPolicyDecision['status'],
    reason: string,
    result: boolean
  ): ENSPolicyDecision[] => [
    {
      policyId: 'policy.mp.info.6',
      requirementId: 'mp.info.6.2.c',
      status,
      parameterIds: ['P-03'],
      evidenceIds: ['EV-07'],
      eventIds,
      runtimeVariables,
      trace: {
        ruleId:
          'mp.info.6.2.c.coverage_required',
        ruleType: 'COVERAGE_REQUIRED',
        expression:
          'retentionThresholdDays is configured && EV-07 has an evaluable status',
        expected:
          'P-03 configurado y EV-07 conforme, sin confundir el requisito base con la copia separada de R2.',
        actual:
          `retención=${
            retentionThresholdDays
              ?? 'SIN_CONFIGURAR'
          }; EV-07=${
            actualStatus
          }; evento=${
            backupLogEvidence
              ?.resolvedEventId
              || 'SIN_DATOS'
          }`,
        result,
      },
      reason,
    },
  ];

  if (
    retentionThresholdDays === undefined
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar mp.info.6.2.c porque P-03 no contiene una retención válida.',
      false
    );
  }

  if (!backupLogEvidence) {
    return buildDecision(
      'NO_EVALUABLE',
      'No existe una resolución de EV-07 para acreditar los requisitos operativos de almacenamiento en otros lugares.',
      false
    );
  }

  if (resolvedEvent?.isSynthetic) {
    return buildDecision(
      'NO_EVALUABLE',
      'EV-07 se ha resuelto mediante un evento sintético y no puede utilizarse como evidencia real.',
      false
    );
  }

  if (
    backupLogEvidence.status === 'CUMPLE'
  ) {
    return buildDecision(
      'CUMPLE',
      'P-03 está configurado y EV-07 no presenta errores que impidan acreditar el requisito base de almacenamiento en otros lugares.',
      true
    );
  }

  if (
    backupLogEvidence.status === 'NO_CUMPLE'
  ) {
    return buildDecision(
      'NO_CUMPLE',
      'EV-07 contiene errores o fallos operativos incompatibles con el cumplimiento de mp.info.6.2.c.',
      false
    );
  }

  if (
    backupLogEvidence.status === 'PARCIAL'
  ) {
    return buildDecision(
      'PARCIAL',
      'EV-07 únicamente aporta cobertura parcial para mp.info.6.2.c.',
      false
    );
  }

  return buildDecision(
    'NO_EVALUABLE',
    'El estado de EV-07 no permite una evaluación concluyente de mp.info.6.2.c.',
    false
  );
};

const normalizeAccessSubject = (
  value: unknown
): string | undefined => {
  if (
    typeof value !== 'string' &&
    typeof value !== 'number'
  ) {
    return undefined;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  return normalized || undefined;
};

const getAccessSubjectBasename = (
  value: unknown
): string | undefined => {
  const normalized =
    normalizeAccessSubject(value);

  if (!normalized) {
    return undefined;
  }

  const parts = normalized
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);

  return parts[parts.length - 1];
};

const getLatestAccessEvent = (
  context: ENSPolicyContext
) =>
  [...context.events]
    .filter(
      event =>
        !event.isSynthetic &&
        (
          !event.controlId ||
          event.controlId ===
            'mp.info.6'
        ) &&
        (
          !event.evidenceId ||
          event.evidenceId ===
            'EV-04'
        ) &&
        [
          'authorized_access',
          'unauthorized_access',
        ].includes(
          event.eventType
        ) &&
        [
          'WAZUH_ALERT',
          'FIM',
          'LOCAL_JSON',
        ].includes(
          event.sourceType
        )
    )
    .sort(
      (left, right) =>
        Date.parse(
          right.timestamp
        ) -
        Date.parse(
          left.timestamp
        )
    )[0];

const buildAccessControlDecision = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  const configuredBackupRepository =
    normalizeRepositoryValue(
      getVariableValue(
        variables,
        'configuredBackupRepository'
      )
    );

  const configuredSubjects =
    normalizeStringList(
      getVariableValue(
        variables,
        'authorizedUsersAndProcesses'
      )
    );

  const authorizedSubjects =
    new Set(
      configuredSubjects.flatMap(
        subject => {
          const normalized =
            normalizeAccessSubject(
              subject
            );

          if (!normalized) {
            return [];
          }

          const shortName =
            getAccessSubjectBasename(
              normalized
            );

          return shortName &&
            shortName !== normalized
            ? [
                normalized,
                shortName,
              ]
            : [normalized];
        }
      )
    );

  const accessEvidence =
    context.evidences.find(
      evidence =>
        evidence.id === 'EV-04'
    );

  const integrityEvidence =
    context.evidences.find(
      evidence =>
        evidence.id === 'EV-03'
    );

  const accessEvent =
    getLatestAccessEvent(
      context
    );

  const observedBackupRepository =
    normalizeRepositoryValue(
      accessEvent
        ?.attributes
        ?.['backup_path']
    );

  const actorUser =
    normalizeAccessSubject(
      accessEvent
        ?.attributes
        ?.['actor_user']
    );

  const actorProcess =
    normalizeAccessSubject(
      accessEvent
        ?.attributes
        ?.['actor_process']
    );

  const actorProcessBasename =
    getAccessSubjectBasename(
      actorProcess
    );

  const userAllowed =
    !actorUser ||
    authorizedSubjects.has(
      actorUser
    );

  const processAllowed =
    !actorProcess ||
    authorizedSubjects.has(
      actorProcess
    ) ||
    (
      actorProcessBasename
        ? authorizedSubjects.has(
            actorProcessBasename
          )
        : false
    );

  const eventIds =
    accessEvent
      ? [accessEvent.id]
      : [];

  const runtimeVariables = [
    ...(configuredBackupRepository
      ? ['configuredBackupRepository']
      : []),
    ...(authorizedSubjects.size
      ? ['authorizedUsersAndProcesses']
      : []),
  ];

  const buildDecision = (
    status: ENSPolicyDecision['status'],
    reason: string,
    result: boolean
  ): ENSPolicyDecision[] => [
    {
      policyId:
        'policy.mp.info.6',
      requirementId:
        'mp.info.6.2.d',
      status,
      parameterIds:
        ['P-06', 'P-07'],
      evidenceIds:
        ['EV-03', 'EV-04'],
      eventIds,
      runtimeVariables,
      trace: {
        ruleId:
          'mp.info.6.2.d.whitelist',
        ruleType:
          'WHITELIST',
        expression:
          'real EV-04 access event && observed repository === P-06 && every observed actor is included in P-07',
        expected:
          'Evento real EV-04 sobre el repositorio P-06 y usuario o proceso autorizado mediante P-07.',
        actual:
          `evento=${
            accessEvent?.eventType
              || 'SIN_DATOS'
          }; repositorio=${
            observedBackupRepository
              || 'SIN_DATOS'
          }; usuario=${
            actorUser
              || 'SIN_DATOS'
          }; proceso=${
            actorProcess
              || 'SIN_DATOS'
          }; EV-04=${
            accessEvidence?.status
              || 'SIN_DATOS'
          }; EV-03=${
            integrityEvidence?.status
              || 'SIN_DATOS'
          }`,
        result,
      },
      reason,
    },
  ];

  if (
    !configuredBackupRepository
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar mp.info.6.2.d porque P-06 no contiene un repositorio local válido.',
      false
    );
  }

  if (
    !authorizedSubjects.size
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'No se puede evaluar mp.info.6.2.d porque P-07 no contiene usuarios o procesos autorizados.',
      false
    );
  }

  if (!accessEvidence) {
    return buildDecision(
      'NO_EVALUABLE',
      'No existe una resolución de EV-04 para el control de acceso al repositorio.',
      false
    );
  }

  if (!accessEvent) {
    return buildDecision(
      'NO_EVALUABLE',
      'No existe un evento real authorized_access o unauthorized_access compatible con EV-04.',
      false
    );
  }

  if (
    !observedBackupRepository
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El evento EV-04 no identifica el repositorio mediante backup_path.',
      false
    );
  }

  if (
    observedBackupRepository !==
    configuredBackupRepository
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El evento EV-04 pertenece a un repositorio distinto del configurado en P-06.',
      false
    );
  }

  if (
    accessEvent.eventType ===
      'unauthorized_access'
  ) {
    return buildDecision(
      'NO_CUMPLE',
      'Se ha observado un evento real de acceso no autorizado al repositorio de copias.',
      false
    );
  }

  if (
    accessEvidence.status ===
      'NO_CUMPLE'
  ) {
    return buildDecision(
      'NO_CUMPLE',
      'EV-04 contiene un estado explícito NO_CUMPLE para el control de acceso.',
      false
    );
  }

  if (
    accessEvidence.status ===
      'PARCIAL'
  ) {
    return buildDecision(
      'PARCIAL',
      'EV-04 únicamente aporta una evaluación parcial del control de acceso.',
      false
    );
  }

  if (
    accessEvidence.status ===
      'NO_EVALUABLE' ||
    accessEvidence.status ===
      'NO_APLICA'
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El estado resuelto de EV-04 no permite concluir el control de acceso.',
      false
    );
  }

  if (
    accessEvent.status ===
      'NO_CUMPLE'
  ) {
    return buildDecision(
      'NO_CUMPLE',
      'El evento real de acceso contiene un estado explícito NO_CUMPLE.',
      false
    );
  }

  if (
    accessEvent.status ===
      'PARCIAL'
  ) {
    return buildDecision(
      'PARCIAL',
      'El evento real de acceso únicamente aporta una evaluación parcial.',
      false
    );
  }

  if (
    accessEvent.status ===
      'NO_EVALUABLE' ||
    accessEvent.status ===
      'NO_APLICA'
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El estado del evento real de acceso no permite una evaluación concluyente.',
      false
    );
  }

  if (
    !actorUser &&
    !actorProcess
  ) {
    return buildDecision(
      'NO_EVALUABLE',
      'El evento EV-04 no identifica actor_user ni actor_process.',
      false
    );
  }

  if (
    !userAllowed ||
    !processAllowed
  ) {
    return buildDecision(
      'NO_CUMPLE',
      'El evento se declara autorizado, pero alguno de sus actores no pertenece a la lista blanca P-07.',
      false
    );
  }

  return buildDecision(
    'CUMPLE',
    'El evento real EV-04 corresponde al repositorio P-06 y todos los actores observados pertenecen a P-07.',
    true
  );
};

const buildRestoreAgeDecision = (
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  const restoreThresholdDays = getVariableNumber(
    variables,
    'restoreThresholdDays'
  );

  const lastRestoreAgeDays = getVariableNumber(
    variables,
    'lastRestoreAgeDays'
  );

  if (
    restoreThresholdDays === undefined ||
    lastRestoreAgeDays === undefined
  ) {
    return [];
  }

  const supportingRuntimeVariables = [
    'monitoredSystems',
    'monitoredSystemsByCriticality',
    'configuredBackupTool',
  ].filter(
    name =>
      variables.some(
        variable =>
          variable.name === name
      )
  );

  const result =
    lastRestoreAgeDays <=
    restoreThresholdDays;

  return [
    {
      policyId:
        'policy.mp.info.6',

      requirementId:
        'mp.info.6.r1.1',

      status:
        result
          ? 'CUMPLE'
          : 'NO_CUMPLE',

      parameterIds: [
        'P-04',
        'P-05',
        'P-10',
      ],

      evidenceIds:
        ['EV-05'],

      eventIds: [],

      runtimeVariables: [
        ...supportingRuntimeVariables,
        'restoreThresholdDays',
        'lastRestoreAgeDays',
      ],

      trace: {
        ruleId:
          'mp.info.6.r1.1.max_restore_age',

        ruleType:
          'MAX_AGE',

        expression:
          `${lastRestoreAgeDays} <= ${restoreThresholdDays}`,

        expected:
          `Prueba de restauración en un máximo de ${restoreThresholdDays} días según P-05; P-04 y P-10 aportan alcance, criticidad, productor y trazabilidad.`,

        actual:
          `${lastRestoreAgeDays} días; soporte disponible: ${
            supportingRuntimeVariables.length
              ? supportingRuntimeVariables.join(', ')
              : 'SIN_DATOS'
          }`,

        result,
      },

      reason:
        result
          ? 'La última prueba de restauración está dentro del periodo máximo configurado por P-05; P-04 y P-10 se conservan como soporte de alcance y trazabilidad.'
          : 'La última prueba de restauración supera el periodo máximo configurado por P-05; P-04 y P-10 no alteran el resultado del umbral.',
    },
  ];
};

const buildOffsiteDecision = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  if (context.level !== 'ALTO') {
    return [];
  }

  const offsiteEnabled = getVariableBoolean(
    variables,
    'offsiteRepositoryActive'
  );
  const offsiteRepository = getVariableValue(variables, 'offsiteRepository');
  const offsiteEvidence = context.evidences.find(
    evidence => evidence.id === 'EV-06'
  );

  if (offsiteEnabled === undefined) {
    return [];
  }

  const repositoryConfigured =
    offsiteRepository !== undefined &&
    String(offsiteRepository).trim().length > 0;

  const evidenceCompliant = offsiteEvidence?.status === 'CUMPLE';
  const result = offsiteEnabled && repositoryConfigured && evidenceCompliant;

  return [
    {
      policyId: 'policy.mp.info.6',
      requirementId: 'mp.info.6.r2.1',
      status: result ? 'CUMPLE' : 'NO_CUMPLE',
      parameterIds: ['P-08', 'P-09'],
      evidenceIds: ['EV-06'],
      eventIds: [],
      runtimeVariables: ['offsiteRepositoryActive', 'offsiteRepository'],
      trace: {
        ruleId: 'mp.info.6.r2.1.offsite_required',
        ruleType: 'CONDITIONAL_REQUIRED',
        expression: `${offsiteEnabled} && ${repositoryConfigured} && ${evidenceCompliant}`,
        expected:
          'Repositorio offsite activo, ubicación configurada y EV-06 en CUMPLE',
        actual: `activo=${offsiteEnabled}; repositorio=${repositoryConfigured}; EV-06=${offsiteEvidence?.status || 'SIN_DATOS'}`,
        result,
      },
      reason: result
        ? 'La copia en ubicación alternativa está activa, configurada y evidenciada por EV-06.'
        : 'La copia en ubicación alternativa no cumple: falta activación, ubicación configurada o evidencia EV-06 conforme.',
    },
  ];
};

const buildPolicyDecisions = (
  context: ENSPolicyContext,
  variables: ENSRuntimeVariable[]
): ENSPolicyDecision[] => {
  if (context.control.id !== 'mp.info.6') {
    return [];
  }

  return [
    ...buildBackupCoverageDecision(
      context,
      variables
    ),
    ...buildBackupAgeDecision(variables),
    ...buildRetentionDecision(
      context,
      variables
    ),
    ...buildOtherLocationsDecision(
      context,
      variables
    ),
    ...buildAccessControlDecision(
      context,
      variables
    ),
    ...buildRestoreAgeDecision(variables),
    ...buildOffsiteDecision(context, variables),
  ];
};

export const runPolicyRuntime = (
  context: ENSPolicyContext
): ENSPolicyRuntimeResult => {
  const runtimeVariables = buildRuntimeVariables(context);

  return {
    controlId: context.control.id,
    policyId: context.control.id,
    evaluatedAt: new Date().toISOString(),
    decisions: buildPolicyDecisions(context, runtimeVariables),
    appliedParameters:
      context.configuration?.parameters.map(parameter => ({
        id: parameter.id,
        name: parameter.name,
        value: parameter.value,
        required: parameter.required,
      })) || [],
    runtimeVariables,
  };
};
