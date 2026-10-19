/** Server queries and pruning of state facts. */
import { createFakeIndexer, FakeDoc, matchesQuery } from './fixtures/fake-indexer';
import {
  buildCollectorRunsQuery,
  buildFactsQuery,
  buildProbeRequest,
  buildStateFactKeepClause,
  buildStateFactLastSeenRequest,
  buildViewFilters,
  FACTS_SORT,
  PRUNING_MAX_LEAVES,
  ENGINE_SOURCE_FIELDS,
  prunableRanges,
  readProbeResponse,
  readStateFactLastSeen,
  resolveEvaluationWindow,
} from '../server/lib/evaluation/queries';
import { computeStateFactCutoffsByCollector, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) failures.push(n); };

const NOW = new Date('2026-10-17T12:00:00Z');

const w = resolveEvaluationWindow('Últimos 30 días', NOW);
check('30-day window in absolute instants', w.to === NOW.toISOString() && Date.parse(w.to) - Date.parse(w.from) === 30 * 86400e3, w);
check('7 days', Date.parse(w.to) - Date.parse(resolveEvaluationWindow('Últimos 7 días', NOW).from) === 7 * 86400e3);
check('an unknown period: 30 days, like the browser', Date.parse(w.to) - Date.parse(resolveEvaluationWindow('???', NOW).from) === 30 * 86400e3);
const scope: ENSAgentScope[] = [{ id: '000', name: 'm', groups: [] }, { id: '024', name: 'r', groups: ['ens'] }];
const filters = buildViewFilters(w, scope);
check('filters: window, scope and ENS facts', JSON.stringify(filters[0]).includes('"@timestamp"') && JSON.stringify(filters[1]) === JSON.stringify({ terms: { 'agent.id': ['000', '024'] } }) && JSON.stringify(filters[2]).includes('data.ensfacil'));
check('one machine\'s view: it and the manager', JSON.stringify(buildViewFilters(w, scope, '024')[1]) === JSON.stringify({ terms: { 'agent.id': ['024', '000'] } }));

const probe = buildProbeRequest(filters, ['op.acc.1', 'op.exp.3']);
check('the probe brings no documents', probe.body.size === 0 && probe.body.track_total_hits === true);
check('the probe counts by control, without control and by machine', Object.keys((probe.body.aggs as any).controls.filters.filters).join() === 'op.acc.1,op.exp.3' && !!(probe.body.aggs as any).orphans && !!(probe.body.aggs as any).agents);
const read = readProbeResponse({
  hits: { total: { value: 12 } },
  aggregations: {
    newest: { value: Date.parse('2026-10-17T11:00:00Z') }, oldest: { value: Date.parse('2026-09-20T00:00:00Z') },
    controls: { buckets: { 'op.acc.1': { doc_count: 10, newest: { value: Date.parse('2026-10-17T11:00:00Z') }, oldest: { value: null } } } },
    orphans: { doc_count: 0, newest: { value: null } },
    agents: { buckets: [{ key: '024', doc_count: 12, first: { value: Date.parse('2026-09-20T00:00:00Z') }, latest: { value: Date.parse('2026-10-17T11:00:00Z') }, last: { hits: { hits: [{ _source: { agent: { name: 'wazuh-real' } } }] } } }] },
  },
});
check('the probe is read: total, by control, presence', read.count === 12 && read.controls['op.acc.1'].count === 10 && read.presence[0].agentName === 'wazuh-real' && read.presence[0].earliest === '2026-09-20T00:00:00.000Z', read);
check('the engine reads only those fields (no `raw` or `full_log`)', ENGINE_SOURCE_FIELDS.includes('data') && !ENGINE_SOURCE_FIELDS.includes('full_log'));

