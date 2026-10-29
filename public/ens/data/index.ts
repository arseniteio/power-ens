import { ENGINE_CATALOG } from '../../../common/ens/catalog/engine-catalog';
import { toScreenControl } from './from-engine-catalog';

export const ENSControls = ENGINE_CATALOG.map(toScreenControl);
