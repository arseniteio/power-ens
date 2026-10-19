import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpExp5ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp5ReportField {
  id: string;
  title: string;
  status: OpExp5ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp5ReportModel {
  controlId: string;
  status: OpExp5ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp5ReportField[];
}

const STATUS_VALUES = new Set<OpExp5ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp5ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp5ReportFieldStatus)
    ? (value as OpExp5ReportFieldStatus)
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
  status: OpExp5ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp5ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/** Report model of op.exp.5: translates the engine result into report fields. */
export const buildOpExp5ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp5ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp5ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  const field1 = field(
    'op.exp.5.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  const field2 = field(
    'op.exp.5.campo2',
    'Cambios detectados en el período',
    evidenceStatus('EV-01'),
    'Cambios reales de la máquina: escrituras en la configuración vigilada (auditd, con autor), transacciones de software (apt/dpkg, con actor), puertos en escucha y hardware.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  const field3 = field(
    'op.exp.5.campo3',
    'Conciliación cambio real frente a cambio autorizado',
    evidenceStatus('EV-02'),
    'Para cada cambio de EV-01, la petición aprobada cuya ventana lo cubre, o «sin petición». Fuente de las peticiones: registro TSV de la máquina, mantenido a mano (no hay integración con un ITSM).',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const field4 = field(
    'op.exp.5.campo4',
    'Calidad de las peticiones de cambio',
    evidenceStatus('EV-03'),
    'Peticiones autorizadas del registro con algún campo obligatorio de P-02 vacío, o fuera del formato de referencia de P-01.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const field5 = field(
    'op.exp.5.campo5',
    'Cambios de riesgo ALTO y aprobación del RSI',
    evidenceStatus('EV-04'),
    'Peticiones de riesgo alto implantadas: aprobador frente al RSI de P-04 y fecha de aprobación frente al primer cambio real que cubren.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field6 = field(
    'op.exp.5.campo6',
    'Paso por preproducción',
    evidenceStatus('EV-05'),
    'No demostrable hoy: el motor evalúa cada máquina por separado y no puede cruzar producción con su preproducción.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const field7 = field(
    'op.exp.5.campo7',
    'Actualización documental tras el cambio',
    evidenceStatus('EV-06'),
    'Por cada petición implantada que declara documentación: si el documento de P-06 se modificó dentro de su plazo.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const field8 = field(
    'op.exp.5.campo8',
    'Estabilidad del servicio tras los cambios',
    evidenceStatus('EV-07'),
    'Servicios que siguen caídos y cayeron en las horas de P-09 posteriores a un cambio, sin reversión registrada.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  const field9 = field(
    'op.exp.5.campo9',
    'Fallos detectados y su comunicación (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-08')
      : 'NO_APLICA',
    'Fallos de software y hardware detectados por Wazuh en el período, con indicación de si fueron comunicados al r',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  const field10 = field(
    'op.exp.5.campo10',
    'Puntos de reversión previos a cada cambio (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-09')
      : 'NO_APLICA',
    'Por cada cambio implantado: si consta la creación previa del mecanismo de reversión declarado en P-08, con su',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  const field11 = field(
    'op.exp.5.campo11',
    'Valoración de impacto en seguridad de los cambios (R1)',
    level === 'ALTO'
      ? evidenceStatus('EV-03')
      : 'NO_APLICA',
    'Cambios del período con indicación de si su documentación incluye la valoración de impacto en la seguridad del',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const field12 = field(
    'op.exp.5.campo12',
    'Puntuación de cumplimiento op.exp.5',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.5',

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
    ],
  };
};
