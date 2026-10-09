import type { ENSComplianceResult } from '../core';

export type OpMon3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpMon3ReportField {
  id: string;
  title: string;
  status: OpMon3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpMon3ReportModel {
  controlId: string;
  status: OpMon3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpMon3ReportField[];
}

const STATUS_VALUES = new Set<OpMon3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpMon3ReportFieldStatus =>
  STATUS_VALUES.has(value as OpMon3ReportFieldStatus)
    ? (value as OpMon3ReportFieldStatus)
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
  status: OpMon3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpMon3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.mon.3 (Vigilancia).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpMon3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpMon3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpMon3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.mon.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13'],
    evidenceObservations('EV-01'),
  );

  // Recolección de eventos de seguridad  ·  fuente: Log Collection (EV-01, EV-02)
  const campo2 = field(
    'op.mon.3.campo2',
    'Recolección de eventos de seguridad',
    evidenceStatus('EV-01'),
    'Fuentes de P-01 con su volumen de eventos ingeridos, método de recolección y estado. Porcentaje de fuentes activas, cobertura temporal efectiva y relación de lagunas detectadas con las fechas afectadas.',
    ['EV-01', 'EV-02'],
    evidenceObservations('EV-01'),
  );

  // Capacidad de correlación (R1)  ·  fuente: Correlación + ATT&CK (EV-03)
  const campo3 = field(
    'op.mon.3.campo3',
    'Capacidad de correlación (R1)',
    evidenceStatus('EV-03'),
    'Inventario de reglas de correlación activas, distinguiendo las de detección simple de las que combinan varios eventos. Técnicas MITRE ATT&CK cubiertas y detecciones producidas por correlación en el período. La distinción importa porque R1 exige específicamente correlación.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Superficie de exposición (R2)  ·  fuente: Vuln. Detector + SCA (EV-04)
  const campo4 = field(
    'op.mon.3.campo4',
    'Superficie de exposición (R2)',
    evidenceStatus('EV-04'),
    'Indicador de superficie de exposición por activo y global, con sus dos componentes separados: vulnerabilidades conocidas y deficiencias de configuración. Evolución en el período y activos con mayor exposición. Atención especial a los expuestos a redes no controladas.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Comportamientos anómalos detectados (R3.1)  ·  fuente: Correlación (EV-05)
  const campo5 = field(
    'op.mon.3.campo5',
    'Comportamientos anómalos detectados (R3.1)',
    level === 'ALTO'
      ? evidenceStatus('EV-05')
      : 'NO_APLICA',
    'Anomalías identificadas respecto a la línea base de P-04: tipo de desviación, usuario o sistema implicado, magnitud y si derivó en incidente. Estado de validación de la línea base, porque una línea base no validada produce ruido o silencio, ambos inútiles.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Detección de APT por tráfico de red (R3.2)  ·  fuente: Log + Correlación (EV-06)
  const campo6 = field(
    'op.mon.3.campo6',
    'Detección de APT por tráfico de red (R3.2)',
    level === 'ALTO'
      ? evidenceStatus('EV-06')
      : 'NO_APLICA',
    'Si P-05 está desplegado: eventos de la sonda ingeridos, anomalías de tráfico detectadas y correlaciones establecidas con actividad de host. Si no lo está: declaración expresa de que el refuerzo NO está cubierto y que requiere componente externo, no configuración adicional.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Observatorio digital (R4)  ·  fuente: CDB lists (EV-07)
  const campo7 = field(
    'op.mon.3.campo7',
    'Observatorio digital (R4)',
    level === 'ALTO'
      ? evidenceStatus('EV-07')
      : 'NO_APLICA',
    'Si P-06 está contratado: indicadores recibidos del servicio, incorporados a listas de detección, y coincidencias producidas. Si no: declaración expresa de que el refuerzo NO está cubierto y que corresponde a un servicio de cibervigilancia externo, fuera del alcance de la plataforma.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Vigilancia de minería de datos (R5)  ·  fuente: Correlación (EV-08, EV-09)
  const campo8 = field(
    'op.mon.3.campo8',
    'Vigilancia de minería de datos (R5)',
    level === 'ALTO'
      ? evidenceStatus('EV-08')
      : 'NO_APLICA',
    'Consultas monitorizadas por sistema y perfil frente a los umbrales de P-07, superaciones detectadas con el usuario implicado, y verificación de que generaron alerta en tiempo real a los destinatarios de P-08 con la latencia medida.',
    ['EV-08', 'EV-09'],
    evidenceObservations('EV-08'),
  );

  // Inspecciones de seguridad realizadas (R6)  ·  fuente: SCA + Vuln. Detector + ENSFácil (EV-10 a EV-12)
  const campo9 = field(
    'op.mon.3.campo9',
    'Inspecciones de seguridad realizadas (R6)',
    level === 'ALTO'
      ? evidenceStatus('EV-10')
      : 'NO_APLICA',
    'Por cada una de las tres inspecciones: periodicidad exigida en P-09, última realización, ejecutor y hallazgos. Verificación de configuración y análisis de vulnerabilidades constan como continuos; pruebas de penetración con su fecha, proveedor y estado de remediación de sus hallazgos.',
    ['EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-10'),
  );

  // Inspecciones tras incidentes (R6)  ·  fuente: ENSFácil (EV-13)
  const campo10 = field(
    'op.mon.3.campo10',
    'Inspecciones tras incidentes (R6)',
    level === 'ALTO'
      ? evidenceStatus('EV-13')
      : 'NO_APLICA',
    'Incidentes del período que revelaron vulnerabilidades nuevas o subestimadas, con indicación de si se realizó la inspección posterior que R6 exige y en qué plazo.',
    ['EV-13'],
    evidenceObservations('EV-13'),
  );

  // Puntuación de cumplimiento op.mon.3  ·  fuente: Motor ENSFácil
  const campo11 = field(
    'op.mon.3.campo11',
    'Puntuación de cumplimiento op.mon.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.mon.3',

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
