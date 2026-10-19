import { ENSEvidenceDefinition } from './types';
import { ENSEvidenceCatalog } from './catalog';

const registry = new Map<string, ENSEvidenceDefinition[]>();

for (const evidence of ENSEvidenceCatalog) {
  if (!registry.has(evidence.controlId)) {
    registry.set(evidence.controlId, []);
  }

  registry.get(evidence.controlId)!.push(evidence);
}

export const getEvidenceDefinitions = (
  controlId: string
): ENSEvidenceDefinition[] => registry.get(controlId) || [];

export const getRegisteredControls = (): string[] =>
  Array.from(registry.keys());

// Can any fact of this control arrive? No, if NONE of its evidences listens to an event or has a primitive judging facts: a control judged only with the configuration declared on screen (op.cont.2, no runbook or rules).
// For such a control nothing arriving is not a COLLECTION failure, and what the policy cannot accredit keeps ITS cause (CONFIGURATION). Derived from the evidence catalog so it cannot diverge from it; a control with no registered evidences is treated as before (expects facts).
export const controlExpectsFacts = (controlId: string): boolean => {
  const definitions = getEvidenceDefinitions(controlId);

  return (
    definitions.length === 0 ||
    definitions.some(
      definition =>
        definition.expectedEventTypes.length > 0 ||
        Boolean(definition.judgment)
    )
  );
};
