import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';

type OpAcc4ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

interface OpAcc4ReportField {
  id: string;
  title: string;
  status: OpAcc4ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

interface OpAcc4ReportModel {
  controlId: string;
  status: OpAcc4ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpAcc4ReportField[];
}

const STATUS_VALUES = new Set<OpAcc4ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpAcc4ReportFieldStatus =>
  STATUS_VALUES.has(value as OpAcc4ReportFieldStatus)
    ? (value as OpAcc4ReportFieldStatus)
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
  status: OpAcc4ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpAcc4ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/** Report model of op.acc.4: translates the engine result into report fields. */
export const buildOpAcc4ReportModel = (
  result: ENSComplianceResult | undefined,
): OpAcc4ReportModel => {
  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const evidenceStatus = (evidenceId: string): OpAcc4ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const field1 = field(
    'op.acc.4.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  const field2 = field(
    'op.acc.4.campo2',
    'Verificación de denegación por defecto',
    evidenceStatus('EV-01'),
    'Resultado de los checks de denegación por defecto en cada sistema: política de firewall, shares con permisos a',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  const field3 = field(
    'op.acc.4.campo3',
    'Privilegios no autorizados detectados',
    evidenceStatus('EV-02'),
    'Listado de privilegios configurados en los sistemas que no tienen correspondencia en la matriz P-01. Para cada',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const field4 = field(
    'op.acc.4.campo4',
    'Cuentas con privilegios excesivos',
    evidenceStatus('EV-08'),
    'Cuentas cuyos privilegios superan el mínimo imprescindible: sudo sin restricción, cuentas de servicio en grupo',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  const field5 = field(
    'op.acc.4.campo5',
    'Cambios en grupos privilegiados',
    evidenceStatus('EV-03'),
    'Altas y bajas registradas en los grupos de P-06 durante el período. Para cada evento: cuenta afectada, grupo,',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const field6 = field(
    'op.acc.4.campo6',
    'Cambios de permisos por cuenta no competente',
    evidenceStatus('EV-04'),
    'Eventos de concesión, alteración o anulación de permisos ejecutados por cuentas fuera de P-02. Detalle: actor,',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field7 = field(
    'op.acc.4.campo7',
    'Estado de la revisión periódica de permisos',
    evidenceStatus('EV-05'),
    'Fecha de la última revisión de permisos registrada, días transcurridos, plazo exigido (P-03) y marca de cumpli',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const field8 = field(
    'op.acc.4.campo8',
    'Accesos remotos en el período',
    evidenceStatus('EV-06'),
    'Registro de conexiones remotas: cuenta, canal, puerto, IP de origen, fecha y duración. Marca de conformidad co',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const field9 = field(
    'op.acc.4.campo9',
    'Accesos a recursos de necesidad de conocer',
    evidenceStatus('EV-07'),
    'Accesos registrados a los recursos de P-07 con identificación del perfil que accede. Marca de si el perfil tie',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  const field10 = field(
    'op.acc.4.campo10',
    'Puntuación de cumplimiento op.acc.4',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.acc.4',

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
    ],
  };
};
