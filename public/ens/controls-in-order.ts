import { ENSControls } from './data';
import { compareENSControlIdsByAnnex } from '../../common/ens/catalog';

export const ENSControlsInAnnexOrder = [...ENSControls].sort((a, b) => compareENSControlIdsByAnnex(a.id, b.id));
