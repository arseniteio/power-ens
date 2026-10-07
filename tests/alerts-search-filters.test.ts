/**
 * Los filtros que la barra de búsqueda del dashboard pasa a las consultas de
 * las pantallas ENS: la consulta y los filtros de la barra en DSL, y las
 * fechas. Y la guarda contra el bucle: con un rango relativo («últimas 24
 * horas») el filtro de fechas sale con un instante nuevo en cada llamada; si se
 * construyera en cada render, cada búsqueda provocaría la siguiente.
 *
 *   npx --yes tsx tests/alerts-search-filters.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildAlertsSearchFilters } from '../public/search/alerts-search-filters';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

type Q = { query: string; language: string };
const patron = { title: 'wazuh-alerts-*', timeFieldName: 'timestamp' };
const filtroBarra = { meta: { key: 'agent.id' }, query: { match_phrase: { 'agent.id': '001' } } };
const rango = { from: 'now-24h', to: 'now' };
const fechas = { meta: { index: 'x' }, range: { timestamp: { gte: 'a', lte: 'b' } } };

const llamadas: unknown[][] = [];
const constructores = {
  buildQuery: (p: unknown, consultas: Q[], filtros: unknown[]) => {
    llamadas.push([p, consultas, filtros]);
    if (consultas.some(c => c.language === 'PPL')) return { type: 'unsupported', queries: consultas, filters: filtros };
    if (consultas.some(c => c.query === 'agent.name:')) throw new Error('Expected value but end of input found');
    return { bool: { must: [], filter: consultas.map(c => c.query).concat(filtros.map(() => 'filtro')), should: [], must_not: [] } };
  },
  buildTimeFilter: (_p: unknown, r: typeof rango) => (r ? fechas : undefined),
};

const dql: Q = { query: 'agent.name: wazuh-real', language: 'kuery' };

const sinPatron = buildAlertsSearchFilters({ indexPattern: undefined, query: dql, filters: [filtroBarra], timeRange: rango }, constructores);
comprueba('sin patrón de índice: ningún filtro', sinPatron.filters.length === 0 && !sinPatron.queryError);

llamadas.length = 0;
const normal = buildAlertsSearchFilters({ indexPattern: patron, query: dql, filters: [filtroBarra], timeRange: rango }, constructores);
comprueba('con patrón: la consulta en DSL y luego las fechas', normal.filters.length === 2 && (normal.filters[0] as any).bool && normal.filters[1] === fechas, normal.filters);
comprueba('la consulta se construye con la de la barra y sus filtros', JSON.stringify(llamadas[0]) === JSON.stringify([patron, [dql], [filtroBarra]]), llamadas);
comprueba('sin error de consulta', normal.queryError === undefined);

const sinFechas = buildAlertsSearchFilters(
  { indexPattern: patron, query: dql, filters: [], timeRange: undefined as unknown as typeof rango },
  constructores
);
comprueba('un patrón sin campo de tiempo: solo la consulta', sinFechas.filters.length === 1 && (sinFechas.filters[0] as any).bool);

const ppl = buildAlertsSearchFilters({ indexPattern: patron, query: { query: 'source = x', language: 'PPL' }, filters: [filtroBarra], timeRange: rango }, constructores);
comprueba('lenguaje no admitido: se avisa', /DQL o Lucene/.test(ppl.queryError || ''), ppl.queryError);
comprueba('lenguaje no admitido: nada sin `bool` llega a la consulta', ppl.filters.every(f => (f as any).bool || f === fechas), ppl.filters);
comprueba('lenguaje no admitido: se quedan los filtros de la barra y las fechas', ppl.filters.length === 2 && JSON.stringify((ppl.filters[0] as any).bool.filter) === '["filtro"]', ppl.filters);

const rota = buildAlertsSearchFilters({ indexPattern: patron, query: { query: 'agent.name:', language: 'kuery' }, filters: [filtroBarra], timeRange: rango }, constructores);
comprueba('consulta inválida: no revienta y dice por qué', rota.queryError === 'Expected value but end of input found', rota.queryError);
comprueba('consulta inválida: se quedan los filtros de la barra y las fechas', rota.filters.length === 2 && JSON.stringify((rota.filters[0] as any).bool.filter) === '["filtro"]', rota.filters);

// La guarda del bucle, sobre el código: toda llamada a `createFilter(` del
// plugin va dentro de un `useMemo(`, y ese useMemo depende del rango guardado
// en el estado, no de uno recalculado.
const raiz = path.join(__dirname, '..', 'public');
const recorre = (dir: string, fuera: string[] = []): string[] => {
  for (const n of fs.readdirSync(dir)) {
    const r = path.join(dir, n);
    if (fs.statSync(r).isDirectory()) recorre(r, fuera);
    else if (/\.(ts|tsx)$/.test(n)) fuera.push(r);
  }
  return fuera;
};
const tramosUseMemo = (texto: string): [number, number][] => {
  const tramos: [number, number][] = [];
  let desde = 0;
  for (;;) {
    const i = texto.indexOf('useMemo(', desde);
    if (i < 0) break;
    let nivel = 0;
    let j = i + 'useMemo'.length;
    for (; j < texto.length; j++) {
      if (texto[j] === '(') nivel++;
      else if (texto[j] === ')' && --nivel === 0) break;
    }
    tramos.push([i, j]);
    desde = i + 1;
  }
  return tramos;
};
let creaFiltros = 0;
for (const fichero of recorre(raiz)) {
  const texto = fs.readFileSync(fichero, 'utf8');
  const tramos = tramosUseMemo(texto);
  const sitio = path.relative(path.join(__dirname, '..'), fichero);
  for (let i = texto.indexOf('createFilter('); i >= 0; i = texto.indexOf('createFilter(', i + 1)) {
    creaFiltros++;
    const tramo = tramos.find(([a, b]) => a < i && i < b);
    comprueba(`${sitio}: createFilter dentro de un useMemo`, !!tramo);
    if (tramo) {
      const deps = texto.slice(tramo[0], tramo[1] + 1).match(/\[([^\]]*)\]\s*,?\s*\)$/);
      comprueba(`${sitio}: el useMemo depende del rango del estado`, !!deps && /\brango\b/.test(deps[1]), deps && deps[1]);
    }
  }
}
comprueba('la barra construye el filtro de fechas', creaFiltros > 0);

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
