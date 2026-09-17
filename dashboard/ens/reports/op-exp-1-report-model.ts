import type { ENSComplianceResult } from '../core';

export type OpExp1ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp1ReportField {
  id: string;
  title: string;
  status: OpExp1ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp1ReportModel {
  controlId: string;
  status: OpExp1ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp1ReportField[];
}

const STATUS_VALUES = new Set<OpExp1ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp1ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp1ReportFieldStatus)
    ? (value as OpExp1ReportFieldStatus)
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
  status: OpExp1ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp1ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.1 (Inventario de activos).
 *
 * Sigue la hoja "Informe ENSFácil" de la plantilla del auditor. Cada campo
 * enseña lo que el motor ha OBSERVADO —los atributos del hecho que decidió su
 * evidencia— y lo que la organización ha DECLARADO en la pantalla, por
 * separado: el informe tiene que distinguir la parte automatizada de la que
 * depende del cliente, que es donde suelen aparecer los hallazgos.
 */
export const buildOpExp1ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp1ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  // Atributos del hecho que decidió la evidencia, en el orden pedido. Lo que el
  // hecho no trae no se inventa: se omite.
  const observed = (evidenceId: string, fields: string[]): string => {
    const attributes = evidences.get(evidenceId)?.resolvedAttributes || {};

    const parts = fields
      .filter(name => {
        const value = attributes[name];

        return value !== undefined && value !== null && value !== '';
      })
      .map(name => `${name}: ${formatValue(attributes[name])}`);

    return parts.length ? parts.join(' · ') : 'Sin hecho observado';
  };

  const declared = (parameterId: string): string =>
    `${parameterId}: ${formatValue(parameterValue(parameterId))}`;

  const TODAS = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07'];

  const campo1 = field(
    'op.exp.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    TODAS,
    TODAS.flatMap(evidenceObservations),
  );

  const campo2 = field(
    'op.exp.1.campo2',
    'Inventario consolidado de activos',
    evidenceStatus('EV-01'),
    observed('EV-01', [
      'activo',
      'fqdn',
      'sistema_operativo',
      'version_so',
      'kernel',
      'fabricante',
      'modelo',
      'num_serie',
      'virtualizacion',
      'cpus',
      'memoria_mb',
    ]),
    ['EV-01', 'EV-02', 'EV-03'],
    [
      `Red: ${observed('EV-03', ['direcciones', 'servicios'])}`,
      // Solo en un servidor de directorio: lo que acredita su naturaleza.
      `Directorio: ${observed('EV-03', [
        'directorio_paquete',
        'directorio_version',
        'directorio_escucha',
        'directorio_sufijo',
        'directorio_dominios',
        'directorio_responde',
      ])}`,
      `Responsable y naturaleza declarados: ${declared('P-01')}`,
      ...evidenceObservations('EV-01'),
    ],
  );

  const campo3 = field(
    'op.exp.1.campo3',
    'Cobertura del inventario',
    evidenceStatus('EV-07'),
    declared('P-01'),
    ['EV-07'],
    [`Taxonomía: ${declared('P-03')}`, ...evidenceObservations('EV-07')],
  );

  const campo4 = field(
    'op.exp.1.campo4',
    'Relación de componentes software',
    evidenceStatus('EV-02'),
    observed('EV-02', [
      'gestor',
      'paquetes',
      'snaps',
      'huella',
      'directorio_paquete',
      'directorio_version',
      'ficheros_fuera_de_gestor',
    ]),
    ['EV-02'],
    [
      'Refuerzo R4 cubierto de hecho aunque no es exigible en ninguna categoría.',
      ...evidenceObservations('EV-02'),
    ],
  );

  const campo5 = field(
    'op.exp.1.campo5',
    'Estado de monitorización de los equipos',
    evidenceStatus('EV-04'),
    observed('EV-04', ['estado_agente', 'ultimo_keepalive', 'version_agente']),
    ['EV-04'],
    [
      `Antigüedad máxima admitida: ${declared('P-08')} h`,
      'Refuerzo R2 cubierto de hecho aunque no es exigible en ninguna categoría.',
      ...evidenceObservations('EV-04'),
    ],
  );

  const campo6 = field(
    'op.exp.1.campo6',
    'Activos no inventariados detectados',
    evidenceStatus('EV-05'),
    observed('EV-05', ['ip', 'mac', 'es_pasarela', 'primera_observacion']),
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  const campo7 = field(
    'op.exp.1.campo7',
    'Cambios en el inventario durante el período',
    evidenceStatus('EV-06'),
    observed('EV-02', ['altas', 'bajas', 'actualizaciones', 'linea_base']),
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  const campo8 = field(
    'op.exp.1.campo8',
    'Activos sin agente — inventario declarado',
    parameterValue('P-02') === undefined ? 'SIN_DATOS' : evidenceStatus('EV-05'),
    declared('P-02'),
    [],
    [
      'Inventario declarado. Solo se verifica contra la red la parte que se observa desde las máquinas con agente (EV-05).',
    ],
  );

  const campo9 = field(
    'op.exp.1.campo9',
    'Activos críticos',
    'NO_APLICA',
    declared('P-06'),
    [],
    ['Refuerzo R3: no exigible en ninguna categoría.'],
  );

  const campo10 = field(
    'op.exp.1.campo10',
    'Estado de la revisión periódica del inventario',
    evidenceStatus('EV-06'),
    observed('EV-06', ['fecha', 'alcance', 'responsable']),
    ['EV-06'],
    [`Plazo: ${declared('P-04')} días`, ...evidenceObservations('EV-06')],
  );

  const campo11 = field(
    'op.exp.1.campo11',
    'Puntuación de cumplimiento op.exp.1',
    asStatus(result?.status),
    formatValue(result?.score),
    TODAS,
    [
      'Solo puntúa op.exp.1.1. Los refuerzos R1 a R4 no son exigibles en ninguna categoría.',
    ],
  );

  return {
    controlId: result?.control.id || 'op.exp.1',

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
