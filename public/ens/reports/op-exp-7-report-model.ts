import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpExp7ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp7ReportField {
  id: string;
  title: string;
  status: OpExp7ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp7ReportModel {
  controlId: string;
  status: OpExp7ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp7ReportField[];
}

const STATUS_VALUES = new Set<OpExp7ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp7ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp7ReportFieldStatus)
    ? (value as OpExp7ReportFieldStatus)
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
  status: OpExp7ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp7ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.7 (Gestión de incidentes).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp7ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp7ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp7ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.7.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  // Volumen y clasificación de alertas  ·  fuente: Log Collection (EV-01)
  const campo2 = field(
    'op.exp.7.campo2',
    'Volumen y clasificación de alertas',
    evidenceStatus('EV-01'),
    'Alertas de seguridad generadas en el período, clasificadas según los criterios de P-01 y por severidad. Distri',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Conciliación alerta — incidente gestionado  ·  fuente: ENSFácil + ITSM (EV-02)
  const campo3 = field(
    'op.exp.7.campo3',
    'Conciliación alerta — incidente gestionado',
    evidenceStatus('EV-02'),
    'Porcentaje de alertas de severidad relevante que derivaron en incidente registrado en P-03. Relación nominal d',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Tiempos de respuesta (MTTD y MTTR)  ·  fuente: ENSFácil + ITSM (EV-03)
  const campo4 = field(
    'op.exp.7.campo4',
    'Tiempos de respuesta (MTTD y MTTR)',
    evidenceStatus('EV-03'),
    'Tiempo medio de detección, de contención y de resolución por severidad, contrastados con los plazos comprometi',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Escalado y comunicación a responsables  ·  fuente: ENSFácil + ITSM (EV-04)
  const campo5 = field(
    'op.exp.7.campo5',
    'Escalado y comunicación a responsables',
    evidenceStatus('EV-04'),
    'Por cada incidente: destinatario de escalado que correspondía según P-02, destinatario real, plazo; y responsa',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Incidentes con afectación a datos personales  ·  fuente: ENSFácil (EV-07)
  const campo6 = field(
    'op.exp.7.campo6',
    'Incidentes con afectación a datos personales',
    evidenceStatus('EV-07'),
    'Incidentes marcados como afectantes a datos personales según P-07, con la valoración de brecha, el tiempo tran',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Preservación de evidencias  ·  fuente: Log + ENSFácil (EV-05)
  const campo7 = field(
    'op.exp.7.campo7',
    'Preservación de evidencias',
    evidenceStatus('EV-05'),
    'Por cada incidente: evidencias exportadas según P-08, hash de sellado, ubicación de custodia y verificación de',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Medidas urgentes de contención aplicadas  ·  fuente: Active Response (EV-06)
  const campo8 = field(
    'op.exp.7.campo8',
    'Medidas urgentes de contención aplicadas',
    evidenceStatus('EV-06'),
    'Acciones de contención ejecutadas en el período: tipo de acción, regla que la disparó, objetivo, resultado y s',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Notificación al CCN-CERT (R1)  ·  fuente: ENSFácil (EV-08)
  const campo9 = field(
    'op.exp.7.campo9',
    'Notificación al CCN-CERT (R1)',
    evidenceStatus('EV-08'),
    'Incidentes que requerían notificación al CCN-CERT según su clasificación, con la referencia de la notificación',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Reconfiguración dinámica ejercitada (R3)  ·  fuente: Log + FIM (EV-09)
  const campo10 = field(
    'op.exp.7.campo10',
    'Reconfiguración dinámica ejercitada (R3)',
    level === 'ALTO'
      ? evidenceStatus('EV-09')
      : 'NO_APLICA',
    'Cambios de configuración en los elementos de P-10 realizados en respuesta a incidentes activos: elemento, tipo',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Incorporación de avisos del CCN-CERT (R3)  ·  fuente: CDB lists + Log (EV-10)
  const campo11 = field(
    'op.exp.7.campo11',
    'Incorporación de avisos del CCN-CERT (R3)',
    level === 'ALTO'
      ? evidenceStatus('EV-10')
      : 'NO_APLICA',
    'Avisos recibidos en el período por el canal de P-11, indicadores de compromiso incorporados a la capacidad de',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Medidas de mejora derivadas de incidentes  ·  fuente: ENSFácil + ITSM (EV-12)
  const campo12 = field(
    'op.exp.7.campo12',
    'Medidas de mejora derivadas de incidentes',
    evidenceStatus('EV-12'),
    'Por cada incidente cerrado: medidas preventivas registradas, cambios de configuración asociados y actualizacio',
    ['EV-12'],
    evidenceObservations('EV-12'),
  );

  // Respuesta automatizada y detección de anomalías (R4)  ·  fuente: Correlación + Active Response (EV-11)
  const campo13 = field(
    'op.exp.7.campo13',
    'Respuesta automatizada y detección de anomalías (R4)',
    evidenceStatus('EV-11'),
    'Si está desplegado: anomalías de comportamiento detectadas y respuestas automatizadas ejecutadas. Acredita par',
    ['EV-11'],
    evidenceObservations('EV-11'),
  );

  // Puntuación de cumplimiento op.exp.7  ·  fuente: Motor ENSFácil
  const campo14 = field(
    'op.exp.7.campo14',
    'Puntuación de cumplimiento op.exp.7',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.7',

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
      campo14,
    ],
  };
};
