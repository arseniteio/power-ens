import type { ENSComplianceResult } from '../core';

export type OpMon1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpMon1ReportField {
  id: string;
  title: string;
  status: OpMon1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpMon1ReportModel {
  controlId: string;
  status: OpMon1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpMon1ReportField[];
}

const STATUS_VALUES = new Set<OpMon1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpMon1ReportFieldStatus =>
  STATUS_VALUES.has(value as OpMon1ReportFieldStatus)
    ? (value as OpMon1ReportFieldStatus)
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
  status: OpMon1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpMon1ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.mon.1 (Detección de intrusión).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpMon1ReportModel = (
  result: ENSComplianceResult | undefined,
): OpMon1ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpMon1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.mon.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Capacidad de detección desplegada  ·  fuente: Wazuh HIDS (EV-01)
  const campo2 = field(
    'op.mon.1.campo2',
    'Capacidad de detección desplegada',
    evidenceStatus('EV-01'),
    'Descripción de la capacidad: tipo de detección (host y, si aplica, red), conjuntos de reglas activos con su ve',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Cobertura de la detección  ·  fuente: Estado de agentes (EV-02)
  const campo3 = field(
    'op.mon.1.campo3',
    'Cobertura de la detección',
    evidenceStatus('EV-02'),
    'Por cada sistema de P-01: agente desplegado, estado, fecha de último contacto y módulos de análisis activos. P',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Detecciones del período  ·  fuente: Log + Correlación (EV-03)
  const campo4 = field(
    'op.mon.1.campo4',
    'Detecciones del período',
    evidenceStatus('EV-03'),
    'Detecciones generadas agrupadas por categoría de amenaza y severidad, con su mapeo a técnicas MITRE ATT&CK. To',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Cobertura del análisis de riesgos  ·  fuente: ENSFácil (EV-04)
  const campo5 = field(
    'op.mon.1.campo5',
    'Cobertura del análisis de riesgos',
    evidenceStatus('EV-04'),
    'Matriz que cruza cada situación de compromiso de P-04 con las reglas de detección que la cubren. Relación expl',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Detección en red  ·  fuente: Log Collection (EV-05)
  const campo6 = field(
    'op.mon.1.campo6',
    'Detección en red',
    evidenceStatus('EV-05'),
    'Si P-02 = sí: eventos del NIDS ingeridos, detecciones de red y correlaciones establecidas con actividad en hos',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Vigencia del conjunto de reglas  ·  fuente: ENSFácil (EV-08)
  const campo7 = field(
    'op.mon.1.campo7',
    'Vigencia del conjunto de reglas',
    evidenceStatus('EV-08'),
    'Versión del ruleset, fecha de última actualización y días transcurridos. Histórico de actualizaciones. Es el e',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Exclusiones y afinación  ·  fuente: ENSFácil (EV-08)
  const campo8 = field(
    'op.mon.1.campo8',
    'Exclusiones y afinación',
    evidenceStatus('EV-08'),
    'Inventario de reglas excluidas o silenciadas con su justificación, quién lo autorizó y su fecha. Revisión de l',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Tratamiento de alertas conforme a procedimiento (R2)  ·  fuente: ENSFácil + ITSM (EV-06)
  const campo9 = field(
    'op.mon.1.campo9',
    'Tratamiento de alertas conforme a procedimiento (R2)',
    level === 'ALTO'
      ? evidenceStatus('EV-06')
      : 'NO_APLICA',
    'Por cada alerta de severidad relevante: procedimiento de respuesta que le correspondía según P-05, si fue apli',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Acciones predeterminadas ejecutadas (R3)  ·  fuente: Active Response (EV-07)
  const campo10 = field(
    'op.mon.1.campo10',
    'Acciones predeterminadas ejecutadas (R3)',
    evidenceStatus('EV-07'),
    'Si P-07 está configurado: acciones automáticas disparadas con la regla de origen, el objetivo, el resultado y',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Puntuación de cumplimiento op.mon.1  ·  fuente: Motor ENSFácil
  const campo11 = field(
    'op.mon.1.campo11',
    'Puntuación de cumplimiento op.mon.1',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.mon.1',

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
    ],
  };
};
