import type { ENSComplianceResult } from '../core';

export type OpExp4ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp4ReportField {
  id: string;
  title: string;
  status: OpExp4ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp4ReportModel {
  controlId: string;
  status: OpExp4ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp4ReportField[];
}

const STATUS_VALUES = new Set<OpExp4ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp4ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp4ReportFieldStatus)
    ? (value as OpExp4ReportFieldStatus)
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
  status: OpExp4ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp4ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.4 (Mantenimiento y actualizaciones de seguridad).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp4ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp4ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp4ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.4.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11'],
    evidenceObservations('EV-01'),
  );

  // Vulnerabilidades abiertas por criticidad  ·  fuente: Vulnerability Detector (EV-01)
  const campo2 = field(
    'op.exp.4.campo2',
    'Vulnerabilidades abiertas por criticidad',
    evidenceStatus('EV-01'),
    'Recuento de vulnerabilidades detectadas y abiertas al cierre del período, desglosadas por criticidad (crítica,',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Cumplimiento de los plazos de remediación  ·  fuente: ENSFácil (EV-02)
  const campo3 = field(
    'op.exp.4.campo3',
    'Cumplimiento de los plazos de remediación',
    evidenceStatus('EV-02'),
    'Por cada nivel de criticidad: plazo exigido según P-01, tiempo medio real de remediación en el período, número',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Evolución de la deuda de vulnerabilidades  ·  fuente: ENSFácil (EV-10)
  const campo4 = field(
    'op.exp.4.campo4',
    'Evolución de la deuda de vulnerabilidades',
    evidenceStatus('EV-10'),
    'Serie temporal de vulnerabilidades abiertas por criticidad y del tiempo medio de remediación. Tendencia: si la',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Estado de parcheado del parque  ·  fuente: Syscollector (EV-03)
  const campo5 = field(
    'op.exp.4.campo5',
    'Estado de parcheado del parque',
    evidenceStatus('EV-03'),
    'Nivel de actualización por activo: última actualización aplicada, días desde la última, y comparación con la m',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Software fuera de soporte  ·  fuente: Syscollector + ENSFácil (EV-05)
  const campo6 = field(
    'op.exp.4.campo6',
    'Software fuera de soporte',
    evidenceStatus('EV-05'),
    'Productos instalados que han alcanzado el fin de soporte del fabricante, con activo, versión y fecha de fin de',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Cobertura del seguimiento de anuncios de defectos  ·  fuente: ENSFácil (EV-06)
  const campo7 = field(
    'op.exp.4.campo7',
    'Cobertura del seguimiento de anuncios de defectos',
    evidenceStatus('EV-06'),
    'Fabricantes y productos presentes en el inventario, con indicación de si están cubiertos por alguna fuente de',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Intervenciones de mantenimiento  ·  fuente: Syscollector + Log (EV-04, EV-07)
  const campo8 = field(
    'op.exp.4.campo8',
    'Intervenciones de mantenimiento',
    evidenceStatus('EV-04'),
    'Registro de instalaciones, actualizaciones y desinstalaciones del período con el actor que las ejecutó y la ma',
    ['EV-04', 'EV-07'],
    evidenceObservations('EV-04'),
  );

  // Trazabilidad de paso por preproducción (R1)  ·  fuente: ENSFácil (EV-08)
  const campo9 = field(
    'op.exp.4.campo9',
    'Trazabilidad de paso por preproducción (R1)',
    evidenceStatus('EV-08'),
    'Por cada versión desplegada en producción en el período: si consta su instalación previa en el sistema de prep',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Puntos de reversión previos a cada cambio (R2)  ·  fuente: FIM + Log (EV-09)
  const campo10 = field(
    'op.exp.4.campo10',
    'Puntos de reversión previos a cada cambio (R2)',
    evidenceStatus('EV-09'),
    'Por cada aplicación de parches o cambio de configuración en el período: si consta la creación previa del mecan',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Firmware de dispositivos hardware (R3)  ·  fuente: Syscollector + ENSFácil (EV-11)
  const campo11 = field(
    'op.exp.4.campo11',
    'Firmware de dispositivos hardware (R3)',
    evidenceStatus('EV-11'),
    'Si P-09 está configurado: versiones de firmware de los dispositivos declarados, antigüedad, y si existen versi',
    ['EV-11'],
    evidenceObservations('EV-11'),
  );

  // Estrategia de monitorización continua (R4)  ·  fuente: Vulnerability Detector (EV-01, EV-10)
  const campo12 = field(
    'op.exp.4.campo12',
    'Estrategia de monitorización continua (R4)',
    evidenceStatus('EV-01'),
    'Acreditación de facto del Refuerzo R4, no exigible pero cubierto por Wazuh: indicadores críticos de seguridad',
    ['EV-01', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Puntuación de cumplimiento op.exp.4  ·  fuente: Motor ENSFácil
  const campo13 = field(
    'op.exp.4.campo13',
    'Puntuación de cumplimiento op.exp.4',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.4',

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
