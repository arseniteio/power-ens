import { ENSControlConfiguration } from '../types';
import { compareENSControlIdsByAnnex } from '../../catalog';
import { mpCom1Configuration } from '../data/mp-com-1-parameters';
import { mpCom3Configuration } from '../data/mp-com-3-parameters';
import { mpCom4Configuration } from '../data/mp-com-4-parameters';
import { mpEq2Configuration } from '../data/mp-eq-2-parameters';
import { mpEq3Configuration } from '../data/mp-eq-3-parameters';
import { mpEq4Configuration } from '../data/mp-eq-4-parameters';
import { mpInfo6Configuration } from '../data/mp-info-6-parameters';
import { mpSw2Configuration } from '../data/mp-sw-2-parameters';
import { opAcc1Configuration } from '../data/op-acc-1-parameters';
import { opAcc2Configuration } from '../data/op-acc-2-parameters';
import { opAcc3Configuration } from '../data/op-acc-3-parameters';
import { opAcc4Configuration } from '../data/op-acc-4-parameters';
import { opAcc5Configuration } from '../data/op-acc-5-parameters';
import { opAcc6Configuration } from '../data/op-acc-6-parameters';
import { opCont2Configuration } from '../data/op-cont-2-parameters';
import { opCont3Configuration } from '../data/op-cont-3-parameters';
import { opExp1Configuration } from '../data/op-exp-1-parameters';
import { opExp2Configuration } from '../data/op-exp-2-parameters';
import { opExp3Configuration } from '../data/op-exp-3-parameters';
import { opExp4Configuration } from '../data/op-exp-4-parameters';
import { opExp5Configuration } from '../data/op-exp-5-parameters';
import { opExp6Configuration } from '../data/op-exp-6-parameters';
import { opExp7Configuration } from '../data/op-exp-7-parameters';
import { opExp8Configuration } from '../data/op-exp-8-parameters';
import { opExp9Configuration } from '../data/op-exp-9-parameters';
import { opExp10Configuration } from '../data/op-exp-10-parameters';
import { opMon1Configuration } from '../data/op-mon-1-parameters';
import { opMon2Configuration } from '../data/op-mon-2-parameters';
import { opMon3Configuration } from '../data/op-mon-3-parameters';
import { opNub1Configuration } from '../data/op-nub-1-parameters';

export const ENSConfigurationRegistry: ENSControlConfiguration[] = [
  mpCom1Configuration,
  mpCom3Configuration,
  mpCom4Configuration,
  mpEq2Configuration,
  mpEq3Configuration,
  mpEq4Configuration,
  mpInfo6Configuration,
  mpSw2Configuration,
  opAcc1Configuration,
  opAcc2Configuration,
  opAcc3Configuration,
  opAcc4Configuration,
  opAcc5Configuration,
  opAcc6Configuration,
  opCont2Configuration,
  opCont3Configuration,
  opExp1Configuration,
  opExp2Configuration,
  opExp3Configuration,
  opExp4Configuration,
  opExp5Configuration,
  opExp6Configuration,
  opExp7Configuration,
  opExp8Configuration,
  opExp9Configuration,
  opExp10Configuration,
  opMon1Configuration,
  opMon2Configuration,
  opMon3Configuration,
  opNub1Configuration,
].sort((a, b) => compareENSControlIdsByAnnex(a.controlId, b.controlId));

export const getENSControlConfiguration = (
  controlId: string
): ENSControlConfiguration | undefined =>
  ENSConfigurationRegistry.find(control => control.controlId === controlId);

export const getEnabledENSControls = (): ENSControlConfiguration[] =>
  ENSConfigurationRegistry.filter(control => control.enabled);

export const getENSParametersByControl = (controlId: string) =>
  getENSControlConfiguration(controlId)?.parameters || [];
