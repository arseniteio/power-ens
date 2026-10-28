import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';

type OpAcc2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

interface OpAcc2ReportField {
  id: string;
  title: string;
  status: OpAcc2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

interface OpAcc2ReportModel {
  controlId: string;
  status: OpAcc2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpAcc2ReportField[];
}

const STATUS_VALUES = new Set<OpAcc2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpAcc2ReportFieldStatus =>
  STATUS_VALUES.has(value as OpAcc2ReportFieldStatus)
    ? (value as OpAcc2ReportFieldStatus)
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
  status: OpAcc2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpAcc2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/** Report model of op.acc.2: translates the engine result into report fields. */
export const buildOpAcc2ReportModel = (
  result: ENSComplianceResult | undefined,
): OpAcc2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const parameterConfigured = (parameterId: string): boolean => {
    const value = parameterValue(parameterId);
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value !== undefined && value !== null && value !== '';
  };

  const evidenceStatus = (evidenceId: string): OpAcc2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();
  const r1Applies = level === 'ALTO';

  const missingCoreParams: string[] = [];
  if (!parameterConfigured('P-01')) missingCoreParams.push('P-01');
  if (!parameterConfigured('P-02')) missingCoreParams.push('P-02');

  const controlStatus = field(
    'op.acc.2.estado',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    missingCoreParams.length > 0
      ? 'GRIS — No evaluable: faltan parámetros base'
      : formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    [
      missingCoreParams.length > 0
        ? `Parámetros base no configurados: ${missingCoreParams.join(', ')}`
        : '',
    ],
    missingCoreParams,
  );

  const resourcesWithoutControl = field(
    'op.acc.2.recursos',
    'Recursos sin control de acceso detectados',
    evidenceStatus('EV-01'),
    `World-writable permitidos (P-03): ${formatValue(parameterValue('P-03'))}`,
    ['EV-01'],
    evidenceObservations('EV-01'),
    parameterConfigured('P-03') ? [] : ['P-03'],
  );

  const umask = field(
    'op.acc.2.umask',
    'Configuración de umask',
    evidenceStatus('EV-01'),
    `umask mínimo exigido (P-07): ${formatValue(parameterValue('P-07'))}`,
    ['EV-01'],
    evidenceObservations('EV-01'),
    parameterConfigured('P-07') ? [] : ['P-07'],
  );

  const osChanges = field(
    'op.acc.2.cambios_so',
    'Cambios en componentes del SO en el período',
    evidenceStatus('EV-02'),
    `Rutas críticas monitorizadas (P-02): ${formatValue(
      parameterValue('P-02'),
    )}`,
    ['EV-02'],
    evidenceObservations('EV-02'),
    parameterConfigured('P-02') ? [] : ['P-02'],
  );

  const deniedAccesses = field(
    'op.acc.2.accesos_denegados',
    'Accesos denegados en el período',
    evidenceStatus('EV-03'),
    'Accesos denegados a recursos del sistema (top recursos y usuarios)',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const acls = field(
    'op.acc.2.acls',
    'Estado de las ACLs por recurso',
    evidenceStatus('EV-04'),
    [
      `Política de acceso (P-04): ${formatValue(parameterValue('P-04'))}`,
      `Tabla de perfiles (P-06): ${formatValue(parameterValue('P-06'))}`,
    ].join(' · '),
    ['EV-04'],
    evidenceObservations('EV-04'),
    parameterConfigured('P-04') ? [] : ['P-04'],
  );

  const suidSgid = field(
    'op.acc.2.suid_sgid',
    'Binarios SUID/SGID y ficheros sin propietario',
    evidenceStatus('EV-07'),
    'Binarios SUID/SGID y ficheros sin propietario detectados por rootcheck',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  const r1Status: OpAcc2ReportFieldStatus = r1Applies
    ? (() => {
        const s5 = evidenceStatus('EV-05');
        const s6 = evidenceStatus('EV-06');
        if (s5 === 'NO_CUMPLE' || s6 === 'NO_CUMPLE') return 'NO_CUMPLE';
        if (s5 === 'PARCIAL' || s6 === 'PARCIAL') return 'PARCIAL';
        if (s5 === 'CUMPLE' && s6 === 'CUMPLE') return 'CUMPLE';
        return 'NO_EVALUABLE';
      })()
    : 'NO_APLICA';

  const r1Privileges = field(
    'op.acc.2.privilegios',
    'Estado de privilegios individuales (Refuerzo R1)',
    r1Status,
    r1Applies
      ? [
          `Modelo de privilegios (P-05): ${formatValue(parameterValue('P-05'))}`,
          `Tipos de acceso por perfil (P-06): ${formatValue(
            parameterValue('P-06'),
          )}`,
        ].join(' · ')
      : 'Refuerzo R1 no exigible en niveles BAJO/MEDIO',
    ['EV-05', 'EV-06'],
    r1Applies
      ? [...evidenceObservations('EV-05'), ...evidenceObservations('EV-06')]
      : ['Aplica solo a nivel ALTO'],
    r1Applies && !parameterConfigured('P-05') ? ['P-05'] : [],
  );

  const missingParams = (result?.parameters || [])
    .filter(parameter => {
      const value = parameter.value;
      const empty = Array.isArray(value)
        ? value.length === 0
        : value === undefined || value === null || value === '';
      return parameter.required && empty;
    })
    .map(parameter => parameter.id);

  const score = field(
    'op.acc.2.puntuacion',
    'Puntuación de cumplimiento op.acc.2',
    asStatus(result?.status),
    [
      typeof result?.score === 'number' ? `${result.score}%` : 'N/A',
      typeof result?.coverage === 'number'
        ? `Cobertura: ${result.coverage}%`
        : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'],
    [
      `Nivel evaluado: ${result?.level || 'SIN_DATOS'}`,
      `Refuerzo R1: ${r1Applies ? 'aplica (ALTO)' : 'no aplica'}`,
      missingParams.length > 0
        ? `Parámetros sin configurar: ${missingParams.join(', ')}`
        : 'Todos los parámetros obligatorios configurados',
    ],
    missingParams,
  );

  return {
    controlId: result?.control.id || 'op.acc.2',

    status: asStatus(result?.status),

    score: typeof result?.score === 'number' ? result.score : null,

    coverage: typeof result?.coverage === 'number' ? result.coverage : null,

    level: result?.level || 'SIN_DATOS',

    evaluatedAt: result?.evaluatedAt,

    fields: [
      controlStatus,
      resourcesWithoutControl,
      umask,
      osChanges,
      deniedAccesses,
      acls,
      suidSgid,
      r1Privileges,
      score,
    ],
  };
};
