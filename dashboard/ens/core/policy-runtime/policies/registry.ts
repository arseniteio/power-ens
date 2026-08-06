import {
  ENSPolicyDefinition,
} from '../types';

import {
  mpInfo6PolicyDefinition,
} from './mp-info-6.policy';

import {
  opAcc1PolicyDefinition,
} from './op-acc-1.policy';

import {
  opAcc2PolicyDefinition,
} from './op-acc-2.policy';

import {
  opAcc3PolicyDefinition,
} from './op-acc-3.policy';

import {
  opAcc4PolicyDefinition,
} from './op-acc-4.policy';

const policyDefinitions:
  ENSPolicyDefinition[] = [
    opAcc4PolicyDefinition,
    opAcc3PolicyDefinition,
    mpInfo6PolicyDefinition,
    opAcc1PolicyDefinition,
    opAcc2PolicyDefinition,
  ];

const policyRegistry =
  new Map<string, ENSPolicyDefinition>();

for (
  const definition
  of policyDefinitions
) {
  const controlId =
    definition.controlId.trim();

  if (!controlId) {
    throw new Error(
      `Política ${definition.id} sin controlId válido.`
    );
  }

  if (
    policyRegistry.has(controlId)
  ) {
    throw new Error(
      `Política duplicada para el control ${controlId}.`
    );
  }

  policyRegistry.set(
    controlId,
    definition
  );
}

export const getPolicyDefinition = (
  controlId: string
): ENSPolicyDefinition | undefined =>
  policyRegistry.get(controlId);

export const getRegisteredPolicyControls =
  (): string[] =>
    Array.from(
      policyRegistry.keys()
    ).sort();
