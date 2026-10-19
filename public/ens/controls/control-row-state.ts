// Row content while there is no verdict for this view (first load or control still computing). Never a status.
import type { ENSControlSummaryEntry } from '../../../common/ens/evaluation/types';

export const controlRowWaitLabel = (isLoading: boolean, summary?: ENSControlSummaryEntry): string | undefined =>
  summary?.pending ? 'Calculando…' : isLoading && !summary ? 'Evaluando…' : undefined;
