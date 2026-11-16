import { getENSCatalogControl } from '../../../../common/ens/catalog';
import { lookupCatalogParameter } from '../../../../common/ens/profiles/validate';

export const parameterTitle = (controlId: string, parameterId: string): string =>
  lookupCatalogParameter(controlId, parameterId)?.label || `${controlId} ${parameterId}`;

export const controlTitle = (controlId: string): string => getENSCatalogControl(controlId)?.name || controlId;
