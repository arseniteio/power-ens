import type { ENSReportField, ENSReportFieldStatus, ENSReportModel } from './registry';
import { statusLabel } from '../../../common/ens/core/status-label';

export interface ENSReportRow {
  campo: string;

  valor: string;

  contexto: string;

  evidencia: string;

  datosPendientes: string;

  estado: ENSReportFieldStatus;
}

interface ENSReportPdfTextRun {
  text: string;
  color?: string;
  bold?: boolean;
}

interface ENSReportPdfCell {
  style: string;
  text: ENSReportPdfTextRun[];
}

export const ENS_REPORT_NO_EVIDENCE = 'Sin evidencia';

export const ENS_REPORT_EVIDENCE_FIELD = 'evidencia';

const UNMEASURED_COLOR = '#69707d';

const STATUSES: ENSReportFieldStatus[] = [
  'CUMPLE',
  'PARCIAL',
  'NO_CUMPLE',
  'NO_EVALUABLE',
  'NO_APLICA',
  'SIN_DATOS',
];

const asStatus = (value: unknown): ENSReportFieldStatus =>
  STATUSES.indexOf(value as ENSReportFieldStatus) >= 0
    ? (value as ENSReportFieldStatus)
    : 'SIN_DATOS';

const findingOf = (field: ENSReportField): string =>
  (field.details || []).filter(Boolean).join(' · ');

const isScore = (field: ENSReportField): boolean =>
  field.id.endsWith('.puntuacion');

const buildENSReportRow = (field: ENSReportField): ENSReportRow => ({
  campo: `${field.id} · ${field.title}`,

  valor: isScore(field)
    ? field.value || '—'
    : findingOf(field) || field.value || '—',

  contexto: isScore(field)
    ? findingOf(field)
    : findingOf(field) ? field.value || '' : '',

  evidencia:
    (field.evidenceIds || []).length > 0
      ? field.evidenceIds.join(', ')
      : ENS_REPORT_NO_EVIDENCE,

  datosPendientes:
    (field.producerGaps || []).length > 0
      ? `Datos pendientes: ${field.producerGaps.join(', ')}`
      : '',

  estado: asStatus(field.status),
});

export const buildENSReportRows = (
  model: ENSReportModel | undefined,
): ENSReportRow[] => (model?.fields || []).map(buildENSReportRow);

export const ensRequirementProofLabel = (
  requirement: { status: string; attested?: boolean; evidenced?: boolean; documental?: boolean },
  causes: string[] = [],
): string => {
  if (requirement.status === 'NO_APLICA') {
    return '';
  }

  if (requirement.attested) {
    return 'Acreditado documentalmente';
  }

  if (requirement.evidenced && requirement.documental) {
    return 'Declarado (documental)';
  }

  if (requirement.evidenced) {
    return 'Medido';
  }

  return causes.length > 0
    ? `No evidenciado · ${causes.join(', ')}`
    : 'No evidenciado';
};

export const ensReportStatusBadgeColor = (status: string): string =>
  status === 'CUMPLE'
    ? 'success'
    : status === 'PARCIAL'
    ? 'warning'
    : status === 'NO_CUMPLE'
    ? 'danger'
    : status === 'NO_APLICA'
    ? 'hollow'
    : 'default';

export const ensReportStatusPdfColor = (status: string): string =>
  status === 'CUMPLE'
    ? '#4caf50'
    : status === 'PARCIAL'
    ? '#f5a700'
    : status === 'NO_CUMPLE'
    ? '#e53935'
    : UNMEASURED_COLOR;

export const buildENSReportEvidencePdfCell = (
  row: ENSReportRow,
): ENSReportPdfCell => ({
  style: 'td',
  text: [
    {
      text: statusLabel(row.estado),
      color: ensReportStatusPdfColor(row.estado),
      bold: true,
    },
    {
      text: `\n${row.evidencia}`,
    },
    ...(row.datosPendientes
      ? [
          {
            text: `\n${row.datosPendientes}`,
            color: UNMEASURED_COLOR,
          },
        ]
      : []),
  ],
});
