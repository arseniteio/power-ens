import { ENSControlConfiguration } from '../types';
import { compareENSControlIdsByAnnex } from '../../catalog';
import { opAcc1Configuration } from '../data/op-acc-1-parameters';
import { opAcc2Configuration } from '../data/op-acc-2-parameters';
import { opAcc3Configuration } from '../data/op-acc-3-parameters';
import { opAcc4Configuration } from '../data/op-acc-4-parameters';
import { opAcc5Configuration } from '../data/op-acc-5-parameters';
import { opAcc6Configuration } from '../data/op-acc-6-parameters';

export const ENSConfigurationRegistry: ENSControlConfiguration[] = [
  opAcc1Configuration,
  opAcc2Configuration,
  opAcc3Configuration,
  opAcc4Configuration,
  opAcc5Configuration,
  opAcc6Configuration,
].sort((a, b) => compareENSControlIdsByAnnex(a.controlId, b.controlId));

export const getENSControlConfiguration = (
  controlId: string
): ENSControlConfiguration | undefined =>
  ENSConfigurationRegistry.find(control => control.controlId === controlId);

export const getEnabledENSControls = (): ENSControlConfiguration[] =>
  ENSConfigurationRegistry.filter(control => control.enabled);

export const getENSParametersByControl = (controlId: string) =>
  getENSControlConfiguration(controlId)?.parameters || [];
