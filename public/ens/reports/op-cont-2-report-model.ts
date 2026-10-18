import type { ENSComplianceResult } from '../../../common/ens/core';

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

const SOLO_ALTO =
  'op.cont.2 solo se exige con nivel ALTO de Disponibilidad: con D en BAJO o MEDIO la medida no es exigible.';

/**
 * Modelo de informe de op.cont.2 (Plan de continuidad).
 *
 * Sale de la hoja «Informe ENSFácil» de la plantilla, ajustado al juicio de la
 * policy (`policies/op-cont-2.policy.ts`). El informe es honesto sobre su
 * naturaleza: el control se acredita con un PLAN, y el plan se audita
 * leyéndolo. Lo que aporta ENSFácil es la vigilancia de las vigencias —el plan,
 * los contratos de los medios alternativos, la formación— de lo que la
 * organización declara en la pantalla:
 *
 *   - un requisito que cumple sale «acreditado documentalmente», nunca como
 *     medido: el 100 % de lo que este control acredita es documental;
 *   - las interrupciones reales (EV-02), la disponibilidad frente al RTO (EV-07)
 *     y la entrada en servicio de los medios alternativos (EV-08) no se miden en
 *     esta versión: sus campos salen NO_APLICA y lo dicen;
 *   - la situación real de las personas del plan (EV-05) no se contrasta con
 *     ningún directorio;
 *   - R2 no se exige; la comprobación de integridad en el arranque la mide
 *     op.exp.6.
 *
 * Con D en BAJO o MEDIO, todo NO_APLICA.
 */
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

  const aplica = (result?.level || '').toUpperCase() === 'ALTO';

  // El estado de un campo: el de su evidencia o su declaración, o NO_APLICA si
  // el control no se exige.
  const segun = (status: unknown): OpCont2ReportFieldStatus =>
    aplica ? asStatus(status) : 'NO_APLICA';

  const declaracion = (requirementId: string) =>
    variables.get(`declaracion_${requirementId.replace(/\./g, '_')}`);

  const requisitoComo = (requirementId: string): string => {
    const requirement = requirements.get(requirementId);

    if (!requirement) {
      return `${requirementId}: sin evaluar`;
    }

    if (requirement.status === 'NO_APLICA') {
      return `${requirementId}: no aplica`;
    }

    return `${requirementId} ${requirement.title}: ${requirement.status}${
      requirement.attested
        ? ', acreditado documentalmente'
        : requirement.evidenced === false
        ? ', no demostrado'
        : ''
    }`;
  };

  const BASE = ['op.cont.2.1', 'op.cont.2.2', 'op.cont.2.3', 'op.cont.2.4', 'op.cont.2.5'];

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.cont.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    aplica ? formatValue(result?.status) : SOLO_ALTO,
    ALL_EVIDENCES,
    aplica ? BASE.map(requisitoComo) : [],
  );

  // Plan de continuidad vigente  ·  fuente: ENSFácil (EV-01)
  const plan = variables.get('plan_vigente_hasta');
  const campo2 = field(
    'op.cont.2.campo2',
    'Plan de continuidad vigente',
    segun(evidences.get('EV-01')?.status),
    !aplica
      ? SOLO_ALTO
      : plan?.value
      ? `DOCUMENTO APORTADO: plan de P-01 vigente hasta el ${formatValue(plan.value)} con la periodicidad de revisión de P-08. Su contenido se verifica leyéndolo, no con la herramienta.`
      : 'DOCUMENTO APORTADO: sin un plan legible en P-01 con su periodicidad en P-08 no hay vigencia que vigilar.',
    ['EV-01'],
    aplica ? evidenceObservations('EV-01') : [],
  );

  // Servicios esenciales y objetivos de recuperación  ·  fuente: Configuración ENSFácil (P-02)
  const servicios = declaracion('op.cont.2.2');
  const campo3 = field(
    'op.cont.2.campo3',
    'Servicios esenciales y objetivos de recuperación',
    segun(servicios?.value),
    aplica ? formatValue(parameters.get('P-02')?.value) : SOLO_ALTO,
    [],
    aplica && servicios ? [servicios.description] : [],
  );

  // Interrupciones reales del período  ·  fuente: Estado de agentes + Log (EV-02)
  const campo4 = field(
    'op.cont.2.campo4',
    'Interrupciones reales del período',
    'NO_APLICA',
    aplica
      ? 'No se miden en esta versión: op.cont.2 no tiene recolector. op.cont.2.2 pide una previsión, no la ausencia de caídas.'
      : SOLO_ALTO,
    ['EV-02'],
    aplica ? evidenceObservations('EV-02') : [],
  );

  // Disponibilidad real frente a los objetivos  ·  fuente: Log + ENSFácil (EV-07)
  const campo5 = field(
    'op.cont.2.campo5',
    'Disponibilidad real frente a los objetivos',
    'NO_APLICA',
    aplica
      ? 'No se mide en esta versión: depende de las interrupciones reales (EV-02). Los objetivos declarados están en P-02.'
      : SOLO_ALTO,
    ['EV-07'],
    aplica ? evidenceObservations('EV-07') : [],
  );

  // Activación de medios alternativos  ·  fuente: Correlación (EV-08)
  const campo6 = field(
    'op.cont.2.campo6',
    'Activación de medios alternativos',
    'NO_APLICA',
    aplica
      ? 'No se mide: no hay un hecho genérico que distinga la entrada en servicio de un medio alternativo del arranque de cualquier máquina.'
      : SOLO_ALTO,
    ['EV-08'],
    aplica ? evidenceObservations('EV-08') : [],
  );

  // Medios alternativos y vigencia contractual  ·  fuente: ENSFácil (EV-04)
  const campo7 = field(
    'op.cont.2.campo7',
    'Medios alternativos y vigencia contractual',
    segun(evidences.get('EV-04')?.status),
    aplica
      ? 'Por cada medio alternativo de P-04: proveedor, contrato, fecha de vigencia y días restantes. Un medio sin contrato o con el contrato vencido es incumplimiento directo de op.cont.2.3.'
      : SOLO_ALTO,
    ['EV-04'],
    aplica ? evidenceObservations('EV-04') : [],
  );

  // Funciones del plan y su vigencia organizativa  ·  fuente: ENSFácil (EV-05)
  const funciones = declaracion('op.cont.2.1');
  const campo8 = field(
    'op.cont.2.campo8',
    'Funciones del plan y su vigencia organizativa',
    segun(funciones?.value),
    aplica
      ? 'Funciones de P-03 con su responsable, su suplente y sus actividades. Que esas personas sigan en la organización y en su puesto no se contrasta: no hay directorio corporativo integrado, y lo revisa el auditor.'
      : SOLO_ALTO,
    ['EV-05'],
    aplica ? [...(funciones ? [funciones.description] : []), ...evidenceObservations('EV-05')] : [],
  );

  // Formación del personal afectado  ·  fuente: ENSFácil (EV-06)
  const campo9 = field(
    'op.cont.2.campo9',
    'Formación del personal afectado',
    segun(evidences.get('EV-06')?.status),
    aplica
      ? 'Por cada responsable y suplente de P-03: su formación de P-05 y hasta cuándo es vigente. Las personas sin formación registrada o con la formación vencida incumplen op.cont.2.4.'
      : SOLO_ALTO,
    ['EV-06'],
    aplica ? evidenceObservations('EV-06') : [],
  );

  // Integración con otros planes de la organización  ·  fuente: Configuración ENSFácil (P-06)
  const integracion = declaracion('op.cont.2.5');
  const campo10 = field(
    'op.cont.2.campo10',
    'Integración con otros planes de la organización',
    segun(integracion?.value),
    aplica ? formatValue(parameters.get('P-06')?.value) : SOLO_ALTO,
    [],
    aplica && integracion ? [integracion.description] : [],
  );

  // Comprobación de integridad tras caída (R2)  ·  fuente: FIM (EV-03)
  const campo11 = field(
    'op.cont.2.campo11',
    'Comprobación de integridad tras caída (R2)',
    'NO_APLICA',
    'R2 no se exige en ningún nivel. La comprobación de integridad en el arranque la mide op.exp.6 en cada agente (su EV-06).',
    ['EV-03'],
    aplica ? evidenceObservations('EV-03') : [],
  );

  // Puntuación de cumplimiento op.cont.2  ·  fuente: Motor ENSFácil
  const acreditados = BASE.filter(id => requirements.get(id)?.attested).length;
  const campo12 = field(
    'op.cont.2.campo12',
    'Puntuación de cumplimiento op.cont.2',
    asStatus(result?.status),
    !aplica
      ? SOLO_ALTO
      : typeof result?.score === 'number'
      ? `${result.score} % sobre los cinco requisitos base. Todo lo que este control acredita es documental (${acreditados} de 5 acreditados documentalmente); nada se verifica técnicamente.`
      : formatValue(result?.status),
    ALL_EVIDENCES,
    aplica
      ? [
          ...BASE.map(requisitoComo),
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
    ],
  };
};
