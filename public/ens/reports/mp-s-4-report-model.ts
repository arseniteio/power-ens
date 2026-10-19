import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpS4ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpS4ReportField {
  id: string;
  title: string;
  status: MpS4ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpS4ReportModel {
  controlId: string;
  status: MpS4ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpS4ReportField[];
}

const STATUS_VALUES = new Set<MpS4ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpS4ReportFieldStatus =>
  STATUS_VALUES.has(value as MpS4ReportFieldStatus)
    ? (value as MpS4ReportFieldStatus)
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
  status: MpS4ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpS4ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.s.4 (Protección frente a la denegación de servicio).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpS4ReportModel = (
  result: ENSComplianceResult | undefined,
): MpS4ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpS4ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.s.4.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Carga y holgura de los servicios  ·  fuente: Log + ENSFácil (EV-01)
  const campo2 = field(
    'mp.s.4.campo2',
    'Carga y holgura de los servicios',
    evidenceStatus('EV-01'),
    'Por servicio de P-01: carga media y de punta observada, capacidad dotada según P-02, utilización en percentiles y margen de holgura efectivo. Servicios operando sin holgura destacados aunque nunca hayan caído, porque es lo que mp.s.4.1 exige.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Tecnologías de prevención desplegadas  ·  fuente: SCA + Syscollector (EV-02)
  const campo3 = field(
    'mp.s.4.campo3',
    'Tecnologías de prevención desplegadas',
    evidenceStatus('EV-02'),
    'Tecnologías de P-03 con su ubicación y estado: las verificables desde el sistema con el resultado de sus checks, y las que operan en el proveedor recogidas como declaración. Acredita mp.s.4.2.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Episodios detectados en el período  ·  fuente: Correlación (EV-03)
  const campo4 = field(
    'mp.s.4.campo4',
    'Episodios detectados en el período',
    level === 'ALTO'
      ? evidenceStatus('EV-03')
      : 'NO_APLICA',
    'Episodios compatibles con denegación de servicio con fecha, servicio afectado, vector, indicador que disparó la detección y duración. Distinguiendo el patrón volumétrico del de agotamiento de recursos.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Impacto en la disponibilidad  ·  fuente: Log + ENSFácil (EV-04)
  const campo5 = field(
    'mp.s.4.campo5',
    'Impacto en la disponibilidad',
    evidenceStatus('EV-04'),
    'Por episodio: tiempo de indisponibilidad total o parcial, degradación del tiempo de respuesta y tasa de error frente a la línea base de P-07. Contraste con la disponibilidad comprometida en P-01.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Caracterización técnica de los episodios  ·  fuente: Log Collection (EV-05)
  const campo6 = field(
    'mp.s.4.campo6',
    'Caracterización técnica de los episodios',
    level === 'ALTO'
      ? evidenceStatus('EV-05')
      : 'NO_APLICA',
    'Datos del ataque que el proveedor necesita para mitigar: rangos de origen ordenados por volumen, protocolos y puertos, vector y distribución temporal. Resumen exportable para la comunicación de mp.s.4.r1.2.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Activación del procedimiento de reacción  ·  fuente: Log + ENSFácil (EV-06)
  const campo7 = field(
    'mp.s.4.campo7',
    'Activación del procedimiento de reacción',
    level === 'ALTO'
      ? evidenceStatus('EV-06')
      : 'NO_APLICA',
    'Por episodio: acciones de P-05 ejecutadas con sus tiempos, apertura del incidente en op.exp.7 y comunicación al proveedor de P-06 con su plazo. Relación de episodios sin activación del procedimiento.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Contención automática aplicada  ·  fuente: Active Response (EV-07)
  const campo8 = field(
    'mp.s.4.campo8',
    'Contención automática aplicada',
    level === 'ALTO'
      ? evidenceStatus('EV-07')
      : 'NO_APLICA',
    'Acciones automáticas ejecutadas con su disparador, objetivo, resultado y reversión. Apartado con nota de prudencia: un bloqueo mal calibrado ante un pico legítimo causa la indisponibilidad que se quiere evitar.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Ataques salientes desde las propias instalaciones (R2)  ·  fuente: Correlación (EV-08, EV-09)
  const campo9 = field(
    'mp.s.4.campo9',
    'Ataques salientes desde las propias instalaciones (R2)',
    evidenceStatus('EV-08'),
    'Tráfico saliente anómalo y equipos con patrones compatibles con participación en ataques a terceros; y servicios propios expuestos utilizables como amplificadores con su configuración. Acredita R2, no exigible en ningún nivel pero el mejor cubierto por la plataforma.',
    ['EV-08', 'EV-09'],
    evidenceObservations('EV-08'),
  );

  // Histórico y evolución de episodios  ·  fuente: Log + ENSFácil (EV-10)
  const campo10 = field(
    'mp.s.4.campo10',
    'Histórico y evolución de episodios',
    evidenceStatus('EV-10'),
    'Serie de episodios por período con su frecuencia e impacto, y valoración de si la capacidad de P-02 y las tecnologías de P-03 siguen siendo adecuadas a la amenaza observada.',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Puntuación de cumplimiento mp.s.4  ·  fuente: Motor ENSFácil
  const campo11 = field(
    'mp.s.4.campo11',
    'Puntuación de cumplimiento mp.s.4',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo12 = field(
    'mp.s.4.campo12',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.s.4',

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
