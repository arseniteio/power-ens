// The screen controls in Annex II order. `data/index.ts` is rewritten whole by the generator, so the order lives here.
import { ENSControls } from './data';
import { compareENSControlIdsByAnnex } from '../../common/ens/catalog';

export const ENSControlsInAnnexOrder = [...ENSControls].sort((a, b) => compareENSControlIdsByAnnex(a.id, b.id));
