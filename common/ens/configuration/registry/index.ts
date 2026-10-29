import { ENSControlConfiguration } from '../types';
import { compareENSControlIdsByAnnex } from '../../catalog';
import { ENGINE_CATALOG, toControlConfiguration } from '../../catalog/engine-catalog';

export const ENSConfigurationRegistry: ENSControlConfiguration[] = ENGINE_CATALOG.map(toControlConfiguration).sort((a, b) =>
  compareENSControlIdsByAnnex(a.controlId, b.controlId)
);

export const getENSControlConfiguration = (
  controlId: string
): ENSControlConfiguration | undefined =>
  ENSConfigurationRegistry.find(control => control.controlId === controlId);
