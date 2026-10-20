// Maturity records: tolerant reading (a malformed entry is skipped) and strict validation shared by route and screen.
import { isUsableLink } from '../configuration/services/attestation-service';
import type { ENSConfigurationVersion, ENSLevel } from '../configuration/types';
import type {
  ENSAnnualResourcesDeclaration,
  ENSControlMaturityRecord,
  ENSMaturityAssessment,
  ENSMaturityFeedback,
  ENSMaturityFeedbackSource,
  ENSMaturityIndicators,
  ENSMaturityLevel,
  ENSMaturityRecordKind,
  ENSMaturityRecords,
  ENSMaturityReview,
  ENSMaturityReviewResult,
  ENSMaturityTargets,
  ENSMeasureDeclaration,
  ENSProcedureAttestation,
} from './types';

// CCN practice, pending the auditor's confirmation: L2 in BÁSICA, L3 in MEDIA, L4 in ALTA.
export const ENS_DEFAULT_MATURITY_TARGETS: ENSMaturityTargets = { BAJO: 2, MEDIO: 3, ALTO: 4 };

// A control's reviews are due every year unless its indicators say otherwise.
export const ENS_DEFAULT_REVIEW_PERIOD_DAYS = 365;

export const ENS_MATURITY_LEVEL_NAMES: Record<ENSMaturityLevel, string> = {
  0: 'Inexistente',
  1: 'Inicial',
  2: 'Reproducible',
  3: 'Proceso definido',
  4: 'Gestionado y medible',
  5: 'Optimizado',
};

export const ENS_CATEGORY_NAMES: Record<ENSLevel, string> = { BAJO: 'BÁSICA', MEDIO: 'MEDIA', ALTO: 'ALTA' };

export const ENS_MATURITY_REVIEW_RESULTS: Record<ENSMaturityReviewResult, string> = {
  CONFORME: 'Conforme',
  CON_DESVIACIONES: 'Con desviaciones',
  NO_CONFORME: 'No conforme',
  DESVIACION_EN_TRATAMIENTO: 'Desviación en tratamiento',
};

// Own keys only: `toString` or `constructor` are not labels.
export const ownLabel = (labels: Record<string, string>, key: unknown): string | undefined =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(labels, key) ? labels[key] : undefined;

export const ENS_MATURITY_FEEDBACK_SOURCES: Record<ENSMaturityFeedbackSource, string> = {
  'op.exp.9.3': 'Lección aprendida (op.exp.9.3)',
  'op.exp.7': 'Gestión de incidentes (op.exp.7)',
  'op.cont.3': 'Deficiencia de una prueba (op.cont.3)',
  auditoria: 'Hallazgo de auditoría',
  revision: 'Revisión del control',
};

export const RECORD_LIST_KEYS: Record<ENSMaturityRecordKind, keyof ENSControlMaturityRecord> = {
  attestation: 'attestations',
  review: 'reviews',
  assessment: 'assessments',
  indicators: 'indicators',
  feedback: 'feedback',
  declaration: 'declarations',
  resources: 'resources',
};

export const ENS_MATURITY_RECORD_KINDS = Object.keys(RECORD_LIST_KEYS) as ENSMaturityRecordKind[];

export const describeMaturityLevel = (level?: ENSMaturityLevel): string => (level === undefined ? '—' : `L${level}`);

export const isMaturityLevel = (value: unknown): value is ENSMaturityLevel =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 5;

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isStamped = (entry: any): boolean =>
  isRecord(entry) && typeof entry.recordedAt === 'string' && typeof entry.recordedBy === 'string';

