import { ENSControlDefinition, ENSRequirementDefinition } from '../types';

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

export const ENS_PROPOSAL_TEXT_PROVENANCE: ENSTextProvenance = 'CRITERION';

export const describeRequirementTexts = (
  requirement: Pick<ENSRequirementDefinition, 'description' | 'interpretation'>
): ENSProvenancedText[] => [
  provenanced('BOE', requirement.description),
  ...(requirement.interpretation ? [provenanced('CRITERION', requirement.interpretation)] : []),
];

const formatISODate = (date: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  return match ? `${match[3]}/${match[2]}/${match[1]}` : date;
};

export const OPERATIONAL_INDICATOR_NOTE =
  'Semáforo y porcentaje: indicadores operativos. Valoración ENS: nivel de madurez (Anexo II, apdo. 6).';

export const describeAnnexSection = (control: Pick<ENSControlDefinition, 'annexSection'>): string =>
  control.annexSection ? `Anexo II, apdo. ${control.annexSection}` : '';

export const describeControlSource = (control: Pick<ENSControlDefinition, 'source'>): string =>
  control.source
    ? `Plantilla v${control.source.version}${control.source.date ? ` (${formatISODate(control.source.date)})` : ''}`
    : '';
