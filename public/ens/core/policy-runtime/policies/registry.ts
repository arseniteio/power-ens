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
  opCont2PolicyDefinition,
} from './op-cont-2.policy';

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

import {
  opExp5PolicyDefinition,
} from './op-exp-5.policy';

import {
  opExp6PolicyDefinition,
} from './op-exp-6.policy';

import {
  opExp7PolicyDefinition,
} from './op-exp-7.policy';

import {
  opExp8PolicyDefinition,
} from './op-exp-8.policy';

import {
  opExp9PolicyDefinition,
} from './op-exp-9.policy';

import {
  opExp10PolicyDefinition,
} from './op-exp-10.policy';

import {
  opMon1PolicyDefinition,
} from './op-mon-1.policy';

import {
  opMon2PolicyDefinition,
} from './op-mon-2.policy';

import {
  opMon3PolicyDefinition,
} from './op-mon-3.policy';

import {
  opNub1PolicyDefinition,
} from './op-nub-1.policy';

const policyDefinitions:
  ENSPolicyDefinition[] = [
    mpInfo6PolicyDefinition,
    opAcc1PolicyDefinition,
    opAcc2PolicyDefinition,
    opAcc3PolicyDefinition,
    opAcc4PolicyDefinition,
    opAcc5PolicyDefinition,
    opAcc6PolicyDefinition,
    opCont2PolicyDefinition,
    opExp1PolicyDefinition,
    opExp2PolicyDefinition,
    opExp3PolicyDefinition,
    opExp4PolicyDefinition,
    opExp5PolicyDefinition,
    opExp6PolicyDefinition,
    opExp7PolicyDefinition,
    opExp8PolicyDefinition,
    opExp9PolicyDefinition,
    opExp10PolicyDefinition,
    opMon1PolicyDefinition,
    opMon2PolicyDefinition,
    opMon3PolicyDefinition,
    opNub1PolicyDefinition,
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
