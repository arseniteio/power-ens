/** Index pattern lookup for the search bar: exact title, freshly read pattern list, "does not exist" vs "could not be read". */
import { findIndexPatternByTitle } from '../public/search/alerts-index-pattern';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const patron = { id: 'wazuh-alerts-*', title: 'wazuh-alerts-*', timeFieldName: 'timestamp' };

const service = (options: { lista?: () => { id: string; title: string }[]; get?: (id: string) => unknown } = {}) => {
  const calls: { refresh?: boolean; get: string[] } = { get: [] };
  let cache: { id: string; title: string }[] | undefined;
  return {
    llamadas: calls,
    getIdsWithTitle: async (refresh?: boolean) => {
      calls.refresh = refresh;
      if (!cache || refresh) cache = (options.lista || (() => [{ id: patron.id, title: patron.title }]))();
      return cache;
    },
    get: async (id: string) => {
      calls.get.push(id);
      return (options.get || (() => patron))(id) as typeof patron;
    },
  };
};

(async () => {
  const s = service();
  const found = await findIndexPatternByTitle(s, 'wazuh-alerts-*');
  check('finds it by its title', found.indexPattern === patron && !found.error, found);
  check('loads the pattern by its id', s.llamadas.get.join() === 'wazuh-alerts-*', s.llamadas.get);
  check('asks for the freshly read list, not the cached one', s.llamadas.refresh === true, s.llamadas.refresh);

  let created = false;
  const late = service({ lista: () => (created ? [{ id: 'nuevo', title: 'wazuh-alerts-*' }] : [{ id: 'otro', title: 'otro-*' }]) });
  await late.getIdsWithTitle();
  created = true;
  const after = await findIndexPatternByTitle(late, 'wazuh-alerts-*');
  check('a pattern created after the cache was filled is found', after.indexPattern === patron, after);

  const similar = await findIndexPatternByTitle(
    service({ lista: () => [{ id: 'a', title: 'wazuh-alerts-4.x-*' }, { id: 'b', title: 'wazuh-alerts' }] }),
    'wazuh-alerts-*'
  );
  check('a similar title does not count: it does not exist', !similar.indexPattern && !similar.error, similar);

  const none = await findIndexPatternByTitle(service({ lista: () => [] }), 'wazuh-alerts-*');
  check('no patterns: does not exist, no error', !none.indexPattern && none.error === undefined, none);

  const withoutPermission = await findIndexPatternByTitle(
    service({
      lista: () => {
        throw new Error('Forbidden');
      },
    }),
    'wazuh-alerts-*'
  );
  check('the list cannot be read: error with its cause, not «does not exist»', withoutPermission.error === 'Forbidden' && !withoutPermission.indexPattern, withoutPermission);

  const brokenOnLoad = await findIndexPatternByTitle(
    service({
      get: () => {
        throw new Error('Network error');
      },
    }),
    'wazuh-alerts-*'
  );
  check('the pattern cannot be loaded: error with its cause', brokenOnLoad.error === 'Network error' && !brokenOnLoad.indexPattern, brokenOnLoad);

  const veryOdd = await findIndexPatternByTitle(
    service({
      lista: () => {
        throw 'sin mensaje';
      },
    }),
    'wazuh-alerts-*'
  );
  check('a failure without a message is also counted', veryOdd.error === 'sin mensaje', veryOdd);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
