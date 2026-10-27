import type { ENSComplianceResult } from '../../../common/ens/core';

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

/** Report model of op.exp.9: translates the engine result into report fields. */
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

  const field1 = field(
    'op.exp.9.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  const field2 = field(
    'op.exp.9.campo2',
    'Expedientes de incidente del período',
    evidenceStatus('EV-09'),
    'Relación de incidentes con su expediente consolidado: identificador, alertas originarias, reportes registrados, actuaciones de emergencia, modificaciones derivadas y evidencias custodiadas.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  const field3 = field(
    'op.exp.9.campo3',
    'Completitud de los reportes',
    evidenceStatus('EV-02'),
    'Por cada incidente: presencia y cumplimentación de los reportes inicial, intermedio y final según P-02.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const field4 = field(
    'op.exp.9.campo4',
    'Actuaciones de emergencia registradas',
    evidenceStatus('EV-03'),
    'Medidas urgentes ejecutadas en el período: acción, incidente asociado, hora, objetivo y resultado.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const field5 = field(
    'op.exp.9.campo5',
    'Modificaciones del sistema derivadas de incidentes',
    evidenceStatus('EV-04'),
    'Cambios detectados en los sistemas afectados en la ventana posterior a cada incidente, con indicación de si constan registrados en el expediente como modificación derivada.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field6 = field(
    'op.exp.9.campo6',
    'Incidentes con relevancia jurídica',
    evidenceStatus('EV-05'),
    'Incidentes marcados según los criterios de P-04, con el detalle de las evidencias recogidas conforme a P-03, su hash de sellado, la fecha de recogida y la ubicación de custodia.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const field7 = field(
    'op.exp.9.campo7',
    'Cadena de custodia de las evidencias',
    evidenceStatus('EV-06'),
    'Por cada evidencia custodiada: registro completo de accesos posteriores con cuenta y finalidad, y resultado de la última verificación de integridad por recálculo de hash.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const field8 = field(
    'op.exp.9.campo8',
    'Protección de registros de períodos en investigación',
    evidenceStatus('EV-07'),
    'Índices marcados como exentos de rotación por corresponder a incidentes abiertos o en plazo de conservación, con el incidente asociado y la fecha prevista de liberación.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  const field9 = field(
    'op.exp.9.campo9',
    'Realimentación de eventos auditables',
    evidenceStatus('EV-08'),
    'Revisiones de la lista de eventos auditables realizadas en el período con el incidente que las motivó, y nuevas reglas de detección incorporadas como consecuencia.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  const field10 = field(
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
    ],
  };
};
