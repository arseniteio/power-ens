// Lo que pinta una fila de la lista mientras no hay veredicto de ESTA vista,
// sin React (lo prueba `tests/evaluation-refresh.test.ts`): la primera carga
// («Evaluando…») o un control que el servidor aún está calculando en la
// primera carga por partes («Calculando…», `pending`). Nunca un estado.
import type { ENSControlSummaryEntry } from '../../../common/ens/evaluation/types';

export const controlRowWaitLabel = (isLoading: boolean, summary?: ENSControlSummaryEntry): string | undefined =>
  summary?.pending ? 'Calculando…' : isLoading && !summary ? 'Evaluando…' : undefined;
