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

const STATUS_VALUES =
  new Set<MPInfo6ReportFieldStatus>([
    'CUMPLE',
    'PARCIAL',
    'NO_CUMPLE',
    'NO_EVALUABLE',
    'NO_APLICA',
    'SIN_DATOS',
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

// Una lista de la policy (una entrada por copia) se lee mejor separada por
// punto y coma: cada entrada ya lleva comas dentro.
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
      ? value.join('; ')
      : 'SIN_DATOS';
  }

  if (typeof value === 'boolean') {
    return value
      ? 'Sí'
      : 'No';
  }

  return String(value);
};

// Una antigüedad medida, con un decimal, como la escribe la policy; un plazo
// de la configuración, tal cual.
const formatAge = (
  value: unknown,
): string =>
  typeof value === 'number'
    ? `${value.toFixed(1)} h`
    : formatValue(value);

const formatHours = (
  value: unknown,
): string =>
  typeof value === 'number'
    ? `${value} h`
    : formatValue(value);

const field = (
  id: string,
  title: string,
  status: MPInfo6ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
): MPInfo6ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details:
    details.filter(Boolean),
  producerGaps: [],
});

/**
 * Modelo de informe de mp.info.6 (Copias de seguridad).
 *
 * El recolector emite hechos y la policy del control los juzga copia a copia
 * (`core/policy-runtime/policies/mp-info-6.policy.ts`). Lo que se enseña aquí
 * es lo que la policy midió: los valores de cada copia que deja en sus
 * variables de ejecución y el motivo de cada evidencia (`medida_EV0x`). El
 * estado de cada campo es el de su evidencia en la tabla, así que el informe y
 * la pantalla dicen lo mismo.
 */
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

  const variables =
    result?.policyRuntime
      ?.runtimeVariables
    || [];

  const parameterValue = (
    parameterId: string,
  ): unknown =>
    parameters.get(
      parameterId
    )?.value;

  const parameterLine = (
    parameterId: string,
  ): string =>
    `${parameterId}: ${formatValue(parameterValue(parameterId))}`;

  const evidenceStatus = (
    evidenceId: string,
  ): MPInfo6ReportFieldStatus =>
    asStatus(
      evidences.get(
        evidenceId
      )?.status
    );

  const measured = (
    name: string,
  ): unknown =>
    variables.find(
      variable =>
        variable.name === name
    )?.value;

  // El motivo con el que la policy midió la evidencia.
  const reason = (
    evidenceId: string,
  ): string =>
    variables.find(
      variable =>
        variable.name ===
        `medida_${evidenceId.replace('-', '')}`
    )?.description
    || '';

  const rep02 = field(
    'REP-02',
    'Última copia correcta',
    evidenceStatus('EV-01'),
    formatValue(
      measured('copias_ultima_correcta')
    ),
    ['EV-01'],
    [
      `Origen declarado (P-10): ${formatValue(parameterValue('P-10'))}`,
      reason('EV-01'),
    ],
  );

  const rep03 = field(
    'REP-03',
    'Periodicidad frente a P-01',
    evidenceStatus('EV-02'),
    [
      'Antigüedad de la última copia correcta más vieja:',
      formatAge(
        measured('copias_antiguedad_maxima_horas')
      ),
      '· Plazo (P-01 + P-02):',
      formatHours(
        measured('copias_plazo_horas')
      ),
    ].join(' '),
    ['EV-02'],
    [
      parameterLine('P-01'),
      parameterLine('P-02'),
      measured('copias_planificacion') !== undefined
        ? `Planificación: ${formatValue(measured('copias_planificacion'))}`
        : '',
      reason('EV-02'),
    ],
  );

  const rep04 = field(
    'REP-04',
    'Recolector de copias',
    evidenceStatus('EV-07'),
    formatValue(
      measured('recolectores_ultimo_latido')
    ),
    ['EV-07'],
    [
      reason('EV-07'),
    ],
  );

  const rep05 = field(
    'REP-05',
    'Retención de las copias',
    evidenceStatus('EV-03'),
    formatValue(
      measured('copias_retencion')
    ),
    ['EV-03'],
    [
      parameterLine('P-03'),
      reason('EV-03'),
    ],
  );

  const rep06 = field(
    'REP-06',
    'Acceso a las copias',
    evidenceStatus('EV-04'),
    formatValue(
      measured('copias_cuentas_con_lectura')
    ),
    ['EV-04'],
    [
      `Autorizados ${parameterLine('P-07')}`,
      reason('EV-04'),
    ],
  );

  const restoreDays =
    measured('restauracion_plazo_dias');

  const rep07 = field(
    'REP-07',
    'Pruebas de recuperación',
    evidenceStatus('EV-05'),
    [
      formatValue(
        measured('restauracion_ultima_prueba')
      ),
      '· Plazo (P-05):',
      typeof restoreDays === 'number'
        ? `${restoreDays} días`
        : formatValue(restoreDays),
    ].join(' '),
    ['EV-05'],
    [
      parameterLine('P-05'),
      reason('EV-05'),
    ],
  );

  const rep08 = field(
    'REP-08',
    'Copia en otro lugar',
    evidenceStatus('EV-06'),
    formatValue(
      measured('copias_destinos')
    ),
    ['EV-06'],
    [
      parameterLine('P-08'),
      parameterLine('P-09'),
      reason('EV-06'),
    ],
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
