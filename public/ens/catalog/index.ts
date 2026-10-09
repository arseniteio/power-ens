export * from './types';
export * from './mp-info-6';
export * from './op-acc-1';
export * from './op-acc-2';
export * from './op-acc-3';
export * from './op-acc-4';
export * from './op-acc-5';
export * from './op-acc-6';
export * from './op-exp-1';
export * from './op-exp-2';
export * from './op-exp-3';
export * from './op-exp-4';
export * from './op-exp-5';
export * from './op-exp-6';
export * from './op-exp-7';
export * from './op-exp-8';
export * from './op-exp-9';
export * from './op-exp-10';
export * from './op-mon-1';

import { ENSControlDefinition } from './types';
import { mpInfo6CatalogDefinition } from './mp-info-6';
import { opAcc1CatalogDefinition } from './op-acc-1';
import { opAcc2CatalogDefinition } from './op-acc-2';
import { opAcc3CatalogDefinition } from './op-acc-3';
import { opAcc4CatalogDefinition } from './op-acc-4';
import { opAcc5CatalogDefinition } from './op-acc-5';
import { opAcc6CatalogDefinition } from './op-acc-6';
import { opExp1CatalogDefinition } from './op-exp-1';
import { opExp2CatalogDefinition } from './op-exp-2';
import { opExp3CatalogDefinition } from './op-exp-3';
import { opExp4CatalogDefinition } from './op-exp-4';
import { opExp5CatalogDefinition } from './op-exp-5';
import { opExp6CatalogDefinition } from './op-exp-6';
import { opExp7CatalogDefinition } from './op-exp-7';
import { opExp8CatalogDefinition } from './op-exp-8';
import { opExp9CatalogDefinition } from './op-exp-9';
import { opExp10CatalogDefinition } from './op-exp-10';
import { opMon1CatalogDefinition } from './op-mon-1';

export const ENSCatalog: ENSControlDefinition[] = [
  mpInfo6CatalogDefinition,
  opAcc1CatalogDefinition,
  opAcc2CatalogDefinition,
  opAcc3CatalogDefinition,
  opAcc4CatalogDefinition,
  opAcc5CatalogDefinition,
  opAcc6CatalogDefinition,
  opExp1CatalogDefinition,
  opExp2CatalogDefinition,
  opExp3CatalogDefinition,
  opExp4CatalogDefinition,
  opExp5CatalogDefinition,
  opExp6CatalogDefinition,
  opExp7CatalogDefinition,
  opExp8CatalogDefinition,
  opExp9CatalogDefinition,
  opExp10CatalogDefinition,
  opMon1CatalogDefinition,
];

export const getENSCatalogControl = (
  controlId: string
): ENSControlDefinition | undefined =>
  ENSCatalog.find(control => control.id === controlId);
