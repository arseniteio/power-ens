import type { ENSControlSummaryEntry } from '../evaluation/types';
import type { ENSMaturityAssessment, ENSOrganizationMaturity } from './types';

export interface ENSMetricsMeasure {
  id: string;
  name: string;
  family: string;
}

const HEADER = [
  'medida',
  'nombre',
  'familia',
  'estado_operativo',
  'cumplimiento_pct',
  'requisitos_no_cumplidos',
  'requisitos_sin_evidencia',
  'madurez_acreditada',
  'madurez_valorada',
  'madurez_objetivo',
  'valorada_por',
  'documentos',
  'origen',
];

// A cell a spreadsheet would run as a formula is written as text: references and authors are typed by people.
const csvCell = (value: unknown): string => {
  const raw = value === undefined || value === null ? '' : String(value);
  const text = /^\s*[=+\-@]/.test(raw) || /^[\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${text.replace(/"/g, '""')}"`;
};

const line = (cells: unknown[]): string => cells.map(csvCell).join(';');

// Every figure says where it comes from: the engine measured it, or a person declared it.
export const metricsCsv = (
  measures: ENSMetricsMeasure[],
  controls: ENSControlSummaryEntry[],
  maturity: ENSOrganizationMaturity | undefined,
  assessments: ENSMaturityAssessment[],
  generatedAt: string
): string => {
  const byControl = new Map(controls.map(entry => [entry.controlId, entry]));
  const declared = new Map(assessments.map(entry => [entry.measureId, entry]));
  const engineIds = new Set(measures.map(measure => measure.id));

  const rows = measures.map(measure => {
    const control = byControl.get(measure.id);
    const accredited = maturity?.measures[measure.id]?.accredited;
    const assessment = declared.get(measure.id);
    return [
      measure.id,
      measure.name,
      measure.family,
      control?.status,
      control?.score,
      control?.requirementsNotMet,
      control?.requirementsNotEvidenced,
      accredited === undefined ? '' : `L${accredited}`,
      assessment?.level === undefined ? '' : `L${assessment.level}`,
      assessment?.target === undefined ? '' : `L${assessment.target}`,
      assessment?.assessedBy,
      assessment?.references,
      assessment?.level === undefined ? 'medido' : 'medido y declarado',
    ];
  });

  const declaredOnly = assessments
    .filter(entry => !engineIds.has(entry.measureId))
    .map(entry => [
      entry.measureId,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      entry.level === undefined ? '' : `L${entry.level}`,
      entry.target === undefined ? '' : `L${entry.target}`,
      entry.assessedBy,
      entry.references,
      'declarado',
    ]);

  const summary = maturity?.summary;
  const globals = summary
    ? [
        ['ENS (global)', 'Nivel alcanzado por el 80 % de las medidas', '', '', '', '', '', `L${summary.global_accredited ?? 0}`, `L${summary.global_assessed ?? 0}`, '', '', '', 'medido y declarado'],
      ]
    : [];

  return `${[line(HEADER), ...[...rows, ...declaredOnly, ...globals].map(line), line([`generado ${generatedAt}`])].join('\r\n')}\r\n`;
};
