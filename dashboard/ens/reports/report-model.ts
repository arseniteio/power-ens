import type {
  ENSComplianceResult,
} from '../core';

export type MPInfo6ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MPInfo6ReportField {
  id: string;
  title: string;
  status: MPInfo6ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MPInfo6ReportModel {
  controlId: string;
  status: MPInfo6ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MPInfo6ReportField[];
}

type RuntimeVariableRecord = {
  name?: unknown;
  id?: unknown;
  key?: unknown;
  value?: unknown;
  actual?: unknown;
  resolvedValue?: unknown;
};

const STATUS_VALUES =
  new Set<MPInfo6ReportFieldStatus>([
    'CUMPLE',
    'PARCIAL',
    'NO_CUMPLE',
    'NO_EVALUABLE',
    'NO_APLICA',
    'SIN_DATOS',
  ]);

const TRACE_FAILURE_STATUSES =
  new Set<MPInfo6ReportFieldStatus>([
    'NO_CUMPLE',
    'PARCIAL',
  ]);

const asStatus = (
  value: unknown,
): MPInfo6ReportFieldStatus => {
  const normalized =
    String(value || '');

  return STATUS_VALUES.has(
    normalized as MPInfo6ReportFieldStatus
  )
    ? normalized as MPInfo6ReportFieldStatus
    : 'SIN_DATOS';
};

const formatValue = (
  value: unknown,
): string => {
  if (
    value === undefined
    ||
    value === null
    ||
    value === ''
  ) {
    return 'SIN_DATOS';
  }

  if (Array.isArray(value)) {
    return value.length
      ? value.join(', ')
      : 'SIN_DATOS';
  }

  if (typeof value === 'boolean') {
    return value
      ? 'Sí'
      : 'No';
  }

  return String(value);
};

const formatTimestamp = (
  value: unknown,
): string => {
  if (
    typeof value !== 'string'
    ||
    !value
  ) {
    return 'SIN_DATOS';
  }

  return value;
};

const field = (
  id: string,
  title: string,
  status: MPInfo6ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MPInfo6ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details:
    details.filter(Boolean),
  producerGaps,
});

const isMeaningfulProducerValue = (
  value: unknown,
): boolean => {
  if (
    value === undefined
    ||
    value === null
  ) {
    return false;
  }

  if (
    typeof value === 'string'
  ) {
    return value.trim().length > 0;
  }

  return true;
};

const getLatestSuccessfulAttribute = (
  evidence:
    | {
        latestSuccessfulAttributes?: Record<
          string,
          unknown
        >;
      }
    | undefined,
  key: string,
): unknown => {
  const value =
    evidence
      ?.latestSuccessfulAttributes
      ?.[key];

  return isMeaningfulProducerValue(
    value
  )
    ? value
    : undefined;
};

const getMissingLatestSuccessfulProducerKeys = (
  evidence:
    | {
        latestSuccessfulAttributes?: Record<
          string,
          unknown
        >;
      }
    | undefined,
  keys: string[],
): string[] =>
  keys.filter(
    key =>
      !isMeaningfulProducerValue(
        evidence
          ?.latestSuccessfulAttributes
          ?.[key]
      )
  );

const externalProducerStatus = (
  baseStatus: MPInfo6ReportFieldStatus,
  hasCoreData: boolean,
  producerGaps: string[],
): MPInfo6ReportFieldStatus => {
  if (
    baseStatus === 'NO_CUMPLE'
    ||
    baseStatus === 'NO_EVALUABLE'
    ||
    baseStatus === 'NO_APLICA'
  ) {
    return baseStatus;
  }

  if (
    !hasCoreData
    ||
    baseStatus === 'SIN_DATOS'
  ) {
    return 'SIN_DATOS';
  }

  if (
    baseStatus === 'PARCIAL'
    ||
    producerGaps.length > 0
  ) {
    return 'PARCIAL';
  }

  return 'CUMPLE';
};

const strongestStatus = (
  statuses: MPInfo6ReportFieldStatus[],
  fallback: MPInfo6ReportFieldStatus,
): MPInfo6ReportFieldStatus => {
  if (
    statuses.includes(
      'NO_CUMPLE'
    )
  ) {
    return 'NO_CUMPLE';
  }

  if (
    statuses.includes(
      'PARCIAL'
    )
  ) {
    return 'PARCIAL';
  }

  if (
    statuses.includes(
      'NO_EVALUABLE'
    )
  ) {
    return 'NO_EVALUABLE';
  }

  if (
    statuses.includes(
      'CUMPLE'
    )
  ) {
    return 'CUMPLE';
  }

  if (
    statuses.includes(
      'NO_APLICA'
    )
  ) {
    return 'NO_APLICA';
  }

  return fallback;
};

