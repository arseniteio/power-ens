import type { ENSComplianceResult } from '../../../common/ens/core';

export type OpNub1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpNub1ReportField {
  id: string;
  title: string;
  status: OpNub1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpNub1ReportModel {
  controlId: string;
  status: OpNub1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpNub1ReportField[];
}

const STATUS_VALUES = new Set<OpNub1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpNub1ReportFieldStatus =>
  STATUS_VALUES.has(value as OpNub1ReportFieldStatus)
    ? (value as OpNub1ReportFieldStatus)
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
  status: OpNub1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpNub1ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

// Worst state of several fields (SIN_DATOS counts as unmeasured); with none measured, the first.
const SEVERITY_RANK: Record<OpNub1ReportFieldStatus, number> = {
  NO_APLICA: 0,
  CUMPLE: 1,
  SIN_DATOS: 2,
  NO_EVALUABLE: 2,
  PARCIAL: 3,
  NO_CUMPLE: 4,
};

const worstStatus = (statuses: OpNub1ReportFieldStatus[]): OpNub1ReportFieldStatus =>
  statuses.reduce<OpNub1ReportFieldStatus>(
    (current, status) => (SEVERITY_RANK[status] > SEVERITY_RANK[current] ? status : current),
    'NO_APLICA'
  );

const ALL_EVIDENCES = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'];

// The template requires these two blocks kept apart: mixing them would give a false impression of coverage.
const DOCUMENTARY = ['op.nub.1.1', 'op.nub.1.r1.1', 'op.nub.1.r1.2'];

/** Report model of op.nub.1: translates the engine result into report fields. */
export const buildOpNub1ReportModel = (
  result: ENSComplianceResult | undefined,
): OpNub1ReportModel => {
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

  const parameterRows = (parameterId: string): string[] => {
    const value = parameters.get(parameterId)?.value;

    return Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
  };

  const evidenceStatus = (evidenceId: string): OpNub1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const variableDescription = (name: string): string =>
    variables.get(name)?.description || '';

  const level = (result?.level || '').toUpperCase();

  const describeRequirement = (requirement: {
    id: string;
    title: string;
    status: string;
    attested?: boolean;
    evidenced?: boolean;
  }): string =>
    `${requirement.id} ${requirement.title}: ${requirement.status}${
      requirement.attested
        ? ' (acreditado documentalmente)'
        : requirement.status !== 'NO_APLICA' && requirement.evidenced === false
        ? ' (no demostrado)'
        : ''
    }`;

  const field1 = field(
    'op.nub.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    [
      variableDescription('posicion_P01'),
      ...(result?.requirements || [])
        .filter(requirement => requirement.status !== 'NO_APLICA')
        .map(describeRequirement),
    ],
  );

  const field2 = field(
    'op.nub.1.campo2',
    'Inventario de servicios en la nube',
    'NO_APLICA',
    parameterRows('P-02').length
      ? `Servicios de P-02 (servicio | modelo | proveedor | información | criticidad | uso): ${parameterRows('P-02').join('; ')}.`
      : 'P-02 sin declarar.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  const field3 = field(
    'op.nub.1.campo3',
    'Expediente documental por servicio',
    evidenceStatus('EV-09'),
    'DOCUMENTACIÓN APORTADA, no verificada técnicamente. Por cada servicio utilizado: conformidad ENS o guía CCN-STIC vigente (P-03), informe de pentest del proveedor dentro de P-12 meses (P-10), cifrado y gestión de claves (P-09), región de los datos y de las copias y jurisdicción (P-08).',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  const field4 = field(
    'op.nub.1.campo4',
    'Vigencia de certificaciones y conformidades',
    // Worst of the certifications and the P-03 conformities: an expired conformity cannot show green.
    worstStatus([
      ...(level === 'BAJO' ? [] : [evidenceStatus('EV-08')]),
      asStatus(variables.get('vigencia_conformidades')?.value),
    ]),
    'DOCUMENTACIÓN APORTADA. Fecha de vigencia de cada conformidad (P-03) y de cada certificación reconocida (P-04, R1 desde MEDIA), con los días restantes frente a la fecha de la evaluación. Las vencidas son incumplimiento inmediato.',
    ['EV-08', 'EV-09'],
    [variableDescription('vigencias'), variableDescription('vigencia_conformidades'), ...evidenceObservations('EV-08')],
  );

  const field5 = field(
    'op.nub.1.campo5',
    'Configuración de seguridad del inquilino (R2)',
    level === 'ALTO' ? evidenceStatus('EV-02') : 'NO_APLICA',
    level !== 'ALTO'
      ? 'R2 solo se exige en categoría ALTA.'
      : 'Por cada servicio de P-07: los controles de postura que el propio proveedor evalúa y Wazuh ingiere (Security Hub, Defender, Security Command Center), con los fallidos y los críticos. Wazuh 4.14 no tiene SCA para inquilinos cloud: sin esos hallazgos, R2 no es automatizable.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  const field6 = field(
    'op.nub.1.campo6',
    'Trazabilidad del perímetro cloud',
    evidenceStatus('EV-01'),
    'MEDIDO en el manager de Wazuh. Por cada servicio de P-06: su módulo cloud, dónde está configurado, su última alerta y las de 24 h frente a P-13, y sus errores. Los servicios del inventario sin integración son puntos ciegos de trazabilidad: un hallazgo, no un incumplimiento.',
    ['EV-01'],
    [variableDescription('servicios_sin_integracion'), ...evidenceObservations('EV-01')],
  );

  const field7 = field(
    'op.nub.1.campo7',
    'Operaciones administrativas en los servicios cloud',
    evidenceStatus('EV-04'),
    'MEDIDO en el manager de Wazuh. Operaciones de administración con éxito en la ventana, por actor, con sus operaciones y la fecha de la última, frente a los administradores autorizados de P-11. Destacadas las de actores no autorizados. Sin operaciones, el módulo solo cuenta como medido si trae un registro de administración leído en los últimos 30 días.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  const field8 = field(
    'op.nub.1.campo8',
    'Cifrado y gestión de claves',
    'NO_APLICA',
    'Dato del informe, sin veredicto: Wazuh 4.14 no tiene SCA cloud con el que verificar el cifrado configurado. Lo declarado en P-09 forma parte del expediente documental (op.nub.1.2 c). Enlaza con op.exp.10: las claves de los servicios cloud son material criptográfico del sistema.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const field9 = field(
    'op.nub.1.campo9',
    'Región de los datos y jurisdicción',
    'NO_APLICA',
    'Dato del informe, sin veredicto: la región configurada no se puede medir, porque Wazuh 4.14 no tiene SCA para inquilinos cloud ni el recolector usa credenciales del proveedor. Lo declarado en P-08 forma parte del expediente documental (op.nub.1.2 d).',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const field10 = field(
    'op.nub.1.campo10',
    'Accesos a los servicios cloud',
    'NO_APLICA',
    'Hallazgo del informe, sin veredicto, cruzado con op.acc.6.r8.1 (que lo juzga): inicios de sesión interactivos por servicio, con resultado, segundo factor y orígenes, medidos en el manager de Wazuh. Destacados los accesos con éxito sin segundo factor.',
    ['EV-07'],
    [variableDescription('accesos_cloud'), ...evidenceObservations('EV-07')],
  );

  const r12 = requirements.get('op.nub.1.r1.2');
  const field11 = field(
    'op.nub.1.campo11',
    'Servicios de seguridad en la nube (R1.2)',
    level === 'BAJO' ? 'NO_APLICA' : asStatus(r12?.status),
    level === 'BAJO'
      ? 'R1.2 solo se exige desde categoría MEDIA.'
      : r12?.attested
      ? 'Acreditado documentalmente: cada servicio de seguridad de P-05 declara su verificación de op.pl.5, con referencia y en vigor. Es una declaración, no una medida.'
      : r12?.status === 'NO_APLICA'
      ? 'P-05 declara que no se utiliza ningún servicio en la nube de seguridad («ninguno»).'
      : r12?.evidenced
      ? 'No conforme (declarado): algún servicio de seguridad de P-05 declara que no cumple op.pl.5, o su verificación ha vencido.'
      : 'Sin acreditar: P-05 sin declarar, o con servicios sin la referencia o la vigencia de su verificación de op.pl.5.',
    [],
    r12?.observations || [],
  );

  const documentary = (result?.requirements || []).filter(
    requirement => DOCUMENTARY.includes(requirement.id) || requirement.attested,
  );
  const technical = (result?.requirements || []).filter(
    requirement => !documentary.includes(requirement),
  );
  const field12 = field(
    'op.nub.1.campo12',
    'Puntuación de cumplimiento op.nub.1',
    asStatus(result?.status),
    typeof result?.score === 'number' ? `${result.score} %` : formatValue(result?.status),
    ALL_EVIDENCES,
    [
      `Bloque documental (se negocia con el proveedor): ${variableDescription('bloque_documental') || 'sin datos'}`,
      ...documentary.map(describeRequirement),
      `Bloque técnico (se configura): ${variableDescription('bloque_tecnico') || 'sin datos'}`,
      ...technical.map(describeRequirement),
    ],
  );

  return {
    controlId: result?.control.id || 'op.nub.1',

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
