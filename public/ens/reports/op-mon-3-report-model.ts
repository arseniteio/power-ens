import type { ENSComplianceResult } from '../../../common/ens/core';

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

// El peor de varios estados de requisito; NO_APLICA solo si todos lo son.
const GRAVEDAD: Record<OpMon3ReportFieldStatus, number> = {
  NO_APLICA: -1,
  CUMPLE: 0,
  SIN_DATOS: 1,
  NO_EVALUABLE: 1,
  PARCIAL: 2,
  NO_CUMPLE: 3,
};

const peorDe = (estados: OpMon3ReportFieldStatus[]): OpMon3ReportFieldStatus =>
  !estados.length || estados.every(e => e === 'NO_APLICA')
    ? 'NO_APLICA'
    : estados.reduce<OpMon3ReportFieldStatus>(
        (actual, estado) => (GRAVEDAD[estado] > GRAVEDAD[actual] ? estado : actual),
        'CUMPLE',
      );

/**
 * Modelo de informe de op.mon.3 (Vigilancia).
 *
 * Sale de la hoja «Informe ENSFácil» de la plantilla, ajustado al juicio de la
 * policy (`policies/op-mon-3.policy.ts`):
 *
 *   - la superficie de exposición (R2) se acredita por CAPACIDAD: el recuento
 *     de vulnerabilidades por activo vive en el indexer y se informa «sin
 *     medir» (variable `cve_por_activo`);
 *   - R3.1 y R4 son documentales: sus campos dicen si están ACREDITADOS
 *     DOCUMENTALMENTE (P-ATT), nunca como medidos;
 *   - la latencia alerta → aviso de R5.2 no es medible (Wazuh no anota los
 *     envíos correctos) y se dice;
 *   - las inspecciones tras incidentes (EV-13) se informan sin veredicto: el
 *     registro de incidentes no dice qué incidentes revelaron vulnerabilidades;
 *   - el apartado de componentes externos (sonda de red, cibervigilancia y
 *     pruebas de penetración) sale en ALTA con el estado de cada uno.
 */
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
  const media = level === 'MEDIO' || level === 'ALTO';
  const alta = level === 'ALTO';

  const describeRequirement = (id: string): string => {
    const requirement = requirements.get(id);

    if (!requirement || requirement.status === 'NO_APLICA') {
      return `${id}: no aplica`;
    }

    return `${id} ${requirement.title}: ${requirement.status}${
      requirement.attested
        ? ' (acreditado documentalmente)'
        : requirement.evidenced === false
        ? ' (no demostrado)'
        : ''
    }`;
  };

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.mon.3.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ALL_EVIDENCES,
    (result?.requirements || [])
      .filter(requirement => requirement.status !== 'NO_APLICA')
      .map(requirement => describeRequirement(requirement.id)),
  );

  // Recolección de eventos de seguridad  ·  fuente: Log Collection (EV-01, EV-02)
  const campo2 = field(
    'op.mon.3.campo2',
    'Recolección de eventos de seguridad',
    requirementStatus('op.mon.3.1'),
    'Sistema central de recolección (servicio, eventos procesados y descartados entre pasadas, conexiones de recepción) y cada fuente de P-01 con su máquina, método, eventos, descartes y último evento frente a max_horas_sin_eventos. Relación de las fuentes sin recolección efectiva y de las lagunas detectadas.',
    ['EV-01', 'EV-02'],
    evidenceObservations('EV-01', 'EV-02'),
  );

  // Capacidad de correlación (R1)  ·  fuente: Correlación + ATT&CK (EV-03)
  const campo3 = field(
    'op.mon.3.campo3',
    'Capacidad de correlación (R1)',
    media ? requirementStatus('op.mon.3.r1.1') : 'NO_APLICA',
    media
      ? 'Por conjunto de reglas: reglas cargadas, reglas que correlacionan (frequency y timeframe, o if_matched_*) y técnicas MITRE ATT&CK; los conjuntos de P-02 contrastados, y las detecciones por correlación del periodo.'
      : 'R1 solo se exige en categorías MEDIA y ALTA.',
    ['EV-03'],
    media ? evidenceObservations('EV-03') : [],
  );

  // Superficie de exposición (R2)  ·  fuente: Vuln. Detector + SCA (EV-04)
  const cve = variables.get('cve_por_activo');
  const campo4 = field(
    'op.mon.3.campo4',
    'Superficie de exposición (R2)',
    media ? requirementStatus('op.mon.3.r2.1') : 'NO_APLICA',
    media
      ? 'Se acredita por capacidad: por activo de P-03, su última evaluación de configuración (SCA, con su puntuación) y su inventario de paquetes frente a P-11; del detector de vulnerabilidades, que está habilitado, con su fuente al día y escribiendo sin errores. Vulnerabilidades por activo: sin medir (viven en el indexer y ENSFácil no usa credenciales).'
      : 'R2 solo se exige en categorías MEDIA y ALTA.',
    ['EV-04'],
    media
      ? [
          ...evidenceObservations('EV-04'),
          ...['superficie_sca', 'superficie_inventario', 'superficie_detector']
            .map(nombre => variables.get(nombre))
            .filter(Boolean)
            .map(variable => `${variable!.name.replace('superficie_', '')}: ${formatValue(variable!.value)}`),
          cve ? cve.description : '',
        ]
      : [],
  );

  // Comportamientos anómalos detectados (R3.1)  ·  fuente: Correlación (EV-05)
  const r31 = requirements.get('op.mon.3.r3.1');
  const campo5 = field(
    'op.mon.3.campo5',
    'Comportamientos anómalos detectados (R3.1)',
    alta ? requirementStatus('op.mon.3.r3.1') : 'NO_APLICA',
    !alta
      ? 'R3 solo se exige en categoría ALTA.'
      : r31?.attested
      ? 'Acreditado documentalmente (P-ATT): la línea base validada y su procedimiento de detección. Wazuh no trae motor de líneas base; es una declaración, no una medida.'
      : 'Sin acreditar: Wazuh no trae motor de líneas base y no consta una atestación en P-ATT.',
    ['EV-05'],
    alta ? [...requirementObservations('op.mon.3.r3.1'), ...evidenceObservations('EV-05')] : [],
  );

  // Detección de APT por tráfico de red (R3.2)  ·  fuente: Log + Correlación (EV-06)
  const campo6 = field(
    'op.mon.3.campo6',
    'Detección de APT por tráfico de red (R3.2)',
    alta ? requirementStatus('op.mon.3.r3.2') : 'NO_APLICA',
    alta
      ? 'Si la sonda de P-05 está desplegada: sus alertas ingeridas y la más reciente. Si no lo está: el refuerzo NO está cubierto, y requiere un componente externo (sonda de red), no configuración adicional.'
      : 'R3 solo se exige en categoría ALTA.',
    ['EV-06'],
    alta ? evidenceObservations('EV-06') : [],
  );

  // Observatorio digital (R4)  ·  fuente: CDB lists (EV-07)
  const r4 = requirements.get('op.mon.3.r4.1');
  const campo7 = field(
    'op.mon.3.campo7',
    'Observatorio digital (R4)',
    alta ? requirementStatus('op.mon.3.r4.1') : 'NO_APLICA',
    !alta
      ? 'R4 solo se exige en categoría ALTA.'
      : r4?.attested
      ? 'Acreditado documentalmente (P-ATT): el servicio de cibervigilancia contratado. Las listas de indicadores cargadas se informan.'
      : 'Sin acreditar: el refuerzo exige un servicio externo de cibervigilancia, fuera del alcance de la plataforma, y no consta en P-ATT.',
    ['EV-07'],
    alta ? [...requirementObservations('op.mon.3.r4.1'), ...evidenceObservations('EV-07')] : [],
  );

  // Vigilancia de minería de datos (R5)  ·  fuente: Correlación (EV-08, EV-09)
  const campo8 = field(
    'op.mon.3.campo8',
    'Vigilancia de minería de datos (R5)',
    alta ? peorDe([requirementStatus('op.mon.3.r5.1'), requirementStatus('op.mon.3.r5.2')]) : 'NO_APLICA',
    alta
      ? 'Cada consulta de P-07 con la regla de umbral que la vigila y sus superaciones del periodo; cada destinatario de P-08 con su canal, el nivel desde el que avisa y sus errores de envío. La latencia entre la alerta y el aviso no es medible: Wazuh no anota los envíos correctos.'
      : 'R5 solo se exige en categoría ALTA.',
    ['EV-08', 'EV-09'],
    alta ? evidenceObservations('EV-08', 'EV-09') : [],
  );

  // Inspecciones de seguridad realizadas (R6)  ·  fuente: SCA + VD + ENSFácil (EV-10 a EV-12)
  const campo9 = field(
    'op.mon.3.campo9',
    'Inspecciones de seguridad realizadas (R6)',
    alta
      ? peorDe(['op.mon.3.r6.1', 'op.mon.3.r6.2', 'op.mon.3.r6.3'].map(requirementStatus))
      : 'NO_APLICA',
    alta
      ? 'Por cada inspección: la periodicidad de P-09 y cómo se acredita. La verificación de configuración y el análisis de vulnerabilidades, continuos (SCA y detector) o con su última fila del registro; las pruebas de penetración, con su fecha, ejecutor, hallazgos y estado de remediación.'
      : 'R6 solo se exige en categoría ALTA.',
    ['EV-10', 'EV-11', 'EV-12'],
    alta
      ? [
          describeRequirement('op.mon.3.r6.1'),
          describeRequirement('op.mon.3.r6.2'),
          describeRequirement('op.mon.3.r6.3'),
          ...evidenceObservations('EV-10', 'EV-11', 'EV-12'),
        ]
      : [],
  );

  // Inspecciones tras incidentes (R6)  ·  fuente: ENSFácil (EV-13)
  const campo10 = field(
    'op.mon.3.campo10',
    'Inspecciones tras incidentes (R6)',
    'NO_APLICA',
    alta
      ? 'Se informa, sin veredicto: incidentes del periodo y las inspecciones registradas tras ellos. El registro de incidentes no dice qué incidentes revelaron vulnerabilidades nuevas o subestimadas, que son los que R6 obliga a inspeccionar.'
      : 'R6 solo se exige en categoría ALTA.',
    ['EV-13'],
    alta ? evidenceObservations('EV-13') : [],
  );

  // Componentes externos requeridos  ·  fuente: Declaración ENSFácil
  const externos: [string, string][] = [
    ['op.mon.3.r3.2', 'Sonda de detección en red (R3.2)'],
    ['op.mon.3.r4.1', 'Servicio de cibervigilancia (R4)'],
    ['op.mon.3.r6.3', 'Pruebas de penetración (R6.3)'],
  ];
  const campo11 = field(
    'op.mon.3.campo11',
    'Componentes externos requeridos',
    alta ? peorDe(externos.map(([id]) => requirementStatus(id))) : 'NO_APLICA',
    alta
      ? 'La categoría ALTA exige tres componentes que la plataforma no proporciona: una sonda de detección en red, un servicio de cibervigilancia y pruebas de penetración. Su estado:'
      : 'Solo la categoría ALTA exige componentes externos.',
    [],
    alta
      ? externos.map(([id, nombre]) => {
          const requirement = requirements.get(id);

          return `${nombre}: ${
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

  // Puntuación de cumplimiento op.mon.3  ·  fuente: Motor ENSFácil
  const campo12 = field(
    'op.mon.3.campo12',
    'Puntuación de cumplimiento op.mon.3',
    asStatus(result?.status),
    typeof result?.score === 'number' ? `${result.score} %` : formatValue(result?.status),
    ALL_EVIDENCES,
    [
      ...(result?.requirements || []).map(requirement =>
        requirement.status === 'NO_APLICA'
          ? `${requirement.id}: no aplica`
          : `${requirement.id}: ${requirement.status}${
              requirement.attested
                ? ', acreditado documentalmente (no se satisface con la herramienta)'
                : requirement.evidenced === false
                ? ', no demostrado'
                : ''
            }`,
      ),
      alta
        ? `Dependen de componentes externos: ${externos.map(([id]) => id).join(', ')}; el resto, de la configuración de la plataforma.`
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
