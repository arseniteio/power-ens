import { ENSControlConfiguration } from '../types';
import { mpInfo6Configuration } from '../data/mp-info-6-parameters';
import { opAcc1Configuration } from '../data/op-acc-1-parameters';
import { opAcc2Configuration } from '../data/op-acc-2-parameters';
import { opAcc3Configuration } from '../data/op-acc-3-parameters';
import { opAcc4Configuration } from '../data/op-acc-4-parameters';
import { opAcc5Configuration } from '../data/op-acc-5-parameters';
import { opAcc6Configuration } from '../data/op-acc-6-parameters';
import { opExp1Configuration } from '../data/op-exp-1-parameters';
import { opExp2Configuration } from '../data/op-exp-2-parameters';
import { opExp3Configuration } from '../data/op-exp-3-parameters';
import { opExp4Configuration } from '../data/op-exp-4-parameters';

export const ENSConfigurationRegistry: ENSControlConfiguration[] = [
  mpInfo6Configuration,
  opAcc1Configuration,
  opAcc2Configuration,
  opAcc3Configuration,
  opAcc4Configuration,
  opAcc5Configuration,
  opAcc6Configuration,
  opExp1Configuration,
  opExp2Configuration,
  opExp3Configuration,
  opExp4Configuration,
];

export const getENSControlConfiguration = (
  controlId: string
): ENSControlConfiguration | undefined =>
  ENSConfigurationRegistry.find(control => control.controlId === controlId);

export const getEnabledENSControls = (): ENSControlConfiguration[] =>
  ENSConfigurationRegistry.filter(control => control.enabled);

export const getENSParametersByControl = (controlId: string) =>
  getENSControlConfiguration(controlId)?.parameters || [];
