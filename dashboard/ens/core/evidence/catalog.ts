import { ENSEvidenceDefinition } from './types';
import { mpInfo6Evidences } from './mp-info-6.evidence';
import { opAcc1Evidences } from './op-acc-1.evidence';
import { opAcc2Evidences } from './op-acc-2.evidence';

export const ENSEvidenceCatalog: ENSEvidenceDefinition[] = [
  ...mpInfo6Evidences,
  ...opAcc1Evidences,
  ...opAcc2Evidences,
];
