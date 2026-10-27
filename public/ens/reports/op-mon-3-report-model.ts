import type { ENSComplianceResult } from '../../../common/ens/core';
import { statusLabel } from '../../../common/ens/core/status-label';

export type OpMon3ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpMon3ReportField {
  id: string;
  title: string;
  status: OpMon3ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpMon3ReportModel {
  controlId: string;
  status: OpMon3ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpMon3ReportField[];
}

const STATUS_VALUES = new Set<OpMon3ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpMon3ReportFieldStatus =>
  STATUS_VALUES.has(value as OpMon3ReportFieldStatus)
    ? (value as OpMon3ReportFieldStatus)
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
  status: OpMon3ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpMon3ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

const ALL_EVIDENCES = [
  'EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07',
  'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13',
];

// Worst of several requirement states; NO_APLICA only if all are.
const SEVERITY_RANK: Record<OpMon3ReportFieldStatus, number> = {
  NO_APLICA: -1,
  CUMPLE: 0,
  SIN_DATOS: 1,
  NO_EVALUABLE: 1,
  PARCIAL: 2,
  NO_CUMPLE: 3,
};

const worstOf = (statuses: OpMon3ReportFieldStatus[]): OpMon3ReportFieldStatus =>
  !statuses.length || statuses.every(e => e === 'NO_APLICA')
    ? 'NO_APLICA'
    : statuses.reduce<OpMon3ReportFieldStatus>(
        (current, status) => (SEVERITY_RANK[status] > SEVERITY_RANK[current] ? status : current),
        'CUMPLE',
      );

/** Report model of op.mon.3: translates the engine result into report fields. */
export const buildOpMon3ReportModel = (
  result: ENSComplianceResult | undefined,
): OpMon3ReportModel => {
  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const requirements = new Map(
    (result?.requirements || []).map(requirement => [requirement.id, requirement]),
  );

  const variables = new Map(
    (result?.policyRuntime?.runtimeVariables || []).map(variable => [variable.name, variable]),
  );

  const evidenceObservations = (...ids: string[]): string[] =>
    ids.flatMap(id => evidences.get(id)?.observations || []);

  const requirementStatus = (id: string): OpMon3ReportFieldStatus =>
    requirements.has(id) ? asStatus(requirements.get(id)?.status) : 'NO_APLICA';

  const requirementObservations = (...ids: string[]): string[] =>
    ids.flatMap(id => requirements.get(id)?.observations || []);

  const level = (result?.level || '').toUpperCase();
  const average = level === 'MEDIO' || level === 'ALTO';
  const high = level === 'ALTO';

  const describeRequirement = (id: string): string => {
    const requirement = requirements.get(id);

    if (!requirement || requirement.status === 'NO_APLICA') {
      return `${id}: no aplica`;
    }

    return `${id} ${requirement.title}: ${statusLabel(requirement.status)}${
      requirement.attested
        ? ' (acreditado documentalmente)'
        : requirement.evidenced === false
        ? ' (no demostrado)'
        : ''
    }`;
  };

  const field1 = field(
    'op.mon.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    (result?.requirements || [])
      .filter(requirement => requirement.status !== 'NO_APLICA')
      .map(requirement => describeRequirement(requirement.id)),
  );

  const field2 = field(
    'op.mon.3.campo2',
    'Recolección de eventos de seguridad',
    requirementStatus('op.mon.3.1'),
    'Sistema central de recolección (servicio, eventos procesados y descartados entre pasadas, conexiones de recepción) y cada fuente de P-01 con su máquina, método, eventos, descartes y último evento frente a max_horas_sin_eventos.',
    ['EV-01', 'EV-02'],
    evidenceObservations('EV-01', 'EV-02'),
  );

  const field3 = field(
    'op.mon.3.campo3',
    'Capacidad de correlación (R1)',
    average ? requirementStatus('op.mon.3.r1.1') : 'NO_APLICA',
    average
      ? 'Por conjunto de reglas: reglas cargadas, reglas que correlacionan (frequency y timeframe, o if_matched_*) y técnicas MITRE ATT&CK; los conjuntos de P-02 contrastados, y las detecciones por correlación del periodo.'
      : 'R1 solo se exige en categorías MEDIA y ALTA.',
    ['EV-03'],
    average ? evidenceObservations('EV-03') : [],
  );

  const cve = variables.get('cve_por_activo');
  const field4 = field(
    'op.mon.3.campo4',
    'Superficie de exposición (R2)',
    average ? requirementStatus('op.mon.3.r2.1') : 'NO_APLICA',
    average
      ? 'Se acredita por capacidad: por activo de P-03, su última evaluación de configuración (SCA, con su puntuación) y su inventario de paquetes frente a P-11; del detector de vulnerabilidades, que está habilitado, con su fuente al día y escribiendo sin errores. Vulnerabilidades por activo: sin medir (viven en el indexer y ENSFácil no usa credenciales).'
      : 'R2 solo se exige en categorías MEDIA y ALTA.',
    ['EV-04'],
    average
      ? [
          ...evidenceObservations('EV-04'),
          ...['superficie_sca', 'superficie_inventario', 'superficie_detector']
            .map(name => variables.get(name))
            .filter(Boolean)
            .map(variable => `${variable!.name.replace('superficie_', '')}: ${formatValue(variable!.value)}`),
          cve ? cve.description : '',
        ]
      : [],
  );

  const r31 = requirements.get('op.mon.3.r3.1');
  const field5 = field(
    'op.mon.3.campo5',
    'Comportamientos anómalos detectados (R3.1)',
    high ? requirementStatus('op.mon.3.r3.1') : 'NO_APLICA',
    !high
      ? 'R3 solo se exige en categoría ALTA.'
      : r31?.attested
      ? 'Acreditado documentalmente (P-ATT): la línea base validada y su procedimiento de detección. Wazuh no trae motor de líneas base; es una declaración, no una medida.'
      : 'Sin acreditar: Wazuh no trae motor de líneas base y no consta una atestación en P-ATT.',
    ['EV-05'],
    high ? [...requirementObservations('op.mon.3.r3.1'), ...evidenceObservations('EV-05')] : [],
  );

  const field6 = field(
    'op.mon.3.campo6',
    'Detección de APT por tráfico de red (R3.2)',
    high ? requirementStatus('op.mon.3.r3.2') : 'NO_APLICA',
    high
      ? 'Si la sonda de P-05 está desplegada: sus alertas ingeridas y la más reciente. Si no lo está: el refuerzo NO está cubierto, y requiere un componente externo (sonda de red), no configuración adicional.'
      : 'R3 solo se exige en categoría ALTA.',
    ['EV-06'],
    high ? evidenceObservations('EV-06') : [],
  );

  const r4 = requirements.get('op.mon.3.r4.1');
  const field7 = field(
    'op.mon.3.campo7',
    'Observatorio digital (R4)',
    high ? requirementStatus('op.mon.3.r4.1') : 'NO_APLICA',
    !high
      ? 'R4 solo se exige en categoría ALTA.'
      : r4?.attested
      ? 'Acreditado documentalmente (P-ATT): el servicio de cibervigilancia contratado. Las listas de indicadores cargadas se informan.'
      : 'Sin acreditar: el refuerzo exige un servicio externo de cibervigilancia, fuera del alcance de la plataforma, y no consta en P-ATT.',
    ['EV-07'],
    high ? [...requirementObservations('op.mon.3.r4.1'), ...evidenceObservations('EV-07')] : [],
  );

  const field8 = field(
    'op.mon.3.campo8',
    'Vigilancia de minería de datos (R5)',
    high ? worstOf([requirementStatus('op.mon.3.r5.1'), requirementStatus('op.mon.3.r5.2')]) : 'NO_APLICA',
    high
      ? 'Cada consulta de P-07 con la regla de umbral que la vigila y sus superaciones del periodo; cada destinatario de P-08 con su canal, el nivel desde el que avisa y sus errores de envío. La latencia entre la alerta y el aviso no es medible: Wazuh no anota los envíos correctos.'
      : 'R5 solo se exige en categoría ALTA.',
    ['EV-08', 'EV-09'],
    high ? evidenceObservations('EV-08', 'EV-09') : [],
  );

  const field9 = field(
    'op.mon.3.campo9',
    'Inspecciones de seguridad realizadas (R6)',
    high
      ? worstOf(['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].map(requirementStatus))
      : 'NO_APLICA',
    high
      ? 'Por cada inspección: la periodicidad de P-09 y cómo se acredita. La verificación de configuración y el análisis de vulnerabilidades, continuos (SCA y detector) o con su última fila del registro; las pruebas de penetración, con su fecha, ejecutor, hallazgos y estado de remediación.'
      : 'R6 solo se exige en categoría ALTA.',
    ['EV-10', 'EV-11', 'EV-12'],
    high
      ? [
          describeRequirement('op.mon.3.r6.1'),
          describeRequirement('op.mon.3.r6.2'),
          describeRequirement('op.mon.3.r6.3'),
          ...evidenceObservations('EV-10', 'EV-11', 'EV-12'),
        ]
      : [],
  );

  const field10 = field(
    'op.mon.3.campo10',
    'Inspecciones tras incidentes (R6)',
    'NO_APLICA',
    high
      ? 'Se informa, sin veredicto: incidentes del periodo y las inspecciones registradas tras ellos. El registro de incidentes no dice qué incidentes revelaron vulnerabilidades nuevas o subestimadas, que son los que R6 obliga a inspeccionar.'
      : 'R6 solo se exige en categoría ALTA.',
    ['EV-13'],
    high ? evidenceObservations('EV-13') : [],
  );

  const external: [string, string][] = [
    ['op.mon.3.r3.2', 'Sonda de detección en red (R3.2)'],
    ['op.mon.3.r4.1', 'Servicio de cibervigilancia (R4)'],
    ['op.mon.3.r6.3', 'Pruebas de penetración (R6.3)'],
  ];
  const field11 = field(
    'op.mon.3.campo11',
    'Componentes externos requeridos',
    high ? worstOf(external.map(([id]) => requirementStatus(id))) : 'NO_APLICA',
    high
      ? 'La categoría ALTA exige tres componentes que la plataforma no proporciona: una sonda de detección en red, un servicio de cibervigilancia y pruebas de penetración. Su estado:'
      : 'Solo la categoría ALTA exige componentes externos.',
    [],
    high
      ? external.map(([id, name]) => {
          const requirement = requirements.get(id);

          return `${name}: ${
            !requirement
              ? 'sin evaluar'
              : requirement.status === 'CUMPLE'
              ? requirement.attested
                ? 'acreditado documentalmente'
                : 'desplegado y operativo'
              : 'no cubierto'
          }`;
        })
      : [],
  );

  const field12 = field(
    'op.mon.3.campo12',
    'Puntuación de cumplimiento op.mon.3',
    asStatus(result?.status),
    typeof result?.score === 'number' ? `${result.score} %` : formatValue(result?.status),
    ALL_EVIDENCES,
    [
      ...(result?.requirements || []).map(requirement =>
        requirement.status === 'NO_APLICA'
          ? `${requirement.id}: no aplica`
          : `${requirement.id}: ${statusLabel(requirement.status)}${
              requirement.attested
                ? ', acreditado documentalmente (no se satisface con la herramienta)'
                : requirement.evidenced === false
                ? ', no demostrado'
                : ''
            }`,
      ),
      high
        ? `Dependen de componentes externos: ${external.map(([id]) => id).join(', ')}; el resto, de la configuración de la plataforma.`
        : '',
    ],
  );

  return {
    controlId: result?.control.id || 'op.mon.3',

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
