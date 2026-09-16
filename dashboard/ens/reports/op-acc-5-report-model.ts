import type { ENSComplianceResult } from '../core';

export type OpAcc5ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpAcc5ReportField {
  id: string;
  title: string;
  status: OpAcc5ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpAcc5ReportModel {
  controlId: string;
  status: OpAcc5ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpAcc5ReportField[];
}

const STATUS_VALUES = new Set<OpAcc5ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpAcc5ReportFieldStatus =>
  STATUS_VALUES.has(value as OpAcc5ReportFieldStatus)
    ? (value as OpAcc5ReportFieldStatus)
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
  status: OpAcc5ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpAcc5ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.acc.5 (Mecanismo de autenticación (usuarios externos)).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpAcc5ReportModel = (
  result: ENSComplianceResult | undefined,
): OpAcc5ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpAcc5ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.acc.5.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  // Volumen de accesos externos en el período  ·  fuente: Log Collection (EV-01)
  const campo2 = field(
    'op.acc.5.campo2',
    'Volumen de accesos externos en el período',
    evidenceStatus('EV-01'),
    'Total de autenticaciones registradas por servicio de P-02, desglosadas en exitosas y fallidas. Evolución respe',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Cobertura temporal del registro de accesos  ·  fuente: Log Collection (EV-09)
  const campo3 = field(
    'op.acc.5.campo3',
    'Cobertura temporal del registro de accesos',
    evidenceStatus('EV-09'),
    'Verificación de que el registro cubre íntegramente el período declarado en P-08, con identificación de cualqui',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Intentos fallidos y bloqueos aplicados  ·  fuente: Correlación (EV-02, EV-03)
  const campo4 = field(
    'op.acc.5.campo4',
    'Intentos fallidos y bloqueos aplicados',
    evidenceStatus('EV-02'),
    'Cuentas que han superado el umbral P-03 en el período, con indicación de si el bloqueo se aplicó efectivamente',
    ['EV-02', 'EV-03'],
    evidenceObservations('EV-02'),
  );

  // Antigüedad de credenciales frente a la política  ·  fuente: ENSFácil (EV-04)
  const campo5 = field(
    'op.acc.5.campo5',
    'Antigüedad de credenciales frente a la política',
    evidenceStatus('EV-04'),
    'Distribución de la antigüedad de las credenciales activas de usuarios externos. Número y relación de credencia',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Reacción ante compromiso y fin de relación  ·  fuente: Correlación (EV-05)
  const campo6 = field(
    'op.acc.5.campo6',
    'Reacción ante compromiso y fin de relación',
    evidenceStatus('EV-05'),
    'Incidencias de compromiso de credencial y bajas de usuarios externos registradas en el período, con el tiempo',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Segundo factor — verificación de aplicación  ·  fuente: Log Collection (EV-07)
  const campo7 = field(
    'op.acc.5.campo7',
    'Segundo factor — verificación de aplicación',
    evidenceStatus('EV-07'),
    'Porcentaje de autenticaciones en las que consta la validación del segundo factor exigido por el refuerzo imple',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Certificados — emisores y validación de revocación  ·  fuente: Log Collection (EV-08)
  const campo8 = field(
    'op.acc.5.campo8',
    'Certificados — emisores y validación de revocación',
    evidenceStatus('EV-08'),
    'Solo si P-01 = R3 o R4. Autoridades de certificación observadas en las autenticaciones del período, contraste',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Información revelada en el proceso de autenticación  ·  fuente: Log Collection (EV-06)
  const campo9 = field(
    'op.acc.5.campo9',
    'Información revelada en el proceso de autenticación',
    evidenceStatus('EV-06'),
    'Resultado del análisis de mensajes de rechazo y respuestas del servicio. Hallazgos de mensajes diferenciados o',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Puntuación de cumplimiento op.acc.5  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'op.acc.5.campo10',
    'Puntuación de cumplimiento op.acc.5',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.acc.5',

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
      campo9,
      campo10,
    ],
  };
};
