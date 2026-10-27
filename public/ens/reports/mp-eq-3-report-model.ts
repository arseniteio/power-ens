import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpEq3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpEq3ReportField {
  id: string;
  title: string;
  status: MpEq3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpEq3ReportModel {
  controlId: string;
  status: MpEq3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpEq3ReportField[];
}

const STATUS_VALUES = new Set<MpEq3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpEq3ReportFieldStatus =>
  STATUS_VALUES.has(value as MpEq3ReportFieldStatus)
    ? (value as MpEq3ReportFieldStatus)
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
  status: MpEq3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpEq3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.eq.3 (Protección de dispositivos portátiles).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpEq3ReportModel = (
  result: ENSComplianceResult | undefined,
): MpEq3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpEq3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.eq.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Inventario de dispositivos portátiles  ·  fuente: Syscollector + ENSFácil (EV-01)
  const campo2 = field(
    'mp.eq.3.campo2',
    'Inventario de dispositivos portátiles',
    evidenceStatus('EV-01'),
    'Relación de dispositivos con tipo, modelo, responsable, confidencialidad de la información que almacenan y estado de monitorización.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Control de custodia  ·  fuente: Estado de agentes + ENSFácil (EV-02)
  const campo3 = field(
    'mp.eq.3.campo3',
    'Control de custodia',
    evidenceStatus('EV-02'),
    'Por dispositivo: fecha de la última confirmación de custodia por su responsable y días transcurridos frente a P-02, junto a la fecha de la última conexión del agente.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Claves de acceso remoto almacenadas  ·  fuente: FIM + Syscollector (EV-03)
  const campo4 = field(
    'mp.eq.3.campo4',
    'Claves de acceso remoto almacenadas',
    evidenceStatus('EV-03'),
    'Por dispositivo: artefactos de P-05 detectados, con su ruta y tipo, y si las claves SSH están protegidas con frase de paso.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Estado del cifrado de disco (R1)  ·  fuente: SCA (EV-04)
  const campo5 = field(
    'mp.eq.3.campo5',
    'Estado del cifrado de disco (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-04')
      : 'NO_APLICA',
    'Por dispositivo al que resulta exigible según P-06: cifrado activo, mecanismo, estado de protección (atención a los suspendidos) y método de protección de la clave.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Accesos remotos desde dispositivos portátiles  ·  fuente: Log + Correlación (EV-05)
  const campo6 = field(
    'mp.eq.3.campo6',
    'Accesos remotos desde dispositivos portátiles',
    evidenceStatus('EV-05'),
    'Servicios efectivamente accedidos desde dispositivos portátiles por redes no controladas, contrastados con el perfil autorizado de P-04.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Incidentes de pérdida y reacción aplicada  ·  fuente: Log + Correlación (EV-06)
  const campo7 = field(
    'mp.eq.3.campo7',
    'Incidentes de pérdida y reacción aplicada',
    evidenceStatus('EV-06'),
    'Pérdidas o sustracciones declaradas en el período con las acciones de P-08 ejecutadas y su plazo: revocación de certificados, deshabilitación de cuentas, cierre de sesiones, borrado remoto.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Configuración de protección del dispositivo  ·  fuente: Syscollector + SCA (EV-08)
  const campo8 = field(
    'mp.eq.3.campo8',
    'Configuración de protección del dispositivo',
    evidenceStatus('EV-08'),
    'Por dispositivo: arranque seguro, estado del TPM, contraseña de firmware y política de arranque desde medios externos.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Requisitos normativos — acreditación documental  ·  fuente: Configuración ENSFácil
  const campo9 = field(
    'mp.eq.3.campo9',
    'Requisitos normativos — acreditación documental',
    evidenceStatus('EV-07'),
    'Bloque no verificable técnicamente: procedimiento de comunicación de pérdidas de P-03, autorización de los responsables para el perfil de acceso remoto de P-04, y normativa de entornos protegidos de P-07 con su registro de difusión.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Puntuación de cumplimiento mp.eq.3  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'mp.eq.3.campo10',
    'Puntuación de cumplimiento mp.eq.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo11 = field(
    'mp.eq.3.campo11',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.eq.3',

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
