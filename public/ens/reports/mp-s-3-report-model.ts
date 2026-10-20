import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpS3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpS3ReportField {
  id: string;
  title: string;
  status: MpS3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpS3ReportModel {
  controlId: string;
  status: MpS3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpS3ReportField[];
}

const STATUS_VALUES = new Set<MpS3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpS3ReportFieldStatus =>
  STATUS_VALUES.has(value as MpS3ReportFieldStatus)
    ? (value as MpS3ReportFieldStatus)
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
  status: MpS3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpS3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.s.3 (Protección de la navegación web).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpS3ReportModel = (
  result: ENSComplianceResult | undefined,
): MpS3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpS3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.s.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  // Normativa, concienciación y formación  ·  fuente: ENSFácil (EV-12)
  const campo2 = field(
    'mp.s.3.campo2',
    'Normativa, concienciación y formación',
    evidenceStatus('EV-12'),
    'Referencia de la normativa de P-01 con su difusión y régimen de conexiones cifradas; actividades de concienciación de P-06; y formación de administradores de P-07. Los tres presentados por separado, porque mp.s.3.2 y mp.s.3.3 son requisitos distintos y uno suele quedar sin acreditar.',
    ['EV-12'],
    evidenceObservations('EV-12'),
  );

  // Volumen y resultado del filtrado de navegación  ·  fuente: Log Collection (EV-01, EV-02)
  const campo3 = field(
    'mp.s.3.campo3',
    'Volumen y resultado del filtrado de navegación',
    evidenceStatus('EV-01'),
    'Peticiones procesadas, permitidas y bloqueadas, desglosadas por categoría de P-03, con su evolución. Categorías declaradas sin bloqueos registrados señaladas para revisión, porque suelen indicar filtro mal aplicado y no ausencia de intentos.',
    ['EV-01', 'EV-02'],
    evidenceObservations('EV-01'),
  );

  // Accesos a destinos de reputación maliciosa  ·  fuente: Correlación (EV-04)
  const campo4 = field(
    'mp.s.3.campo4',
    'Accesos a destinos de reputación maliciosa',
    evidenceStatus('EV-04'),
    'Accesos e intentos hacia destinos maliciosos con el usuario y el puesto, distinguiendo los bloqueados de los permitidos. Los permitidos con actividad posterior anómala en el puesto se escalan como posible compromiso y enlazan con op.exp.7.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Descargas de código ejecutable y contenido activo  ·  fuente: Log Collection (EV-03)
  const campo5 = field(
    'mp.s.3.campo5',
    'Descargas de código ejecutable y contenido activo',
    evidenceStatus('EV-03'),
    'Descargas bloqueadas por tipo de contenido y relación de las permitidas que correspondían a tipos declarados bloqueados. Atención a comprimidos y extensiones alteradas, que son la vía de evasión habitual.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Protección de la resolución de nombres  ·  fuente: Log + SCA (EV-05)
  const campo6 = field(
    'mp.s.3.campo6',
    'Protección de la resolución de nombres',
    evidenceStatus('EV-05'),
    'Conformidad de la configuración de resolución en los puestos y detección de consultas a resolutores no autorizados o por canales alternativos. Acredita mp.s.3.4 y cierra una vía frecuente de evasión.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Evasión del control de navegación  ·  fuente: Log + ENSFácil (EV-11)
  const campo7 = field(
    'mp.s.3.campo7',
    'Evasión del control de navegación',
    evidenceStatus('EV-11'),
    'Tráfico web observado en el perímetro sin registro correspondiente en el proxy, túneles y servicios de anonimización detectados, por puesto y usuario. Enlaza con mp.com.1: es la misma comprobación de que todo el tráfico atraviesa el sistema previsto.',
    ['EV-11'],
    evidenceObservations('EV-11'),
  );

  // Protección del puesto frente a la navegación  ·  fuente: Syscollector + SCA (EV-06)
  const campo8 = field(
    'mp.s.3.campo8',
    'Protección del puesto frente a la navegación',
    evidenceStatus('EV-06'),
    'Estado de las políticas del navegador gestionado por puesto, extensiones instaladas con las no autorizadas destacadas, y defensas del puesto frente a spyware y ransomware.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Política de control de cookies  ·  fuente: SCA (EV-07)
  const campo9 = field(
    'mp.s.3.campo9',
    'Política de control de cookies',
    evidenceStatus('EV-07'),
    'Conformidad de la configuración de cookies con P-05 por puesto: aislamiento de perfiles, cookies de terceros, sincronización con cuentas no corporativas. Acredita mp.s.3.7, requisito peculiar del ENS y de los más olvidados.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Registro del uso de la navegación (R1)  ·  fuente: Log + ENSFácil (EV-08)
  const campo10 = field(
    'mp.s.3.campo10',
    'Registro del uso de la navegación (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-08')
      : 'NO_APLICA',
    'Elementos efectivamente registrados frente a los declarados en P-08, retención efectiva frente a la declarada, y uso previsto. Los tres extremos que el refuerzo exige declarar, con verificación de que la práctica coincide con la declaración.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Inspección de canales cifrados (R1)  ·  fuente: Log + ENSFácil (EV-09)
  const campo11 = field(
    'mp.s.3.campo11',
    'Inspección de canales cifrados (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-09')
      : 'NO_APLICA',
    'Declaraciones de P-09 —qué se analiza, qué se registra, retención y uso previsto—, relación de destinos de confianza excluidos, y verificación de que la inspección respeta esas exclusiones. Apartado con aviso destacado por sus implicaciones más allá del ENS.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Lista negra de destinos vetados (R1)  ·  fuente: Log + CDB lists (EV-10)
  const campo12 = field(
    'mp.s.3.campo12',
    'Lista negra de destinos vetados (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-10')
      : 'NO_APLICA',
    'Estado de la lista de P-10 con sus fuentes y fecha de última actualización, e intentos de acceso a destinos vetados detectados, incluidos los que no pasaron por el proxy. Enlaza con op.exp.7 R3 y op.mon.3.',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Puntuación de cumplimiento mp.s.3  ·  fuente: Motor ENSFácil
  const campo13 = field(
    'mp.s.3.campo13',
    'Puntuación de cumplimiento mp.s.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo14 = field(
    'mp.s.3.campo14',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.s.3',

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
      campo14,
    ],
  };
};
