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

import {
  opAcc5PolicyDefinition,
} from './op-acc-5.policy';

import {
  opAcc6PolicyDefinition,
} from './op-acc-6.policy';

import {
  opExp1PolicyDefinition,
} from './op-exp-1.policy';

import {
  opExp2PolicyDefinition,
} from './op-exp-2.policy';

import {
  opExp3PolicyDefinition,
} from './op-exp-3.policy';

import {
  opExp4PolicyDefinition,
} from './op-exp-4.policy';

const policyDefinitions:
  ENSPolicyDefinition[] = [
    opExp4PolicyDefinition,
    opExp3PolicyDefinition,
    opExp2PolicyDefinition,
    opExp1PolicyDefinition,
    opAcc6PolicyDefinition,
    opAcc5PolicyDefinition,
    opAcc3PolicyDefinition,
    opAcc4PolicyDefinition,
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
