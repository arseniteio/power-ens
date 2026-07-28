export * from './mp-info-6.policy';
export * from './op-acc-1.policy';
export * from './op-acc-2.policy';

import { ENSPolicyDefinition } from '../types';
import { mpInfo6PolicyDefinition } from './mp-info-6.policy';
import { opAcc1PolicyDefinition } from './op-acc-1.policy';
import { opAcc2PolicyDefinition } from './op-acc-2.policy';

export const ENSPolicyRegistry: ENSPolicyDefinition[] = [
  mpInfo6PolicyDefinition,
  opAcc1PolicyDefinition,
  opAcc2PolicyDefinition,
];

export const getENSPolicyDefinition = (
  controlId: string
): ENSPolicyDefinition | undefined =>
  ENSPolicyRegistry.find(policy => policy.controlId === controlId);
