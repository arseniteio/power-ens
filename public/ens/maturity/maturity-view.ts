// What the maturity screens show and the forms ask, kept apart from React so it can be tested.
import { dayIn } from '../../../common/ens/maturity/maturity-engine';
import {
  ENS_DEFAULT_REVIEW_PERIOD_DAYS,
  ENS_MATURITY_FEEDBACK_SOURCES,
  ENS_MATURITY_LEVEL_NAMES,
  ENS_MATURITY_REVIEW_RESULTS,
} from '../../../common/ens/maturity/maturity-records';
import type {
  ENSControlMaturity,
  ENSControlMaturitySummary,
  ENSMaturityGateOrigin,
  ENSMaturityLevel,
  ENSMaturityRecordKind,
} from '../../../common/ens/maturity/types';

export const MATURITY_ORIGIN_LABELS: Record<ENSMaturityGateOrigin, string> = {
  A: 'Automático',
  D: 'Declarado',
  Doc: 'Documental',
  'D+A': 'Declarado y medido',
  'Doc+D': 'Documental y declarado',
};

export const MATURITY_NOTE = 'Semáforo y porcentaje: operativos. Madurez: valoración normativa del proceso, de la organización (Anexo II, ap. 6).';

export const MATURITY_GUIDE_URL = 'https://gitlab.com/quersystem/plugin-wazuh-ens/-/blob/main/docs/deployment/10-maturity-assessment.md';

export const MATURITY_FORM_TITLES: Record<ENSMaturityRecordKind, string> = {
  assessment: 'Valorar la madurez',
  attestation: 'Registrar el procedimiento',
  review: 'Registrar una revisión',
  indicators: 'Umbral y periodicidad de revisión',
  feedback: 'Registrar realimentación',
};

export interface MaturityField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'select' | 'number';
  required?: boolean;
  options?: { value: string; text: string }[];
  help?: string;
  // Suggest the organisation's people.
  people?: boolean;
}

const levelOptions = (withEmpty?: string) => [
  ...(withEmpty !== undefined ? [{ value: '', text: withEmpty }] : []),
  ...([0, 1, 2, 3, 4, 5] as ENSMaturityLevel[]).map(level => ({ value: String(level), text: `L${level} · ${ENS_MATURITY_LEVEL_NAMES[level]}` })),
];

export const MATURITY_FORM_FIELDS: Record<ENSMaturityRecordKind, MaturityField[]> = {
  assessment: [
    { name: 'level', label: 'Nivel valorado', type: 'select', required: true, options: levelOptions() },
    { name: 'target', label: 'Nivel objetivo', type: 'select', options: levelOptions('El de la categoría'), help: 'Vacío: el objetivo de la categoría, en General.' },
    { name: 'reviewer', label: 'Revisor', type: 'text', required: true, people: true },
    { name: 'date', label: 'Fecha', type: 'date', required: true },
    { name: 'justification', label: 'Justificación', type: 'textarea', help: 'Obligatoria si el nivel valorado supera al acreditado.' },
  ],
  attestation: [
    { name: 'reference', label: 'Referencia', type: 'text', required: true },
    { name: 'version', label: 'Versión', type: 'text', required: true },
    { name: 'link', label: 'Enlace', type: 'text', required: true, help: 'http(s)://, file:// o ruta de red.' },
    { name: 'approvedAt', label: 'Fecha de aprobación', type: 'date', required: true },
    { name: 'validUntil', label: 'Vigente hasta', type: 'date', required: true },
    { name: 'disseminatedAt', label: 'Fecha de difusión', type: 'date', required: true },
    { name: 'disseminatedTo', label: 'Difundido a', type: 'text', required: true, help: 'A quién se difundió: personas, grupos o listas.' },
    { name: 'owner', label: 'Responsable', type: 'text', required: true, people: true },
  ],
  review: [
    { name: 'date', label: 'Fecha', type: 'date', required: true },
    { name: 'reviewer', label: 'Revisor', type: 'text', required: true, people: true },
    {
      name: 'result',
      label: 'Resultado',
      type: 'select',
      required: true,
      options: Object.entries(ENS_MATURITY_REVIEW_RESULTS).map(([value, text]) => ({ value, text })),
    },
    { name: 'actions', label: 'Acciones', type: 'textarea', help: 'Obligatorias con desviaciones o no conforme. Tratan una desviación del umbral (L4).' },
  ],
  indicators: [
    { name: 'minScore', label: 'Umbral de cumplimiento (%)', type: 'number', required: true, help: 'Por debajo, el control está en desviación.' },
    { name: 'reviewPeriodDays', label: 'Periodicidad de revisión (días)', type: 'number', required: true },
  ],
  feedback: [
    { name: 'reference', label: 'Referencia', type: 'text', required: true, help: 'La misma referencia actualiza su estado (por ejemplo, al cerrarla).' },
    {
      name: 'source',
      label: 'Origen',
      type: 'select',
      required: true,
      options: Object.entries(ENS_MATURITY_FEEDBACK_SOURCES).map(([value, text]) => ({ value, text })),
    },
    { name: 'description', label: 'Descripción', type: 'textarea', required: true },
    { name: 'openedAt', label: 'Fecha de apertura', type: 'date', required: true },
    { name: 'closedAt', label: 'Fecha de cierre', type: 'date' },
    { name: 'procedureVersion', label: 'Versión del procedimiento que la cierra', type: 'text' },
  ],
};

