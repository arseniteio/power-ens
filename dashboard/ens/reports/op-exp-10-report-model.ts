import type { ENSComplianceResult } from '../core';

export type OpExp10ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface OpExp10ReportField {
  id: string;
  title: string;
  status: OpExp10ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface OpExp10ReportModel {
  controlId: string;
  status: OpExp10ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: OpExp10ReportField[];
}

const STATUS_VALUES = new Set<OpExp10ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): OpExp10ReportFieldStatus =>
  STATUS_VALUES.has(value as OpExp10ReportFieldStatus)
    ? (value as OpExp10ReportFieldStatus)
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
  status: OpExp10ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): OpExp10ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Modelo de informe de op.exp.10 (Protección de claves criptográficas).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpExp10ReportModel = (
  result: ENSComplianceResult | undefined,
): OpExp10ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpExp10ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.exp.10.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  // Inventario de material criptográfico  ·  fuente: Configuración + Syscollector (P-01, EV-07)
  const campo2 = field(
    'op.exp.10.campo2',
    'Inventario de material criptográfico',
    evidenceStatus('EV-07'),
    'Relación de claves y certificados del sistema con finalidad, soporte, ubicación, responsable de custodia, algo',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Accesos al material criptográfico  ·  fuente: FIM whodata (EV-01)
  const campo3 = field(
    'op.exp.10.campo3',
    'Accesos al material criptográfico',
    evidenceStatus('EV-01'),
    'Registro de todos los accesos, lecturas y modificaciones de los ficheros de P-02 con la cuenta, el proceso y l',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Indicios de copia o exfiltración de claves  ·  fuente: FIM + ENSFácil (EV-02)
  const campo4 = field(
    'op.exp.10.campo4',
    'Indicios de copia o exfiltración de claves',
    evidenceStatus('EV-02'),
    'Ficheros con patrón de material criptográfico detectados fuera de las ubicaciones autorizadas, y correlaciones',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Protección de los almacenes de claves  ·  fuente: FIM + SCA (EV-08)
  const campo5 = field(
    'op.exp.10.campo5',
    'Protección de los almacenes de claves',
    evidenceStatus('EV-08'),
    'Por cada fichero de clave: propietario, permisos actuales, permisos esperados y marca de conformidad. Relación',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Conformidad de algoritmos y parámetros (R1)  ·  fuente: SCA (EV-03)
  const campo6 = field(
    'op.exp.10.campo6',
    'Conformidad de algoritmos y parámetros (R1)',
    evidenceStatus('EV-03'),
    'Por cada servicio de P-04: versiones de protocolo admitidas, suites de cifrado habilitadas, algoritmos de firm',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Uso efectivo de protocolos y cifradores (R1)  ·  fuente: Log Collection (EV-04)
  const campo7 = field(
    'op.exp.10.campo7',
    'Uso efectivo de protocolos y cifradores (R1)',
    evidenceStatus('EV-04'),
    'Protocolos y suites efectivamente negociados en las conexiones del período, frente a los configurados como mín',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Aislamiento de medios de generación y explotación  ·  fuente: Syscollector + SCA (EV-05)
  const campo8 = field(
    'op.exp.10.campo8',
    'Aislamiento de medios de generación y explotación',
    evidenceStatus('EV-05'),
    'Verificación de que no se ejecutan operaciones de generación de claves en los sistemas de explotación declarad',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Claves retiradas y su archivo  ·  fuente: FIM + ENSFácil (EV-06)
  const campo9 = field(
    'op.exp.10.campo9',
    'Claves retiradas y su archivo',
    evidenceStatus('EV-06'),
    'Claves declaradas como retiradas en P-01 con verificación de que ya no están presentes en los medios de explot',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Fases del ciclo de vida — acreditación documental  ·  fuente: Configuración ENSFácil (P-07)
  //
  // Generación y custodia son en parte verificables (EV-05, EV-01, EV-02,
  // EV-08); transporte y destrucción no dejan rastro en ninguna máquina y solo
  // se acreditan con el procedimiento declarado.
  const procedimiento = parameterValue('P-07');
  const campo11 = field(
    'op.exp.10.campo11',
    'Fases del ciclo de vida — acreditación documental',
    procedimiento === undefined || procedimiento === null || String(procedimiento).trim() === ''
      ? 'NO_EVALUABLE'
      : 'CUMPLE',
    formatValue(procedimiento),
    [],
    [
      'Generación: verificable en parte (EV-05, sin generación en explotación).',
      'Transporte al punto de explotación: solo documental (P-07).',
      'Custodia durante la explotación: verificable (EV-01, EV-02, EV-08).',
      'Archivo tras la retirada: verificable en parte (EV-06, EV-07).',
      'Destrucción final: solo documental (P-07).',
    ],
  );

  // Conformidad de cifradores con guía CCN-STIC (R2)  ·  fuente: Configuración ENSFácil (P-09)
  const campo12 = field(
    'op.exp.10.campo12',
    'Conformidad de cifradores con guía CCN-STIC (R2)',
    'NO_APLICA',
    formatValue(parameterValue('P-09')),
    [],
    ['R2 no es exigible en ninguna categoría: se recoge la declaración si existe, sin efecto en el cumplimiento.'],
  );

  // Puntuación de cumplimiento op.exp.10  ·  fuente: Motor ENSFácil
  const campo10 = field(
    'op.exp.10.campo10',
    'Puntuación de cumplimiento op.exp.10',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.exp.10',

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
      campo11,
      campo12,
      campo10,
    ],
  };
};
