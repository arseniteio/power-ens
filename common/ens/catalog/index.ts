export * from './types';
export * from './support/measurement-plan';
export * from './support/order';
export * from './support/provenance';
export * from './support/template-correspondence';
export * from './op-acc-1';
export * from './op-acc-2';
export * from './op-acc-3';
export * from './op-acc-4';
export * from './op-acc-5';
export * from './op-acc-6';

import { ENSControlDefinition } from './types';
import { compareControlsByAnnex } from './support/order';
import { opAcc1CatalogDefinition } from './op-acc-1';
import { opAcc2CatalogDefinition } from './op-acc-2';
import { opAcc3CatalogDefinition } from './op-acc-3';
import { opAcc4CatalogDefinition } from './op-acc-4';
import { opAcc5CatalogDefinition } from './op-acc-5';
import { opAcc6CatalogDefinition } from './op-acc-6';

export const ENSCatalog: ENSControlDefinition[] = [
  opAcc1CatalogDefinition,
  opAcc2CatalogDefinition,
  opAcc3CatalogDefinition,
  opAcc4CatalogDefinition,
  opAcc5CatalogDefinition,
  opAcc6CatalogDefinition,
].sort(compareControlsByAnnex);

export const getENSCatalogControl = (
  controlId: string
): ENSControlDefinition | undefined =>
  ENSCatalog.find(control => control.id === controlId);

// Annex II order of two control ids; ids outside the catalog go after, by identifier.
export const compareENSControlIdsByAnnex = (a: string, b: string): number =>
  compareControlsByAnnex(
    getENSCatalogControl(a) || { id: a },
    getENSCatalogControl(b) || { id: b }
  );

// Annex II order of two families ('op.acc', 'mp.info'): by the first section of their catalog controls.
export const compareENSFamiliesByAnnex = (a: string, b: string): number => {
  const firstSection = (family: string) =>
    ENSCatalog.find(control => control.id.startsWith(`${family}.`))?.annexSection;

  return compareControlsByAnnex(
    { id: a, annexSection: firstSection(a) },
    { id: b, annexSection: firstSection(b) }
  );
};
