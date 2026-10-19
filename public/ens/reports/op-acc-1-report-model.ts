import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpAcc1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpAcc1ReportField {
  id: string;
  title: string;
  status: OpAcc1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpAcc1ReportModel {
  controlId: string;
  status: OpAcc1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpAcc1ReportField[];
}

const STATUS_VALUES = new Set<OpAcc1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpAcc1ReportFieldStatus =>
  STATUS_VALUES.has(value as OpAcc1ReportFieldStatus)
    ? (value as OpAcc1ReportFieldStatus)
    : 'SIN_DATOS';

const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'Sin valor';
  }
  if (value === undefined || value === null || value === '') {
    return 'Sin valor';
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  return String(value);
};

const field = (
  id: string,
  title: string,
  status: OpAcc1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpAcc1ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/** Report model of op.acc.1: translates the engine result into report fields. */
export const buildOpAcc1ReportModel = (
  result: ENSComplianceResult | undefined,
): OpAcc1ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const requirements = new Map(
    (result?.requirements || []).map(requirement => [
      requirement.id,
      requirement,
    ]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const parameterConfigured = (parameterId: string): boolean => {
    const value = parameterValue(parameterId);
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== undefined && value !== null && value !== '';
  };

  const evidenceStatus = (evidenceId: string): OpAcc1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const evidenceAgent = (evidenceId: string): string => {
    const evidence = evidences.get(evidenceId);
    return evidence?.agentName || evidence?.agentId || '';
  };

  const missingCoreParams: string[] = [];
  if (!parameterConfigured('P-01')) missingCoreParams.push('P-01');
  if (!parameterConfigured('P-02')) missingCoreParams.push('P-02');

  const controlStatus = field(
    'op.acc.1.estado',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    missingCoreParams.length > 0
      ? 'GRIS — No evaluable: faltan parámetros base'
      : formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    [
      missingCoreParams.length > 0
        ? `Parámetros base no configurados: ${missingCoreParams.join(', ')}`
        : '',
    ],
    missingCoreParams,
  );

  const inventory = field(
    'op.acc.1.inventario',
    'Inventario de cuentas activas',
    evidenceStatus('EV-01'),
    [
      `Fuente de identidad: ${formatValue(parameterValue('P-01'))}`,
      `Sistemas en scope: ${formatValue(parameterValue('P-02'))}`,
    ].join(' · '),
    ['EV-01'],
    [
      ...evidenceObservations('EV-01'),
      evidenceAgent('EV-01') ? `Agente: ${evidenceAgent('EV-01')}` : '',
    ],
    parameterConfigured('P-01') ? [] : ['P-01'],
  );

  const generic = field(
    'op.acc.1.genericas',
    'Cuentas genéricas o compartidas detectadas',
    evidenceStatus('EV-03'),
    `Lista vigilada (P-04): ${formatValue(parameterValue('P-04'))}`,
    ['EV-03'],
    evidenceObservations('EV-03'),
    parameterConfigured('P-04') ? [] : ['P-04'],
  );

  const multiRole = field(
    'op.acc.1.multirol',
    'Cuentas con acceso multi-rol sin identificador diferenciado',
    evidenceStatus('EV-06'),
    'Identificadores que ejercen distintos roles sin separación',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const interactiveService = field(
    'op.acc.1.servicio',
    'Cuentas de servicio con acceso interactivo',
    evidenceStatus('EV-05'),
    `Cuentas de servicio declaradas (P-03): ${formatValue(
      parameterValue('P-03'),
    )}`,
    ['EV-05'],
    evidenceObservations('EV-05'),
    parameterConfigured('P-03') ? [] : ['P-03'],
  );

  const activeTerminatedAccounts = field(
    'op.acc.1.bajas',
    'Cuentas activas de usuarios con baja registrada',
    evidenceStatus('EV-04'),
    [
      `Plazo máx. deshabilitar (P-05): ${formatValue(parameterValue('P-05'))}`,
      `Integración RRHH (P-08): ${formatValue(parameterValue('P-08'))}`,
    ].join(' · '),
    ['EV-04'],
    evidenceObservations('EV-04'),
    parameterConfigured('P-05') ? [] : ['P-05'],
  );

  const modifications = field(
    'op.acc.1.modificaciones',
    'Modificaciones de cuentas en el período',
    evidenceStatus('EV-02'),
    'Altas, modificaciones, habilitaciones y bajas de cuentas',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const deletions = field(
    'op.acc.1.eliminaciones',
    'Eliminaciones prematuras (retención incumplida)',
    evidenceStatus('EV-08'),
    `Retención mínima de cuentas (P-06): ${formatValue(
      parameterValue('P-06'),
    )}`,
    ['EV-08'],
    evidenceObservations('EV-08'),
    parameterConfigured('P-06') ? [] : ['P-06'],
  );

  const level = (result?.level || '').toUpperCase();
  const r1Applies = level === 'MEDIO' || level === 'ALTO';
  const authorizedList = field(
    'op.acc.1.autorizados',
    'Lista de usuarios autorizados — estado (Refuerzo R1)',
    r1Applies ? evidenceStatus('EV-07') : 'NO_APLICA',
    r1Applies
      ? `Lista maestra (P-07): ${formatValue(parameterValue('P-07'))}`
      : 'Refuerzo R1 no exigible en nivel BAJO',
    ['EV-07'],
    r1Applies ? evidenceObservations('EV-07') : ['Aplica solo a MEDIO/ALTO'],
    r1Applies && !parameterConfigured('P-07') ? ['P-07'] : [],
  );

  const missingParams = (result?.parameters || [])
    .filter(parameter => {
      const value = parameter.value;
      const empty = Array.isArray(value)
        ? value.length === 0
        : value === undefined || value === null || value === '';
      return parameter.required && empty;
    })
    .map(parameter => parameter.id);

  const score = field(
    'op.acc.1.puntuacion',
    'Puntuación de cumplimiento op.acc.1',
    asStatus(result?.status),
    [
      typeof result?.score === 'number' ? `${result.score}%` : 'N/A',
      typeof result?.coverage === 'number'
        ? `Cobertura: ${result.coverage}%`
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    [
      `Nivel evaluado: ${result?.level || 'SIN_DATOS'}`,
      missingParams.length > 0
        ? `Parámetros sin configurar: ${missingParams.join(', ')}`
        : 'Todos los parámetros obligatorios configurados',
    ],
    missingParams,
  );

  return {
    controlId: result?.control.id || 'op.acc.1',

    status: asStatus(result?.status),

    score: typeof result?.score === 'number' ? result.score : null,

    coverage: typeof result?.coverage === 'number' ? result.coverage : null,

    level: result?.level || 'SIN_DATOS',

    evaluatedAt: result?.evaluatedAt,

    fields: [
      controlStatus,
      inventory,
      generic,
      multiRole,
      interactiveService,
      activeTerminatedAccounts,
      modifications,
      deletions,
      authorizedList,
      score,
    ],
  };
};
