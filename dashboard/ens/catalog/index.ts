export * from './types';
export * from './mp-info-6';
export * from './op-acc-1';
export * from './op-acc-2';
export * from './op-acc-3';
export * from './op-acc-4';

import { ENSControlDefinition } from './types';
import { mpInfo6CatalogDefinition } from './mp-info-6';
import { opAcc1CatalogDefinition } from './op-acc-1';
import { opAcc2CatalogDefinition } from './op-acc-2';
import { opAcc3CatalogDefinition } from './op-acc-3';
import { opAcc4CatalogDefinition } from './op-acc-4';

export const ENSCatalog: ENSControlDefinition[] = [
  mpInfo6CatalogDefinition,
  opAcc1CatalogDefinition,
  opAcc2CatalogDefinition,
  opAcc3CatalogDefinition,
  opAcc4CatalogDefinition,
];

export const getENSCatalogControl = (
  controlId: string
): ENSControlDefinition | undefined =>
  ENSCatalog.find(control => control.id === controlId);
