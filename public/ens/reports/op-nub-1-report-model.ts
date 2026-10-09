import type { ENSComplianceResult } from '../core';

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

/**
 * Modelo de informe de op.nub.1 (Protección de servicios en la nube).
 * Generado desde la hoja "Informe ENSFácil" del Excel.
 * Los parametros mostrados en cada campo se eligen a partir de la
 * descripcion del campo en el Excel.
 */
export const buildOpNub1ReportModel = (
  result: ENSComplianceResult | undefined,
): OpNub1ReportModel => {
  const parameters = new Map(
    (result?.parameters || []).map(parameter => [parameter.id, parameter]),
  );

  const evidences = new Map(
    (result?.evidences || []).map(evidence => [evidence.id, evidence]),
  );

  const parameterValue = (parameterId: string): unknown =>
    parameters.get(parameterId)?.value;

  const evidenceStatus = (evidenceId: string): OpNub1ReportFieldStatus =>
    asStatus(evidences.get(evidenceId)?.status);

  const evidenceObservations = (evidenceId: string): string[] =>
    evidences.get(evidenceId)?.observations || [];

  const level = (result?.level || '').toUpperCase();

  // Estado del control (semáforo ENS)  ·  fuente: Correlación automática
  const campo1 = field(
    'op.nub.1.campo1',
    'Estado del control (semáforo ENS)',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  // Inventario de servicios en la nube  ·  fuente: Configuración + ENSFácil (EV-03)
  const campo2 = field(
    'op.nub.1.campo2',
    'Inventario de servicios en la nube',
    evidenceStatus('EV-03'),
    'Servicios de P-02 con su modelo (SaaS, PaaS, IaaS), proveedor, información tratada y criticidad. Apartado separado para los servicios detectados en uso que no figuran en el inventario, que es el hallazgo de shadow IT.',
    ['EV-03'],
    evidenceObservations('EV-03'),
  );

  // Expediente documental por servicio  ·  fuente: ENSFácil (EV-09)
  const campo3 = field(
    'op.nub.1.campo3',
    'Expediente documental por servicio',
    evidenceStatus('EV-09'),
    'Por cada servicio: conformidad ENS o guía CCN-STIC, certificación reconocida con su metodología y vigencia, informe de pentesting del proveedor, cláusulas de transparencia, jurisdicción declarada y modelo de cifrado. Marcado expresamente como DOCUMENTACIÓN APORTADA y no verificada técnicamente.',
    ['EV-09'],
    evidenceObservations('EV-09'),
  );

  // Vigencia de certificaciones y conformidades  ·  fuente: ENSFácil (EV-08)
  const campo4 = field(
    'op.nub.1.campo4',
    'Vigencia de certificaciones y conformidades',
    evidenceStatus('EV-08'),
    'Fechas de vigencia de cada declaración y certificación con los días restantes y aviso anticipado de vencimiento. Relación de las ya caducadas, que son incumplimiento inmediato.',
    ['EV-08'],
    evidenceObservations('EV-08'),
  );

  // Configuración de seguridad del inquilino (R2)  ·  fuente: SCA cloud (EV-02)
  const campo5 = field(
    'op.nub.1.campo5',
    'Configuración de seguridad del inquilino (R2)',
    level === 'ALTO'
      ? evidenceStatus('EV-02')
      : 'NO_APLICA',
    'Por cada servicio: resultado de los checks de configuración contra la política de P-07, con el porcentaje de cumplimiento y la relación de desviaciones. Destacados los hallazgos graves: almacenamiento público, privilegios excesivos, auditoría desactivada, MFA no exigida. Es el bloque de mayor valor técnico.',
    ['EV-02'],
    evidenceObservations('EV-02'),
  );

  // Trazabilidad del perímetro cloud  ·  fuente: Cloud integrations (EV-01)
  const campo6 = field(
    'op.nub.1.campo6',
    'Trazabilidad del perímetro cloud',
    evidenceStatus('EV-01'),
    'Volumen de eventos ingeridos por servicio e integración, con su continuidad. Servicios del inventario sin integración configurada, que son puntos ciegos de trazabilidad.',
    ['EV-01'],
    evidenceObservations('EV-01'),
  );

  // Operaciones administrativas en los servicios cloud  ·  fuente: Cloud integrations (EV-04)
  const campo7 = field(
    'op.nub.1.campo7',
    'Operaciones administrativas en los servicios cloud',
    evidenceStatus('EV-04'),
    'Operaciones de administración registradas: identidades creadas o modificadas, cambios de permisos, alteraciones de configuración de seguridad y de reglas de red, con el actor y la fecha. Destacadas las ejecutadas por cuentas no autorizadas.',
    ['EV-04'],
    evidenceObservations('EV-04'),
  );

  // Cifrado y gestión de claves  ·  fuente: SCA cloud (EV-05)
  const campo8 = field(
    'op.nub.1.campo8',
    'Cifrado y gestión de claves',
    evidenceStatus('EV-05'),
    'Por servicio: cifrado en reposo activo, modelo de gestión de claves efectivo frente al declarado en P-09, y rotación configurada. Enlaza con op.exp.10, porque las claves de los servicios cloud son material criptográfico del sistema.',
    ['EV-05'],
    evidenceObservations('EV-05'),
  );

  // Región de los datos y jurisdicción  ·  fuente: SCA cloud (EV-06)
  const campo9 = field(
    'op.nub.1.campo9',
    'Región de los datos y jurisdicción',
    evidenceStatus('EV-06'),
    'Por servicio: región configurada para los datos y para sus copias, frente a la declarada en P-08, con marca de conformidad. Aviso destacado ante discrepancias por su relevancia también en materia de transferencias internacionales de datos personales.',
    ['EV-06'],
    evidenceObservations('EV-06'),
  );

  // Accesos a los servicios cloud  ·  fuente: Cloud integrations (EV-07)
  const campo10 = field(
    'op.nub.1.campo10',
    'Accesos a los servicios cloud',
    evidenceStatus('EV-07'),
    'Autenticaciones registradas por servicio con origen, resultado y método, y verificación de doble factor. Un servicio cloud es acceso a través de zona no controlada, de modo que los criterios de op.acc.6 R8 le resultan directamente aplicables.',
    ['EV-07'],
    evidenceObservations('EV-07'),
  );

  // Puntuación de cumplimiento op.nub.1  ·  fuente: Motor ENSFácil
  const campo11 = field(
    'op.nub.1.campo11',
    'Puntuación de cumplimiento op.nub.1',
    asStatus(result?.status),
    formatValue(result?.status),
    ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08', 'EV-09'],
    evidenceObservations('EV-01'),
  );

  return {
    controlId: result?.control.id || 'op.nub.1',

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
