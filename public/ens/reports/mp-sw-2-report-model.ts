import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpSw2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpSw2ReportField {
  id: string;
  title: string;
  status: MpSw2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpSw2ReportModel {
  controlId: string;
  status: MpSw2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpSw2ReportField[];
}

const STATUS_VALUES = new Set<MpSw2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpSw2ReportFieldStatus =>
  STATUS_VALUES.has(value as MpSw2ReportFieldStatus)
    ? (value as MpSw2ReportFieldStatus)
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
  status: MpSw2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpSw2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.sw.2 (Aceptación y puesta en servicio).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpSw2ReportModel = (
  result: ENSComplianceResult | undefined,
): MpSw2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpSw2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.sw.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Puestas en servicio del período  ·  fuente: Syscollector + ENSFácil (EV-01)
  const campo2 = field(
    'mp.sw.2.campo2',
    'Puestas en servicio del período',
    evidenceStatus('EV-01'),
    'Aplicaciones y versiones que entraron en producción, con fecha, sistemas afectados y responsable.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Aceptación previa acreditada  ·  fuente: ENSFácil (EV-02)
  const campo3 = field(
    'mp.sw.2.campo3',
    'Aceptación previa acreditada',
    evidenceStatus('EV-02'),
    'Por cada puesta en servicio: acta de aceptación de P-07 asociada, su fecha y quién aceptó.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Criterios de aceptación verificados  ·  fuente: SCA + ENSFácil (EV-06)
  const campo4 = field(
    'mp.sw.2.campo4',
    'Criterios de aceptación verificados',
    evidenceStatus('EV-06'),
    'Por criterio de P-02: resultado de la verificación automática cuando sea posible, o constancia de declaración cuando no lo sea.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Diferencial de seguridad del entorno  ·  fuente: SCA + Syscollector (EV-03)
  const campo5 = field(
    'mp.sw.2.campo5',
    'Diferencial de seguridad del entorno',
    evidenceStatus('EV-03'),
    'Por cada despliegue: cumplimiento SCA, puertos, servicios y vulnerabilidades antes y después de la ventana de P-04, con la variación y su contraste con P-05.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Exposición introducida  ·  fuente: Syscollector (EV-04)
  const campo6 = field(
    'mp.sw.2.campo6',
    'Exposición introducida',
    evidenceStatus('EV-04'),
    'Puertos y servicios nuevos tras cada despliegue, distinguiendo los previstos en P-06 de los inesperados.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Vulnerabilidades introducidas  ·  fuente: Vuln. Detector (EV-05)
  const campo7 = field(
    'mp.sw.2.campo7',
    'Vulnerabilidades introducidas',
    evidenceStatus('EV-05'),
    'CVE que aparecen tras el despliegue con su severidad, componente afectado y si proviene de la aplicación o de sus dependencias de terceros.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Estabilidad posterior al despliegue  ·  fuente: Log + Correlación (EV-09)
  const campo8 = field(
    'mp.sw.2.campo8',
    'Estabilidad posterior al despliegue',
    evidenceStatus('EV-09'),
    'Tasa de errores y disponibilidad en la ventana posterior frente a la línea base previa, con las desviaciones significativas y la acción correctiva aplicada si la hubo.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Paso por preproducción (R1)  ·  fuente: Syscollector (EV-07)
  const campo9 = field(
    'mp.sw.2.campo9',
    'Paso por preproducción (R1)',
    evidenceStatus('EV-07'),
    'Por versión desplegada: si consta su instalación previa en el par de preproducción de P-03, con las fechas de ambas.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Aislamiento del entorno de preproducción (R1)  ·  fuente: Syscollector + SCA (EV-08)
  const campo10 = field(
    'mp.sw.2.campo10',
    'Aislamiento del entorno de preproducción (R1)',
    evidenceStatus('EV-08'),
    'Verificación del aislamiento efectivo: interfaces y rutas de los sistemas de preproducción, y tráfico observado entre los rangos de preproducción y producción.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Auditoría de código fuente (R2)  ·  fuente: ENSFácil (EV-10)
  const campo11 = field(
    'mp.sw.2.campo11',
    'Auditoría de código fuente (R2)',
    evidenceStatus('EV-10'),
    'Si P-08 está cumplimentado: auditorías realizadas con fecha, metodología, hallazgos y estado de cierre, con el cruce frente a las vulnerabilidades observables en producción.',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Puntuación de cumplimiento mp.sw.2  ·  fuente: Motor ENSFácil
  const campo12 = field(
    'mp.sw.2.campo12',
    'Puntuación de cumplimiento mp.sw.2',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo13 = field(
    'mp.sw.2.campo13',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.sw.2',

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
