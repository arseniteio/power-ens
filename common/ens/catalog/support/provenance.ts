import { ENSControlDefinition, ENSRequirementDefinition } from '../types';

// Where a text shown to the auditor comes from. Only the «Ficha del Control» of the templates is the BOE; parameters, evidences, thresholds, non-compliance conditions and report fields are the auditor's proposal or ENSFácil's criterion («Metodología y fuentes» of the auditor's index).
export type ENSTextProvenance = 'NORMA_ENS' | 'CRITERIO_APLICACION';

export const ENS_TEXT_PROVENANCE_LABELS: Record<ENSTextProvenance, string> = {
  NORMA_ENS: 'Norma ENS',
  CRITERIO_APLICACION: 'Criterio de aplicación',
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

// Evidence texts (title, description, audit question) are never the norm.
export const ENS_EVIDENCE_TEXT_PROVENANCE: ENSTextProvenance = 'CRITERIO_APLICACION';

// The texts of a requirement in reading order: the BOE literal, then how it is read and measured.
export const describeRequirementTexts = (
  requirement: Pick<ENSRequirementDefinition, 'description' | 'interpretation'>
): ENSProvenancedText[] => [
  provenanced('NORMA_ENS', requirement.description),
  ...(requirement.interpretation ? [provenanced('CRITERIO_APLICACION', requirement.interpretation)] : []),
];

export const describeEvidenceText = (text: string): ENSProvenancedText =>
  provenanced(ENS_EVIDENCE_TEXT_PROVENANCE, text);

const formatISODate = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

// «Anexo II, apdo. 4.2.1»; empty when the control declares no section.
export const describeAnnexSection = (control: Pick<ENSControlDefinition, 'annexSection'>): string =>
  control.annexSection ? `Anexo II, apdo. ${control.annexSection}` : '';

// «Plantilla del auditor v2.0 (15/10/2026)».
export const describeControlSource = (control: Pick<ENSControlDefinition, 'source'>): string =>
  control.source ? `Plantilla del auditor v${control.source.version} (${formatISODate(control.source.date)})` : '';
