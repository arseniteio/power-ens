import type { ENSComplianceResult } from '../core';

export type OpMon1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpMon1ReportField {
  id: string;
  title: string;
  status: OpMon1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpMon1ReportModel {
  controlId: string;
  status: OpMon1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpMon1ReportField[];
}

const STATUS_VALUES = new Set<OpMon1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpMon1ReportFieldStatus =>
  STATUS_VALUES.has(value as OpMon1ReportFieldStatus)
    ? (value as OpMon1ReportFieldStatus)
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
  status: OpMon1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpMon1ReportField => ({
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
 * Modelo de informe de op.mon.1 (Detección de intrusión).
 *
 * Sale de la hoja «Informe ENSFácil» de la plantilla, ajustado al juicio de la
 * policy (`policies/op-mon-1.policy.ts`):
 *
 *   - R2 es documental: su campo enseña si está ACREDITADO DOCUMENTALMENTE
 *     (P-05 o P-ATT), nunca como medido. Que cada alerta se tratara conforme a
 *     su procedimiento (EV-06) es un dato del informe que mide op.exp.7.
 *   - R3 no se exige en ninguna categoría: su campo sale NO_APLICA y enseña la
 *     cobertura DE HECHO que la policy ha medido (variable
 *     `cobertura_de_hecho_R3`), que acredita el enunciado general del bloque.
 *   - La vigencia del ruleset y las exclusiones (EV-08) son de R1: en BÁSICA no
 *     aplican.
 */
export const buildOpMon1ReportModel = (
  result: ENSComplianceResult | undefined,
): OpMon1ReportModel => {
  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const requirements = new Map(
    (result?.requirements || []).map(requirement => [requirement.id, requirement]),
  );

  const variables = new Map(
    (result?.policyRuntime?.runtimeVariables || []).map(variable => [variable.name, variable]),
  );

  const evidenceStatus = (evidenceId: string): OpMon1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.mon.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    (result?.requirements || [])
      .filter(requirement => requirement.status !== 'NO_APLICA')
      .map(requirement => `${requirement.id} ${requirement.title}: ${requirement.status}${requirement.attested ? ' (acreditado documentalmente)' : ''}`),
  );

  // Capacidad de detección desplegada  ·  fuente: Wazuh HIDS (EV-01)
  const campo2 = field(
    'op.mon.1.campo2',
    'Capacidad de detección desplegada',
    evidenceStatus('EV-01'),
    'Motor de reglas del manager: servicio activo, eventos procesados entre pasadas, versión de Wazuh, reglas cargadas y con técnica MITRE ATT&CK. Es la acreditación conjunta del requisito base y de R1; en R1 se exigen además los conjuntos de reglas de P-03.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Cobertura de la detección  ·  fuente: Estado de agentes (EV-02)
  const campo3 = field(
    'op.mon.1.campo3',
    'Cobertura de la detección',
    evidenceStatus('EV-02'),
    'Por cada sistema de P-01: su agente, estado de conexión, último contacto y la última pasada de FIM y de SCA frente a P-10. Relación nominal de los sistemas sin detección efectiva.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Detecciones del período  ·  fuente: Log + Correlación (EV-03)
  const campo4 = field(
    'op.mon.1.campo4',
    'Detecciones del período',
    evidenceStatus('EV-03'),
    'Por cada sistema de P-01 conectado: su última detección, las alertas y el nivel máximo de las últimas 24 h, las reglas distintas y las técnicas MITRE ATT&CK. Un sistema activo sin detecciones en P-09 días es un hallazgo.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Cobertura del análisis de riesgos  ·  fuente: ENSFácil (EV-04)
  const campo5 = field(
    'op.mon.1.campo5',
    'Cobertura del análisis de riesgos',
    evidenceStatus('EV-04'),
    'Matriz que cruza cada situación de compromiso de P-04 con las reglas cargadas que la detectan. Las situaciones sin regla, o con reglas que el manager no carga, son los puntos ciegos declarados del control.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Detección en red  ·  fuente: Log Collection (EV-05)
  const campo6 = field(
    'op.mon.1.campo6',
    'Detección en red',
    evidenceStatus('EV-05'),
    'Si P-02 la exige: los NIDS cuyos eventos ingiere el manager, por dónde llegan y su última alerta frente a P-09. Si no la exige: la referencia del análisis de riesgos que lo justifica.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Vigencia del conjunto de reglas  ·  fuente: ENSFácil (EV-08)
  const campo7 = field(
    'op.mon.1.campo7',
    'Vigencia del conjunto de reglas',
    evidenceStatus('EV-08'),
    'Versión del ruleset, fecha de su fichero de reglas más reciente y días transcurridos frente a P-08. Es el equivalente, para un sistema de detección, a la antigüedad de las firmas de un antivirus.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Exclusiones y afinación  ·  fuente: ENSFácil (EV-08)
  const campo8 = field(
    'op.mon.1.campo8',
    'Exclusiones y afinación',
    evidenceStatus('EV-08'),
    'Ficheros de reglas excluidos y reglas reescritas a nivel 0 en el manager, cada uno contra P-06: su motivo y quién lo aprobó. Un silenciamiento sin constancia es un hallazgo de R1.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Tratamiento de alertas conforme a procedimiento (R2)  ·  fuente: P-05 / P-ATT (+ EV-06, dato del informe)
  const r2 = requirements.get('op.mon.1.r2.1');
  const campo9 = field(
    'op.mon.1.campo9',
    'Procedimientos de respuesta a las alertas (R2)',
    level === 'ALTO' ? asStatus(r2?.status) : 'NO_APLICA',
    level !== 'ALTO'
      ? 'R2 solo se exige en categoría ALTA.'
      : r2?.attested
      ? 'Acreditado documentalmente: procedimientos de respuesta declarados (P-05 o P-ATT). Es una declaración, no una medida.'
      : 'Sin acreditar: no constan procedimientos de respuesta completos en P-05 ni una atestación en P-ATT.',
    ['EV-06'],
    [...(r2?.observations || []), ...evidenceObservations('EV-06')],
  );

  // Acciones predeterminadas ejecutadas (R3)  ·  fuente: Active Response (EV-07)
  const r3 = variables.get('cobertura_de_hecho_R3');
  const campo10 = field(
    'op.mon.1.campo10',
    'Acciones predeterminadas ejecutadas (R3)',
    'NO_APLICA',
    r3
      ? `R3 no es exigible en ninguna categoría. Cobertura de hecho: ${formatValue(r3.value)}.`
      : 'R3 no es exigible en ninguna categoría.',
    ['EV-07'],
    [...(r3 ? [r3.description] : []), ...evidenceObservations('EV-07')],
  );

  // Puntuación de cumplimiento op.mon.1  ·  fuente: Motor ENSFácil
  const campo11 = field(
    'op.mon.1.campo11',
    'Puntuación de cumplimiento op.mon.1',
    asStatus(result?.status),
    typeof result?.score === 'number' ? `${result.score} %` : formatValue(result?.status),
    ALL_EVIDENCES,
    [
      ...(result?.requirements || []).map(requirement =>
        requirement.status === 'NO_APLICA'
          ? `${requirement.id}: no aplica`
          : `${requirement.id}: ${requirement.status}${requirement.attested ? ', acreditado documentalmente (no se satisface con la herramienta)' : requirement.evidenced === false ? ', no demostrado' : ''}`,
      ),
      r3 ? `op.mon.1.r3.1 (no exigible): cobertura de hecho ${formatValue(r3.value)}` : '',
    ],
  );

  return {
    controlId: result?.control.id || 'op.mon.1',

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
