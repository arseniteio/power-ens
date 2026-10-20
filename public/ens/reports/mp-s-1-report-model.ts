import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpS1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpS1ReportField {
  id: string;
  title: string;
  status: MpS1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpS1ReportModel {
  controlId: string;
  status: MpS1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpS1ReportField[];
}

const STATUS_VALUES = new Set<MpS1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpS1ReportFieldStatus =>
  STATUS_VALUES.has(value as MpS1ReportFieldStatus)
    ? (value as MpS1ReportFieldStatus)
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
  status: MpS1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpS1ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.s.1 (Protección del correo electrónico).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpS1ReportModel = (
  result: ENSComplianceResult | undefined,
): MpS1ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpS1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.s.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Protección en tránsito del correo  ·  fuente: SCA + Log (EV-06)
  const campo2 = field(
    'mp.s.1.campo2',
    'Protección en tránsito del correo',
    evidenceStatus('EV-06'),
    'Porcentaje de correo entrante y saliente cifrado, versiones de TLS negociadas y relación de destinos con los que se intercambia correo en claro pese a admitir cifrado. Acredita la parte de tránsito de mp.s.1.1.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Autenticación del dominio propio  ·  fuente: Log + ENSFácil (EV-07)
  const campo3 = field(
    'mp.s.1.campo3',
    'Autenticación del dominio propio',
    evidenceStatus('EV-07'),
    'Estado de los registros SPF, DKIM y DMARC de cada dominio de P-02, con su política y coherencia. Resumen de los informes agregados de DMARC. Se señala que estos mecanismos son el medio estándar de cumplir mp.s.1.2, no una exigencia nombrada en el texto del ENS.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Suplantación del dominio y fraude detectados  ·  fuente: Correlación (EV-08)
  const campo4 = field(
    'mp.s.1.campo4',
    'Suplantación del dominio y fraude detectados',
    evidenceStatus('EV-08'),
    'Intentos de suplantación del dominio o de identidades internas detectados en el período, con el origen, el destinatario objetivo y si fueron bloqueados. Es la amenaza de mayor impacto económico del correo.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Eficacia del filtrado de correo no solicitado  ·  fuente: Log + ENSFácil (EV-02)
  const campo5 = field(
    'mp.s.1.campo5',
    'Eficacia del filtrado de correo no solicitado',
    evidenceStatus('EV-02'),
    'Volumen de mensajes procesados, clasificados como no solicitados, en cuarentena, liberados y entregados, con las tasas correspondientes. Valoración de la calibración del filtro frente a los umbrales de P-05.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Detecciones de código dañino  ·  fuente: Log + ENSFácil (EV-03)
  const campo6 = field(
    'mp.s.1.campo6',
    'Detecciones de código dañino',
    evidenceStatus('EV-03'),
    'Detecciones por tipo de amenaza según el desglose que enumera mp.s.1.4, con remitente, destinatario y acción aplicada. Apartado destacado para las detecciones en destino y para las correlaciones con actividad posterior en el puesto del receptor.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Cobertura del análisis de anexos  ·  fuente: Log Collection (EV-04)
  const campo7 = field(
    'mp.s.1.campo7',
    'Cobertura del análisis de anexos',
    evidenceStatus('EV-04'),
    'Mensajes con anexo frente a mensajes con análisis registrado, con las omisiones desglosadas por causa: tamaño, tipo, anexo cifrado, remitente en lista de confianza. Las omisiones son el hueco real del filtro.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Tratamiento del código móvil y contenido activo  ·  fuente: Log Collection (EV-05)
  const campo8 = field(
    'mp.s.1.campo8',
    'Tratamiento del código móvil y contenido activo',
    evidenceStatus('EV-05'),
    'Mensajes con contenido activo bloqueado o saneado, desglosados por tipo: macros, scripts en HTML, ejecutables. Acredita mp.s.1.5, que es el requisito de amenazas más frecuentemente desatendido.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Integridad de la configuración del servicio  ·  fuente: FIM + ENSFácil (EV-09)
  const campo9 = field(
    'mp.s.1.campo9',
    'Integridad de la configuración del servicio',
    evidenceStatus('EV-09'),
    'Cambios en la configuración del MTA, en las reglas de la pasarela y en los registros DNS del dominio, con el usuario que los realizó. Destacados los que degradan la protección.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Concienciación y formación (mp.s.1.7)  ·  fuente: Config. + Log (EV-10)
  const campo10 = field(
    'mp.s.1.campo10',
    'Concienciación y formación (mp.s.1.7)',
    evidenceStatus('EV-10'),
    'Actividades realizadas con fecha, alcance y participación. Si existen campañas de phishing simulado, sus tasas de apertura, clic y notificación, que dan una métrica de eficacia. Enlaza con mp.per.3 y mp.per.4.',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Puntuación de cumplimiento mp.s.1  ·  fuente: Motor ENSFácil
  const campo11 = field(
    'mp.s.1.campo11',
    'Puntuación de cumplimiento mp.s.1',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo12 = field(
    'mp.s.1.campo12',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.s.1',

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
