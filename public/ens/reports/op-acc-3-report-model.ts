import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';

type OpAcc3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

interface OpAcc3ReportField {
  id: string;
  title: string;
  status: OpAcc3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

interface OpAcc3ReportModel {
  controlId: string;
  status: OpAcc3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpAcc3ReportField[];
}

const STATUS_VALUES = new Set<OpAcc3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpAcc3ReportFieldStatus =>
  STATUS_VALUES.has(value as OpAcc3ReportFieldStatus)
    ? (value as OpAcc3ReportFieldStatus)
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
  status: OpAcc3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpAcc3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/** Report model of op.acc.3: translates the engine result into report fields. */
export const buildOpAcc3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpAcc3ReportModel => {
  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const evidenceStatus = (evidenceId: string): OpAcc3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  const field1 = field(
    'op.acc.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  const field2 = field(
    'op.acc.3.campo2',
    'Cuentas con funciones incompatibles detectadas',
    evidenceStatus('EV-01'),
    'Listado de cuentas que han ejercido funciones incompatibles en el período. Para cada una: cuenta, funciones de',
    ['EV-01', 'EV-02'],
    evidenceObservations('EV-01'),
  );

  const field3 = field(
    'op.acc.3.campo3',
    'Tareas críticas y concurrencia verificada',
    evidenceStatus('EV-03'),
    'Para cada tarea crítica de P-04 ejecutada en el período: número de personas distintas implicadas, identificaci',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const field4 = field(
    'op.acc.3.campo4',
    'Inventario de acciones por cuenta y función',
    evidenceStatus('EV-06'),
    'Tabla agregada de todas las acciones ejecutadas en el período, agrupadas por cuenta y clasificadas por función',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const field5 = field(
    'op.acc.3.campo5',
    'Segregación configuración / mantenimiento (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-04')
      : 'NO_APLICA',
    'Cuentas que han aunado funciones de configuración y mantenimiento en la ventana P-06. Detalle de las acciones',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field6 = field(
    'op.acc.3.campo6',
    'Cuentas de auditoría — separación funcional (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-05')
      : 'NO_APLICA',
    'Estado de cada cuenta de P-05: acciones ejecutadas en el período y marca de si alguna excede la función de aud',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const field7 = field(
    'op.acc.3.campo7',
    'Accesos a la información de seguridad (R3)',
    evidenceStatus('EV-07'),
    'Registro de accesos a la configuración de seguridad y consolas de gestión, con identificación de la cuenta y s',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  const field8 = field(
    'op.acc.3.campo8',
    'Puntuación de cumplimiento op.acc.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.acc.3',

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
    ],
  };
};
