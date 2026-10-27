import type { ENSComplianceResult } from '../../../common/ens/core';
import { statusLabel } from '../../../common/ens/core/status-label';

export type OpCont3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpCont3ReportField {
  id: string;
  title: string;
  status: OpCont3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpCont3ReportModel {
  controlId: string;
  status: OpCont3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpCont3ReportField[];
}

const STATUS_VALUES = new Set<OpCont3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpCont3ReportFieldStatus =>
  STATUS_VALUES.has(value as OpCont3ReportFieldStatus)
    ? (value as OpCont3ReportFieldStatus)
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
  status: OpCont3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpCont3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

const ALL_EVIDENCES = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'];

/** Report model of op.cont.3: translates the engine result into report fields. */
export const buildOpCont3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpCont3ReportModel => {
  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const evidenceStatus = (evidenceId: string): OpCont3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();
  const asHighLevel = (status: OpCont3ReportFieldStatus): OpCont3ReportFieldStatus =>
    level === 'ALTO' ? status : 'NO_APLICA';

  const field1 = field(
    'op.cont.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    (result?.requirements || [])
      .filter(requirement => requirement.status !== 'NO_APLICA')
      .map(requirement => `${requirement.id} ${requirement.title}: ${statusLabel(requirement.status)}`),
  );

  const field2 = field(
    'op.cont.3.campo2',
    'Histórico de pruebas realizadas',
    asHighLevel(evidenceStatus('EV-01')),
    'Las pruebas del registro de pruebas del manager con su inicio y fin, tipo, escenario, sistemas, resultado declarado y deficiencias.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  const field3 = field(
    'op.cont.3.campo3',
    'Cumplimiento de la periodicidad',
    asHighLevel(evidenceStatus('EV-02')),
    'La última prueba del plan, la de cada tipo de P-02 y la de cada escenario de P-03, contra su periodicidad, en el instante en que se leyó el registro.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const field4 = field(
    'op.cont.3.campo4',
    'Suficiencia del alcance de las pruebas',
    asHighLevel(evidenceStatus('EV-01')),
    'Distribución de las pruebas por tipo (revisión documental, escritorio, parcial, simulacro) y la última que ejercita de verdad los medios alternativos.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  const field5 = field(
    'op.cont.3.campo5',
    'Medición objetiva de las pruebas',
    asHighLevel(evidenceStatus('EV-04')),
    'Por cada prueba parcial o simulacro del periodo y cada sistema implicado: sus caídas y restablecimientos en la ventana real de la prueba y las 24 h siguientes, y la indisponibilidad más larga.',
    ['EV-03', 'EV-04'],
    [...evidenceObservations('EV-03'), ...evidenceObservations('EV-04')],
  );

  const field6 = field(
    'op.cont.3.campo6',
    'Resultado frente a los objetivos comprometidos',
    asHighLevel(evidenceStatus('EV-04')),
    'La indisponibilidad medida de cada sistema frente a su RTO de P-07 y el resultado de las restauraciones de la ventana, contrastados con el resultado declarado.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field7 = field(
    'op.cont.3.campo7',
    'Restauración de copias en las pruebas',
    asHighLevel(evidenceStatus('EV-04')),
    'Las pruebas de restauración de mp.info.6 recibidas en la ventana de cada prueba, con su resultado y si el contenido coincide.',
    ['EV-08', 'EV-04'],
    evidenceObservations('EV-08'),
  );

  const field8 = field(
    'op.cont.3.campo8',
    'Deficiencias detectadas y su corrección',
    asHighLevel(evidenceStatus('EV-05')),
    'Las deficiencias de cada prueba con su responsable, plazo y estado.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const field9 = field(
    'op.cont.3.campo9',
    'Actualización del plan tras las pruebas',
    asHighLevel(evidenceStatus('EV-05')),
    'La versión del plan de continuidad que recoge cada deficiencia cerrada.',
    ['EV-07', 'EV-05'],
    evidenceObservations('EV-07'),
  );

  const field10 = field(
    'op.cont.3.campo10',
    'Estado del sistema tras las pruebas',
    asHighLevel(evidenceStatus('EV-05')),
    'Los cambios de FIM en los sistemas de cada prueba en las 24 h siguientes a su ventana, con las deficiencias registradas de esa prueba: una prueba puede dejar el sistema en peor estado, y eso debería constar como deficiencia.',
    ['EV-06', 'EV-05'],
    evidenceObservations('EV-06'),
  );

  const field11 = field(
    'op.cont.3.campo11',
    'Puntuación de cumplimiento op.cont.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    ['EV-01', 'EV-02', 'EV-04', 'EV-05'].map(id => `${id}: ${evidenceStatus(id)}`),
  );

  return {
    controlId: result?.control.id || 'op.cont.3',

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
    ],
  };
};
