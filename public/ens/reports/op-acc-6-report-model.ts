import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpAcc6ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpAcc6ReportField {
  id: string;
  title: string;
  status: OpAcc6ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpAcc6ReportModel {
  controlId: string;
  status: OpAcc6ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpAcc6ReportField[];
}

const STATUS_VALUES = new Set<OpAcc6ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpAcc6ReportFieldStatus =>
  STATUS_VALUES.has(value as OpAcc6ReportFieldStatus)
    ? (value as OpAcc6ReportFieldStatus)
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
  status: OpAcc6ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpAcc6ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/** Report model of op.acc.6: translates the engine result into report fields. */
export const buildOpAcc6ReportModel = (
  result: ENSComplianceResult | undefined,
): OpAcc6ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpAcc6ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  const field1 = field(
    'op.acc.6.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  const field2 = field(
    'op.acc.6.campo2',
    'Accesos por zona de origen',
    evidenceStatus('EV-01'),
    'Distribución de las autenticaciones del período según procedan de zona controlada o no controlada, con el porc',
    ['EV-01', 'EV-02'],
    evidenceObservations('EV-01'),
  );

  const field3 = field(
    'op.acc.6.campo3',
    'Accesos sin doble factor desde zona no controlada',
    evidenceStatus('EV-02'),
    'Relación detallada de autenticaciones procedentes de zona no controlada sin segundo factor: usuario, IP de ori',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const field4 = field(
    'op.acc.6.campo4',
    'Acceso remoto — conformidad con R9',
    evidenceStatus('EV-07'),
    'Por cada canal de P-07: conexiones registradas, verificación de cifrado del tráfico, usuarios que lo utilizaro',
    ['EV-07', 'EV-08'],
    evidenceObservations('EV-07'),
  );

  const field5 = field(
    'op.acc.6.campo5',
    'Intentos fallidos y bloqueos',
    evidenceStatus('EV-03'),
    'Cuentas que superaron el umbral P-05 con indicación de si el bloqueo se aplicó. Patrones de ataque detectados',
    ['EV-03', 'EV-04'],
    evidenceObservations('EV-03'),
  );

  const field6 = field(
    'op.acc.6.campo6',
    'Antigüedad y robustez de las credenciales',
    evidenceStatus('EV-05'),
    'Distribución de la antigüedad de las credenciales activas frente a P-04, relación de las que superan el plazo,',
    ['EV-05', 'EV-11'],
    evidenceObservations('EV-05'),
  );

  const field7 = field(
    'op.acc.6.campo7',
    'Reacción ante compromiso y bajas de personal',
    evidenceStatus('EV-06'),
    'Incidencias de compromiso y bajas registradas en el período, con el tiempo hasta la inhabilitación efectiva de',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const field8 = field(
    'op.acc.6.campo8',
    'Registro de accesos — cobertura (R5)',
    evidenceStatus('EV-01'),
    'Volumen de eventos de autenticación ingeridos por fuente de P-03, verificación de continuidad del registro e i',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  const field9 = field(
    'op.acc.6.campo9',
    'Renovación de autenticación en puntos críticos (R6)',
    level === 'ALTO'
      ? evidenceStatus('EV-09')
      : 'NO_APLICA',
    'Operaciones de P-08 ejecutadas en el período con indicación de si fueron precedidas de reautenticación singula',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  const field10 = field(
    'op.acc.6.campo10',
    'Credenciales sin utilización prolongada (R7)',
    level === 'ALTO'
      ? evidenceStatus('EV-10')
      : 'NO_APLICA',
    'Cuentas habilitadas cuyo último acceso supera P-09 días: usuario, días de inactividad, privilegios asociados y',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  const field11 = field(
    'op.acc.6.campo11',
    'Puntuación de cumplimiento op.acc.6',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.acc.6',

    status: asStatus(result?.status),

    score: typeof result?.score === 'number' ? result.score : null,

    coverage: typeof result?.coverage === 'number' ? result.coverage : null,

    level: result?.level || 'SIN_DATOS',

    evaluatedAt: result?.evaluatedAt,

    fields: [
      field1,
      field2,
      field3,
      field4,
      field5,
      field6,
      field7,
      field8,
      field9,
      field10,
      field11,
    ],
  };
};
