import { ENSEvidenceDefinition } from './types';
import { ENGINE_CATALOG, toEvidenceDefinitions } from '../../catalog/engine-catalog';

export const ENSEvidenceCatalog: ENSEvidenceDefinition[] = ENGINE_CATALOG.flatMap(toEvidenceDefinitions);
