import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpEq2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpEq2ReportField {
  id: string;
  title: string;
  status: MpEq2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpEq2ReportModel {
  controlId: string;
  status: MpEq2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpEq2ReportField[];
}

const STATUS_VALUES = new Set<MpEq2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpEq2ReportFieldStatus =>
  STATUS_VALUES.has(value as MpEq2ReportFieldStatus)
    ? (value as MpEq2ReportFieldStatus)
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
  status: MpEq2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpEq2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.eq.2 (Bloqueo de puesto de trabajo).
 * Generated from the "Informe Power ENS" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpEq2ReportModel = (
  result: ENSComplianceResult | undefined,
): MpEq2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpEq2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.eq.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
    evidenceObservations('EV-01'),
  );

  // Conformidad de la política de bloqueo  ·  fuente: SCA (EV-01)
  const campo2 = field(
    'mp.eq.2.campo2',
    'Conformidad de la política de bloqueo',
    evidenceStatus('EV-01'),
    'Por equipo: bloqueo activo, temporizador configurado frente a P-01, y si el desbloqueo exige credenciales.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Política de cancelación de sesiones (R1)  ·  fuente: SCA (EV-02)
  const campo3 = field(
    'mp.eq.2.campo3',
    'Política de cancelación de sesiones (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-02')
      : 'NO_APLICA',
    'Por equipo: límite de sesión configurado, contraste con P-02 y validación de coherencia con P-01.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Bloqueos efectivamente producidos  ·  fuente: Log Collection (EV-03)
  const campo4 = field(
    'mp.eq.2.campo4',
    'Bloqueos efectivamente producidos',
    evidenceStatus('EV-03'),
    'Número de eventos de bloqueo y desbloqueo por equipo en el período, con la frecuencia media.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Sesiones de larga duración sin bloqueo  ·  fuente: Correlación (EV-04)
  const campo5 = field(
    'mp.eq.2.campo5',
    'Sesiones de larga duración sin bloqueo',
    evidenceStatus('EV-04'),
    'Sesiones que superaron P-02 minutos sin evento de bloqueo ni cierre, con el equipo, el usuario y la duración.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Herramientas de inhibición detectadas  ·  fuente: Syscollector (EV-05)
  const campo6 = field(
    'mp.eq.2.campo6',
    'Herramientas de inhibición detectadas',
    evidenceStatus('EV-05'),
    'Equipos en los que se ha detectado la presencia o ejecución de utilidades que simulan actividad para evitar el bloqueo, con el usuario asociado.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Cobertura del control  ·  fuente: SCA + Power ENS (EV-06)
  const campo7 = field(
    'mp.eq.2.campo7',
    'Cobertura del control',
    evidenceStatus('EV-06'),
    'Equipos del alcance P-03 con política verificada, equipos sin monitorizar y excepciones autorizadas de P-04 presentadas por separado con su justificación y aprobación.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Puntuación de cumplimiento mp.eq.2  ·  fuente: Motor Power ENS
  const campo8 = field(
    'mp.eq.2.campo8',
    'Puntuación de cumplimiento mp.eq.2',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración Power ENS + revisión
  const campo9 = field(
    'mp.eq.2.campo9',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.eq.2',

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
    ],
  };
};
