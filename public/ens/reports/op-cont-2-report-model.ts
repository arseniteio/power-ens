import type { ENSComplianceResult } from '../core';

export type OpCont2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpCont2ReportField {
  id: string;
  title: string;
  status: OpCont2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpCont2ReportModel {
  controlId: string;
  status: OpCont2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpCont2ReportField[];
}

const STATUS_VALUES = new Set<OpCont2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpCont2ReportFieldStatus =>
  STATUS_VALUES.has(value as OpCont2ReportFieldStatus)
    ? (value as OpCont2ReportFieldStatus)
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
  status: OpCont2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpCont2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.cont.2 (Plan de continuidad).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpCont2ReportModel = (
  result: ENSComplianceResult | undefined,
): OpCont2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpCont2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.cont.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Plan de continuidad vigente  ·  fuente: ENSFácil (EV-01)
  const campo2 = field(
    'op.cont.2.campo2',
    'Plan de continuidad vigente',
    level === 'ALTO'
      ? evidenceStatus('EV-01')
      : 'NO_APLICA',
    'Referencia del plan de P-01 con su versión, fecha de aprobación, responsable y antigüedad frente a la periodicidad de P-08. Marcado como DOCUMENTO APORTADO: la verificación de su contenido es revisión documental y no monitorización.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Interrupciones reales del período  ·  fuente: Estado de agentes + Log (EV-02)
  const campo3 = field(
    'op.cont.2.campo3',
    'Interrupciones reales del período',
    level === 'ALTO'
      ? evidenceStatus('EV-02')
      : 'NO_APLICA',
    'Interrupciones detectadas en los sistemas que soportan servicios esenciales: sistema afectado, servicio esencial implicado, hora de inicio y de restablecimiento, y duración. Son datos medidos, no estimados.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Disponibilidad real frente a los objetivos  ·  fuente: Log + ENSFácil (EV-07)
  const campo4 = field(
    'op.cont.2.campo4',
    'Disponibilidad real frente a los objetivos',
    level === 'ALTO'
      ? evidenceStatus('EV-07')
      : 'NO_APLICA',
    'Por servicio esencial: disponibilidad acumulada del período, tiempo de restablecimiento de cada incidencia y contraste con el RTO de P-02. Relación de casos en que el objetivo se superó. Convierte el plan en algo contrastable con la realidad.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Activación de medios alternativos  ·  fuente: Correlación (EV-08)
  const campo5 = field(
    'op.cont.2.campo5',
    'Activación de medios alternativos',
    level === 'ALTO'
      ? evidenceStatus('EV-08')
      : 'NO_APLICA',
    'Activaciones de medios alternativos detectadas en el período, con el intervalo entre la caída del medio habitual y la entrada del alternativo. Acredita que la previsión de coordinación de op.cont.2.2 opera en la práctica y no solo en el documento.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Medios alternativos y vigencia contractual  ·  fuente: ENSFácil (EV-04)
  const campo6 = field(
    'op.cont.2.campo6',
    'Medios alternativos y vigencia contractual',
    level === 'ALTO'
      ? evidenceStatus('EV-04')
      : 'NO_APLICA',
    'Por cada medio alternativo de P-04: proveedor, referencia del contrato, vigencia, días restantes y tiempo de activación comprometido. Destacados los que carecen de contrato o lo tienen vencido, que son incumplimiento directo de op.cont.2.3.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Funciones del plan y su vigencia organizativa  ·  fuente: ENSFácil (EV-05)
  const campo7 = field(
    'op.cont.2.campo7',
    'Funciones del plan y su vigencia organizativa',
    level === 'ALTO'
      ? evidenceStatus('EV-05')
      : 'NO_APLICA',
    'Funciones de P-03 con la persona designada, su suplente y su situación actual en la organización. Relación de funciones asignadas a personas dadas de baja o con cambio de puesto, que exigen actualización inmediata del plan.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Formación del personal afectado  ·  fuente: ENSFácil (EV-06)
  const campo8 = field(
    'op.cont.2.campo8',
    'Formación del personal afectado',
    level === 'ALTO'
      ? evidenceStatus('EV-06')
      : 'NO_APLICA',
    'Por cada persona con función en el plan: formación recibida, fecha y vigencia. Relación de personas sin formación registrada o con formación caducada. Es uno de los hallazgos más frecuentes de este control.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Comprobación de integridad tras caída (R2)  ·  fuente: FIM (EV-03)
  const campo9 = field(
    'op.cont.2.campo9',
    'Comprobación de integridad tras caída (R2)',
    level === 'ALTO'
      ? evidenceStatus('EV-03')
      : 'NO_APLICA',
    'Por cada interrupción del período: si se ejecutó la verificación de integridad de los componentes de P-07 al reanudarse el servicio y cuál fue su resultado. Desviaciones detectadas con el componente afectado. Acredita R2, no exigible, y cubre un vector real de ataque.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Puntuación de cumplimiento op.cont.2  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'op.cont.2.campo10',
    'Puntuación de cumplimiento op.cont.2',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.cont.2',

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
