import type { ENSComplianceResult } from '../core';

export type OpExp9ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp9ReportField {
  id: string;
  title: string;
  status: OpExp9ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp9ReportModel {
  controlId: string;
  status: OpExp9ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp9ReportField[];
}

const STATUS_VALUES = new Set<OpExp9ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp9ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp9ReportFieldStatus)
    ? (value as OpExp9ReportFieldStatus)
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
  status: OpExp9ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp9ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.9 (Registro de la gestión de incidentes).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp9ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp9ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp9ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.9.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  // Expedientes de incidente del período  ·  fuente: ENSFácil (EV-09)
  const campo2 = field(
    'op.exp.9.campo2',
    'Expedientes de incidente del período',
    evidenceStatus('EV-09'),
    'Relación de incidentes con su expediente consolidado: identificador, alertas originarias, reportes registrados',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Completitud de los reportes  ·  fuente: ENSFácil + ITSM (EV-02)
  const campo3 = field(
    'op.exp.9.campo3',
    'Completitud de los reportes',
    evidenceStatus('EV-02'),
    'Por cada incidente: presencia y cumplimentación de los reportes inicial, intermedio y final según P-02. Relaci',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Actuaciones de emergencia registradas  ·  fuente: Active Response + Log (EV-03)
  const campo4 = field(
    'op.exp.9.campo4',
    'Actuaciones de emergencia registradas',
    evidenceStatus('EV-03'),
    'Medidas urgentes ejecutadas en el período: acción, incidente asociado, hora, objetivo y resultado. Contraste e',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Modificaciones del sistema derivadas de incidentes  ·  fuente: FIM + Syscollector (EV-04)
  const campo5 = field(
    'op.exp.9.campo5',
    'Modificaciones del sistema derivadas de incidentes',
    evidenceStatus('EV-04'),
    'Cambios detectados en los sistemas afectados en la ventana posterior a cada incidente, con indicación de si co',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Incidentes con relevancia jurídica  ·  fuente: ENSFácil (EV-05)
  const campo6 = field(
    'op.exp.9.campo6',
    'Incidentes con relevancia jurídica',
    evidenceStatus('EV-05'),
    'Incidentes marcados según los criterios de P-04, con el detalle de las evidencias recogidas conforme a P-03, s',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Cadena de custodia de las evidencias  ·  fuente: ENSFácil + Indexer audit (EV-06)
  const campo7 = field(
    'op.exp.9.campo7',
    'Cadena de custodia de las evidencias',
    evidenceStatus('EV-06'),
    'Por cada evidencia custodiada: registro completo de accesos posteriores con cuenta y finalidad, y resultado de',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Protección de registros de períodos en investigación  ·  fuente: ENSFácil (EV-07)
  const campo8 = field(
    'op.exp.9.campo8',
    'Protección de registros de períodos en investigación',
    evidenceStatus('EV-07'),
    'Índices marcados como exentos de rotación por corresponder a incidentes abiertos o en plazo de conservación, c',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Realimentación de eventos auditables  ·  fuente: ENSFácil + ITSM (EV-08)
  const campo9 = field(
    'op.exp.9.campo9',
    'Realimentación de eventos auditables',
    evidenceStatus('EV-08'),
    'Revisiones de la lista de eventos auditables realizadas en el período con el incidente que las motivó, y nueva',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Puntuación de cumplimiento op.exp.9  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'op.exp.9.campo10',
    'Puntuación de cumplimiento op.exp.9',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.9',

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
