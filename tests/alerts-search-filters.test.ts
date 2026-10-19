/** Filters the dashboard search bar passes to the ENS screens' queries, merged into a single DSL. */
import * as fs from 'fs';
import * as path from 'path';
import { buildAlertsSearchFilters } from '../public/search/alerts-search-filters';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const patron = { title: 'wazuh-alerts-*', timeFieldName: 'timestamp' };
const barFilter = { meta: { key: 'agent.id' }, query: { match_phrase: { 'agent.id': '001' } } };
const range = { from: 'now-24h', to: 'now' };
const dates = { meta: { index: 'x' }, range: { timestamp: { gte: 'a', lte: 'b' } } };
const all = { bool: { must: [], filter: ['consulta', 'filtro', 'fechas'], should: [], must_not: [] } };

let barra: 'ok' | 'ppl' | 'rota' = 'ok';
const calls: unknown[] = [];
const constructores = {
  buildQuery: (p: unknown) => {
    calls.push(p);
    if (barra === 'ppl') return { type: 'unsupported', queries: [], filters: [] };
    if (barra === 'rota') throw new Error('Expected value but end of input found');
    return all;
  },
  buildTimeFilter: (_p: unknown, r: typeof range) => (r ? dates : undefined),
};
const estado = { indexPattern: patron as typeof patron | undefined, filters: [barFilter], timeRange: range };

const sinPatron = buildAlertsSearchFilters({ ...estado, indexPattern: undefined }, constructores);
check('no index pattern: no filter', sinPatron.filters.length === 0 && !sinPatron.queryError);

const normal = buildAlertsSearchFilters(estado, constructores);
check('with pattern: a single DSL with the query, the filters and the dates', normal.filters.length === 1 && normal.filters[0] === all, normal.filters);
check('it is built on the pattern', calls[calls.length - 1] === patron);
check('no query error', normal.queryError === undefined);

barra = 'ppl';
const ppl = buildAlertsSearchFilters(estado, constructores);
check('unsupported language: a warning is raised', /DQL o Lucene/.test(ppl.queryError || ''), ppl.queryError);
check('unsupported language: nothing without `bool` reaches the query', !ppl.filters.some(f => (f as any).type === 'unsupported'), ppl.filters);
check('unsupported language: the bar filters and the dates remain', ppl.filters.length === 2 && ppl.filters[0] === barFilter && ppl.filters[1] === dates, ppl.filters);

barra = 'rota';
const rota = buildAlertsSearchFilters(estado, constructores);
check('invalid query: does not blow up and says why', rota.queryError === 'Expected value but end of input found', rota.queryError);
check('invalid query: the bar filters and the dates remain', rota.filters.length === 2 && rota.filters[0] === barFilter && rota.filters[1] === dates, rota.filters);
const brokenWithoutDates = buildAlertsSearchFilters({ ...estado, timeRange: undefined as unknown as typeof range }, constructores);
check('invalid query and pattern without a time field: only the filters', brokenWithoutDates.filters.length === 1 && brokenWithoutDates.filters[0] === barFilter, brokenWithoutDates.filters);

const root = path.join(__dirname, '..', 'public');
const walk = (dir: string, outside: string[] = []): string[] => {
  for (const n of fs.readdirSync(dir)) {
    const r = path.join(dir, n);
    if (fs.statSync(r).isDirectory()) walk(r, outside);
    else if (/\.(ts|tsx)$/.test(n)) outside.push(r);
  }
  return outside;
};
const useMemoSpans = (text: string): [number, number][] => {
  const spans: [number, number][] = [];
  let since = 0;
  for (;;) {
    const i = text.indexOf('useMemo(', since);
    if (i < 0) break;
    let level = 0;
    let j = i + 'useMemo'.length;
    for (; j < text.length; j++) {
      if (text[j] === '(') level++;
      else if (text[j] === ')' && --level === 0) break;
    }
    spans.push([i, j]);
    since = i + 1;
  }
  return spans;
};
let buildFilters = 0;
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  const spans = useMemoSpans(text);
  const sitio = path.relative(path.join(__dirname, '..'), file);
  for (const m of text.matchAll(/\b(createFilter|getOpenSearchQuery)\(/g)) {
    const i = m.index as number;
    buildFilters++;
    const span = spans.find(([a, b]) => a < i && i < b);
    check(`${sitio}: ${m[1]} inside a useMemo`, !!span);
    if (span) {
      const deps = text.slice(span[0], span[1] + 1).match(/\[([^\]]*)\]\s*,?\s*\)$/);
      check(`${sitio}: the useMemo depends on the state range`, !!deps && /\brange\b/.test(deps[1]), deps && deps[1]);
    }
  }
}
check('the bar builds the date filter', buildFilters > 0);

let vistasConBarra = 0;
for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  if (/export const useAlertsSearchBar\b/.test(text) || !/\buseAlertsSearchBar\(/.test(text)) continue;
  vistasConBarra++;
  const sitio = path.relative(path.join(__dirname, '..'), file);
  check(`${sitio}: renders the bar with its warnings (AlertsSearchFrame)`, /<AlertsSearchFrame\b/.test(text));
}
check('hay vistas con la barra', vistasConBarra > 0);

const barSource = fs.readFileSync(path.join(root, 'search', 'alerts-search-bar.tsx'), 'utf8');
check('the bar returns its pass counter as refreshKey', /\brefreshKey:\s*run\b/.test(barSource));
let searchesWithBar = 0;
for (const file of ['events', 'requirements'].flatMap(d => walk(path.join(root, d)))) {
  const text = fs.readFileSync(file, 'utf8');
  const sitio = path.relative(path.join(__dirname, '..'), file);
  for (const m of text.matchAll(/useEsSearch\(\{/g)) {
    let level = 0;
    let j = (m.index as number) + 'useEsSearch('.length;
    for (; j < text.length; j++) {
      if (text[j] === '{') level++;
      else if (text[j] === '}' && --level === 0) break;
    }
    searchesWithBar++;
    check(`${sitio}: the search carries the bar's refreshKey`, /\brefreshKey\b/.test(text.slice(m.index as number, j + 1)));
  }
}
check('some searches hang from the bar', searchesWithBar >= 3, searchesWithBar);

console.log(failures.length ? `\n${failures.length} FALLOS` : '\nTODO OK');
process.exit(failures.length ? 1 : 0);