const hora = (h: number) => new Date(NOW.getTime() - h * 3600e3).toISOString();
let n = 0;
const doc = (agent: string, data: Record<string, unknown>, hours: number): FakeDoc => ({
  _id: `d${String(++n).padStart(5, '0')}`, _index: 'wazuh-alerts-4.x-x',
  _source: { '@timestamp': hora(hours), id: `i${n}`, agent: { id: agent, name: agent }, data },
});
const docs: FakeDoc[] = [];
for (let h = 160; h >= 1; h -= 1) {
  for (const agent of ['024', '029', '033']) {
    docs.push(doc(agent, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: h % 24 === 0 ? 'EV-01' : 'EV-01,EV-04' }, h));
    if (h % 3 === 0) docs.push(doc(agent, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: `s${h % 5}` }, h - 0.01));
    if (h % 7 === 0) docs.push(doc(agent, { ensfacil: 'op.exp.3', event: 'service_running', servicio: 'cron' }, h - 0.02));
  }
  if (h % 10 === 0) docs.push(doc('024', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-99' }, h - 0.03));
  if (h % 15 === 0) docs.push(doc('029', { ensfacil: 'op.exp.3', event: 'service_running', evidencias: 'EV-04' }, h - 0.04));
  if (h % 15 === 0) docs.push(doc('033', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: ['EV-04', 'EV-77'] }, h - 0.04));
  docs.push(doc('028', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01' }, h));
  if (h % 2 === 0) docs.push(doc('028', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04' }, h - 0.01));
  for (const origin of ['pbs', 'zimbra']) {
    if (origin === 'zimbra' && h % 2) continue;
    docs.push(doc('024', { ensfacil: 'mp.info.6', origen: origin, event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03' }, h - (origin === 'pbs' ? 0 : 0.5)));
    docs.push(doc('024', { ensfacil: 'mp.info.6', origen: origin, event: 'backup_run', evidence_id: 'EV-01', resultado: 'ok' }, h - (origin === 'pbs' ? 0.01 : 0.51)));
    if (origin === 'pbs' || h > 80) docs.push(doc('024', { ensfacil: 'mp.info.6', origen: origin, event: 'backup_retention', evidence_id: 'EV-03', dias: 30 }, h - (origin === 'pbs' ? 0.02 : 0.52)));
  }
  if (h % 4 === 0) docs.push(doc('024', { ensfacil: 'mp.info.6', event: 'backup_run', evidence_id: 'EV-01' }, h - 0.2));
}
const index = createFakeIndexer(docs, { clock: () => NOW.getTime() });
const window = resolveEvaluationWindow('Últimos 30 días', NOW);
const start = Date.parse(window.from);
const hoy = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate());
const instantes = [...Array.from({ length: 6 }, (_, i) => new Date(hoy - i * 86400e3 - 1)).reverse(), NOW];
const allOf = (controlId: string, agent: string) => docs
  .filter(d => d._source.data.ensfacil === controlId && d._source.agent.id === agent)
  .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || a._id.localeCompare(b._id));

const pruningOf = async (controlId: string, agent: string) => {
  const runs = (await index.search({ index: 'wazuh-alerts-*', body: { size: 10000, query: buildCollectorRunsQuery([], controlId, agent) } })).body.hits.hits;
  const latest = readStateFactLastSeen(controlId, (await index.search(buildStateFactLastSeenRequest([], controlId, agent, 'UTC'))).body);
  const cortes = computeStateFactCutoffsByCollector(controlId, normalizeWazuhAlerts(runs), instantes, latest.lastFactOf, latest.collectors);
  const gaps = new Map([...cortes.entries()].map(([c, byInstant]) => [c, prunableRanges(start, instantes.map(i => i.getTime()), byInstant)]));
  return { clausula: buildStateFactKeepClause(controlId, agent, gaps), cortes };
};
const ids = (events: any[]) => events.map(e => e.id).sort().join();

(async () => {
  for (const [controlId, agent, shouldPrune] of [
    ['op.exp.3', '024', true],
    ['op.exp.3', '028', true],
    ['op.exp.3', '029', false],
    ['op.exp.3', '033', false],
    ['mp.info.6', '024', true],
  ] as [string, string, boolean][]) {
    const all = allOf(controlId, agent);
    const { clausula, cortes } = await pruningOf(controlId, agent);
    const query = buildFactsQuery([], controlId, agent, clausula);
    const readOnes = all.filter(d => matchesQuery(d, query, NOW.getTime()));
    const equal = instantes.filter(t => {
      const until = (list: FakeDoc[]) => normalizeWazuhAlerts(list.filter(d => Date.parse(d._source['@timestamp']) <= t.getTime()));
      return ids(keepLatestRunStateFacts(controlId, until(all), t)) === ids(keepLatestRunStateFacts(controlId, until(readOnes), t));
    }).length;
    const what = `${controlId} en ${agent}`;
    check(`${what}: ${shouldPrune ? 'fewer facts are read' : 'when in doubt, everything is read'}`, shouldPrune ? readOnes.length < all.length : readOnes.length === all.length && clausula === undefined, [readOnes.length, all.length, [...cortes.keys()]]);
    check(`${what}: as of each of the ${instantes.length} instants (now and 6 days), the engine keeps exactly the same`, equal === instantes.length, equal);
    const outside = all.filter(d => !matchesQuery(d, query, NOW.getTime()));
    check(`${what}: a heartbeat or a fact that declares another evidence is never pruned`, outside.every(d => d._source.data.event !== 'collector_run' && d._source.data.evidence_id !== 'EV-99'));
  }
  const ofMpInfo6 = (await pruningOf('mp.info.6', '024')).cortes;
  check('mp.info.6: each collector (pbs, zimbra and the one without `origen`) has its own cut', ['pbs', 'zimbra', ''].every(c => ofMpInfo6.has(c)), [...ofMpInfo6.keys()]);

  const day = { buckets: [{ last: { value: NOW.getTime() - 3600e3 } }] };
  const types = { sum_other_doc_count: 3, buckets: [{ key: 'service_running', ids: { buckets: [{ key: 'EV-04', days: day }] } }] };
  const trimmed = readStateFactLastSeen('op.exp.3', {
    aggregations: { alt: { doc_count: 0 }, collectors: { buckets: { __none__: { types: types } } } },
  });
  const whole = readStateFactLastSeen('op.exp.3', {
    aggregations: { alt: { doc_count: 0 }, collectors: { buckets: { __none__: { types: { ...types, sum_other_doc_count: 0 } } } } },
  });
  check('(the same whole aggregation does give the last fact)', whole.lastFactOf('', 'EV-04', NOW.getTime()) === NOW.getTime() - 3600e3);
  check('buckets that did not fit in the aggregation: no last fact (not pruned)', trimmed.lastFactOf('', 'EV-04', NOW.getTime()) === undefined);
  check('a control without state facts prunes nothing', buildStateFactKeepClause('op.acc.3', '024', new Map([['', [{ from: 0, to: 1 }]]])) === undefined);
  check('without gaps there is no clause', buildStateFactKeepClause('op.exp.3', '024', new Map([['', []]])) === undefined);

  check('the read order does not use `_id` (its fielddata) and breaks ties with keywords', !JSON.stringify(FACTS_SORT).includes('"_id"') && JSON.stringify(FACTS_SORT).includes('"id"') && JSON.stringify(FACTS_SORT).includes('manager.name'));
  {
    const gaps = new Map<string, { from: number; to: number }[]>();
    for (let r = 0; r < 40; r++) gaps.set(`r${r}`, Array.from({ length: 30 }, (_, i) => ({ from: i * 10, to: i * 10 + 5 })));
    const leaves = (q: any): number => Array.isArray(q) ? q.reduce((n, x) => n + leaves(x), 0) : q && typeof q === 'object'
      ? (q.bool ? ['filter', 'must', 'should', 'must_not'].reduce((n, k) => n + (q.bool[k] ? leaves([].concat(q.bool[k])) : 0), 0) : 1) : 0;
    const clausula = buildStateFactKeepClause('mp.info.6', '024', gaps);
    const query = buildFactsQuery(buildViewFilters(w, scope), 'mp.info.6', '024', clausula);
    check(`pruning is bounded to ${PRUNING_MAX_LEAVES} leaves (collectors that do not fit are read)`, leaves(clausula) <= PRUNING_MAX_LEAVES + 20, leaves(clausula));
    check('and the whole query stays under 1024 clauses', leaves(query) < 1024, leaves(query));
  }

  failures.length ? console.log(`\n${failures.length} FAILURES`) : console.log('\nAll checks pass.');
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
