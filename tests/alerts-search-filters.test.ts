/**
 * Los filtros que la barra de búsqueda del dashboard pasa a las consultas de
 * las pantallas ENS: la consulta, los filtros de la barra y las fechas en un
 * solo DSL, el de `data.query.getOpenSearchQuery`. Y la guarda contra el
 * bucle: con un rango relativo («últimas 24 horas») el filtro de fechas sale
 * con un instante nuevo en cada llamada; si se construyera en cada render,
 * cada búsqueda provocaría la siguiente.
 *
 *   npx --yes tsx tests/alerts-search-filters.test.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { buildAlertsSearchFilters } from '../public/search/alerts-search-filters';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const patron = { title: 'wazuh-alerts-*', timeFieldName: 'timestamp' };
const filtroBarra = { meta: { key: 'agent.id' }, query: { match_phrase: { 'agent.id': '001' } } };
const rango = { from: 'now-24h', to: 'now' };
const fechas = { meta: { index: 'x' }, range: { timestamp: { gte: 'a', lte: 'b' } } };
const todo = { bool: { must: [], filter: ['consulta', 'filtro', 'fechas'], should: [], must_not: [] } };

// Lo que hace `getOpenSearchQuery` con lo que haya en la barra.
let barra: 'ok' | 'ppl' | 'rota' = 'ok';
const llamadas: unknown[] = [];
const constructores = {
  buildQuery: (p: unknown) => {
    llamadas.push(p);
    if (barra === 'ppl') return { type: 'unsupported', queries: [], filters: [] };
    if (barra === 'rota') throw new Error('Expected value but end of input found');
    return todo;
  },
  buildTimeFilter: (_p: unknown, r: typeof rango) => (r ? fechas : undefined),
};
const estado = { indexPattern: patron as typeof patron | undefined, filters: [filtroBarra], timeRange: rango };

const sinPatron = buildAlertsSearchFilters({ ...estado, indexPattern: undefined }, constructores);
comprueba('sin patrón de índice: ningún filtro', sinPatron.filters.length === 0 && !sinPatron.queryError);

const normal = buildAlertsSearchFilters(estado, constructores);
comprueba('con patrón: un solo DSL con la consulta, los filtros y las fechas', normal.filters.length === 1 && normal.filters[0] === todo, normal.filters);
comprueba('se construye sobre el patrón', llamadas[llamadas.length - 1] === patron);
comprueba('sin error de consulta', normal.queryError === undefined);

barra = 'ppl';
const ppl = buildAlertsSearchFilters(estado, constructores);
comprueba('lenguaje no admitido: se avisa', /DQL o Lucene/.test(ppl.queryError || ''), ppl.queryError);
comprueba('lenguaje no admitido: nada sin `bool` llega a la consulta', !ppl.filters.some(f => (f as any).type === 'unsupported'), ppl.filters);
comprueba('lenguaje no admitido: se quedan los filtros de la barra y las fechas', ppl.filters.length === 2 && ppl.filters[0] === filtroBarra && ppl.filters[1] === fechas, ppl.filters);

barra = 'rota';
const rota = buildAlertsSearchFilters(estado, constructores);
comprueba('consulta inválida: no revienta y dice por qué', rota.queryError === 'Expected value but end of input found', rota.queryError);
comprueba('consulta inválida: se quedan los filtros de la barra y las fechas', rota.filters.length === 2 && rota.filters[0] === filtroBarra && rota.filters[1] === fechas, rota.filters);
const rotaSinFechas = buildAlertsSearchFilters({ ...estado, timeRange: undefined as unknown as typeof rango }, constructores);
comprueba('consulta inválida y patrón sin campo de tiempo: solo los filtros', rotaSinFechas.filters.length === 1 && rotaSinFechas.filters[0] === filtroBarra, rotaSinFechas.filters);

// La guarda del bucle, sobre el código: toda llamada del plugin que fabrica
// el filtro de fechas (`createFilter(`, `getOpenSearchQuery(`) va dentro de un
// `useMemo(`, y ese useMemo depende del rango guardado en el estado, no de uno
// recalculado.
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
  for (const m of texto.matchAll(/\b(createFilter|getOpenSearchQuery)\(/g)) {
    const i = m.index as number;
    creaFiltros++;
    const tramo = tramos.find(([a, b]) => a < i && i < b);
    comprueba(`${sitio}: ${m[1]} dentro de un useMemo`, !!tramo);
    if (tramo) {
      const deps = texto.slice(tramo[0], tramo[1] + 1).match(/\[([^\]]*)\]\s*,?\s*\)$/);
      comprueba(`${sitio}: el useMemo depende del rango del estado`, !!deps && /\brange\b/.test(deps[1]), deps && deps[1]);
    }
  }
}
comprueba('la barra construye el filtro de fechas', creaFiltros > 0);

// Los avisos de la barra, en todas las vistas que la usan: el patrón que no se
// pudo leer (con su causa), el que no existe y la consulta que no se ha
// aplicado. Los pinta `AlertsSearchFrame`; una vista que llame a
// `useAlertsSearchBar()` sin él buscaría sin avisar de nada de eso.
let vistasConBarra = 0;
for (const fichero of recorre(raiz)) {
  const texto = fs.readFileSync(fichero, 'utf8');
  if (/export const useAlertsSearchBar\b/.test(texto) || !/\buseAlertsSearchBar\(/.test(texto)) continue;
  vistasConBarra++;
  const sitio = path.relative(path.join(__dirname, '..'), fichero);
  comprueba(`${sitio}: pinta la barra con sus avisos (AlertsSearchFrame)`, /<AlertsSearchFrame\b/.test(texto));
}
comprueba('hay vistas con la barra', vistasConBarra > 0);

// «Actualizar» vuelve a buscar también con un rango ABSOLUTO: ahí los
// filtros recalculados salen con el mismo JSON y `useEsSearch` no vería
// cambio. La barra cuenta las pasadas (`refreshKey`) y toda búsqueda de las
// pantallas que cuelgan de ella (Controles con su panel, Eventos) lo lleva.
const barraFuente = fs.readFileSync(path.join(raiz, 'search', 'alerts-search-bar.tsx'), 'utf8');
comprueba('la barra devuelve su contador de pasadas como refreshKey', /\brefreshKey:\s*run\b/.test(barraFuente));
let busquedasConBarra = 0;
for (const fichero of ['events', 'requirements'].flatMap(d => recorre(path.join(raiz, d)))) {
  const texto = fs.readFileSync(fichero, 'utf8');
  const sitio = path.relative(path.join(__dirname, '..'), fichero);
  for (const m of texto.matchAll(/useEsSearch\(\{/g)) {
    let nivel = 0;
    let j = (m.index as number) + 'useEsSearch('.length;
    for (; j < texto.length; j++) {
      if (texto[j] === '{') nivel++;
      else if (texto[j] === '}' && --nivel === 0) break;
    }
    busquedasConBarra++;
    comprueba(`${sitio}: la búsqueda lleva el refreshKey de la barra`, /\brefreshKey\b/.test(texto.slice(m.index as number, j + 1)));
  }
}
comprueba('hay búsquedas que cuelgan de la barra', busquedasConBarra >= 3, busquedasConBarra);

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
