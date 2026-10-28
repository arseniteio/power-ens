import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpCom3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpCom3ReportField {
  id: string;
  title: string;
  status: MpCom3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpCom3ReportModel {
  controlId: string;
  status: MpCom3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpCom3ReportField[];
}

const STATUS_VALUES = new Set<MpCom3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpCom3ReportFieldStatus =>
  STATUS_VALUES.has(value as MpCom3ReportFieldStatus)
    ? (value as MpCom3ReportFieldStatus)
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
  status: MpCom3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpCom3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.com.3 (Protección de la integridad y de la autenticidad).
 * Generated from the "Informe Power ENS" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpCom3ReportModel = (
  result: ENSComplianceResult | undefined,
): MpCom3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpCom3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.com.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11'],
    evidenceObservations('EV-01'),
  );

  // Canales con el exterior del dominio  ·  fuente: Configuración + Log (EV-01)
  const campo2 = field(
    'mp.com.3.campo2',
    'Canales con el exterior del dominio',
    evidenceStatus('EV-01'),
    'Canales de P-01 con su contraparte, mecanismo de autenticación mutua y red de tránsito.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Conformidad criptográfica configurada (R2)  ·  fuente: SCA (EV-02)
  const campo3 = field(
    'mp.com.3.campo3',
    'Conformidad criptográfica configurada (R2)',
    evidenceStatus('EV-02'),
    'Por canal: versiones de protocolo admitidas, suites habilitadas, algoritmos de firma y parámetros de intercambio de claves, contrastados con los autorizados por el CCN en P-02.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Algoritmos efectivamente negociados (R2)  ·  fuente: Log Collection (EV-03)
  const campo4 = field(
    'mp.com.3.campo4',
    'Algoritmos efectivamente negociados (R2)',
    evidenceStatus('EV-03'),
    'Distribución de protocolos y suites realmente negociados en el período frente a los configurados como mínimo.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Ataques activos detectados  ·  fuente: Correlación (EV-04, EV-05, EV-06)
  const campo5 = field(
    'mp.com.3.campo5',
    'Ataques activos detectados',
    evidenceStatus('EV-04'),
    'Por cada uno de los tres tipos que enumera mp.com.3.2: detecciones del período, canal afectado, indicador que las disparó y severidad.',
    ['EV-04', 'EV-05', 'EV-06'],
    evidenceObservations('EV-04'),
  );

  // Activación del procedimiento de incidente  ·  fuente: Log + Power ENS (EV-07)
  const campo6 = field(
    'mp.com.3.campo6',
    'Activación del procedimiento de incidente',
    evidenceStatus('EV-07'),
    'Por cada detección de ataque activo: ticket de incidente asociado, momento de apertura e intervalo.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Cifrado de los canales fuera del dominio (R1)  ·  fuente: SCA + Log (EV-08)
  const campo7 = field(
    'mp.com.3.campo7',
    'Cifrado de los canales fuera del dominio (R1)',
    evidenceStatus('EV-08'),
    'Canales de P-01 que discurren por redes ajenas, con la VPN empleada, su configuración y verificación de que el túnel está activo cuando hay tráfico del canal.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Mecanismos de identificación admitidos  ·  fuente: Log Collection (EV-09)
  const campo8 = field(
    'mp.com.3.campo8',
    'Mecanismos de identificación admitidos',
    evidenceStatus('EV-09'),
    'Mecanismos de P-05 presentados en el período con su resultado.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Integridad de la configuración de los canales  ·  fuente: FIM (EV-10)
  const campo9 = field(
    'mp.com.3.campo9',
    'Integridad de la configuración de los canales',
    evidenceStatus('EV-10'),
    'Cambios detectados en la configuración de los extremos y túneles, con el usuario que los realizó y el diff.',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Dispositivos hardware y productos certificados  ·  fuente: Config. + Power ENS (EV-11)
  const campo10 = field(
    'mp.com.3.campo10',
    'Dispositivos hardware y productos certificados',
    level === 'ALTO'
      ? evidenceStatus('EV-11')
      : 'NO_APLICA',
    'Dispositivos hardware de P-07 empleados en la VPN, con el criterio documentado sobre la tensión de redacción de R3; y productos certificados de P-08 con su referencia y vigencia.',
    ['EV-11'],
    evidenceObservations('EV-11'),
  );

  // Puntuación de cumplimiento mp.com.3  ·  fuente: Motor Power ENS
  const campo11 = field(
    'mp.com.3.campo11',
    'Puntuación de cumplimiento mp.com.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración Power ENS + revisión
  const campo12 = field(
    'mp.com.3.campo12',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.com.3',

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
