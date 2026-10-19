/** Search request. */
import { buildENSSearchRequest } from '../public/search/search-request';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const window = { range: { '@timestamp': { gte: '2026-09-07T00:00:00Z', lte: '2026-10-07T00:00:00Z' } } };
const scope = { terms: { 'agent.id': ['024', '028'] } };
const control = { bool: { should: [{ match_phrase: { 'data.ensfacil': 'op.acc.1' } }, { match_phrase: { 'data.control': 'op.acc.1' } }], minimum_should_match: 1 } };
const r = buildENSSearchRequest({ preAppliedFilters: [window, scope, control], size: 10000, sorting: [{ timestamp: { order: 'desc' } }] });

check('contra wazuh-alerts-*', r.index === 'wazuh-alerts-*');
check('the three filters, in order, in filter', JSON.stringify((r.body as any).query.bool.filter) === JSON.stringify([window, scope, control]));
check('10,000 most recent', (r.body as any).size === 10000 && JSON.stringify((r.body as any).sort) === '[{"timestamp":{"order":"desc"}}]');
check('no aggregations if not requested', !('aggs' in (r.body as any)));
check('exact total', (r.body as any).track_total_hits === true);

const barra = [
  { meta: { disabled: false, negate: false }, query: { match_phrase: { 'rule.groups': 'ensfacil' } } },
  { meta: { disabled: true, negate: false }, query: { match_phrase: { 'agent.id': '999' } } },
  { meta: { disabled: false, negate: true }, query: { match_phrase: { 'agent.name': 'x' } } },
];
const rb = buildENSSearchRequest({ preAppliedFilters: barra, size: 0, preAppliedAggs: { a: { terms: { field: 'x' } } } });
check('bar filter: counts its query', JSON.stringify((rb.body as any).query.bool.filter) === JSON.stringify([{ match_phrase: { 'rule.groups': 'ensfacil' } }]));
check('disabled: out', !JSON.stringify(rb.body).includes('999'));
check('negated: to must_not', JSON.stringify((rb.body as any).query.bool.must_not) === JSON.stringify([{ match_phrase: { 'agent.name': 'x' } }]));
check('aggregations if requested', JSON.stringify((rb.body as any).aggs) === '{"a":{"terms":{"field":"x"}}}');
check('nulls out', JSON.stringify((buildENSSearchRequest({ preAppliedFilters: [null, undefined, window] }).body as any).query.bool.filter) === JSON.stringify([window]));

const range = { meta: { index: 'x', params: {} }, range: { timestamp: { gte: 'a', lte: 'b' } } };
const exists = { meta: { index: 'x' }, $state: { store: 'appState' }, exists: { field: 'data.ensfacil' } };
const rr = buildENSSearchRequest({ preAppliedFilters: [range, exists] });
check('range with meta: only { range }', JSON.stringify((rr.body as any).query.bool.filter[0]) === JSON.stringify({ range: { timestamp: { gte: 'a', lte: 'b' } } }), (rr.body as any).query.bool.filter[0]);
check('exists con meta y $state: solo { exists }', JSON.stringify((rr.body as any).query.bool.filter[1]) === JSON.stringify({ exists: { field: 'data.ensfacil' } }), (rr.body as any).query.bool.filter[1]);
check('neither meta nor $state in the body', !/"meta"|"\$state"/.test(JSON.stringify(rr.body)));
const negated = { meta: { negate: true }, $state: { store: 'appState' }, query: { match_phrase: { 'agent.id': '000' } } };
const rn = buildENSSearchRequest({ preAppliedFilters: [negated] });
check('negated with query: to must_not, without meta', JSON.stringify((rn.body as any).query.bool.must_not) === JSON.stringify([{ match_phrase: { 'agent.id': '000' } }]) && (rn.body as any).query.bool.filter.length === 0);
const negatedRange = { meta: { negate: true }, range: { timestamp: { lt: 'a' } } };
check('negated without query: what remains, to must_not', JSON.stringify((buildENSSearchRequest({ preAppliedFilters: [negatedRange] }).body as any).query.bool.must_not) === JSON.stringify([{ range: { timestamp: { lt: 'a' } } }]));

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
