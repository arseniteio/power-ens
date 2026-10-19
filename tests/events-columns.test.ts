/** Fixed columns and filters of the Events tab, and pagination against the index. */
import {
  buildEventsFilters,
  ENS_EVENT_COLUMNS,
  ENS_EVENTS_MAX_WINDOW,
  getField,
  navigableEventRows,
  pageIndexFor,
} from '../public/events/events-columns';
import { readFileSync } from 'fs';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

check(
  'today\'s columns, in their order',
  ENS_EVENT_COLUMNS.map(c => c.id).join() ===
    'timestamp,agent.name,data.ensfacil,data.event,data.control,data.requisito,data.evidence_id,data.evidencias,data.estado,data.nivel,rule.description,rule.level,rule.id',
  ENS_EVENT_COLUMNS.map(c => c.id)
);
check('each column with its label', ENS_EVENT_COLUMNS.every(c => !!c.label));
const f: any[] = buildEventsFilters([{ id: '024', groups: ['ens'] }, { id: '028', groups: ['ens'] }], undefined);
check('only ENS facts', JSON.stringify(f[0]) === '{"match_phrase":{"rule.groups":"ensfacil"}}');
check('only scope machines', JSON.stringify(f[1]) === '{"terms":{"agent.id":["024","028"]}}');
const g: any[] = buildEventsFilters([{ id: '024', groups: ['ens'] }], '024');
check('a chosen machine', JSON.stringify(g[1]) === '{"match_phrase":{"agent.id":"024"}}');
const conManager = [{ id: '024', groups: ['ens'] }, { id: '000', groups: [] }];
check('chosen machine with the manager in scope: only that machine', JSON.stringify(buildEventsFilters(conManager, '024')[1]) === '{"match_phrase":{"agent.id":"024"}}', buildEventsFilters(conManager, '024'));
check('the manager chosen: only the manager', JSON.stringify(buildEventsFilters(conManager, '000')[1]) === '{"match_phrase":{"agent.id":"000"}}');
check('machine outside the scope: nothing', JSON.stringify(buildEventsFilters(conManager, '031')[1]) === '{"match_none":{}}');
check('no machine: the whole scope, manager included', JSON.stringify(buildEventsFilters(conManager, undefined)[1]) === '{"terms":{"agent.id":["024","000"]}}');
{
  const vista = readFileSync(`${__dirname}/../public/requirements/requirements-view.tsx`, 'utf8');
  check('«Controles» uses the raw-fact filters', /buildRawFactsFilters\(getActiveENSScopeAgents\(\), agentId\)/.test(vista) && !/buildENSScopeAgentQueryFilter/.test(vista));
}
check(
  'the same agents give the same JSON (useEsSearch does not search again)',
  JSON.stringify(buildEventsFilters([{ id: '024', groups: ['ens'] }], '024')) === JSON.stringify(g)
);
check('nested field', getField({ data: { requisito: 'op.acc.1.1' } }, 'data.requisito') === 'op.acc.1.1');
check('missing field: empty', getField({}, 'data.nivel') === '');
check('no document: empty', getField(undefined, 'data.nivel') === '');
check('list: comma-separated', getField({ rule: { groups: ['a', 'b'] } }, 'rule.groups') === 'a, b');
check('number: as text', getField({ rule: { level: 3 } }, 'rule.level') === '3');

check('the index window', ENS_EVENTS_MAX_WINDOW === 10000);
check('few facts: all navigable', navigableEventRows(120) === 120);
check('more than the window: only the window', navigableEventRows(53210) === 10000);
check('sin total: cero', navigableEventRows(NaN) === 0 && navigableEventRows(-1) === 0);
for (const size of [25, 50, 100]) {
  const ultima = Math.ceil(navigableEventRows(53210) / size) - 1;
  check(`the last page of ${size} fits in the window`, ultima * size + size <= ENS_EVENTS_MAX_WINDOW);
}

check('same filters: the chosen page', pageIndexFor({ key: 'A', index: 4 }, 'A') === 4);
check('other filters: the first', pageIndexFor({ key: 'A', index: 4 }, 'B') === 0);

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
