import { ENSControlConfiguration } from '../types';
import { mpInfo6Configuration } from '../data/mp-info-6-parameters';
import { opAcc1Configuration } from '../data/op-acc-1-parameters';
import { opAcc2Configuration } from '../data/op-acc-2-parameters';
import { opAcc3Configuration } from '../data/op-acc-3-parameters';
import { opAcc4Configuration } from '../data/op-acc-4-parameters';

export const ENSConfigurationRegistry: ENSControlConfiguration[] = [
  mpInfo6Configuration,
  opAcc1Configuration,
  opAcc2Configuration,
  opAcc3Configuration,
  opAcc4Configuration,
];

export const getENSControlConfiguration = (
  controlId: string
): ENSControlConfiguration | undefined =>
  ENSConfigurationRegistry.find(control => control.controlId === controlId);

export const getEnabledENSControls = (): ENSControlConfiguration[] =>
  ENSConfigurationRegistry.filter(control => control.enabled);

export const getENSParametersByControl = (controlId: string) =>
  getENSControlConfiguration(controlId)?.parameters || [];
