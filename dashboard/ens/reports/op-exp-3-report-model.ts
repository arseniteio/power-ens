import type { ENSComplianceResult } from '../core';

export type OpExp3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp3ReportField {
  id: string;
  title: string;
  status: OpExp3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp3ReportModel {
  controlId: string;
  status: OpExp3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp3ReportField[];
}

const STATUS_VALUES = new Set<OpExp3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp3ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp3ReportFieldStatus)
    ? (value as OpExp3ReportFieldStatus)
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
  status: OpExp3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.3 (Gestión de la configuración de seguridad).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Continuidad del cumplimiento de la línea base  ·  fuente: SCA (EV-01)
  const campo2 = field(
    'op.exp.3.campo2',
    'Continuidad del cumplimiento de la línea base',
    evidenceStatus('EV-01'),
    'Serie temporal del porcentaje de cumplimiento SCA por activo y agregado del sistema durante el período. Es la',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Regresiones de configuración detectadas  ·  fuente: SCA + ENSFácil (EV-10)
  const campo3 = field(
    'op.exp.3.campo3',
    'Regresiones de configuración detectadas',
    evidenceStatus('EV-10'),
    'Checks que pasaron de conforme a no conforme en el período: activo, check afectado, fecha de la regresión, si',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Ediciones de la configuración de seguridad  ·  fuente: FIM whodata (EV-02)
  const campo4 = field(
    'op.exp.3.campo4',
    'Ediciones de la configuración de seguridad',
    evidenceStatus('EV-02'),
    'Registro completo de modificaciones en las rutas de P-04: fichero, tipo de cambio, diff cuando procede, usuari',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Trazabilidad de cambios frente a autorización  ·  fuente: FIM + ITSM (EV-05)
  const campo5 = field(
    'op.exp.3.campo5',
    'Trazabilidad de cambios frente a autorización',
    evidenceStatus('EV-05'),
    'Para cada cambio de configuración detectado: ticket o solicitud de autorización asociada, quién la aprobó y fe',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Reacción ante vulnerabilidades  ·  fuente: Vuln. Detector + SCA (EV-06)
  const campo6 = field(
    'op.exp.3.campo6',
    'Reacción ante vulnerabilidades',
    evidenceStatus('EV-06'),
    'Vulnerabilidades notificadas sobre los activos durante el período, con el tiempo hasta la reacción (cambio de',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Reacción ante incidentes  ·  fuente: Correlación (EV-07)
  const campo7 = field(
    'op.exp.3.campo7',
    'Reacción ante incidentes',
    evidenceStatus('EV-07'),
    'Incidentes de seguridad del período con indicación de si generaron cambios de configuración en los activos afe',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Elementos no autorizados en el sistema  ·  fuente: Syscollector + ENSFácil (EV-03)
  const campo8 = field(
    'op.exp.3.campo8',
    'Elementos no autorizados en el sistema',
    evidenceStatus('EV-03'),
    'Hardware o software detectado que no figura en la línea base P-01: activo afectado, elemento, fecha de aparici',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Servicios fuera de la lista autorizada  ·  fuente: Syscollector + ENSFácil (EV-04)
  const campo9 = field(
    'op.exp.3.campo9',
    'Servicios fuera de la lista autorizada',
    evidenceStatus('EV-04'),
    'Servicios en ejecución sin correspondencia en P-02, por activo y perfil, con el proceso asociado y si el servi',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Verificaciones periódicas de la configuración  ·  fuente: Registro ENSFácil (EV-03)
  const campo10 = field(
    'op.exp.3.campo10',
    'Verificaciones periódicas de la configuración',
    evidenceStatus('EV-03'),
    'Histórico de verificaciones formales de la configuración frente a la línea base: fecha, alcance, resultado y d',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Concentración de la administración (R2)  ·  fuente: FIM + ENSFácil (EV-08)
  const campo11 = field(
    'op.exp.3.campo11',
    'Concentración de la administración (R2)',
    evidenceStatus('EV-08'),
    'Número de cuentas que efectivamente han editado la configuración de seguridad en el período, con el detalle de',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Copias de seguridad de la configuración (R3)  ·  fuente: FIM + Log (EV-09)
  const campo12 = field(
    'op.exp.3.campo12',
    'Copias de seguridad de la configuración (R3)',
    evidenceStatus('EV-09'),
    'Para cada alcance declarado en P-07: fecha de la última copia, antigüedad, frecuencia declarada y marca de cum',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Puntuación de cumplimiento op.exp.3  ·  fuente: Motor ENSFácil
  const campo13 = field(
    'op.exp.3.campo13',
    'Puntuación de cumplimiento op.exp.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.3',

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
      campo11,
      campo12,
      campo13,
    ],
  };
};
