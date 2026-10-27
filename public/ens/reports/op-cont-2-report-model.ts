import type { ENSComplianceResult } from '../../../common/ens/core';
import { statusLabel } from '../../../common/ens/core/status-label';

export type OpCont2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpCont2ReportField {
  id: string;
  title: string;
  status: OpCont2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpCont2ReportModel {
  controlId: string;
  status: OpCont2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpCont2ReportField[];
}

const STATUS_VALUES = new Set<OpCont2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpCont2ReportFieldStatus =>
  STATUS_VALUES.has(value as OpCont2ReportFieldStatus)
    ? (value as OpCont2ReportFieldStatus)
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
  status: OpCont2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpCont2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

const ALL_EVIDENCES = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'];

const HIGH_ONLY =
  'op.cont.2 solo se exige con nivel ALTO de Disponibilidad: con D en BAJO o MEDIO la medida no es exigible.';

/** Report model of op.cont.2: translates the engine result into report fields. */
export const buildOpCont2ReportModel = (
  result: ENSComplianceResult | undefined,
): OpCont2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const requirements = new Map(
    (result?.requirements || []).map(requirement => [requirement.id, requirement]),
  );

  const variables = new Map(
    (result?.policyRuntime?.runtimeVariables || []).map(variable => [variable.name, variable]),
  );

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const applies = (result?.level || '').toUpperCase() === 'ALTO';

  const accordingTo = (status: unknown): OpCont2ReportFieldStatus =>
    applies ? asStatus(status) : 'NO_APLICA';

  const declaration = (requirementId: string) =>
    variables.get(`declaracion_${requirementId.replace(/\./g, '_')}`);

  const requirementAs = (requirementId: string): string => {
    const requirement = requirements.get(requirementId);

    if (!requirement) {
      return `${requirementId}: sin evaluar`;
    }

    if (requirement.status === 'NO_APLICA') {
      return `${requirementId}: no aplica`;
    }

    return `${requirementId} ${requirement.title}: ${statusLabel(requirement.status)}${
      requirement.attested
        ? ', acreditado documentalmente'
        : requirement.evidenced === false
        ? ', no demostrado'
        : ''
    }`;
  };

  const BASE = ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'];

  const field1 = field(
    'op.cont.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    applies ? formatValue(result?.status) : HIGH_ONLY,
    ALL_EVIDENCES,
    applies ? BASE.map(requirementAs) : [],
  );

  const plan = variables.get('plan_vigente_hasta');
  const field2 = field(
    'op.cont.2.campo2',
    'Plan de continuidad vigente',
    accordingTo(evidences.get('EV-01')?.status),
    !applies
      ? HIGH_ONLY
      : plan?.value
      ? `DOCUMENTO APORTADO: plan de P-01 vigente hasta el ${formatValue(plan.value)} con la periodicidad de revisión de P-08. Su contenido se verifica leyéndolo, no con la herramienta.`
      : 'DOCUMENTO APORTADO: sin un plan legible en P-01 con su periodicidad en P-08 no hay vigencia que vigilar.',
    ['EV-01'],
    applies ? evidenceObservations('EV-01') : [],
  );

  const services = declaration('op.cont.2.2');
  const field3 = field(
    'op.cont.2.campo3',
    'Servicios esenciales y objetivos de recuperación',
    accordingTo(services?.value),
    applies ? formatValue(parameters.get('P-02')?.value) : HIGH_ONLY,
    [],
    applies && services ? [services.description] : [],
  );

  const field4 = field(
    'op.cont.2.campo4',
    'Interrupciones reales del período',
    'NO_APLICA',
    applies
      ? 'No se miden en esta versión: op.cont.2 no tiene recolector. op.cont.2.2 pide una previsión, no la ausencia de caídas.'
      : HIGH_ONLY,
    ['EV-02'],
    applies ? evidenceObservations('EV-02') : [],
  );

  const field5 = field(
    'op.cont.2.campo5',
    'Disponibilidad real frente a los objetivos',
    'NO_APLICA',
    applies
      ? 'No se mide en esta versión: depende de las interrupciones reales (EV-02). Los objetivos declarados están en P-02.'
      : HIGH_ONLY,
    ['EV-07'],
    applies ? evidenceObservations('EV-07') : [],
  );

  const field6 = field(
    'op.cont.2.campo6',
    'Activación de medios alternativos',
    'NO_APLICA',
    applies
      ? 'No se mide: no hay un hecho genérico que distinga la entrada en servicio de un medio alternativo del arranque de cualquier máquina.'
      : HIGH_ONLY,
    ['EV-08'],
    applies ? evidenceObservations('EV-08') : [],
  );

  const field7 = field(
    'op.cont.2.campo7',
    'Medios alternativos y vigencia contractual',
    accordingTo(evidences.get('EV-04')?.status),
    applies
      ? 'Por cada medio alternativo de P-04: proveedor, contrato, fecha de vigencia y días restantes. Un medio sin contrato o con el contrato vencido es incumplimiento directo de op.cont.2.3.'
      : HIGH_ONLY,
    ['EV-04'],
    applies ? evidenceObservations('EV-04') : [],
  );

  const functions = declaration('op.cont.2.1');
  const field8 = field(
    'op.cont.2.campo8',
    'Funciones del plan y su vigencia organizativa',
    accordingTo(functions?.value),
    applies
      ? 'Funciones de P-03 con su responsable, su suplente y sus actividades. Que esas personas sigan en la organización y en su puesto no se contrasta: no hay directorio corporativo integrado, y lo revisa el auditor.'
      : HIGH_ONLY,
    ['EV-05'],
    applies ? [...(functions ? [functions.description] : []), ...evidenceObservations('EV-05')] : [],
  );

  const field9 = field(
    'op.cont.2.campo9',
    'Formación del personal afectado',
    accordingTo(evidences.get('EV-06')?.status),
    applies
      ? 'Por cada responsable y suplente de P-03: su formación de P-05 y hasta cuándo es vigente. Las personas sin formación registrada o con la formación vencida incumplen op.cont.2.4.'
      : HIGH_ONLY,
    ['EV-06'],
    applies ? evidenceObservations('EV-06') : [],
  );

  const integration = declaration('op.cont.2.5');
  const field10 = field(
    'op.cont.2.campo10',
    'Integración con otros planes de la organización',
    accordingTo(integration?.value),
    applies ? formatValue(parameters.get('P-06')?.value) : HIGH_ONLY,
    [],
    applies && integration ? [integration.description] : [],
  );

  const field11 = field(
    'op.cont.2.campo11',
    'Comprobación de integridad tras caída (R2)',
    'NO_APLICA',
    'R2 no se exige en ningún nivel. La comprobación de integridad en el arranque la mide op.exp.6 en cada agente (su EV-06).',
    ['EV-03'],
    applies ? evidenceObservations('EV-03') : [],
  );

  const accredited = BASE.filter(id => requirements.get(id)?.attested).length;
  const field12 = field(
    'op.cont.2.campo12',
    'Puntuación de cumplimiento op.cont.2',
    asStatus(result?.status),
    !applies
      ? HIGH_ONLY
      : typeof result?.score === 'number'
      ? `${result.score} % sobre los cinco requisitos base. Todo lo que este control acredita es documental (${accredited} de 5 acreditados documentalmente); nada se verifica técnicamente.`
      : formatValue(result?.status),
    ALL_EVIDENCES,
    applies
      ? [
          ...BASE.map(requirementAs),
          'op.cont.2.r1.1 y op.cont.2.r2.1: definidos, no exigidos.',
        ]
      : [],
  );

  return {
    controlId: result?.control.id || 'op.cont.2',

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
