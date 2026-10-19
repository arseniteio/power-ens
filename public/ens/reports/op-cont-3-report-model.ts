import type { ENSComplianceResult } from '../../../common/ens/core';

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

/**
 * Modelo de informe de op.cont.3 (Pruebas periódicas).
 *
 * Sale de la hoja «Informe ENSFácil» de la plantilla, ajustado al juicio de la
 * policy (`policies/op-cont-3.policy.ts`):
 *
 *   - Solo con la Disponibilidad en ALTO: con D por debajo, todo NO_APLICA.
 *   - El requisito se decide con EV-01, EV-02, EV-04 y EV-05. EV-03 y EV-08
 *     (lo medido en la ventana de cada prueba) alimentan EV-04, y EV-06 y EV-07
 *     (lo que la prueba dejó y la actualización del plan) acompañan a la
 *     corrección de EV-05. Sus campos llevan el estado de la evidencia a la
 *     que alimentan y, en el detalle, lo que la policy midió.
 */
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
  const enAlto = (status: OpCont3ReportFieldStatus): OpCont3ReportFieldStatus =>
    level === 'ALTO' ? status : 'NO_APLICA';

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.cont.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    (result?.requirements || [])
      .filter(requirement => requirement.status !== 'NO_APLICA')
      .map(requirement => `${requirement.id} ${requirement.title}: ${requirement.status}`),
  );

  // Histórico de pruebas realizadas  ·  fuente: ENSFácil (EV-01)
  const campo2 = field(
    'op.cont.3.campo2',
    'Histórico de pruebas realizadas',
    enAlto(evidenceStatus('EV-01')),
    'Las pruebas del registro de pruebas del manager con su inicio y fin, tipo, escenario, sistemas, resultado declarado y deficiencias. Es la evidencia documental principal y el punto de partida de la revisión del control.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Cumplimiento de la periodicidad  ·  fuente: ENSFácil (EV-02)
  const campo3 = field(
    'op.cont.3.campo3',
    'Cumplimiento de la periodicidad',
    enAlto(evidenceStatus('EV-02')),
    'La última prueba del plan, la de cada tipo de P-02 y la de cada escenario de P-03, contra su periodicidad, en el instante en que se leyó el registro. Los escenarios nunca probados se nombran, y se da el próximo vencimiento.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Suficiencia del alcance de las pruebas  ·  fuente: ENSFácil (EV-01)
  const campo4 = field(
    'op.cont.3.campo4',
    'Suficiencia del alcance de las pruebas',
    enAlto(evidenceStatus('EV-01')),
    'Distribución de las pruebas por tipo (revisión documental, escritorio, parcial, simulacro) y la última que ejercita de verdad los medios alternativos. Solo revisiones o ejercicios de mesa no acreditan que el plan funcione.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Medición objetiva de las pruebas  ·  fuente: Log + Estado de agentes (EV-03, alimenta EV-04)
  const campo5 = field(
    'op.cont.3.campo5',
    'Medición objetiva de las pruebas',
    enAlto(evidenceStatus('EV-04')),
    'Por cada prueba parcial o simulacro del periodo y cada sistema implicado: sus caídas y restablecimientos en la ventana real de la prueba y las 24 h siguientes, y la indisponibilidad más larga. Es el dato que respalda —o desmiente— el resultado declarado; su estado es el de EV-04.',
    ['EV-03', 'EV-04'],
    [...evidenceObservations('EV-03'), ...evidenceObservations('EV-04')],
  );

  // Resultado frente a los objetivos comprometidos  ·  fuente: ENSFácil (EV-04)
  const campo6 = field(
    'op.cont.3.campo6',
    'Resultado frente a los objetivos comprometidos',
    enAlto(evidenceStatus('EV-04')),
    'La indisponibilidad medida de cada sistema frente a su RTO de P-07 y el resultado de las restauraciones de la ventana, contrastados con el resultado declarado. Una prueba declarada satisfactoria que no alcanzó sus objetivos se señala expresamente.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Restauración de copias en las pruebas  ·  fuente: Log + Correlación (EV-08, alimenta EV-04)
  const campo7 = field(
    'op.cont.3.campo7',
    'Restauración de copias en las pruebas',
    enAlto(evidenceStatus('EV-04')),
    'Las pruebas de restauración de mp.info.6 recibidas en la ventana de cada prueba, con su resultado y si el contenido coincide. Una restauración fallida en una prueba declarada satisfactoria la juzga EV-04, cuyo estado lleva este campo.',
    ['EV-08', 'EV-04'],
    evidenceObservations('EV-08'),
  );

  // Deficiencias detectadas y su corrección  ·  fuente: ENSFácil (EV-05)
  const campo8 = field(
    'op.cont.3.campo8',
    'Deficiencias detectadas y su corrección',
    enAlto(evidenceStatus('EV-05')),
    'Las deficiencias de cada prueba con su responsable, plazo y estado. Se destacan las abiertas fuera de plazo, las que siguen abiertas tras la prueba siguiente y las pruebas que declaran más deficiencias de las que se siguen.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Actualización del plan tras las pruebas  ·  fuente: ENSFácil (EV-07, acompaña a EV-05)
  const campo9 = field(
    'op.cont.3.campo9',
    'Actualización del plan tras las pruebas',
    enAlto(evidenceStatus('EV-05')),
    'La versión del plan de continuidad que recoge cada deficiencia cerrada. Las cerradas sin versión se señalan como corrección posiblemente nominal; el estado es el de la corrección (EV-05).',
    ['EV-07', 'EV-05'],
    evidenceObservations('EV-07'),
  );

  // Estado del sistema tras las pruebas  ·  fuente: FIM (EV-06, acompaña a EV-05)
  const campo10 = field(
    'op.cont.3.campo10',
    'Estado del sistema tras las pruebas',
    enAlto(evidenceStatus('EV-05')),
    'Los cambios de FIM en los sistemas de cada prueba en las 24 h siguientes a su ventana, con las deficiencias registradas de esa prueba: una prueba puede dejar el sistema en peor estado, y eso debería constar como deficiencia.',
    ['EV-06', 'EV-05'],
    evidenceObservations('EV-06'),
  );

  // Puntuación de cumplimiento op.cont.3  ·  fuente: Motor ENSFácil
  const campo11 = field(
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
