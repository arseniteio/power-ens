import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpCom1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpCom1ReportField {
  id: string;
  title: string;
  status: MpCom1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpCom1ReportModel {
  controlId: string;
  status: MpCom1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpCom1ReportField[];
}

const STATUS_VALUES = new Set<MpCom1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpCom1ReportFieldStatus =>
  STATUS_VALUES.has(value as MpCom1ReportFieldStatus)
    ? (value as MpCom1ReportFieldStatus)
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
  status: MpCom1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpCom1ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.com.1 (Perímetro seguro).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpCom1ReportModel = (
  result: ENSComplianceResult | undefined,
): MpCom1ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpCom1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.com.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Elementos perimetrales y continuidad del registro  ·  fuente: Log Collection (EV-01, EV-08)
  const campo2 = field(
    'mp.com.1.campo2',
    'Elementos perimetrales y continuidad del registro',
    evidenceStatus('EV-01'),
    'Elementos de P-01 con el volumen de eventos ingeridos y su continuidad.',
    ['EV-01', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Flujos observados frente a autorizados  ·  fuente: Log + ENSFácil (EV-02)
  const campo3 = field(
    'mp.com.1.campo3',
    'Flujos observados frente a autorizados',
    evidenceStatus('EV-02'),
    'Flujos que atravesaron el perímetro agregados por tupla, con su volumen, contrastados con P-02.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Vías de elusión del perímetro  ·  fuente: Syscollector + Log (EV-03, EV-04, EV-05)
  const campo4 = field(
    'mp.com.1.campo4',
    'Vías de elusión del perímetro',
    evidenceStatus('EV-03'),
    'Interfaces de red no previstas, rutas alternativas, conexiones sin registro en el perímetro y túneles o software de acceso remoto inverso detectados, por sistema.',
    ['EV-03', 'EV-04', 'EV-05'],
    evidenceObservations('EV-03'),
  );

  // Servicios de administración expuestos  ·  fuente: Log Collection (EV-07)
  const campo5 = field(
    'mp.com.1.campo5',
    'Servicios de administración expuestos',
    evidenceStatus('EV-07'),
    'Tráfico entrante desde redes externas hacia puertos de administración, con origen, destino y volumen.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Estado del conjunto de reglas  ·  fuente: Log + ENSFácil (EV-06)
  const campo6 = field(
    'mp.com.1.campo6',
    'Estado del conjunto de reglas',
    evidenceStatus('EV-06'),
    'Flujos autorizados en P-02 sin tráfico observado en el período —candidatos a retirada—, reglas que amparan tráfico desproporcionado respecto a su propósito, y patrones permisivos de P-05 detectados.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Puntuación de cumplimiento mp.com.1  ·  fuente: Motor ENSFácil
  const campo7 = field(
    'mp.com.1.campo7',
    'Puntuación de cumplimiento mp.com.1',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo8 = field(
    'mp.com.1.campo8',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.com.1',

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
    ],
  };
};
