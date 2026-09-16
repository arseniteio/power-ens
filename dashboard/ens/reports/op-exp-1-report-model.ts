import type { ENSComplianceResult } from '../core';

export type OpExp1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp1ReportField {
  id: string;
  title: string;
  status: OpExp1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp1ReportModel {
  controlId: string;
  status: OpExp1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp1ReportField[];
}

const STATUS_VALUES = new Set<OpExp1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp1ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp1ReportFieldStatus)
    ? (value as OpExp1ReportFieldStatus)
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
  status: OpExp1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp1ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.1 (Inventario de activos).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp1ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp1ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  // Inventario consolidado de activos  ·  fuente: Syscollector (EV-01, EV-02, EV-03)
  const campo2 = field(
    'op.exp.1.campo2',
    'Inventario consolidado de activos',
    evidenceStatus('EV-01'),
    'Listado completo de los elementos del sistema con: identificador, naturaleza según P-03, responsable según P-0',
    ['EV-01', 'EV-02', 'EV-03'],
    evidenceObservations('EV-01'),
  );

  // Cobertura del inventario  ·  fuente: ENSFácil (EV-07)
  const campo3 = field(
    'op.exp.1.campo3',
    'Cobertura del inventario',
    evidenceStatus('EV-07'),
    'Porcentaje de activos con responsable asignado, con naturaleza clasificada y con agente desplegado. Relación e',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Relación de componentes software  ·  fuente: Syscollector (EV-02)
  const campo4 = field(
    'op.exp.1.campo4',
    'Relación de componentes software',
    evidenceStatus('EV-02'),
    'Inventario de software y paquetes por activo, con versión. Agregado de componentes de terceros y librerías pre',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Estado de monitorización de los equipos  ·  fuente: Estado de agentes (EV-04)
  const campo5 = field(
    'op.exp.1.campo5',
    'Estado de monitorización de los equipos',
    evidenceStatus('EV-04'),
    'Estado en tiempo real de cada activo monitorizado: activo, desconectado, nunca conectado, con fecha de último',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Activos no inventariados detectados  ·  fuente: Syscollector + ENSFácil (EV-05)
  const campo6 = field(
    'op.exp.1.campo6',
    'Activos no inventariados detectados',
    evidenceStatus('EV-05'),
    'Activos detectados en el período que no figuraban en el inventario: identificador, dirección, fecha de detecci',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Cambios en el inventario durante el período  ·  fuente: Syscollector (EV-06)
  const campo7 = field(
    'op.exp.1.campo7',
    'Cambios en el inventario durante el período',
    evidenceStatus('EV-06'),
    'Altas y bajas de activos, y variaciones en la composición de los existentes: software instalado o eliminado, c',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Puntuación de cumplimiento op.exp.1  ·  fuente: Motor ENSFácil
  const campo8 = field(
    'op.exp.1.campo8',
    'Puntuación de cumplimiento op.exp.1',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.1',

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
