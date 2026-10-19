export * from './types';
export * from './support/measurement-plan';
export * from './support/order';
export * from './support/provenance';
export * from './support/template-correspondence';
export * from './mp-com-1';
export * from './mp-com-3';
export * from './mp-com-4';
export * from './mp-eq-2';
export * from './mp-eq-3';
export * from './mp-eq-4';
export * from './mp-info-6';
export * from './mp-sw-2';
export * from './op-acc-1';
export * from './op-acc-2';
export * from './op-acc-3';
export * from './op-acc-4';
export * from './op-acc-5';
export * from './op-acc-6';
export * from './op-cont-2';
export * from './op-cont-3';
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
export * from './op-mon-2';
export * from './op-mon-3';
export * from './op-nub-1';

import { ENSControlDefinition } from './types';
import { compareControlsByAnnex } from './support/order';
import { mpCom1CatalogDefinition } from './mp-com-1';
import { mpCom3CatalogDefinition } from './mp-com-3';
import { mpCom4CatalogDefinition } from './mp-com-4';
import { mpEq2CatalogDefinition } from './mp-eq-2';
import { mpEq3CatalogDefinition } from './mp-eq-3';
import { mpEq4CatalogDefinition } from './mp-eq-4';
import { mpInfo6CatalogDefinition } from './mp-info-6';
import { mpSw2CatalogDefinition } from './mp-sw-2';
import { opAcc1CatalogDefinition } from './op-acc-1';
import { opAcc2CatalogDefinition } from './op-acc-2';
import { opAcc3CatalogDefinition } from './op-acc-3';
import { opAcc4CatalogDefinition } from './op-acc-4';
import { opAcc5CatalogDefinition } from './op-acc-5';
import { opAcc6CatalogDefinition } from './op-acc-6';
import { opCont2CatalogDefinition } from './op-cont-2';
import { opCont3CatalogDefinition } from './op-cont-3';
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
import { opMon2CatalogDefinition } from './op-mon-2';
import { opMon3CatalogDefinition } from './op-mon-3';
import { opNub1CatalogDefinition } from './op-nub-1';

export const ENSCatalog: ENSControlDefinition[] = [
  mpCom1CatalogDefinition,
  mpCom3CatalogDefinition,
  mpCom4CatalogDefinition,
  mpEq2CatalogDefinition,
  mpEq3CatalogDefinition,
  mpEq4CatalogDefinition,
  mpInfo6CatalogDefinition,
  mpSw2CatalogDefinition,
  opAcc1CatalogDefinition,
  opAcc2CatalogDefinition,
  opAcc3CatalogDefinition,
  opAcc4CatalogDefinition,
  opAcc5CatalogDefinition,
  opAcc6CatalogDefinition,
  opCont2CatalogDefinition,
  opCont3CatalogDefinition,
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
  opMon2CatalogDefinition,
  opMon3CatalogDefinition,
  opNub1CatalogDefinition,
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
