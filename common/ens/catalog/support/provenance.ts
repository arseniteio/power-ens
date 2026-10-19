import { ENSControlDefinition, ENSRequirementDefinition } from '../types';

// Where a text shown to the auditor comes from. Only the «Ficha del Control» of the templates is the BOE; parameters, evidences, thresholds, non-compliance conditions and report fields are the auditor's proposal or ENSFácil's criterion («Metodología y fuentes» of the auditor's index).
export type ENSTextProvenance = 'BOE' | 'CRITERION';

export const ENS_TEXT_PROVENANCE_LABELS: Record<ENSTextProvenance, string> = {
  BOE: 'Norma ENS',
  CRITERION: 'Criterio de aplicación',
};

export interface ENSProvenancedText {
  provenance: ENSTextProvenance;
  label: string;
  text: string;
}

const provenanced = (provenance: ENSTextProvenance, text: string): ENSProvenancedText => ({
  provenance,
  label: ENS_TEXT_PROVENANCE_LABELS[provenance],
  text,
});

// Evidence, parameter and report-field texts are never the norm: the template proposes them.
export const ENS_PROPOSAL_TEXT_PROVENANCE: ENSTextProvenance = 'CRITERION';

// The texts of a requirement in reading order: the BOE literal, then how it is read and measured.
export const describeRequirementTexts = (
  requirement: Pick<ENSRequirementDefinition, 'description' | 'interpretation'>
): ENSProvenancedText[] => [
  provenanced('BOE', requirement.description),
  ...(requirement.interpretation ? [provenanced('CRITERION', requirement.interpretation)] : []),
];

// A text whose source is unknown (not in the catalog) is never presented as the norm.
export const describeUncatalogedText = (text: string): ENSProvenancedText => provenanced('CRITERION', text);

const formatISODate = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

// «Anexo II, apdo. 4.2.1»; empty when the control declares no section.
export const describeAnnexSection = (control: Pick<ENSControlDefinition, 'annexSection'>): string =>
  control.annexSection ? `Anexo II, apdo. ${control.annexSection}` : '';

// «Plantilla del auditor v2.0 (15/10/2026)»; without the date when the template has none («Plantilla del auditor v1.0»).
export const describeControlSource = (control: Pick<ENSControlDefinition, 'source'>): string =>
  control.source
    ? `Plantilla del auditor v${control.source.version}${control.source.date ? ` (${formatISODate(control.source.date)})` : ''}`
    : '';
