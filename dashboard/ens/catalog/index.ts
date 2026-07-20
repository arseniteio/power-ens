export * from './types';
export * from './mp-info-6';
export * from './op-acc-1';
export * from './op-acc-2';

import { ENSControlDefinition } from './types';
import { mpInfo6CatalogDefinition } from './mp-info-6';
import { opAcc1CatalogDefinition } from './op-acc-1';
import { opAcc2CatalogDefinition } from './op-acc-2';

export const ENSCatalog: ENSControlDefinition[] = [
  mpInfo6CatalogDefinition,
  opAcc1CatalogDefinition,
  opAcc2CatalogDefinition,
];

export const getENSCatalogControl = (
  controlId: string
): ENSControlDefinition | undefined =>
  ENSCatalog.find(control => control.id === controlId);
