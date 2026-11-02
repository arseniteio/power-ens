import { getENSCatalogControl } from '../../../common/ens/catalog';
import {
  ENS_PENDING_MEASUREMENT_LABEL,
  describePendingMeasurement,
  isPendingMeasurement,
} from '../../../common/ens/catalog/support/measurement-plan';
import {
  ENSProvenancedText,
  ENSTextProvenance,
  ENS_PROPOSAL_TEXT_PROVENANCE,
  ENS_TEXT_PROVENANCE_LABELS,
  describeAnnexSection,
  describeControlSource,
  describeRequirementTexts,
} from '../../../common/ens/catalog/support/provenance';
import { describeControlAxis } from '../../../common/ens/core/control-level';
import {
  ENS_TEMPLATE_COVERAGE_LABELS,
  ENSTemplateCorrespondenceRow,
  getTemplateCorrespondence,
} from '../../../common/ens/catalog/support/template-correspondence';

const NORM_COLOR = '#006bb4';
const CRITERION_COLOR = '#69707d';

export const describeReportControlLine = (controlId: string): string => {
  const control = getENSCatalogControl(controlId);

  return control
    ? [describeAnnexSection(control), describeControlAxis(control), describeControlSource(control)].filter(Boolean).join(' · ')
    : '';
};

export const describeReportPendingMeasurement = (controlId: string): string => {
  const control = getENSCatalogControl(controlId);

  return control && isPendingMeasurement(control)
    ? `${ENS_PENDING_MEASUREMENT_LABEL}. ${describePendingMeasurement(control)}`
    : '';
};

export const reportRequirementTexts = (controlId: string, requirementId: string): ENSProvenancedText[] => {
  const requirement = getENSCatalogControl(controlId)?.requirements.find(item => item.id === requirementId);

  return requirement ? describeRequirementTexts(requirement) : [];
};

export const pdfProvenanceRuns = (texts: ENSProvenancedText[]): object[] =>
  texts.flatMap(text => [
    { text: '\n' },
    {
      text: `${text.label}: `,
      bold: true,
      fontSize: 7,
      color: text.provenance === 'BOE' ? NORM_COLOR : CRITERION_COLOR,
    },
    { text: text.text, color: text.provenance === 'BOE' ? '#1a1c21' : CRITERION_COLOR },
  ]);

export const pdfRowLabel = (provenance: ENSTextProvenance = ENS_PROPOSAL_TEXT_PROVENANCE): object => ({
  text: `${ENS_TEXT_PROVENANCE_LABELS[provenance]}\n`,
  bold: true,
  fontSize: 6,
  color: provenance === 'BOE' ? NORM_COLOR : CRITERION_COLOR,
});

export const REPORT_CRITERION_NOTE = `${ENS_TEXT_PROVENANCE_LABELS.CRITERION}: campos, parámetros y umbrales propuestos por la plantilla del auditor o por Power ENS, sin valor normativo.`;

const correspondenceTable = (title: string, rows: ENSTemplateCorrespondenceRow[]): object[] => [
  { text: title, bold: true, fontSize: 9, margin: [0, 8, 0, 4] },
  {
    table: {
      headerRows: 1,
      widths: ['auto', '*', 'auto', 'auto', '*'],
      body: [
        ['Plantilla', 'Nombre en la plantilla', 'Power ENS', 'Cobertura', 'Nota'].map(text => ({ text, style: 'th' })),
        ...rows.map(row => [
          { text: row.template, style: 'td' },
          { text: row.templateName, style: 'td' },
          { text: row.ours.length ? row.ours.join(', ') : '—', style: 'td' },
          { text: ENS_TEMPLATE_COVERAGE_LABELS[row.coverage], style: 'td', bold: row.coverage === 'NOT_MEASURED' },
          { text: row.note, style: 'td' },
        ]),
      ],
    },
    layout: 'lightHorizontalLines',
  },
];

export const buildTemplateCorrespondencePdf = (controlId: string): object[] => {
  const correspondence = getTemplateCorrespondence(controlId);

  if (!correspondence) {
    return [];
  }

  return [
    { text: correspondence.title, style: 'h3', margin: [0, 16, 0, 6] },
    {
      text: [
        { text: `${ENS_TEXT_PROVENANCE_LABELS.CRITERION}: `, bold: true, fontSize: 7, color: CRITERION_COLOR },
        { text: correspondence.summary, fontSize: 9 },
      ],
    },
    ...correspondenceTable('Requisitos', correspondence.requirements),
    ...correspondenceTable('Parámetros', correspondence.parameters),
    ...correspondenceTable('Evidencias', correspondence.evidences),
    {
      text: `Solo en Power ENS: ${correspondence.ownOnly.map(item => `${item.id} (${item.note})`).join(' · ')}`,
      fontSize: 8,
      color: CRITERION_COLOR,
      margin: [0, 6, 0, 0],
    },
  ];
};