// The control's record as stored, with only well-formed entries, oldest first.
export const readControlMaturityRecord = (records: Partial<ENSMaturityRecords> | undefined, controlId: string): ENSControlMaturityRecord => {
  const controls = isRecord(records) && isRecord(records.controls) ? records.controls : {};
  const stored: any = Object.prototype.hasOwnProperty.call(controls, controlId) ? controls[controlId] : undefined;
  const list = (key: keyof ENSControlMaturityRecord, keep: (entry: any) => boolean): any[] =>
    isRecord(stored) && Array.isArray(stored[key]) ? (stored[key] as unknown[]).filter((entry: unknown) => isStamped(entry) && keep(entry)) : [];
  return {
    attestations: list('attestations', entry => typeof entry.reference === 'string'),
    reviews: list('reviews', entry => typeof entry.date === 'string'),
    assessments: list('assessments', entry => isMaturityLevel(entry.level)),
    indicators: list('indicators', entry => typeof entry.minScore === 'number'),
    feedback: list('feedback', entry => typeof entry.reference === 'string'),
    declarations: list('declarations', entry => typeof entry.applies === 'boolean' && typeof entry.reference === 'string'),
    resources: list('resources', entry => typeof entry.period === 'string'),
  };
};

// Target of each category: the one in General, or the default when absent or not a level.
export const resolveMaturityTargets = (configuration?: Partial<ENSConfigurationVersion>): ENSMaturityTargets => {
  const declared = (configuration?.global as any)?.maturityTargets;
  const of = (level: ENSLevel): ENSMaturityLevel =>
    isRecord(declared) && isMaturityLevel(declared[level]) ? declared[level] : ENS_DEFAULT_MATURITY_TARGETS[level];
  return { BAJO: of('BAJO'), MEDIO: of('MEDIO'), ALTO: of('ALTO') };
};

// Shape of `global.maturityTargets` for the save route: absent is valid; present, an object of levels.
export const validateMaturityTargetsShape = (value: unknown): string[] => {
  if (value === undefined) return [];
  if (!isRecord(value)) return ['global.maturityTargets debe ser un objeto.'];
  return Object.entries(value).flatMap(([key, level]) =>
    !['BAJO', 'MEDIO', 'ALTO'].includes(key)
      ? [`global.maturityTargets.${key} no es una categoría.`]
      : !isMaturityLevel(level)
      ? [`global.maturityTargets.${key} debe ser un nivel de 0 a 5.`]
      : []
  );
};

// --- validation of a new entry -------------------------------------------------------------------------------

const DAY_MS = 86400e3;
const SHORT = 200;
const LONG = 4000;

const isoDay = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? value : undefined;
};

// A day no later than today (one day of margin for time zones).
const notFuture = (day: string, now: Date): boolean => Date.parse(`${day}T00:00:00Z`) <= now.getTime() + DAY_MS;

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

interface Checker {
  errors: string[];
  text(field: string, label: string, max?: number): string;
  optionalText(field: string, label: string, max?: number): string | undefined;
  day(field: string, label: string, options?: { past?: boolean }): string;
  optionalDay(field: string, label: string, options?: { past?: boolean }): string | undefined;
}

const checker = (value: Record<string, any>, now: Date): Checker => {
  const errors: string[] = [];
  const optionalText = (field: string, label: string, max = SHORT) => {
    const text = textOf(value[field]);
    if (value[field] !== undefined && typeof value[field] !== 'string') errors.push(`${label}: debe ser texto.`);
    if (text.length > max) errors.push(`${label}: como mucho ${max} caracteres.`);
    return text || undefined;
  };
  const optionalDay = (field: string, label: string, options: { past?: boolean } = {}) => {
    if (value[field] === undefined || value[field] === '') return undefined;
    const day = isoDay(value[field]);
    if (!day) {
      errors.push(`${label}: fecha AAAA-MM-DD válida.`);
      return undefined;
    }
    if (options.past && !notFuture(day, now)) errors.push(`${label}: no puede ser posterior a hoy.`);
    return day;
  };
  return {
    errors,
    optionalText,
    optionalDay,
    text: (field, label, max = SHORT) => {
      const text = optionalText(field, label, max);
      if (!text) errors.push(`${label}: obligatorio.`);
      return text || '';
    },
    day: (field, label, options = {}) => {
      const day = optionalDay(field, label, options);
      if (!day && (value[field] === undefined || value[field] === '')) errors.push(`${label}: obligatorio.`);
      return day || '';
    },
  };
};

type Unstamped<T> = Omit<T, 'recordedAt' | 'recordedBy'>;

