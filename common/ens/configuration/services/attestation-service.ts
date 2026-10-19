// Documentary attestation: proves by document what no telemetry can show (e.g. `op.acc.1.5` eIDAS,
// `op.acc.1.r1.1`).
// It cannot cover a measurement: only requirements the catalog declares with `evidenceIds: []` accept one
// (`esRequisitoAtestable` reads the catalog, not the attestation). The result is marked `ATESTACION` with
// reference, date and signer, and reads "acreditado documentalmente", never "cumple". An incomplete attestation
// (no reference or owner) proves nothing.
// Types from the file, never from a high-level barrel.
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../types';

// Id of the parameter carrying the attestations, identical in every control (the engine looks it up without
// knowing the control).
export const ENS_ATTESTATION_PARAMETER_ID = 'P-ATT';

export interface ENSRequirementAttestation {
  requirementId: string;
  // Name of the proving document.
  reference: string;
  // Links to the document; several allowed, all stored.
  links: string[];
  date?: string;
  responsible?: string;
}

export const cells = (row: string): string[] =>
  row.split('|').map(cell => cell.trim());

// A usable link: `http(s)://`, `file://` or a network path (`\\\\server\\...`). Loose text is rejected.
// Domain of the parameter's own EXAMPLE, rejected on purpose so that copying it verbatim does not prove
// anything. `.invalido` is not an assignable TLD.
const PLACEHOLDER_HOSTS = ['ejemplo.invalido', 'example.invalid'];

export const isUsableLink = (value: string): boolean => {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  const lowered = trimmed.toLowerCase();

  if (PLACEHOLDER_HOSTS.some(host => lowered.includes(host))) {
    return false;
  }

  return (
    /^https?:\/\/\S+$/i.test(trimmed) ||
    /^file:\/\/\S+$/i.test(trimmed) ||
    /^\\\\\S+/.test(trimmed) ||
    /^\/\S+/.test(trimmed)
  );
};

export const parameterRows = (
  parameter?: ENSControlParameter
): string[] => {
  const value = parameter?.value;

  if (Array.isArray(value)) {
    return value.map(item => String(item));
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split('\n');
  }

  return [];
};

// Declared attestations, per requirement.
// Row format: `requirement | reference | link | date | owner`; extra links are separated by spaces inside their
// cell.
export const parseRequirementAttestations = (
  configuration?: ENSControlConfiguration
): Map<string, ENSRequirementAttestation> => {
  const parameter = configuration?.parameters.find(
    candidate => candidate.id === ENS_ATTESTATION_PARAMETER_ID
  );

  const attestations = new Map<string, ENSRequirementAttestation>();

  parameterRows(parameter).forEach(row => {
    const [requirementId, reference, rawLinks, date, responsible] =
      cells(row);

    if (!requirementId || !reference) {
      return;
    }

    const links = (rawLinks || '')
      .split(/[\s,;]+/)
      .filter(isUsableLink);

    attestations.set(requirementId, {
      requirementId,
      reference,
      links,
      date: date || undefined,
      responsible: responsible || undefined,
    });
  });

  return attestations;
};

// Complete enough to prove: reference AND at least one usable link. Date and owner go to the report but do not
// block.
export const isAttestationSufficient = (
  attestation?: ENSRequirementAttestation
): boolean =>
  Boolean(
    attestation &&
      attestation.reference.trim() &&
      attestation.links.length > 0
  );

// Screen and report sentence; always states that it is documentary.
export const describeAttestation = (
  attestation: ENSRequirementAttestation
): string => {
  const parts = [
    `Acreditado documentalmente: ${attestation.reference}`,
  ];

  if (attestation.date) {
    parts.push(`de ${attestation.date}`);
  }

  if (attestation.responsible) {
    parts.push(`declarado por ${attestation.responsible}`);
  }

  return `${parts.join(', ')}. ${attestation.links.join(' ')}`;
};
