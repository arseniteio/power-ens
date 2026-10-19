import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpExp2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp2ReportField {
  id: string;
  title: string;
  status: OpExp2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp2ReportModel {
  controlId: string;
  status: OpExp2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp2ReportField[];
}

const STATUS_VALUES = new Set<OpExp2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp2ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp2ReportFieldStatus)
    ? (value as OpExp2ReportFieldStatus)
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
  status: OpExp2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.2 (Configuración de seguridad).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp2ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  // Cumplimiento de la línea base por activo  ·  fuente: SCA (EV-01, EV-06)
  //
  // EV-01 dice QUÉ política se evalúa (contra P-01) y EV-06 su PUNTUACIÓN
  // (contra P-05). El detalle por check no lo recoge el agente: vive en el
  // módulo SCA del manager.
  const campo2 = field(
    'op.exp.2.campo2',
    'Cumplimiento de la línea base por activo',
    evidenceStatus('EV-01'),
    'Política SCA evaluada en el activo frente a la asignada en P-01, y puntuación SCA frente al umbral P-05 (EV-06).',
    ['EV-01', 'EV-06'],
    [...evidenceObservations('EV-01'), ...evidenceObservations('EV-06')],
  );

  // Checks fallidos agregados  ·  fuente: SCA (EV-01)
  const campo3 = field(
    'op.exp.2.campo3',
    'Checks fallidos agregados',
    evidenceStatus('EV-01'),
    'Relación de los checks incumplidos ordenados por número de activos afectados y por criticidad. Permite prioriz',
    ['EV-01'],
    evidenceObservations('EV-01'),
    ['detalle por check SCA: lo guarda el manager y ningún agente lo emite'],
  );

  // Cuentas y contraseñas estándar detectadas  ·  fuente: SCA + Log (EV-02)
  const campo4 = field(
    'op.exp.2.campo4',
    'Cuentas y contraseñas estándar detectadas',
    evidenceStatus('EV-02'),
    'Cuentas por defecto que siguen existiendo, con el activo y el producto al que pertenecen. Marca destacada para',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Servicios y puertos no justificados  ·  fuente: Syscollector + ENSFácil (EV-03)
  const campo5 = field(
    'op.exp.2.campo5',
    'Servicios y puertos no justificados',
    evidenceStatus('EV-03'),
    'Por activo: servicios en ejecución y puertos en escucha sin correspondencia en P-02, con el proceso asociado.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Configuración de seguridad por defecto  ·  fuente: SCA (EV-04)
  const campo6 = field(
    'op.exp.2.campo6',
    'Configuración de seguridad por defecto',
    evidenceStatus('EV-04'),
    'Resultado de los checks de seguridad por defecto: versiones de protocolo admitidas, cifrados, autenticación an',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Cobertura de virtualización  ·  fuente: SCA + Syscollector (EV-05)
  const campo7 = field(
    'op.exp.2.campo7',
    'Cobertura de virtualización',
    evidenceStatus('EV-05'),
    'Máquinas virtuales y anfitriones observados frente al inventario P-06.',
    ['EV-05'],
    evidenceObservations('EV-05'),
    ['cobertura del anfitrión de cada VM: es una pregunta entre máquinas que el agente de la VM no puede contestar'],
  );

  // Evolución del bastionado  ·  fuente: SCA + ENSFácil (EV-06)
  const campo8 = field(
    'op.exp.2.campo8',
    'Evolución del bastionado',
    evidenceStatus('EV-06'),
    'Serie de puntuaciones SCA del periodo frente al umbral P-05: ninguna puede quedar por debajo.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Conformidad previa a la entrada en operación  ·  fuente: SCA + ENSFácil (EV-07)
  const campo9 = field(
    'op.exp.2.campo9',
    'Conformidad previa a la entrada en operación',
    evidenceStatus('EV-07'),
    'Activos incorporados en el período con la fecha de puesta en producción y la del primer resultado SCA conforme',
    ['EV-07'],
    evidenceObservations('EV-07'),
    ['fecha de puesta en producción por activo: ningún agente la observa; se acredita con el procedimiento de P-07'],
  );

  // Puntuación de cumplimiento op.exp.2  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'op.exp.2.campo10',
    'Puntuación de cumplimiento op.exp.2',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.2',

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
    ],
  };
};
