import type { ENSComplianceResult } from '../core';

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

/**
 * Construye el modelo de informe de op.acc.1 (Identificación) a partir del
 * resultado de cumplimiento del motor ENSFácil. Sigue el mismo patrón que
 * buildMpInfo6ReportModel: traduce el estado de cada evidencia (EV-01..08)
 * resuelta por el motor a los campos del informe definidos en el Excel.
 *
 * Los 10 campos provienen de la hoja "Informe ENSFácil" de la plantilla
 * op.acc.1. Cuando no hay eventos, cada campo cae a NO_EVALUABLE/SIN_DATOS
 * de forma coherente (nunca CUMPLE falso).
 */
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

  // Detecta parámetros base sin configurar (P-01/P-02 => control no evaluable).
  const missingCoreParams: string[] = [];
  if (!parameterConfigured('P-01')) missingCoreParams.push('P-01');
  if (!parameterConfigured('P-02')) missingCoreParams.push('P-02');

  // Campo 1 — Estado del control (semáforo ENS). Fuente: EV-01 a EV-08.
  const estadoControl = field(
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

  // Campo 2 — Inventario de cuentas activas. Fuente: EV-01.
  const inventario = field(
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

  // Campo 3 — Cuentas genéricas o compartidas detectadas. Fuente: EV-03.
  const genericas = field(
    'op.acc.1.genericas',
    'Cuentas genéricas o compartidas detectadas',
    evidenceStatus('EV-03'),
    `Lista vigilada (P-04): ${formatValue(parameterValue('P-04'))}`,
    ['EV-03'],
    evidenceObservations('EV-03'),
    parameterConfigured('P-04') ? [] : ['P-04'],
  );

  // Campo 4 — Cuentas con acceso multi-rol sin identificador diferenciado. EV-06.
  const multiRol = field(
    'op.acc.1.multirol',
    'Cuentas con acceso multi-rol sin identificador diferenciado',
    evidenceStatus('EV-06'),
    'Identificadores que ejercen distintos roles sin separación',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Campo 5 — Cuentas de servicio con acceso interactivo. Fuente: EV-05.
  const servicioInteractivo = field(
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

  // Campo 6 — Cuentas activas de usuarios con baja registrada. Fuente: EV-04.
  const bajasActivas = field(
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

  // Campo 7 — Modificaciones de cuentas en el período. Fuente: EV-02.
  const modificaciones = field(
    'op.acc.1.modificaciones',
    'Modificaciones de cuentas en el período',
    evidenceStatus('EV-02'),
    'Altas, modificaciones, habilitaciones y bajas de cuentas',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Campo 8 — Eliminaciones prematuras (retención incumplida). Fuente: EV-08.
  const eliminaciones = field(
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

  // Campo 9 — Lista de usuarios autorizados — estado (Refuerzo R1). EV-07.
  // Solo aplica a MEDIO/ALTO. En BAJO se marca NO_APLICA.
  const level = (result?.level || '').toUpperCase();
  const r1Aplica = level === 'MEDIO' || level === 'ALTO';
  const listaAutorizados = field(
    'op.acc.1.autorizados',
    'Lista de usuarios autorizados — estado (Refuerzo R1)',
    r1Aplica ? evidenceStatus('EV-07') : 'NO_APLICA',
    r1Aplica
      ? `Lista maestra (P-07): ${formatValue(parameterValue('P-07'))}`
      : 'Refuerzo R1 no exigible en nivel BAJO',
    ['EV-07'],
    r1Aplica ? evidenceObservations('EV-07') : ['Aplica solo a MEDIO/ALTO'],
    r1Aplica && !parameterConfigured('P-07') ? ['P-07'] : [],
  );

  // Campo 10 — Puntuación de cumplimiento op.acc.1. Fuente: Motor ENSFácil.
  const missingParams = (result?.parameters || [])
    .filter(parameter => {
      const value = parameter.value;
      const empty = Array.isArray(value)
        ? value.length === 0
        : value === undefined || value === null || value === '';
      return parameter.required && empty;
    })
    .map(parameter => parameter.id);

  const puntuacion = field(
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
      estadoControl,
      inventario,
      genericas,
      multiRol,
      servicioInteractivo,
      bajasActivas,
      modificaciones,
      eliminaciones,
      listaAutorizados,
      puntuacion,
    ],
  };
};
