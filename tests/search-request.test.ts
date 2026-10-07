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

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