export type ENSMaturityEntryInput =
  | Unstamped<ENSProcedureAttestation>
  | Unstamped<ENSMaturityReview>
  | Unstamped<ENSMaturityAssessment>
  | Unstamped<ENSMaturityIndicators>
  | Unstamped<ENSMaturityFeedback>
  | Unstamped<ENSMeasureDeclaration>
  | Unstamped<ENSAnnualResourcesDeclaration>;

// «sí»/«si»/true and «no»/false: the form sends text, the stored entry a boolean.
const yesNo = (value: unknown): boolean | undefined =>
  value === true || value === 'si' || value === 'sí' ? true : value === false || value === 'no' ? false : undefined;

// A non-negative amount, absent when empty; NaN marks a malformed one.
const amount = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

// Validates a person's entry; above `accredited` (or with it unknown) an assessment needs a justification.
export const validateMaturityEntry = (
  kind: ENSMaturityRecordKind,
  value: unknown,
  now: Date,
  accredited?: ENSMaturityLevel
): { entry?: ENSMaturityEntryInput; errors: string[] } => {
  if (!isRecord(value)) return { errors: ['La entrada debe ser un objeto.'] };
  const c = checker(value, now);

  if (kind === 'attestation') {
    const entry = {
      reference: c.text('reference', 'Referencia'),
      version: c.text('version', 'Versión', 50),
      link: c.text('link', 'Enlace', 1000),
      approvedAt: c.day('approvedAt', 'Fecha de aprobación', { past: true }),
      validUntil: c.day('validUntil', 'Vigente hasta'),
      disseminatedAt: c.day('disseminatedAt', 'Fecha de difusión', { past: true }),
      disseminatedTo: c.text('disseminatedTo', 'Difundido a', 1000),
      owner: c.text('owner', 'Responsable'),
    };
    if (entry.link && !isUsableLink(entry.link)) c.errors.push('Enlace: http(s)://, file:// o ruta de red; no vale el del ejemplo.');
    if (entry.approvedAt && entry.validUntil && entry.validUntil < entry.approvedAt) c.errors.push('Vigente hasta: no puede ser anterior a la aprobación.');
    if (entry.approvedAt && entry.disseminatedAt && entry.disseminatedAt < entry.approvedAt) c.errors.push('Fecha de difusión: no puede ser anterior a la aprobación.');
    return c.errors.length ? { errors: c.errors } : { entry, errors: [] };
  }

  if (kind === 'review') {
    const result = value.result as ENSMaturityReviewResult;
    const entry = {
      date: c.day('date', 'Fecha', { past: true }),
      reviewer: c.text('reviewer', 'Revisor'),
      result,
      actions: c.optionalText('actions', 'Acciones', LONG) || '',
    };
    if (!ownLabel(ENS_MATURITY_REVIEW_RESULTS, result)) c.errors.push('Resultado: Conforme, Con desviaciones, No conforme o Desviación en tratamiento.');
    if ((result === 'CON_DESVIACIONES' || result === 'NO_CONFORME') && !entry.actions) {
      c.errors.push('Acciones: obligatorias si la revisión tiene desviaciones o no es conforme.');
    }
    return c.errors.length ? { errors: c.errors } : { entry, errors: [] };
  }

  if (kind === 'assessment') {
    const level = value.level;
    const target = value.target === undefined || value.target === null || value.target === '' ? undefined : value.target;
    const entry: Unstamped<ENSMaturityAssessment> = {
      level,
      ...(target !== undefined ? { target } : {}),
      reviewer: c.text('reviewer', 'Revisor'),
      date: c.day('date', 'Fecha', { past: true }),
      ...(c.optionalText('justification', 'Justificación', LONG) ? { justification: textOf(value.justification) } : {}),
    };
    if (!isMaturityLevel(level)) c.errors.push('Nivel valorado: de 0 a 5.');
    if (target !== undefined && !isMaturityLevel(target)) c.errors.push('Nivel objetivo: de 0 a 5.');
    if (isMaturityLevel(level) && !entry.justification) {
      if (accredited === undefined && level > 0) {
        c.errors.push('Justificación: obligatoria; no se ha podido calcular el nivel acreditado.');
      } else if (accredited !== undefined && level > accredited) {
        c.errors.push(`Justificación: obligatoria; el nivel valorado (L${level}) supera al acreditado (L${accredited}).`);
      }
    }
    return c.errors.length ? { errors: c.errors } : { entry, errors: [] };
  }

  if (kind === 'indicators') {
    const entry = { minScore: value.minScore, reviewPeriodDays: value.reviewPeriodDays ?? ENS_DEFAULT_REVIEW_PERIOD_DAYS };
    if (typeof entry.minScore !== 'number' || !Number.isFinite(entry.minScore) || entry.minScore < 0 || entry.minScore > 100) {
      c.errors.push('Umbral: porcentaje de 0 a 100.');
    }
    if (!Number.isInteger(entry.reviewPeriodDays) || entry.reviewPeriodDays < 1 || entry.reviewPeriodDays > 1095) {
      c.errors.push('Periodicidad de revisión: de 1 a 1095 días.');
    }
    return c.errors.length ? { errors: c.errors } : { entry, errors: [] };
  }

  if (kind === 'feedback') {
    const source = value.source as ENSMaturityFeedbackSource;
    const entry: Unstamped<ENSMaturityFeedback> = {
      reference: c.text('reference', 'Referencia'),
      source,
      description: c.text('description', 'Descripción', LONG),
      openedAt: c.day('openedAt', 'Fecha de apertura', { past: true }),
    };
    const closedAt = c.optionalDay('closedAt', 'Fecha de cierre', { past: true });
    const procedureVersion = c.optionalText('procedureVersion', 'Versión del procedimiento', 50);
    if (closedAt) entry.closedAt = closedAt;
    if (procedureVersion) entry.procedureVersion = procedureVersion;
    if (!ownLabel(ENS_MATURITY_FEEDBACK_SOURCES, source)) c.errors.push('Origen: uno de la lista.');
    if (closedAt && entry.openedAt && closedAt < entry.openedAt) c.errors.push('Fecha de cierre: no puede ser anterior a la apertura.');
    if (procedureVersion && !closedAt) c.errors.push('Versión del procedimiento: solo al cerrar.');
    return c.errors.length ? { errors: c.errors } : { entry, errors: [] };
  }

  if (kind === 'declaration') {
    const applies = yesNo(value.applies);
    const level = value.level === undefined || value.level === null || value.level === '' ? undefined : value.level;
    const target = value.target === undefined || value.target === null || value.target === '' ? undefined : value.target;
    const link = c.optionalText('link', 'Enlace', 1000);
    const justification = c.optionalText('justification', 'Justificación', LONG);
    const entry: Unstamped<ENSMeasureDeclaration> = {
      applies: applies === true,
      ...(level !== undefined ? { level } : {}),
      ...(target !== undefined ? { target } : {}),
      reference: c.text('reference', 'Referencia documental'),
      ...(link ? { link } : {}),
      owner: c.text('owner', 'Responsable'),
      date: c.day('date', 'Fecha', { past: true }),
      ...(justification ? { justification } : {}),
    };
    if (applies === undefined) c.errors.push('Aplica: sí o no.');
    if (level !== undefined && !isMaturityLevel(level)) c.errors.push('Nivel valorado: de 0 a 5.');
    if (target !== undefined && !isMaturityLevel(target)) c.errors.push('Nivel objetivo: de 0 a 5.');
    if (applies === true && level === undefined) c.errors.push('Nivel valorado: obligatorio si la medida aplica.');
    if (applies === false && !justification) c.errors.push('Justificación: obligatoria si la medida no aplica.');
    if (link && !isUsableLink(link)) c.errors.push('Enlace: http(s)://, file:// o ruta de red; no vale el del ejemplo.');
    return c.errors.length ? { errors: c.errors } : { entry, errors: [] };
  }

  if (kind === 'resources') {
    const period = textOf(value.period);
    const ictBudget = amount(value.ictBudget);
    const ictStaff = amount(value.ictStaff);
    const securityStaff = amount(value.securityStaff);
    const entry: Unstamped<ENSAnnualResourcesDeclaration> = {
      period,
      ...(ictBudget !== undefined ? { ictBudget } : {}),
      ...(ictStaff !== undefined ? { ictStaff } : {}),
      ...(securityStaff !== undefined ? { securityStaff } : {}),
      reference: c.text('reference', 'Referencia documental'),
      owner: c.text('owner', 'Responsable'),
    };
    if (!/^\d{4}$/.test(period)) c.errors.push('Periodo: el año del cierre (AAAA).');
    [
      [ictBudget, 'Presupuesto TIC total'],
      [ictStaff, 'Plantilla TIC total'],
      [securityStaff, 'Plantilla de seguridad'],
    ].forEach(([n, label]) => {
      if (Number.isNaN(n)) c.errors.push(`${label}: número no negativo.`);
    });
    if (ictBudget === undefined && ictStaff === undefined) c.errors.push('Presupuesto TIC total o plantilla TIC total: al menos uno.');
    if (securityStaff !== undefined && ictStaff === undefined) c.errors.push('Plantilla de seguridad: solo con la plantilla TIC total.');
    if (typeof securityStaff === 'number' && typeof ictStaff === 'number' && securityStaff > ictStaff) {
      c.errors.push('Plantilla de seguridad: no puede superar a la plantilla TIC total.');
    }
    return c.errors.length ? { errors: c.errors } : { entry, errors: [] };
  }

  return { errors: [`Tipo de registro desconocido: ${String(kind)}.`] };
};

