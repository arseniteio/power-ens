export * from './types';
export * from './support/measurement-plan';
export * from './support/order';
export * from './support/provenance';
export * from './support/template-correspondence';

import { ENSControlDefinition } from './types';
import { compareControlsByAnnex } from './support/order';
import { ENGINE_CATALOG, toControlDefinition } from './engine-catalog';

export const ENSCatalog: ENSControlDefinition[] = ENGINE_CATALOG.map(toControlDefinition).sort(compareControlsByAnnex);

export const getENSCatalogControl = (
  controlId: string
): ENSControlDefinition | undefined =>
  ENSCatalog.find(control => control.id === controlId);

export const compareENSControlIdsByAnnex = (a: string, b: string): number =>
  compareControlsByAnnex(
    getENSCatalogControl(a) || { id: a },
    getENSCatalogControl(b) || { id: b }
  );

export const compareENSFamiliesByAnnex = (a: string, b: string): number => {
  const firstSection = (family: string) =>
    ENSCatalog.find(control => control.id.startsWith(`${family}.`))?.annexSection;

  return compareControlsByAnnex(
    { id: a, annexSection: firstSection(a) },
    { id: b, annexSection: firstSection(b) }
  );
};
