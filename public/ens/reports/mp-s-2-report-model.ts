import type { ENSComplianceResult } from '../../../common/ens/core';

export type MpS2ReportFieldStatus =
  | 'CUMPLE'
  | 'PARCIAL'
  | 'NO_CUMPLE'
  | 'NO_EVALUABLE'
  | 'NO_APLICA'
  | 'SIN_DATOS';

export interface MpS2ReportField {
  id: string;
  title: string;
  status: MpS2ReportFieldStatus;
  value: string;
  evidenceIds: string[];
  details: string[];
  producerGaps: string[];
}

export interface MpS2ReportModel {
  controlId: string;
  status: MpS2ReportFieldStatus;
  score: number | null;
  coverage: number | null;
  level: string;
  evaluatedAt?: string;
  fields: MpS2ReportField[];
}

const STATUS_VALUES = new Set<MpS2ReportFieldStatus>([
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
]);

const asStatus = (value: unknown): MpS2ReportFieldStatus =>
  STATUS_VALUES.has(value as MpS2ReportFieldStatus)
    ? (value as MpS2ReportFieldStatus)
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
  status: MpS2ReportFieldStatus,
  value: string,
  evidenceIds: string[],
  details: string[] = [],
  producerGaps: string[] = [],
): MpS2ReportField => ({
  id,
  title,
  status,
  value,
  evidenceIds,
  details: details.filter(Boolean),
  producerGaps,
});

/**
 * Report model of mp.s.2 (Protección de servicios y aplicaciones web).
 * Generated from the "Informe ENSFácil" sheet of the Excel.
 * The parameters shown in each field are chosen from the
 * field description in the Excel.
 */
