/** A daily index in the window with no ENSFácil facts (1.2.0). */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse } from '../server/lib/evaluation/responses';
import { STREAM_SORT, FACTS_SORT } from '../server/lib/evaluation/queries';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt' && k !== 'meta').map(k => [k, canon(v[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const clock = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(clock.getTime() - h * 3600 * 1000).toISOString();
const dayOf = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');
let n = 0;
const fact = (agent: string, name: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: `wazuh-alerts-4.x-${dayOf(hora(hours))}`,
  _source: { '@timestamp': hora(hours), timestamp: hora(hours), id: `${Date.parse(hora(hours)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agent, name: name }, rule: { id: '100', groups: ['ENS'] }, data },
});

const ens: FakeDoc[] = [];
for (const [agent, name] of [['101', 'srv-web01'], ['102', 'ldap01']]) {
  for (const h of [50, 3, 1]) {
    ens.push(fact(agent, name, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
    ens.push(fact(agent, name, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: name, servicio: 'ssh.service', estado: 'CUMPLE' }, h - 0.01));
    ens.push(fact(agent, name, { ensfacil: 'op.acc.1', event: 'collector_run' }, h));
  }
}
const foreign: FakeDoc = {
  _id: 'otra-1',
  _index: 'wazuh-alerts-4.x-2026.10.16',
  _source: { '@timestamp': hora(24), timestamp: hora(24), id: 'x.1', manager: { name: 'wazuh-manager' }, agent: { id: '101', name: 'srv-web01' }, rule: { id: '5715', groups: ['sshd'] }, data: { srcip: '192.0.2.10' } },
};
check('setup: the foreign alert falls on a day without ENSFácil facts', !ens.some(d => d._index === foreign._index));

const monitor = (id: string, name: string): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group: ['ens'], status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
const configuration: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
configuration.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
configuration.updatedAt = '2026-10-14T10:00:00.000Z';
const rest: FakeDoc[] = [
  monitor('101', 'srv-web01'),
  monitor('102', 'ldap01'),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuration, updatedAt: configuration.updatedAt } },
];
const indexer = (docs: FakeDoc[]) => createFakeIndexer([...docs, ...rest], { clock: () => clock.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };

const request = async (service: any, clients2: any, q: any) => {
  let r = buildEvaluationResponse(await service.run(clients2, { timeZone: 'UTC', ...q }, { allowStale: true })) as any;
  // Slower than the series idle window (SERIES_IDLE_MS, 200 ms; the screen polls every 2 s), or the background
  // series never gets a turn.
  for (let i = 0; i < 600 && (r.meta?.pending || r.meta?.seriesPending); i++) {
    await new Promise(ready => setTimeout(ready, 300));
    r = buildEvaluationResponse(await service.run(clients2, { timeZone: 'UTC', ...q }, { allowStale: true })) as any;
  }
  return r;
};

(async () => {
  console.log('1. The fake, like OpenSearch');
  const withForeign = indexer([...ens, foreign]);
  const searches = (sort: unknown[]) =>
    withForeign.search({ index: 'wazuh-alerts-4.x-2026.10.15,wazuh-alerts-4.x-2026.10.16,wazuh-alerts-4.x-2026.10.17', body: { size: 1, sort, query: { match_all: {} } } });
  let error: any;
  try {
    await searches([{ 'data.ensfacil': { order: 'asc' } }]);
  } catch (e) {
    error = e;
  }
  check('sorting by data.ensfacil without unmapped_type on a day that does not map it: 400 «No mapping found»', error?.meta?.statusCode === 400 && /No mapping found for \[data\.ensfacil\] in order to sort on/.test(error?.message), error?.message);
  const good = await searches([{ 'data.ensfacil': { order: 'asc', missing: '_last', unmapped_type: 'keyword' } }]);
  check('con unmapped_type responde', good.body.hits.hits.length === 1);
  check('the stream\'s order carries unmapped_type on all its keys except the date', STREAM_SORT.every((s: any) => {
    const [campo, o] = Object.entries(s)[0] as [string, any];
    return campo === '@timestamp' || o.unmapped_type === 'keyword';
  }) && STREAM_SORT.length === FACTS_SORT.length + 1);

  console.log('2. A day without ENSFácil facts in the window');
  const reference = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock });
  const withoutForeign = indexer(ens);
  const clientsRef = { asCurrentUser: withoutForeign, asInternalUser: withoutForeign };
  const service = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock });
  const clients2 = { asCurrentUser: withForeign, asInternalUser: withForeign };
  let response: any;
  let failure: any;
  try {
    response = await request(service, clients2, { include: 'results' });
  } catch (e) {
    failure = e;
  }
  check('the first load answers', !failure && Array.isArray(response?.results), failure?.message);
  const named = withForeign.log.some(l => typeof l.index === 'string' && l.index.split(',').includes('wazuh-alerts-4.x-2026.10.16') && (l.body?.sort || [])[0]?.['data.ensfacil']);
  check('and the per-machine stream did name the day without facts', named);
  const expectedValue = await request(reference, clientsRef, { include: 'results' });
  check('with the same as without that day', response && same(response.results, expectedValue.results) && same(response.agents, expectedValue.agents));

  console.log('3. A 400 from the stream: row by row');
  const rejections: string[] = [];
  const rejector = {
    ...withForeign,
    search: async (p: any) => {
      if ((p.body?.sort || [])[0]?.['data.ensfacil']) {
        rejections.push(p.index);
        throw Object.assign(new Error('illegal_argument_exception'), { statusCode: 400, meta: { statusCode: 400 } });
      }
      return withForeign.search(p);
    },
  };
  const service3 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock });
  const clients3 = { asCurrentUser: rejector, asInternalUser: rejector };
  let r3: any;
  let f3: any;
  try {
    r3 = await request(service3, clients3, { include: 'results' });
  } catch (e) {
    f3 = e;
  }
  check('the stream was rejected and it still answers', rejections.length > 0 && !f3, f3?.message);
  check('with rows read one by one, like the stream', r3 && same(r3.results, expectedValue.results) && same(r3.agents, expectedValue.agents));
  let series: any;
  let fs: any;
  try {
    series = await request(service3, clients3, { include: 'dashboard', timelineDays: 3 });
  } catch (e) {
    fs = e;
  }
  const seriesRef = await request(reference, clientsRef, { include: 'dashboard', timelineDays: 3 });
  check('the series is also computed row by row', !fs && !series?.meta?.seriesPending && (series?.timeline || []).length > 1, fs?.message || series?.meta);
  check('and it is the same', series && same((series.timeline || []).map((p: any) => [p.label, p.score]), (seriesRef.timeline || []).map((p: any) => [p.label, p.score])));

  console.log('4. Only a 400 falls to row by row: 401/403 and 429/5xx fail with their motive');
  for (const estado of [401, 403, 429, 503]) {
    const reads: string[] = [];
    const withState = {
      ...withForeign,
      search: async (p: any) => {
        if ((p.body?.sort || [])[0]?.['data.ensfacil']) {
          throw Object.assign(new Error(`estado ${estado}`), { statusCode: estado, meta: { statusCode: estado } });
        }
        if (p.body?.size > 0) reads.push(JSON.stringify(p.body.query).slice(0, 80));
        return withForeign.search(p);
      },
    };
    const s4 = createEvaluationService({ engineControls: [], logger, securityEnabled: true, clock: () => clock });
    let f4: any;
    try {
      await request(s4, { asCurrentUser: withState, asInternalUser: withState }, { include: 'results' });
    } catch (e) {
      f4 = e;
    }
    check(`${estado}: fails with its status and its motive (no row-by-row retry)`, Number(f4?.meta?.statusCode ?? f4?.statusCode) === estado && new RegExp(`estado ${estado}`).test(f4?.message || ''), f4?.message);
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
