import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpCom4ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpCom4ReportField {
  id: string;
  title: string;
  status: MpCom4ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpCom4ReportModel {
  controlId: string;
  status: MpCom4ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpCom4ReportField[];
}

const STATUS_VALUES = new Set<MpCom4ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpCom4ReportFieldStatus =>
  STATUS_VALUES.has(value as MpCom4ReportFieldStatus)
    ? (value as MpCom4ReportFieldStatus)
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
  status: MpCom4ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpCom4ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.com.4 (Separación de flujos de información en la red).
 * Generated from the "Informe Power ENS" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpCom4ReportModel = (
  result: ENSComplianceResult | undefined,
): MpCom4ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpCom4ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.com.4.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Modalidad de segmentación y su admisibilidad  ·  fuente: SCA + Syscollector (EV-07)
  const campo2 = field(
    'mp.com.4.campo2',
    'Modalidad de segmentación y su admisibilidad',
    evidenceStatus('EV-07'),
    'Forma de segmentación declarada en P-03, verificación de su implementación efectiva y comprobación de que es admisible para la categoría del sistema.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Mapa de segmentos y segregación mínima  ·  fuente: Syscollector + Power ENS (EV-08)
  const campo3 = field(
    'mp.com.4.campo3',
    'Mapa de segmentos y segregación mínima',
    evidenceStatus('EV-08'),
    'Segmentos de P-01 con los equipos detectados en cada uno, y verificación de que existen al menos usuarios, servicios y administración.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Matriz de tráfico observado entre segmentos  ·  fuente: Log + Power ENS (EV-01)
  const campo4 = field(
    'mp.com.4.campo4',
    'Matriz de tráfico observado entre segmentos',
    evidenceStatus('EV-01'),
    'Matriz de los flujos efectivamente observados entre cada par de segmentos, con volumen y protocolos, presentada junto a la matriz autorizada de P-02 para comparación directa.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Fugas de segmentación  ·  fuente: Correlación (EV-02)
  const campo5 = field(
    'mp.com.4.campo5',
    'Fugas de segmentación',
    evidenceStatus('EV-02'),
    'Flujos entre segmentos no autorizados, con origen, destino, protocolo, volumen y frecuencia.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Equipos puente entre segmentos  ·  fuente: Syscollector + Power ENS (EV-03)
  const campo6 = field(
    'mp.com.4.campo6',
    'Equipos puente entre segmentos',
    evidenceStatus('EV-03'),
    'Sistemas con interfaces en más de un segmento, distinguiendo los puntos de interconexión declarados en P-05 de los puentes accidentales, que anulan la separación sin autorización alguna.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Separación de las comunicaciones inalámbricas  ·  fuente: Log + Power ENS (EV-04)
  const campo7 = field(
    'mp.com.4.campo7',
    'Separación de las comunicaciones inalámbricas',
    evidenceStatus('EV-04'),
    'Por cada SSID de P-04: segmento asignado, aislamiento entre clientes y destinos efectivamente alcanzados frente a los autorizados. mp.com.4.2 es taxativo, de modo que este apartado es de cumplimiento binario.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Puntos de interconexión (R4)  ·  fuente: Log Collection (EV-05)
  const campo8 = field(
    'mp.com.4.campo8',
    'Puntos de interconexión (R4)',
    level === 'ALTO'
      ? evidenceStatus('EV-05')
      : 'NO_APLICA',
    'Por cada punto de P-05: elemento que lo controla, volumen de registros ingeridos, continuidad y conexiones aceptadas y denegadas entre los segmentos que une.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Control de entrada de usuarios por segmento (R4)  ·  fuente: Log + Correlación (EV-06)
  const campo9 = field(
    'mp.com.4.campo9',
    'Control de entrada de usuarios por segmento (R4)',
    level === 'ALTO'
      ? evidenceStatus('EV-06')
      : 'NO_APLICA',
    'Asignaciones de segmento por usuario frente a los criterios de P-06, con relación de usuarios ubicados en segmentos que no les corresponden según su identidad.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Encapsulamiento de incidentes  ·  fuente: Log + Power ENS (EV-09)
  const campo10 = field(
    'mp.com.4.campo10',
    'Encapsulamiento de incidentes',
    evidenceStatus('EV-09'),
    'Alertas de seguridad distribuidas por segmento y detección de propagación entre ellos.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Vigencia de la matriz de flujos  ·  fuente: Log + Power ENS (EV-10)
  const campo11 = field(
    'mp.com.4.campo11',
    'Vigencia de la matriz de flujos',
    evidenceStatus('EV-10'),
    'Flujos autorizados sin tráfico observado, candidatos a retirada; flujos observados no previstos; y fecha de la última revisión frente a P-07.',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Puntuación de cumplimiento mp.com.4  ·  fuente: Motor Power ENS
  const campo12 = field(
    'mp.com.4.campo12',
    'Puntuación de cumplimiento mp.com.4',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración Power ENS + revisión
  const campo13 = field(
    'mp.com.4.campo13',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.com.4',

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
