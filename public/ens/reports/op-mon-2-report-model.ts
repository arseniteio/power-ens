import type { ENSComplianceResult } from '../core';

export type OpMon2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpMon2ReportField {
  id: string;
  title: string;
  status: OpMon2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpMon2ReportModel {
  controlId: string;
  status: OpMon2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpMon2ReportField[];
}

const STATUS_VALUES = new Set<OpMon2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpMon2ReportFieldStatus =>
  STATUS_VALUES.has(value as OpMon2ReportFieldStatus)
    ? (value as OpMon2ReportFieldStatus)
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
  status: OpMon2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpMon2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.mon.2 (Sistema de métricas).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpMon2ReportModel = (
  result: ENSComplianceResult | undefined,
): OpMon2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpMon2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.mon.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  // Grado de implantación de las medidas  ·  fuente: Motor ENSFácil (EV-01)
  const campo2 = field(
    'op.mon.2.campo2',
    'Grado de implantación de las medidas',
    evidenceStatus('EV-01'),
    'Porcentaje de implantación por medida, agregado por marco (organizativo, operacional, protección) y global, calculado sobre la Declaración de Aplicabilidad de P-01. Comparación con los objetivos de P-06. Es el dato central del control.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Evolución del grado de implantación  ·  fuente: Motor ENSFácil (EV-02)
  const campo3 = field(
    'op.mon.2.campo3',
    'Evolución del grado de implantación',
    evidenceStatus('EV-02'),
    'Serie histórica por período según P-02, con la tendencia y la relación de medidas que han retrocedido respecto al período anterior. Es lo que convierte un porcentaje en información útil.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Fiabilidad de la medición  ·  fuente: Motor ENSFácil (EV-04)
  const campo4 = field(
    'op.mon.2.campo4',
    'Fiabilidad de la medición',
    evidenceStatus('EV-04'),
    'Cobertura de la monitorización sobre la que se calculan las métricas: porcentaje de sistemas con agente activo, continuidad de ingesta y categorías de evento cubiertas. Declara hasta qué punto el resto de las cifras del informe son sólidas.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Controles no evaluables por falta de parámetros  ·  fuente: Motor ENSFácil (EV-05)
  const campo5 = field(
    'op.mon.2.campo5',
    'Controles no evaluables por falta de parámetros',
    evidenceStatus('EV-05'),
    'Número y relación de controles en estado GRIS con el parámetro concreto que falta en cada caso. Se presenta como lista de acciones pendientes del cliente, con su evolución entre períodos para demostrar que la deuda de configuración se reduce.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Métricas de gestión de incidentes (R1)  ·  fuente: ENSFácil + op.exp.7/9 (EV-03)
  const campo6 = field(
    'op.mon.2.campo6',
    'Métricas de gestión de incidentes (R1)',
    evidenceStatus('EV-03'),
    'Indicadores de P-03 consolidados con el formato de la ITS de Notificación de Incidentes: incidentes por tipo y severidad, tiempos medios de detección, contención y resolución, proporción de alertas gestionadas, notificaciones al CCN-CERT y a la AEPD.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Recursos consumidos por el sistema de seguridad (R2)  ·  fuente: Entrada manual (EV-06)
  const campo7 = field(
    'op.mon.2.campo7',
    'Recursos consumidos por el sistema de seguridad (R2)',
    evidenceStatus('EV-06'),
    'Horas de dedicación internas y externas y presupuesto ejecutado, aportados por el cliente conforme a P-04. Marcado expresamente como DATO DECLARADO y no medido, con la fecha de aportación y el responsable que lo validó, para que quede claro su origen.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Datos para el informe anual del artículo 32  ·  fuente: Motor ENSFácil (EV-07)
  const campo8 = field(
    'op.mon.2.campo8',
    'Datos para el informe anual del artículo 32',
    evidenceStatus('EV-07'),
    'Conjunto consolidado con la estructura que requiere el informe anual al que remite op.mon.2.1, con cada cifra trazada a su origen. Es la salida de mayor utilidad práctica del control y el argumento que más valora el cliente.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Puntuación de cumplimiento op.mon.2  ·  fuente: Motor ENSFácil
  const campo9 = field(
    'op.mon.2.campo9',
    'Puntuación de cumplimiento op.mon.2',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.mon.2',

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
    ],
  };
};
