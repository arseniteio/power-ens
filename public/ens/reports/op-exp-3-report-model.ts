import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpExp3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp3ReportField {
  id: string;
  title: string;
  status: OpExp3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp3ReportModel {
  controlId: string;
  status: OpExp3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp3ReportField[];
}

const STATUS_VALUES = new Set<OpExp3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp3ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp3ReportFieldStatus)
    ? (value as OpExp3ReportFieldStatus)
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
  status: OpExp3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.3 (Gestión de la configuración de seguridad).
 *
 * Los campos salen de la hoja "Informe ENSFácil" de la plantilla. Lo que se
 * acredita aquí no es un estado sino una CONTINUIDAD, y el control remite a
 * otros cuatro (op.exp.2, op.acc.4, op.exp.4, op.exp.7): los campos cuya fuente
 * no está en la máquina lo dicen en `producerGaps` en vez de rellenarse.
 */

// Evidencias sin hecho en la máquina y qué falta para que lo tengan.
const SIN_FUENTE: Record<string, string> = {
  'EV-01':
    'La serie de resultados SCA vive en el manager: falta una integración que la emita por agente.',
  'EV-05':
    'Falta la integración con el sistema de gestión de cambios declarado en P-06.',
  'EV-06':
    'La reacción a vulnerabilidades la mide op.exp.4 con el detector de vulnerabilidades del manager.',
  'EV-07':
    'Falta el registro de incidentes de op.exp.7 con el que correlacionar los cambios.',
  'EV-10':
    'Las regresiones se calculan sobre la serie de resultados SCA del manager, que el agente no tiene.',
};

const TODAS = [
  'EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06',
  'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11',
];

export const buildOpExp3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const gaps = (...evidenceIds: string[]): string[] =>
    evidenceIds
      .filter(evidenceId => SIN_FUENTE[evidenceId])
      .map(evidenceId => `${evidenceId}: ${SIN_FUENTE[evidenceId]}`);

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    TODAS,
    [],
    gaps(...TODAS),
  );

  // Continuidad del cumplimiento de la línea base  ·  fuente: SCA (EV-01)
  const campo2 = field(
    'op.exp.3.campo2',
    'Continuidad del cumplimiento de la línea base',
    evidenceStatus('EV-01'),
    'Serie temporal del cumplimiento SCA por activo durante el período: demuestra que la funcionalidad mínima y el mínimo privilegio se mantienen «en todo momento» (remite a op.exp.2).',
    ['EV-01'],
    evidenceObservations('EV-01'),
    gaps('EV-01'),
  );

  // Regresiones de configuración detectadas  ·  fuente: SCA (EV-10)
  const campo3 = field(
    'op.exp.3.campo3',
    'Regresiones de configuración detectadas',
    evidenceStatus('EV-10'),
    'Checks que pasaron de conforme a no conforme en el período, por activo y con la fecha de la regresión.',
    ['EV-10'],
    evidenceObservations('EV-10'),
    gaps('EV-10'),
  );

  // Ediciones de la configuración de seguridad  ·  fuente: auditd (EV-02)
  const campo4 = field(
    'op.exp.3.campo4',
    'Ediciones de la configuración de seguridad',
    evidenceStatus('EV-02'),
    `Ediciones de las rutas de P-04 con su actor, operación, proceso e intervalo, contrastadas con las cuentas autorizadas (P-03: ${formatValue(parameterValue('P-03'))}).`,
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Trazabilidad de cambios frente a autorización  ·  fuente: ITSM (EV-05)
  const campo5 = field(
    'op.exp.3.campo5',
    'Trazabilidad de cambios frente a autorización',
    evidenceStatus('EV-05'),
    `Para cada edición detectada, el cambio aprobado que la autoriza en el sistema de gestión de cambios (P-06: ${formatValue(parameterValue('P-06'))}). Remite a op.acc.4.`,
    ['EV-05'],
    evidenceObservations('EV-05'),
    gaps('EV-05'),
  );

  // Reacción ante vulnerabilidades  ·  fuente: op.exp.4 (EV-06)
  const campo6 = field(
    'op.exp.3.campo6',
    'Reacción ante vulnerabilidades',
    evidenceStatus('EV-06'),
    'Vulnerabilidades notificadas en el período y tiempo hasta la reacción. Se mide en op.exp.4.',
    ['EV-06'],
    evidenceObservations('EV-06'),
    gaps('EV-06'),
  );

  // Reacción ante incidentes  ·  fuente: op.exp.7 (EV-07)
  const campo7 = field(
    'op.exp.3.campo7',
    'Reacción ante incidentes',
    evidenceStatus('EV-07'),
    'Incidentes del período y si produjeron cambios de configuración en los activos afectados. Remite a op.exp.7.',
    ['EV-07'],
    evidenceObservations('EV-07'),
    gaps('EV-07'),
  );

  // Elementos no autorizados en el sistema  ·  fuente: dpkg / apt (EV-03)
  const campo8 = field(
    'op.exp.3.campo8',
    'Elementos no autorizados en el sistema',
    evidenceStatus('EV-03'),
    'Software instalado de nuevo en el período, con quién lo pidió, contrastado con el software autorizado sobre la línea base (P-01). Tolerancia cero.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Servicios fuera de la lista autorizada  ·  fuente: systemd / ss (EV-04)
  const campo9 = field(
    'op.exp.3.campo9',
    'Servicios fuera de la lista autorizada',
    evidenceStatus('EV-04'),
    'Servicios en ejecución por activo y perfil, con sus puertos, contrastados con la fila de su perfil en P-02.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Verificaciones periódicas de la configuración  ·  fuente: registro (EV-11)
  const campo10 = field(
    'op.exp.3.campo10',
    'Verificaciones periódicas de la configuración',
    evidenceStatus('EV-11'),
    `Fecha de la última verificación formal frente a la línea base y contraste con la periodicidad declarada (P-05: ${formatValue(parameterValue('P-05'))} días).`,
    ['EV-11'],
    evidenceObservations('EV-11'),
  );

  // Concentración de la administración (R2)  ·  fuente: auditd (EV-08)
  const campo11 = field(
    'op.exp.3.campo11',
    'Concentración de la administración (R2)',
    evidenceStatus('EV-08'),
    `Cuentas distintas que han editado la configuración en la ventana de observación, contra el máximo declarado (P-09: ${formatValue(parameterValue('P-09'))}).`,
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Copias de seguridad de la configuración (R3)  ·  fuente: disco (EV-09)
  const campo12 = field(
    'op.exp.3.campo12',
    'Copias de seguridad de la configuración (R3)',
    evidenceStatus('EV-09'),
    `Fecha de la copia más reciente del alcance que peor está, contra la antigüedad máxima declarada (P-10: ${formatValue(parameterValue('P-10'))} h).`,
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Puntuación de cumplimiento op.exp.3  ·  fuente: Motor ENSFácil
  const campo13 = field(
    'op.exp.3.campo13',
    'Puntuación de cumplimiento op.exp.3',
    asStatus(result?.status),
    formatValue(result?.status),
    TODAS,
    [
      'Bloques: base (BAJO, MEDIO, ALTO), R1 (MEDIO y ALTO), R2 y R3 (solo ALTO). R4 y R5 no son exigibles en ninguna categoría.',
      'Remisiones: op.exp.3.1 y .2 → op.exp.2; op.exp.3.3 → op.acc.4; op.exp.3.4 → op.exp.4; op.exp.3.5 → op.exp.7.',
    ],
    gaps(...TODAS),
  );

  return {
    controlId: result?.control.id || 'op.exp.3',

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
