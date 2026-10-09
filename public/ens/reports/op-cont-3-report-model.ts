import type { ENSComplianceResult } from '../core';

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

/**
 * Modelo de informe de op.cont.3 (Pruebas periódicas).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpCont3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpCont3ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpCont3ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.cont.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Histórico de pruebas realizadas  ·  fuente: ENSFácil (EV-01)
  const campo2 = field(
    'op.cont.3.campo2',
    'Histórico de pruebas realizadas',
    level === 'ALTO'
      ? evidenceStatus('EV-01')
      : 'NO_APLICA',
    'Todas las pruebas registradas con fecha, tipo, escenario, participantes y resultado declarado. Es la evidencia documental principal y el punto de partida de la revisión del control.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Cumplimiento de la periodicidad  ·  fuente: ENSFácil (EV-02)
  const campo3 = field(
    'op.cont.3.campo3',
    'Cumplimiento de la periodicidad',
    level === 'ALTO'
      ? evidenceStatus('EV-02')
      : 'NO_APLICA',
    'Por cada tipo de prueba y escenario: fecha de la última realización, meses transcurridos y contraste con P-01. Relación de escenarios de P-03 nunca probados, que son el hueco de cobertura más concreto.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Suficiencia del alcance de las pruebas  ·  fuente: ENSFácil (EV-01)
  const campo4 = field(
    'op.cont.3.campo4',
    'Suficiencia del alcance de las pruebas',
    level === 'ALTO'
      ? evidenceStatus('EV-01')
      : 'NO_APLICA',
    'Distribución de las pruebas por tipo: cuántas fueron revisión documental, de escritorio, parciales o simulacros completos con conmutación real. Permite valorar si el plan se ha ejercitado de verdad o solo se ha revisado.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Medición objetiva de la última prueba  ·  fuente: Log + Estado de agentes (EV-03)
  const campo5 = field(
    'op.cont.3.campo5',
    'Medición objetiva de la última prueba',
    level === 'ALTO'
      ? evidenceStatus('EV-03')
      : 'NO_APLICA',
    'Eventos registrados durante la ventana de P-06: cronología de caídas, arranques en medios alternativos y restablecimientos, con los intervalos medidos por servicio esencial. Es el dato que respalda —o desmiente— el resultado declarado.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Resultado frente a los objetivos comprometidos  ·  fuente: ENSFácil (EV-04)
  const campo6 = field(
    'op.cont.3.campo6',
    'Resultado frente a los objetivos comprometidos',
    level === 'ALTO'
      ? evidenceStatus('EV-04')
      : 'NO_APLICA',
    'Cuadro comparativo entre las métricas de P-07 y los valores medidos: RTO alcanzado frente al comprometido, servicios restablecidos, integridad de los datos. Discrepancias entre lo declarado y lo medido destacadas de forma expresa.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Restauración de copias en las pruebas  ·  fuente: Log + Correlación (EV-08)
  const campo7 = field(
    'op.cont.3.campo7',
    'Restauración de copias en las pruebas',
    level === 'ALTO'
      ? evidenceStatus('EV-08')
      : 'NO_APLICA',
    'Operaciones de restauración ejecutadas durante las pruebas, con el tiempo empleado y la verificación de integridad de los datos recuperados. Enlaza con mp.info.6: una copia que nunca se restaura no está verificada.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Deficiencias detectadas y su corrección  ·  fuente: ENSFácil (EV-05)
  const campo8 = field(
    'op.cont.3.campo8',
    'Deficiencias detectadas y su corrección',
    level === 'ALTO'
      ? evidenceStatus('EV-05')
      : 'NO_APLICA',
    'Por cada prueba: deficiencias localizadas, responsable, plazo y estado de cierre. Apartado destacado para las abiertas fuera de plazo y para las que siguen abiertas al llegar la siguiente prueba. Es el bloque donde se concentran los incumplimientos de este control.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Actualización del plan tras las pruebas  ·  fuente: ENSFácil (EV-07)
  const campo9 = field(
    'op.cont.3.campo9',
    'Actualización del plan tras las pruebas',
    level === 'ALTO'
      ? evidenceStatus('EV-07')
      : 'NO_APLICA',
    'Correlación entre las deficiencias cerradas y los cambios de versión del plan de continuidad de op.cont.2. Deficiencias cerradas sin actualización del plan señaladas como corrección posiblemente nominal.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Estado del sistema tras las pruebas  ·  fuente: FIM + Syscollector (EV-06)
  const campo10 = field(
    'op.cont.3.campo10',
    'Estado del sistema tras las pruebas',
    level === 'ALTO'
      ? evidenceStatus('EV-06')
      : 'NO_APLICA',
    'Desviaciones de integridad o de inventario detectadas tras cada prueba que impliquen conmutación o restauración, con indicación de si fueron resueltas o registradas como deficiencia. Una prueba puede dejar el sistema en peor estado del que tenía.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Puntuación de cumplimiento op.cont.3  ·  fuente: Motor ENSFácil
  const campo11 = field(
    'op.cont.3.campo11',
    'Puntuación de cumplimiento op.cont.3',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
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
