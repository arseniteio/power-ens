// Statement of Applicability: excludes a whole control when the system lacks what the control regulates.
// An incomplete statement does not exclude (reason, reference and a link are required). An exclusion never hides
// what was measured: see `core/evaluation/requirement/applicability.ts`. Excluded requirements are NO_APLICA,
// with reference and reason.
// Types from the file, never from a high-level barrel.
import type { ENSControlConfiguration } from '../types';
import { cells, isUsableLink, parameterRows } from './attestation-service';

// Parameter id, identical in every control that declares it (the engine looks it up without knowing the control).
export const ENS_APPLICABILITY_PARAMETER_ID = 'P-DA';

export interface ENSApplicabilityDeclaration {
  // Why the control does not apply to this system.
  reason: string;
  // Name of the approving document.
  reference: string;
  links: string[];
  date?: string;
  responsible?: string;
}

// Statement of a control: the first row with reason and reference.
// Row format: `reason | reference | link | date | owner`; extra links are separated by spaces inside their cell.
export const parseApplicabilityDeclaration = (
  configuration?: ENSControlConfiguration
): ENSApplicabilityDeclaration | undefined => {
  const parameter = configuration?.parameters.find(
    candidate => candidate.id === ENS_APPLICABILITY_PARAMETER_ID
  );

  for (const row of parameterRows(parameter)) {
    const [reason, reference, rawLinks, date, responsible] = cells(row);

    if (!reason || !reference) {
      continue;
    }

    return {
      reason,
      reference,
      links: (rawLinks || '').split(/[\s,;]+/).filter(isUsableLink),
      date: date || undefined,
      responsible: responsible || undefined,
    };
  }

  return undefined;
};

// Complete enough to exclude: reason, reference and at least one usable link. Date and owner go to the report
// but do not block.
export const isDeclarationSufficient = (
  declaration?: ENSApplicabilityDeclaration
): boolean =>
  Boolean(
    declaration &&
      declaration.reason.trim() &&
      declaration.reference.trim() &&
      declaration.links.length > 0
  );

// Screen and report sentence; always states that it is a declared exclusion.
export const describeDeclaration = (
  declaration: ENSApplicabilityDeclaration
): string => {
  const parts = [
    `Excluido por la Declaración de Aplicabilidad: ${declaration.reference}`,
  ];

  if (declaration.date) {
    parts.push(`de ${declaration.date}`);
  }

  if (declaration.responsible) {
    parts.push(`declarado por ${declaration.responsible}`);
  }

  return `${parts.join(', ')}. Motivo: ${declaration.reason}. ${declaration.links.join(' ')}`;
};
