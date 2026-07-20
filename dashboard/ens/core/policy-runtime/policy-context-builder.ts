import { ENSLevel } from '../../configuration/types';
import { ENSControlDefinition } from '../../catalog';
import { ENSControlConfiguration } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { ENSEvidenceResolved } from '../evidence/types';
import { ENSPolicyContext } from './types';

export const buildPolicyContext = (
  control: ENSControlDefinition,
  configuration: ENSControlConfiguration | undefined,
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  evidences: ENSEvidenceResolved[]
): ENSPolicyContext => ({
  control,
  configuration,
  level,
  events,
  evidences,
});
