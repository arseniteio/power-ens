import type { ENSControlSummaryEntry } from '../../../common/ens/evaluation/types';

export const controlRowWaitLabel = (isLoading: boolean, summary?: ENSControlSummaryEntry): string | undefined =>
  summary?.pending ? 'Calculando…' : isLoading && !summary ? 'Evaluando…' : undefined;
