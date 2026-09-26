import type { ENSComplianceResult } from '../core';

export type OpExp6ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp6ReportField {
  id: string;
  title: string;
  status: OpExp6ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp6ReportModel {
  controlId: string;
  status: OpExp6ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp6ReportField[];
}

const STATUS_VALUES = new Set<OpExp6ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp6ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp6ReportFieldStatus)
    ? (value as OpExp6ReportFieldStatus)
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
  status: OpExp6ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp6ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.6 (Protección frente a código dañino).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp6ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp6ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp6ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.6.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  // Cobertura del antimalware  ·  fuente: Syscollector + SCA (EV-01)
  const campo2 = field(
    'op.exp.6.campo2',
    'Cobertura del antimalware',
    evidenceStatus('EV-01'),
    'Por cada equipo de P-02: producto instalado, versión, estado del servicio y fecha de último contacto. Porcenta',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Estado de actualización de firmas  ·  fuente: Log + SCA (EV-02)
  const campo3 = field(
    'op.exp.6.campo3',
    'Estado de actualización de firmas',
    evidenceStatus('EV-02'),
    'Antigüedad de las bases de datos de detección por equipo, con el umbral P-03 como referencia. Relación de equi',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Configuración y protección en tiempo real  ·  fuente: SCA (EV-03)
  const campo4 = field(
    'op.exp.6.campo4',
    'Configuración y protección en tiempo real',
    evidenceStatus('EV-03'),
    'Por equipo: estado de cada ajuste de P-04. Relación destacada de equipos con protección en tiempo real desacti',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Detecciones del período  ·  fuente: Log Collection (EV-04)
  const campo5 = field(
    'op.exp.6.campo5',
    'Detecciones del período',
    evidenceStatus('EV-04'),
    'Todas las detecciones registradas: equipo, fichero o proceso, amenaza identificada, acción aplicada y resultad',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Análisis de ficheros externos y dispositivos extraíbles  ·  fuente: Log Collection (EV-12)
  const campo6 = field(
    'op.exp.6.campo6',
    'Análisis de ficheros externos y dispositivos extraíbles',
    evidenceStatus('EV-12'),
    'Por cada vía de P-05: volumen de ficheros analizados y detecciones producidas. Conexiones de dispositivos extr',
    ['EV-12'],
    evidenceObservations('EV-12'),
  );

  // Escaneo periódico completo (R1)  ·  fuente: Log + ENSFácil (EV-05)
  const campo7 = field(
    'op.exp.6.campo7',
    'Escaneo periódico completo (R1)',
    evidenceStatus('EV-05'),
    'Fecha del último escaneo completo por equipo, días transcurridos y contraste con P-06. Relación de equipos fue',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Integridad de funciones críticas (R2)  ·  fuente: FIM + Rootcheck (EV-06)
  const campo8 = field(
    'op.exp.6.campo8',
    'Integridad de funciones críticas (R2)',
    evidenceStatus('EV-06'),
    'Resultado de la verificación de los componentes de P-07: equipos conformes, desviaciones de hash detectadas co',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Lista blanca de aplicaciones (R3)  ·  fuente: Log + SCA (EV-07)
  const campo9 = field(
    'op.exp.6.campo9',
    'Lista blanca de aplicaciones (R3)',
    level === 'ALTO'
      ? evidenceStatus('EV-07')
      : 'NO_APLICA',
    'Estado del mecanismo de lista blanca por equipo: política aplicada, modo (aplicación o auditoría) y número de',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Capacidad EDR desplegada (R4)  ·  fuente: VirusTotal, YARA, Rootcheck, Active Response (EV-08 a EV-11)
  const campo10 = field(
    'op.exp.6.campo10',
    'Capacidad EDR desplegada (R4)',
    level === 'ALTO'
      ? evidenceStatus('EV-08')
      : 'NO_APLICA',
    'Acreditación del Refuerzo R4 con el detalle de capacidades activas: consultas reputacionales realizadas y dete',
    ['EV-08', 'EV-09', 'EV-10', 'EV-11'],
    evidenceObservations('EV-08'),
  );

  // Actividad sospechosa no detectada por el antimalware  ·  fuente: Rootcheck + ATT&CK (EV-10)
  const campo11 = field(
    'op.exp.6.campo11',
    'Actividad sospechosa no detectada por el antimalware',
    evidenceStatus('EV-10'),
    'Comportamientos compatibles con código dañino identificados por Wazuh que el antimalware del cliente no detect',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Puntuación de cumplimiento op.exp.6  ·  fuente: Motor ENSFácil
  const campo12 = field(
    'op.exp.6.campo12',
    'Puntuación de cumplimiento op.exp.6',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.6',

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
    ],
  };
};