const getRuntimeVariable = (
  result: ENSComplianceResult | undefined,
  names: string[],
): unknown => {
  const variables = (
    result?.policyRuntime
      ?.runtimeVariables
    || []
  ) as unknown as RuntimeVariableRecord[];

  for (const variable of variables) {
    const record =
      variable || {};

    const variableName =
      record.name
      ??
      record.id
      ??
      record.key;

    if (
      names.includes(
        String(
          variableName || ''
        )
      )
    ) {
      return (
        record.value
        ??
        record.actual
        ??
        record.resolvedValue
      );
    }
  }

  return undefined;
};

export const buildMpInfo6ReportModel = (
  result: ENSComplianceResult | undefined,
): MPInfo6ReportModel => {
  const parameters =
    new Map(
      (
        result?.parameters
        || []
      ).map(
        parameter => [
          parameter.id,
          parameter,
        ]
      )
    );

  const evidences =
    new Map(
      (
        result?.evidences
        || []
      ).map(
        evidence => [
          evidence.id,
          evidence,
        ]
      )
    );

  const decisions =
    result?.policyRuntime
      ?.decisions
    || [];

  const traceability =
    result?.traceability
    || [];

  const parameterValue = (
    parameterId: string,
  ): unknown =>
    parameters.get(
      parameterId
    )?.value;

  const evidenceStatus = (
    evidenceId: string,
  ): MPInfo6ReportFieldStatus =>
    asStatus(
      evidences.get(
        evidenceId
      )?.status
    );

  const decisionByRule = (
    ruleId: string,
  ) =>
    decisions.find(
      decision =>
        decision.trace
          ?.ruleId ===
        ruleId
    );

  const traceByEvidence = (
    evidenceId: string,
    failureOnly = false,
  ) =>
    traceability
      .filter(
        entry =>
          entry.source === 'WAZUH'
          &&
          Boolean(
            entry.eventId
          )
          &&
          entry.evidenceId ===
            evidenceId
          &&
          (
            !failureOnly
            ||
            TRACE_FAILURE_STATUSES.has(
              asStatus(
                entry.status
              )
            )
          )
      )
      .sort(
        (left, right) =>
          new Date(
            right.timestamp
            || 0
          ).getTime()
          -
          new Date(
            left.timestamp
            || 0
          ).getTime()
      );

  const ev01 =
    evidences.get(
      'EV-01'
    );

  const rep02BytesWritten =
    getLatestSuccessfulAttribute(
      ev01,
      'bytes_written',
    );

  const rep02EndTime =
    getLatestSuccessfulAttribute(
      ev01,
      'end_time',
    );

  const rep02ProducerGaps =
    getMissingLatestSuccessfulProducerKeys(
      ev01,
      [
        'bytes_written',
        'end_time',
      ],
    );

  const rep02HasData =
    Boolean(
      ev01?.lastSeen
      ||
      rep02BytesWritten
        !== undefined
      ||
      rep02EndTime
        !== undefined
      ||
      parameterValue(
        'P-10'
      ) !== undefined
    );

  const rep02 = field(
    'REP-02',
    'Última copia exitosa',
    externalProducerStatus(
      evidenceStatus(
        'EV-01'
      ),
      rep02HasData,
      rep02ProducerGaps,
    ),
    [
      'Último evento:',
      formatTimestamp(
        ev01?.lastSeen
      ),
      '· Herramienta:',
      formatValue(
        parameterValue(
          'P-10'
        )
      ),
      '· Volumen:',
      formatValue(
        rep02BytesWritten
      ),
      '· Fin real:',
      formatTimestamp(
        rep02EndTime
      ),
    ].join(' '),
    ['EV-01'],
    [
      ev01?.agentName
        ? `Agente: ${ev01.agentName}`
        : '',
      ev01?.resolvedRuleId
        ? `Regla: ${ev01.resolvedRuleId}`
        : '',
      ev01?.resolvedSource
        ? `Fuente: ${ev01.resolvedSource}`
        : '',
    ],
    rep02ProducerGaps,
  );

  const periodicityDecision =
    decisionByRule(
      'mp.info.6.2.a.max_backup_age'
    );

  const backupThreshold =
    periodicityDecision
      ?.trace.expected
    ??
    getRuntimeVariable(
      result,
      [
        'backupThresholdHours',
      ]
    );

  const lastBackupAge =
    periodicityDecision
      ?.trace.actual
    ??
    getRuntimeVariable(
      result,
      [
        'lastBackupAgeHours',
      ]
    );

  const rep03 = field(
    'REP-03',
    'Periodicidad frente a P-01',
    asStatus(
      periodicityDecision
        ?.status
      ??
      evidences.get(
        'EV-02'
      )?.status
    ),
    [
      'Intervalo real:',
      formatValue(
        lastBackupAge
      ),
      '· Umbral:',
      formatValue(
        backupThreshold
      ),
    ].join(' '),
    ['EV-02'],
    [
      `P-01: ${
        formatValue(
          parameterValue(
            'P-01'
          )
        )
      }`,
      `P-02: ${
        formatValue(
          parameterValue(
            'P-02'
          )
        )
      }`,
      periodicityDecision
        ?.reason
      || '',
    ],
  );

  const backupFailures =
    traceByEvidence(
      'EV-07',
      true,
    );

  const rep04Status =
    backupFailures.length
      ? strongestStatus(
          backupFailures.map(
            entry =>
              asStatus(
                entry.status
              )
          ),
          'NO_CUMPLE',
        )
      : evidenceStatus(
          'EV-07'
        );

  const rep04 = field(
    'REP-04',
    'Fallos del período',
    rep04Status,
    [
      'Fallos históricos:',
      String(
        backupFailures.length
      ),
      '· Último:',
      backupFailures[0]
        ? `${
            formatTimestamp(
              backupFailures[0]
                .timestamp
            )
          } (${
            backupFailures[0]
              .eventType
          })`
        : 'SIN_DATOS',
    ].join(' '),
    ['EV-07'],
    backupFailures
      .slice(0, 5)
      .map(
        entry =>
          `${
            formatTimestamp(
              entry.timestamp
            )
          } · ${
            entry.eventType
            || 'evento'
          } · ${
            asStatus(
              entry.status
            )
          }`
      ),
  );

  const integrityFailures =
    traceByEvidence(
      'EV-03',
      true,
    );

  const retentionDecision =
    decisionByRule(
      'mp.info.6.2.b.min_retention'
    );

  const rep05Status =
    integrityFailures.length
      ? strongestStatus(
          integrityFailures.map(
            entry =>
              asStatus(
                entry.status
              )
          ),
          'NO_CUMPLE',
        )
      : evidenceStatus(
          'EV-03'
        );

  const rep05 = field(
    'REP-05',
    'Integridad del repositorio',
    rep05Status,
    [
      'Cambios inesperados:',
      String(
        integrityFailures.length
      ),
      '· Repositorio:',
      formatValue(
        parameterValue(
          'P-06'
        )
      ),
    ].join(' '),
    ['EV-03'],
    [
      `Retención configurada: ${
        formatValue(
          parameterValue(
            'P-03'
          )
        )
      }`,
      retentionDecision
        ?.reason
      || '',
      ...integrityFailures
        .slice(0, 5)
        .map(
          entry =>
            `${
              formatTimestamp(
                entry.timestamp
              )
            } · ${
              entry.eventType
              || 'evento'
            }`
        ),
    ],
  );

  const accessDecision =
    decisionByRule(
      'mp.info.6.2.d.whitelist'
    );

  const accessEvents =
    traceByEvidence(
      'EV-04',
    );

  const actorUser =
    getRuntimeVariable(
      result,
      [
        'actorUser',
        'actor_user',
      ]
    );

  const actorProcess =
    getRuntimeVariable(
      result,
      [
        'actorProcess',
        'actor_process',
      ]
    );

  const rep06 = field(
    'REP-06',
    'Accesos a las copias',
    asStatus(
      accessDecision
        ?.status
      ??
      evidences.get(
        'EV-04'
      )?.status
    ),
    [
      'Eventos de acceso:',
      String(
        accessEvents.length
      ),
      '· Usuario:',
      formatValue(
        actorUser
      ),
      '· Proceso:',
      formatValue(
        actorProcess
      ),
    ].join(' '),
    ['EV-04'],
    [
      `Autorizados P-07: ${
        formatValue(
          parameterValue(
            'P-07'
          )
        )
      }`,
      accessDecision
        ?.reason
      || '',
    ],
  );

  const restoreDecision =
    decisionByRule(
      'mp.info.6.r1.1.max_restore_age'
    );

  const restoreEvents =
    traceByEvidence(
      'EV-05',
    );

  const ev05 =
    evidences.get(
      'EV-05'
    );

  const restorePath =
    getLatestSuccessfulAttribute(
      ev05,
      'restored_path',
    );

  const restoreMd5 =
    getLatestSuccessfulAttribute(
      ev05,
      'md5',
    );

  const lastSuccessfulRestoreEvent =
    ev05?.latestSuccessfulEventId
      ? restoreEvents.find(
          event =>
            event.eventId ===
            ev05.latestSuccessfulEventId
        )
      : undefined;

  const lastRestoreAge =
    restoreDecision
      ?.trace.actual
    ??
    getRuntimeVariable(
      result,
      [
        'lastRestoreAgeDays',
      ]
    );

  const restoreThreshold =
    restoreDecision
      ?.trace.expected
    ??
    getRuntimeVariable(
      result,
      [
        'restoreThresholdDays',
      ]
    );

  const rep07 = field(
    'REP-07',
    'Pruebas de recuperación',
    asStatus(
      restoreDecision
        ?.status
      ??
      evidences.get(
        'EV-05'
      )?.status
    ),
    [
      'Antigüedad:',
      formatValue(
        lastRestoreAge
      ),
      '· Máximo:',
      formatValue(
        restoreThreshold
      ),
      '· Última prueba:',
      restoreEvents[0]
        ? `${
            formatTimestamp(
              restoreEvents[0]
                .timestamp
            )
          } (${
            restoreEvents[0]
              .eventType
          })`
        : formatTimestamp(
            ev05?.lastSeen
          ),
      '· Última restauración válida:',
      formatTimestamp(
        lastSuccessfulRestoreEvent
          ?.timestamp
      ),
      '· Ruta última restauración válida:',
      formatValue(
        restorePath
      ),
      '· MD5 última restauración válida:',
      formatValue(
        restoreMd5
      ),
    ].join(' '),
    ['EV-05'],
    [
      `P-05: ${
        formatValue(
          parameterValue(
            'P-05'
          )
        )
      }`,
      restoreDecision
        ?.reason
      || '',
    ],
  );

  const offsiteDecision =
    decisionByRule(
      'mp.info.6.r2.1.offsite_required'
    );

  const ev06 =
    evidences.get(
      'EV-06'
    );

  const offsiteActive =
    getRuntimeVariable(
      result,
      [
        'offsiteRepositoryActive',
      ]
    )
    ??
    parameterValue(
      'P-08'
    );

  const offsiteRepository =
    getRuntimeVariable(
      result,
      [
        'offsiteRepository',
      ]
    )
    ??
    parameterValue(
      'P-09'
    );

  const lastSync =
    getLatestSuccessfulAttribute(
      ev06,
      'last_sync',
    );

  const replicationTime =
    getLatestSuccessfulAttribute(
      ev06,
      'replication_time',
    );

  const replicationLag =
    getLatestSuccessfulAttribute(
      ev06,
      'replication_lag',
    );

  const rep08ProducerGaps =
    getMissingLatestSuccessfulProducerKeys(
      ev06,
      [
        'last_sync',
        'replication_time',
        'replication_lag',
      ],
    );

  const rep08HasData =
    (
      offsiteActive
      !== undefined
    )
    ||
    (
      offsiteRepository
      !== undefined
    )
    ||
    (
      lastSync
      !== undefined
    )
    ||
    (
      replicationTime
      !== undefined
    )
    ||
    (
      replicationLag
      !== undefined
    );

  const rep08 = field(
    'REP-08',
    'Verificación offsite',
    externalProducerStatus(
      asStatus(
        offsiteDecision
          ?.status
        ??
        ev06?.status
      ),
      rep08HasData,
      rep08ProducerGaps,
    ),
    [
      'Ubicación alternativa:',
      formatValue(
        offsiteActive
      ),
      '· Repositorio:',
      formatValue(
        offsiteRepository
      ),
      '· Última sincronización:',
      formatTimestamp(
        lastSync
      ),
      '· Tiempo de replicación:',
      formatValue(
        replicationTime
      ),
      '· Desfase:',
      formatValue(
        replicationLag
      ),
    ].join(' '),
    ['EV-06'],
    [
      offsiteDecision
        ?.reason
      || '',
      ev06?.resolvedSource
        ? `Fuente: ${ev06.resolvedSource}`
        : '',
    ],
    rep08ProducerGaps,
  );

  return {
    controlId:
      result?.control.id
      || 'mp.info.6',

    status:
      asStatus(
        result?.status
      ),

    score:
      typeof result?.score ===
        'number'
        ? result.score
        : null,

    coverage:
      typeof result?.coverage ===
        'number'
        ? result.coverage
        : null,

    level:
      result?.level
      || 'SIN_DATOS',

    evaluatedAt:
      result?.evaluatedAt,

    fields: [
      rep02,
      rep03,
      rep04,
      rep05,
      rep06,
      rep07,
      rep08,
    ],
  };
};