// The local day (the configured zone, Madrid by default): after midnight in Madrid it is already the next day.
const today = (now: Date, timeZone?: string) => dayIn(now, timeZone || 'Europe/Madrid');

// Initial values of each form: the current entry when there is one (to adjust it), else sensible defaults.
export const initialMaturityDraft = (
  kind: ENSMaturityRecordKind,
  maturity: ENSControlMaturity | undefined,
  now: Date,
  timeZone?: string
): Record<string, string> => {
  if (kind === 'assessment') {
    return {
      level: String(maturity?.assessed?.level ?? maturity?.accredited ?? 0),
      target: maturity?.assessed?.target !== undefined ? String(maturity.assessed.target) : '',
      reviewer: maturity?.assessed?.reviewer || '',
      date: today(now, timeZone),
      justification: '',
    };
  }
  if (kind === 'attestation') {
    const current = maturity?.attestation;
    return {
      reference: current?.reference || '',
      version: current?.version || '',
      link: current?.link || '',
      approvedAt: current?.approvedAt || '',
      validUntil: current?.validUntil || '',
      disseminatedAt: current?.disseminatedAt || '',
      disseminatedTo: current?.disseminatedTo || '',
      owner: current?.owner || '',
    };
  }
  if (kind === 'review') return { date: today(now, timeZone), reviewer: '', result: 'CONFORME', actions: '' };
  if (kind === 'indicators') {
    return {
      minScore: String(maturity?.indicators?.minScore ?? 80),
      reviewPeriodDays: String(maturity?.indicators?.reviewPeriodDays ?? ENS_DEFAULT_REVIEW_PERIOD_DAYS),
    };
  }
  return { reference: '', source: 'op.exp.9.3', description: '', openedAt: today(now, timeZone), closedAt: '', procedureVersion: '' };
};

// What the form sends: numbers where the record has numbers, and no empty optional field.
export const maturityEntryFromDraft = (kind: ENSMaturityRecordKind, draft: Record<string, string>): Record<string, unknown> => {
  const entry: Record<string, unknown> = {};
  MATURITY_FORM_FIELDS[kind].forEach(field => {
    const value = (draft[field.name] ?? '').trim();
    if (!value && !field.required) return;
    const numeric = field.type === 'number' || ['level', 'target'].includes(field.name);
    entry[field.name] = numeric && value !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
  });
  return entry;
};

// The level shown in a list: the assessed one, else the accredited one (marked), else nothing measured.
export const describeMaturityCell = (entry?: ENSControlMaturitySummary): { text: string; title: string; belowTarget: boolean } => {
  if (!entry) return { text: '…', title: 'Calculando la madurez.', belowTarget: false };
  if (!entry.applicable) return { text: 'n/a', title: 'No aplica en este nivel.', belowTarget: false };
  const level = entry.assessed ?? entry.accredited;
  const accredited = entry.measured ? `acreditado L${entry.accredited ?? 0}` : 'sin medición todavía';
  const assessed = entry.assessed !== undefined ? `valorado L${entry.assessed}` : 'sin valorar';
  return {
    text:
      level === undefined
        ? `sin medición · objetivo L${entry.target}`
        : `L${level} ${entry.assessed === undefined ? 'acreditado' : 'valorado'} · objetivo L${entry.target}`,
    title: `Madurez: ${assessed}, ${accredited}, objetivo L${entry.target}${entry.aboveAccredited ? '. Valorado por encima de lo acreditado.' : '.'}`,
    belowTarget: level !== undefined && level < entry.target,
  };
};

export const MATURITY_DISTRIBUTION_ROWS: { key: string; label: string }[] = [
  ...([0, 1, 2, 3, 4, 5] as ENSMaturityLevel[]).map(level => ({ key: `L${level}`, label: `L${level} · ${ENS_MATURITY_LEVEL_NAMES[level]}` })),
];
