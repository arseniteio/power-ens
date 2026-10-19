/** What `useEsSearch` decides when its parameters change, and the single notice per message. */
import { decideSearch, ENS_SEARCH_TOAST_WINDOW_MS, isOwnCancellation, searchDataKey, shouldToast } from '../public/search/search-decision';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const filters = [{ match_phrase: { 'agent.id': '024' } }];
const a = searchDataKey({ preAppliedFilters: filters, size: 0, refreshKey: 1 });
const refreshedOne = searchDataKey({ preAppliedFilters: filters, size: 0, refreshKey: 2 });
const b = searchDataKey({ preAppliedFilters: [{ match_phrase: { 'agent.id': '028' } }], size: 0, refreshKey: 2 });

check('refreshKey does not count in the data key', a === refreshedOne, [a, refreshedOne]);
check('another filter does change the data key', a !== b);
check('without refreshKey: the same key as with it', searchDataKey({ preAppliedFilters: filters, size: 0 }) === a);

check('nothing in progress: it searches', decideSearch(undefined, a) === 'start');
check('only the refreshKey rises with the same search in progress: it waits for that one', decideSearch(a, refreshedOne) === 'skip');
check('data change with another search in progress: it is cancelled and a new search is made', decideSearch(a, b) === 'abort-and-start');

check('cancellation by its own signal: not a failure', isOwnCancellation({ aborted: true }));
check('AbortError with our signal intact (cut by another): it is a failure', !isOwnCancellation({ aborted: false }));
check('without a signal: it is a failure', !isOwnCancellation(undefined));

{
  const record = new Map<string, number>();
  const t0 = Date.parse('2026-10-08T10:00:00Z');
  const avisos = Array.from({ length: 17 }, (_, i) => shouldToast(record, 'Request Timeout', t0 + i * 10)).filter(Boolean).length;
  check('17 rows failing the same at once: a single notice', avisos === 1, avisos);
  check('another message: its own notice', shouldToast(record, 'Forbidden', t0 + 200));
  check('the same message within the minute: silent', !shouldToast(record, 'Request Timeout', t0 + ENS_SEARCH_TOAST_WINDOW_MS - 1));
  check('after the minute: warned again', shouldToast(record, 'Request Timeout', t0 + ENS_SEARCH_TOAST_WINDOW_MS));
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
