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
