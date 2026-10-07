/**
 *   npx --yes tsx tests/search-request.test.ts
 */
import { buildENSSearchRequest } from '../public/search/search-request';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

// Lo que pide hoy una fila de Controles (control-row.tsx).
const ventana = { range: { '@timestamp': { gte: '2026-09-07T00:00:00Z', lte: '2026-10-07T00:00:00Z' } } };
const alcance = { terms: { 'agent.id': ['024', '028'] } };
const control = { bool: { should: [{ match_phrase: { 'data.ensfacil': 'op.acc.1' } }, { match_phrase: { 'data.control': 'op.acc.1' } }], minimum_should_match: 1 } };
const r = buildENSSearchRequest({ preAppliedFilters: [ventana, alcance, control], size: 10000, sorting: [{ timestamp: { order: 'desc' } }] });

comprueba('contra wazuh-alerts-*', r.index === 'wazuh-alerts-*');
comprueba('los tres filtros, en orden, en filter', JSON.stringify((r.body as any).query.bool.filter) === JSON.stringify([ventana, alcance, control]));
comprueba('10.000 más recientes', (r.body as any).size === 10000 && JSON.stringify((r.body as any).sort) === '[{"timestamp":{"order":"desc"}}]');
comprueba('sin agregaciones si no se piden', !('aggs' in (r.body as any)));
comprueba('total exacto', (r.body as any).track_total_hits === true);

const barra = [
  { meta: { disabled: false, negate: false }, query: { match_phrase: { 'rule.groups': 'ensfacil' } } },
  { meta: { disabled: true, negate: false }, query: { match_phrase: { 'agent.id': '999' } } },
  { meta: { disabled: false, negate: true }, query: { match_phrase: { 'agent.name': 'x' } } },
];
const rb = buildENSSearchRequest({ preAppliedFilters: barra, size: 0, preAppliedAggs: { a: { terms: { field: 'x' } } } });
comprueba('filtro de la barra: cuenta su query', JSON.stringify((rb.body as any).query.bool.filter) === JSON.stringify([{ match_phrase: { 'rule.groups': 'ensfacil' } }]));
comprueba('desactivado: fuera', !JSON.stringify(rb.body).includes('999'));
comprueba('negado: a must_not', JSON.stringify((rb.body as any).query.bool.must_not) === JSON.stringify([{ match_phrase: { 'agent.name': 'x' } }]));
comprueba('agregaciones si se piden', JSON.stringify((rb.body as any).aggs) === '{"a":{"terms":{"field":"x"}}}');
comprueba('nulos fuera', JSON.stringify((buildENSSearchRequest({ preAppliedFilters: [null, undefined, ventana] }).body as any).query.bool.filter) === JSON.stringify([ventana]));

// Filtros con `meta` que no son `{ meta, query }`: el de rango (lo que da
// `timefilter.createFilter`) y el de existencia. La consulta es lo que queda
// sin `meta` ni `$state`; si entraran, OpenSearch respondería 400.
const rango = { meta: { index: 'x', params: {} }, range: { timestamp: { gte: 'a', lte: 'b' } } };
const existe = { meta: { index: 'x' }, $state: { store: 'appState' }, exists: { field: 'data.ensfacil' } };
const rr = buildENSSearchRequest({ preAppliedFilters: [rango, existe] });
comprueba('rango con meta: solo { range }', JSON.stringify((rr.body as any).query.bool.filter[0]) === JSON.stringify({ range: { timestamp: { gte: 'a', lte: 'b' } } }), (rr.body as any).query.bool.filter[0]);
comprueba('exists con meta y $state: solo { exists }', JSON.stringify((rr.body as any).query.bool.filter[1]) === JSON.stringify({ exists: { field: 'data.ensfacil' } }), (rr.body as any).query.bool.filter[1]);
comprueba('ni meta ni $state en el cuerpo', !/"meta"|"\$state"/.test(JSON.stringify(rr.body)));
const negado = { meta: { negate: true }, $state: { store: 'appState' }, query: { match_phrase: { 'agent.id': '000' } } };
const rn = buildENSSearchRequest({ preAppliedFilters: [negado] });
comprueba('negado con query: a must_not, sin meta', JSON.stringify((rn.body as any).query.bool.must_not) === JSON.stringify([{ match_phrase: { 'agent.id': '000' } }]) && (rn.body as any).query.bool.filter.length === 0);
const rangoNegado = { meta: { negate: true }, range: { timestamp: { lt: 'a' } } };
comprueba('negado sin query: lo que queda, a must_not', JSON.stringify((buildENSSearchRequest({ preAppliedFilters: [rangoNegado] }).body as any).query.bool.must_not) === JSON.stringify([{ range: { timestamp: { lt: 'a' } } }]));

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
