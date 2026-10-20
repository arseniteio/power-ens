import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpEq4ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpEq4ReportField {
  id: string;
  title: string;
  status: MpEq4ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpEq4ReportModel {
  controlId: string;
  status: MpEq4ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpEq4ReportField[];
}

const STATUS_VALUES = new Set<MpEq4ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpEq4ReportFieldStatus =>
  STATUS_VALUES.has(value as MpEq4ReportFieldStatus)
    ? (value as MpEq4ReportFieldStatus)
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
  status: MpEq4ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpEq4ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.eq.4 (Otros dispositivos conectados a la red).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpEq4ReportModel = (
  result: ENSComplianceResult | undefined,
): MpEq4ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpEq4ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.eq.4.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Dispositivos descubiertos en la red  ·  fuente: Log Collection + ENSFácil (EV-01)
  const campo2 = field(
    'mp.eq.4.campo2',
    'Dispositivos descubiertos en la red',
    evidenceStatus('EV-01'),
    'Dispositivos vistos en el período con dirección, fabricante deducido del OUI, primera y última aparición y segmento. Es la foto de lo que hay realmente conectado, que casi nunca coincide con el inventario.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Contraste inventario frente a red  ·  fuente: ENSFácil (EV-02)
  const campo3 = field(
    'mp.eq.4.campo3',
    'Contraste inventario frente a red',
    evidenceStatus('EV-02'),
    'Dispositivos del inventario P-01 no vistos en la red y dispositivos vistos sin entrada en el inventario. Los segundos son el hallazgo: equipos conectados sin configuración verificada ni flujo definido.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Flujos de información observados  ·  fuente: Log + Correlación (EV-03)
  const campo4 = field(
    'mp.eq.4.campo4',
    'Flujos de información observados',
    evidenceStatus('EV-03'),
    'Por dispositivo: destinos, puertos y protocolos observados, contrastados con lo autorizado en P-02. Relación de flujos no previstos con su volumen y frecuencia. El caso más frecuente es salida a internet no contemplada.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Trazabilidad propia de los dispositivos  ·  fuente: Log Collection (EV-04)
  const campo5 = field(
    'mp.eq.4.campo5',
    'Trazabilidad propia de los dispositivos',
    evidenceStatus('EV-04'),
    'Dispositivos de P-04 con registros efectivamente ingeridos y volumen de eventos. Dispositivos del inventario sin trazabilidad propia, que son los que solo se ven desde fuera.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Exposición de los paneles de administración  ·  fuente: Log Collection (EV-05)
  const campo6 = field(
    'mp.eq.4.campo6',
    'Exposición de los paneles de administración',
    evidenceStatus('EV-05'),
    'Accesos a las interfaces de administración con origen, usuario y resultado. Apartado destacado para accesos desde segmentos no previstos y para autenticaciones con credenciales por defecto, que dan acceso directo a los documentos almacenados.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Dispositivos de invitados y BYOD  ·  fuente: Log + ENSFácil (EV-07)
  const campo7 = field(
    'mp.eq.4.campo7',
    'Dispositivos de invitados y BYOD',
    evidenceStatus('EV-07'),
    'Dispositivos no corporativos detectados, segmento en que se encuentran frente al previsto en P-06 y recursos alcanzados. Enlaza con mp.com.4.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Control de conexión a la red (R2)  ·  fuente: Log Collection (EV-06)
  const campo8 = field(
    'mp.eq.4.campo8',
    'Control de conexión a la red (R2)',
    evidenceStatus('EV-06'),
    'Si P-08 está configurado: conexiones autorizadas, intentos bloqueados y violaciones de port security. Acredita la segunda parte de R2, no exigible en ningún nivel pero es lo que permite reaccionar en el momento de la conexión.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Capacidad y ejecución del borrado de almacenamiento  ·  fuente: Log + ENSFácil (EV-08)
  const campo9 = field(
    'mp.eq.4.campo9',
    'Capacidad y ejecución del borrado de almacenamiento',
    evidenceStatus('EV-08'),
    'Por dispositivo con almacenamiento: funcionalidad de borrado declarada en P-05, ejecuciones registradas y verificación de que las retiradas fueron precedidas del borrado. Es el momento de mayor riesgo del ciclo de vida de estos equipos.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Puntuación de cumplimiento mp.eq.4  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'mp.eq.4.campo10',
    'Puntuación de cumplimiento mp.eq.4',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo11 = field(
    'mp.eq.4.campo11',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.eq.4',

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
