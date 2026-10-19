import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpExp8ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp8ReportField {
  id: string;
  title: string;
  status: OpExp8ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp8ReportModel {
  controlId: string;
  status: OpExp8ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp8ReportField[];
}

const STATUS_VALUES = new Set<OpExp8ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp8ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp8ReportFieldStatus)
    ? (value as OpExp8ReportFieldStatus)
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
  status: OpExp8ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp8ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/** Report model of op.exp.8: translates the engine result into report fields. */
export const buildOpExp8ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp8ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp8ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  const field1 = field(
    'op.exp.8.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13'],
    evidenceObservations('EV-01'),
  );

  const field2 = field(
    'op.exp.8.campo2',
    'Cobertura del registro en servidores',
    evidenceStatus('EV-02'),
    'Por cada servidor de P-02: agente desplegado, estado, fecha de último contacto y módulos de recolección activo',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const field3 = field(
    'op.exp.8.campo3',
    'Volumen y composición del registro',
    evidenceStatus('EV-01'),
    'Eventos ingeridos en el período por categoría de P-01 y por fuente, con su evolución. Categorías declaradas qu',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  const field4 = field(
    'op.exp.8.campo4',
    'Continuidad del registro y lagunas detectadas',
    evidenceStatus('EV-04'),
    'Cobertura temporal efectiva del registro por fuente y agente. Relación de lagunas detectadas con las fechas af',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field5 = field(
    'op.exp.8.campo5',
    'Suficiencia de los campos del registro de auditoría',
    evidenceStatus('EV-03'),
    'Por cada fuente: presencia de los cinco campos que exige op.exp.8.1 en una muestra representativa. Relación de',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const field6 = field(
    'op.exp.8.campo6',
    'Revisiones periódicas realizadas (R1)',
    evidenceStatus('EV-05'),
    'Histórico de revisiones de los registros: fecha, responsable, alcance revisado y patrones anormales encontrado',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const field7 = field(
    'op.exp.8.campo7',
    'Sincronización de relojes (R2)',
    evidenceStatus('EV-06'),
    'Por sistema: fuente de tiempo configurada, estado de sincronización, desviación medida y si emplea autenticaci',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const field8 = field(
    'op.exp.8.campo8',
    'Retención de registros (R3)',
    evidenceStatus('EV-07'),
    'Por categoría de evento: retención declarada en P-07, antigüedad del evento más antiguo disponible y marca de',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  const field9 = field(
    'op.exp.8.campo9',
    'Accesos a los registros (R4)',
    evidenceStatus('EV-08'),
    'Accesos a los índices y a la API en el período, con la cuenta, la operación y el alcance. Relación destacada d',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  const field10 = field(
    'op.exp.8.campo10',
    'Copias de seguridad de los registros (R4)',
    evidenceStatus('EV-09'),
    'Estado de los snapshots: alcance, fecha de la última copia, antigüedad frente a la frecuencia de P-09, y verif',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  const field11 = field(
    'op.exp.8.campo11',
    'Capacidad de análisis desplegada (R5)',
    level === 'ALTO'
      ? evidenceStatus('EV-10')
      : 'NO_APLICA',
    'Inventario de reglas de correlación activas con su cobertura por categoría de evento de P-01 y su mapeo a técn',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  const field12 = field(
    'op.exp.8.campo12',
    'Recolección, correlación y respuesta automática (R5)',
    level === 'ALTO'
      ? evidenceStatus('EV-11')
      : 'NO_APLICA',
    'Acreditación de los tres componentes que exige op.exp.8.r5.2, documentados por separado: recolección automátic',
    ['EV-11', 'EV-12'],
    evidenceObservations('EV-11'),
  );

  const field13 = field(
    'op.exp.8.campo13',
    'Integridad del propio sistema de registro',
    evidenceStatus('EV-13'),
    'Modificaciones en la configuración de Wazuh, reglas y decodificadores, con la cuenta que las realizó; y dispon',
    ['EV-13'],
    evidenceObservations('EV-13'),
  );

  const field14 = field(
    'op.exp.8.campo14',
    'Puntuación de cumplimiento op.exp.8',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.8',

    status: asStatus(result?.status),

    score: typeof result?.score === 'number' ? result.score : null,

    coverage: typeof result?.coverage === 'number' ? result.coverage : null,

    level: result?.level || 'SIN_DATOS',

    evaluatedAt: result?.evaluatedAt,

    fields: [
      field1,
      field2,
      field3,
      field4,
      field5,
      field6,
      field7,
      field8,
      field9,
      field10,
      field11,
      field12,
      field13,
      field14,
    ],
  };
};
