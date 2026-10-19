import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpAcc3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpAcc3ReportField {
  id: string;
  title: string;
  status: OpAcc3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpAcc3ReportModel {
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

/**
 * Modelo de informe de op.acc.3 (Segregación de funciones y tareas).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpAcc3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpAcc3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpAcc3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.acc.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  // Cuentas con funciones incompatibles detectadas  ·  fuente: Correlación (EV-01, EV-02)
  const campo2 = field(
    'op.acc.3.campo2',
    'Cuentas con funciones incompatibles detectadas',
    evidenceStatus('EV-01'),
    'Listado de cuentas que han ejercido funciones incompatibles en el período. Para cada una: cuenta, funciones de',
    ['EV-01', 'EV-02'],
    evidenceObservations('EV-01'),
  );

  // Tareas críticas y concurrencia verificada  ·  fuente: Correlación (EV-03)
  const campo3 = field(
    'op.acc.3.campo3',
    'Tareas críticas y concurrencia verificada',
    evidenceStatus('EV-03'),
    'Para cada tarea crítica de P-04 ejecutada en el período: número de personas distintas implicadas, identificaci',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Inventario de acciones por cuenta y función  ·  fuente: Log Collection (EV-06)
  const campo4 = field(
    'op.acc.3.campo4',
    'Inventario de acciones por cuenta y función',
    evidenceStatus('EV-06'),
    'Tabla agregada de todas las acciones ejecutadas en el período, agrupadas por cuenta y clasificadas por función',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Segregación configuración / mantenimiento (R1)  ·  fuente: Correlación (EV-04)
  const campo5 = field(
    'op.acc.3.campo5',
    'Segregación configuración / mantenimiento (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-04')
      : 'NO_APLICA',
    'Cuentas que han aunado funciones de configuración y mantenimiento en la ventana P-06. Detalle de las acciones',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Cuentas de auditoría — separación funcional (R1)  ·  fuente: Correlación (EV-05)
  const campo6 = field(
    'op.acc.3.campo6',
    'Cuentas de auditoría — separación funcional (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-05')
      : 'NO_APLICA',
    'Estado de cada cuenta de P-05: acciones ejecutadas en el período y marca de si alguna excede la función de aud',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Accesos a la información de seguridad (R3)  ·  fuente: FIM + Log (EV-07)
  const campo7 = field(
    'op.acc.3.campo7',
    'Accesos a la información de seguridad (R3)',
    evidenceStatus('EV-07'),
    'Registro de accesos a la configuración de seguridad y consolas de gestión, con identificación de la cuenta y s',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Puntuación de cumplimiento op.acc.3  ·  fuente: Motor ENSFácil
  const campo8 = field(
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
      campo1,
      campo2,
      campo3,
      campo4,
      campo5,
      campo6,
      campo7,
      campo8,
    ],
  };
};