// The records with one more entry in the control's list (nothing is replaced or removed).
export const appendMaturityEntry = (
  records: Partial<ENSMaturityRecords> | undefined,
  controlId: string,
  kind: ENSMaturityRecordKind,
  entry: Record<string, unknown>
): ENSMaturityRecords => {
  const controls = isRecord(records) && isRecord(records.controls) ? records.controls : {};
  const record = isRecord(controls[controlId]) ? controls[controlId] : {};
  const key = RECORD_LIST_KEYS[kind];
  const list = Array.isArray((record as any)[key]) ? (record as any)[key] : [];
  return { ...(records as object), controls: { ...controls, [controlId]: { ...record, [key]: [...list, entry] } } };
};

// One line for the audit trail and the history.
export const describeMaturityEntry = (controlId: string, kind: ENSMaturityRecordKind, entry: any): string => {
  switch (kind) {
    case 'attestation':
      return `Madurez de ${controlId}: procedimiento ${entry.reference} versión ${entry.version}.`;
    case 'review':
      return `Madurez de ${controlId}: revisión del ${entry.date} (${ownLabel(ENS_MATURITY_REVIEW_RESULTS, entry.result) || entry.result}).`;
    case 'assessment':
      return `Madurez de ${controlId}: nivel valorado L${entry.level}${entry.target !== undefined ? `, objetivo L${entry.target}` : ''}.`;
    case 'indicators':
      return `Madurez de ${controlId}: umbral ${entry.minScore} %, revisión cada ${entry.reviewPeriodDays} días.`;
    case 'declaration':
      return `Medida sin motor ${controlId}: ${entry.applies ? `aplica, nivel valorado L${entry.level}` : 'no aplica'} (${entry.reference}).`;
    case 'resources':
      return `Recursos TIC totales del periodo ${entry.period}: ${[
        entry.ictBudget !== undefined ? `presupuesto ${entry.ictBudget} €` : '',
        entry.ictStaff !== undefined ? `plantilla ${entry.ictStaff}` : '',
        entry.securityStaff !== undefined ? `seguridad ${entry.securityStaff}` : '',
      ]
        .filter(Boolean)
        .join(', ')}.`;
    default:
      return `Madurez de ${controlId}: realimentación ${entry.reference}${entry.closedAt ? ' cerrada' : ''}.`;
  }
};

// Names for the owner and reviewer fields, from the organisation's personnel register (suggestions only).
export const listOrganizationPeople = (configuration?: Partial<ENSConfigurationVersion>): string[] => {
  const values = (configuration as any)?.organizationData?.values || {};
  const rows = (id: string): string[] => (Array.isArray(values[id]) ? values[id].map(String) : []);
  const names = [
    ...rows('formacion_personal').map(row => row.split('|')[0]),
    ...rows('personal_autorizado').map(row => row.split('|')[0]),
  ]
    .map(name => name.trim())
    .filter(Boolean);
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'es'));
};