export const buildMpS2ReportModel = (
  result: ENSComplianceResult | undefined,
): MpS2ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): MpS2ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'mp.s.2.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13'],
    evidenceObservations('EV-01'),
  );

  // Aplicaciones web en alcance y su exposición  ·  fuente: Configuración + Log (EV-01)
  const campo2 = field(
    'mp.s.2.campo2',
    'Aplicaciones web en alcance y su exposición',
    evidenceStatus('EV-01'),
    'Aplicaciones de P-01 con su exposición, tecnología, si requieren control de acceso y volumen de peticiones registradas. Priorizadas por exposición: las accesibles desde internet con información protegida concentran el riesgo.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Accesos obviando la autenticación  ·  fuente: Correlación (EV-02)
  const campo3 = field(
    'mp.s.2.campo3',
    'Accesos obviando la autenticación',
    evidenceStatus('EV-02'),
    'Accesos exitosos a rutas de P-03 sin autenticación previa registrada, con la ruta, el origen y la fecha. Es el supuesto central de mp.s.2.1 y el hallazgo de mayor gravedad del requisito base.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Vías alternativas de acceso  ·  fuente: SCA + Log (EV-03)
  const campo4 = field(
    'mp.s.2.campo4',
    'Vías alternativas de acceso',
    evidenceStatus('EV-03'),
    'Estado de las comprobaciones de P-04 por servidor y accesos exitosos detectados por vías no previstas. Es el apartado más desatendido y el que suele permitir descargar documentos sin pasar por la aplicación.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Ataques web detectados por tipo  ·  fuente: Log Collection (EV-04, EV-06, EV-08)
  const campo5 = field(
    'mp.s.2.campo5',
    'Ataques web detectados por tipo',
    evidenceStatus('EV-04'),
    'Volumen de intentos por cada amenaza que enumera el requisito: manipulación de URL, inyección de código y cross site scripting, con origen, aplicación objetivo y evolución en el período.',
    ['EV-04', 'EV-06', 'EV-08'],
    evidenceObservations('EV-04'),
  );

  // Ataques con respuesta satisfactoria  ·  fuente: Correlación (EV-09)
  const campo6 = field(
    'mp.s.2.campo6',
    'Ataques con respuesta satisfactoria',
    evidenceStatus('EV-09'),
    'Relación de los ataques que obtuvieron respuesta satisfactoria o produjeron efectos observables, con la evidencia correlacionada: código y tamaño de respuesta, errores de base de datos, ficheros creados, procesos lanzados. Es el apartado que distingue este informe de un recuento de intentos.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Escalado de privilegios en la aplicación  ·  fuente: Correlación (EV-07)
  const campo7 = field(
    'mp.s.2.campo7',
    'Escalado de privilegios en la aplicación',
    evidenceStatus('EV-07'),
    'Accesos a funcionalidad o datos de nivel superior al de la sesión, y manipulación de identificadores para acceder a recursos ajenos. Acredita mp.s.2.2.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Protección de las cookies de sesión  ·  fuente: Log + SCA (EV-05)
  const campo8 = field(
    'mp.s.2.campo8',
    'Protección de las cookies de sesión',
    evidenceStatus('EV-05'),
    'Atributos de las cookies emitidas por aplicación frente a los exigidos en P-05, y detección de uso de una misma sesión desde orígenes distintos. Enlaza con mp.com.3.2 c).',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Vulnerabilidades de la plataforma web  ·  fuente: Vuln. Detector + SCA (EV-10)
  const campo9 = field(
    'mp.s.2.campo9',
    'Vulnerabilidades de la plataforma web',
    evidenceStatus('EV-10'),
    'Vulnerabilidades conocidas en servidores web, motores de aplicación y componentes, y resultado de los checks de configuración de servidor. Cubre la capa que las auditorías de código no alcanzan.',
    ['EV-10'],
    evidenceObservations('EV-10'),
  );

  // Auditorías de seguridad realizadas  ·  fuente: ENSFácil (EV-11)
  const campo10 = field(
    'mp.s.2.campo10',
    'Auditorías de seguridad realizadas',
    evidenceStatus('EV-11'),
    'Auditorías de P-08 con fecha, aplicación, modalidad, metodología y herramientas. Control de la frecuencia de P-06, aplicaciones nunca auditadas, y verificación de que la modalidad de P-07 es admisible para la categoría del sistema.',
    ['EV-11'],
    evidenceObservations('EV-11'),
  );

  // Resolución de los hallazgos de auditoría (R2)  ·  fuente: ENSFácil + Log (EV-12)
  const campo11 = field(
    'mp.s.2.campo11',
    'Resolución de los hallazgos de auditoría (R2)',
    level === 'ALTO'
      ? evidenceStatus('EV-12')
      : 'NO_APLICA',
    'Hallazgos por auditoría con severidad, plazo y estado de cierre. Apartado destacado para los abiertos fuera de plazo y para los declarados cerrados cuyo patrón sigue detectándose en producción. Es donde se concentran los incumplimientos de mp.s.2.r2.3.',
    ['EV-12'],
    evidenceObservations('EV-12'),
  );

  // Protección de proxies y cachés (R3)  ·  fuente: SCA + Log (EV-13)
  const campo12 = field(
    'mp.s.2.campo12',
    'Protección de proxies y cachés (R3)',
    level === 'ALTO'
      ? evidenceStatus('EV-13')
      : 'NO_APLICA',
    'Por cada elemento de P-10: resultado de los checks de configuración frente a los ataques característicos e intentos detectados. Atención especial al almacenamiento en caché de respuestas autenticadas, que es fuga de información entre usuarios.',
    ['EV-13'],
    evidenceObservations('EV-13'),
  );

  // Puntuación de cumplimiento mp.s.2  ·  fuente: Motor ENSFácil
  const campo13 = field(
    'mp.s.2.campo13',
    'Puntuación de cumplimiento mp.s.2',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13'],
    evidenceObservations('EV-01'),
  );

  // Nivel de madurez (CMM — Anexo II ap. 6)  ·  fuente: Valoración ENSFácil + revisión
  const campo14 = field(
    'mp.s.2.campo14',
    'Nivel de madurez (CMM — Anexo II ap. 6)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09', 'EV-10', 'EV-11', 'EV-12', 'EV-13'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'mp.s.2',

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
      campo13,
      campo14,
    ],
  };
};
