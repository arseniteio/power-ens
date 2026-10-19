/**
 * Las consultas del servidor y la poda de los hechos de estado.
 *
 *   npx --yes tsx tests/evaluation-queries.test.ts
 *
 * La poda es lo único que hace que el servidor NO lea todos los hechos de la
 * ventana, así que se prueba lo que promete: lo que deja de leer, el motor
 * también lo descartaría (`keepLatestRunStateFacts` da lo mismo con y sin
 * ello), también a fecha de días pasados; y ante cualquier duda, se lee.
 */
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
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) fallos.push(n); };

const AHORA = new Date('2026-10-17T12:00:00Z');

// --- ventana y filtros -------------------------------------------------------
const w = resolveEvaluationWindow('Últimos 30 días', AHORA);
comprueba('ventana de 30 días en instantes absolutos', w.to === AHORA.toISOString() && Date.parse(w.to) - Date.parse(w.from) === 30 * 86400e3, w);
comprueba('7 días', Date.parse(w.to) - Date.parse(resolveEvaluationWindow('Últimos 7 días', AHORA).from) === 7 * 86400e3);
comprueba('un periodo desconocido: 30 días, como el navegador', Date.parse(w.to) - Date.parse(resolveEvaluationWindow('???', AHORA).from) === 30 * 86400e3);
const alcance: ENSAgentScope[] = [{ id: '000', name: 'm', groups: [] }, { id: '024', name: 'r', groups: ['ens'] }];
const filtros = buildViewFilters(w, alcance);
comprueba('filtros: ventana, alcance y hechos ENS', JSON.stringify(filtros[0]).includes('"@timestamp"') && JSON.stringify(filtros[1]) === JSON.stringify({ terms: { 'agent.id': ['000', '024'] } }) && JSON.stringify(filtros[2]).includes('data.ensfacil'));
comprueba('vista de una máquina: ella y el manager', JSON.stringify(buildViewFilters(w, alcance, '024')[1]) === JSON.stringify({ terms: { 'agent.id': ['024', '000'] } }));

// --- la sonda ----------------------------------------------------------------
const sonda = buildProbeRequest(filtros, ['op.acc.1', 'op.exp.3']);
comprueba('la sonda no trae documentos', sonda.body.size === 0 && sonda.body.track_total_hits === true);
comprueba('la sonda cuenta por control, sin control y por máquina', Object.keys((sonda.body.aggs as any).controls.filters.filters).join() === 'op.acc.1,op.exp.3' && !!(sonda.body.aggs as any).orphans && !!(sonda.body.aggs as any).agents);
const leida = readProbeResponse({
  hits: { total: { value: 12 } },
  aggregations: {
    newest: { value: Date.parse('2026-10-17T11:00:00Z') }, oldest: { value: Date.parse('2026-09-20T00:00:00Z') },
    controls: { buckets: { 'op.acc.1': { doc_count: 10, newest: { value: Date.parse('2026-10-17T11:00:00Z') }, oldest: { value: null } } } },
    orphans: { doc_count: 0, newest: { value: null } },
    agents: { buckets: [{ key: '024', doc_count: 12, first: { value: Date.parse('2026-09-20T00:00:00Z') }, latest: { value: Date.parse('2026-10-17T11:00:00Z') }, last: { hits: { hits: [{ _source: { agent: { name: 'wazuh-real' } } }] } } }] },
  },
});
comprueba('la sonda se lee: total, por control, presencia', leida.count === 12 && leida.controls['op.acc.1'].count === 10 && leida.presence[0].agentName === 'wazuh-real' && leida.presence[0].earliest === '2026-09-20T00:00:00.000Z', leida);
comprueba('el motor lee solo esos campos (sin `raw` ni `full_log`)', ENGINE_SOURCE_FIELDS.includes('data') && !ENGINE_SOURCE_FIELDS.includes('full_log'));

// --- la poda exacta -------------------------------------------------------------
// El servidor calcula el MISMO corte que el motor (latidos + último hecho de
// cada evidencia, de una agregación) para ahora y el final de cada día de la
// serie, y no lee lo que queda bajo el corte en todos esos instantes. Se
// prueba lo que promete: a fecha de CADA instante, `keepLatestRunStateFacts`
// conserva exactamente lo mismo leyendo todo que leyendo lo podado.
// op.exp.3: `service_running` es de EV-04. mp.info.6: varios recolectores por
// máquina (`origen`), cada uno delimita los suyos.
const hora = (h: number) => new Date(AHORA.getTime() - h * 3600e3).toISOString();
let n = 0;
const doc = (agente: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
  _id: `d${String(++n).padStart(5, '0')}`, _index: 'wazuh-alerts-4.x-x',
  _source: { '@timestamp': hora(horas), id: `i${n}`, agent: { id: agente, name: agente }, data },
});
const docs: FakeDoc[] = [];
for (let h = 160; h >= 1; h -= 1) {
  // Cada hora una pasada; EV-04 se declara cubierta salvo una vez al día, y
  // sus hechos llegan cada 3 horas (el corte lo pone a veces el latido y a
  // veces el último hecho).
  for (const agente of ['024', '029', '033']) {
    docs.push(doc(agente, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: h % 24 === 0 ? 'EV-01' : 'EV-01,EV-04' }, h));
    if (h % 3 === 0) docs.push(doc(agente, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: `s${h % 5}` }, h - 0.01));
    // Sin evidencia declarada: también es de EV-04 para el motor.
    if (h % 7 === 0) docs.push(doc(agente, { ensfacil: 'op.exp.3', event: 'service_running', servicio: 'cron' }, h - 0.02));
  }
  // Un hecho del mismo tipo que declara OTRA evidencia: para el motor no es de estado.
  if (h % 10 === 0) docs.push(doc('024', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-99' }, h - 0.03));
  // 029: alguno con la evidencia en otro campo; 033: alguno con varias en una lista.
  if (h % 15 === 0) docs.push(doc('029', { ensfacil: 'op.exp.3', event: 'service_running', evidencias: 'EV-04' }, h - 0.04));
  if (h % 15 === 0) docs.push(doc('033', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: ['EV-04', 'EV-77'] }, h - 0.04));
  // Una máquina cuyo latido nunca declara EV-04 (el corte, por el último hecho).
  docs.push(doc('028', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01' }, h));
  if (h % 2 === 0) docs.push(doc('028', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04' }, h - 0.01));
  for (const origen of ['pbs', 'zimbra']) {
    // Zimbra late cada 2 horas y deja de emitir EV-03 a mitad de la semana.
    if (origen === 'zimbra' && h % 2) continue;
    docs.push(doc('024', { ensfacil: 'mp.info.6', origen, event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03' }, h - (origen === 'pbs' ? 0 : 0.5)));
    docs.push(doc('024', { ensfacil: 'mp.info.6', origen, event: 'backup_run', evidence_id: 'EV-01', resultado: 'ok' }, h - (origen === 'pbs' ? 0.01 : 0.51)));
    if (origen === 'pbs' || h > 80) docs.push(doc('024', { ensfacil: 'mp.info.6', origen, event: 'backup_retention', evidence_id: 'EV-03', dias: 30 }, h - (origen === 'pbs' ? 0.02 : 0.52)));
  }
  // Sin campo de recolector: otro recolector más.
  if (h % 4 === 0) docs.push(doc('024', { ensfacil: 'mp.info.6', event: 'backup_run', evidence_id: 'EV-01' }, h - 0.2));
}
const indice = createFakeIndexer(docs, { clock: () => AHORA.getTime() });
const ventana = resolveEvaluationWindow('Últimos 30 días', AHORA);
const inicio = Date.parse(ventana.from);
// Ahora y el final de los 6 días anteriores (UTC).
const hoy = Date.UTC(AHORA.getUTCFullYear(), AHORA.getUTCMonth(), AHORA.getUTCDate());
const instantes = [...Array.from({ length: 6 }, (_, i) => new Date(hoy - i * 86400e3 - 1)).reverse(), AHORA];
const todosDe = (controlId: string, agente: string) => docs
  .filter(d => d._source.data.ensfacil === controlId && d._source.agent.id === agente)
  .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || a._id.localeCompare(b._id));

const podaDe = async (controlId: string, agente: string) => {
  const runs = (await indice.search({ index: 'wazuh-alerts-*', body: { size: 10000, query: buildCollectorRunsQuery([], controlId, agente) } })).body.hits.hits;
  const ultimos = readStateFactLastSeen(controlId, (await indice.search(buildStateFactLastSeenRequest([], controlId, agente, 'UTC'))).body);
  const cortes = computeStateFactCutoffsByCollector(controlId, normalizeWazuhAlerts(runs), instantes, ultimos.lastFactOf, ultimos.collectors);
  const huecos = new Map([...cortes.entries()].map(([c, porInstante]) => [c, prunableRanges(inicio, instantes.map(i => i.getTime()), porInstante)]));
  return { clausula: buildStateFactKeepClause(controlId, agente, huecos), cortes };
};
const ids = (eventos: any[]) => eventos.map(e => e.id).sort().join();

(async () => {
  for (const [controlId, agente, debePodar] of [
    ['op.exp.3', '024', true],
    ['op.exp.3', '028', true],
    ['op.exp.3', '029', false],
    ['op.exp.3', '033', false],
    ['mp.info.6', '024', true],
  ] as [string, string, boolean][]) {
    const todos = todosDe(controlId, agente);
    const { clausula, cortes } = await podaDe(controlId, agente);
    const consulta = buildFactsQuery([], controlId, agente, clausula);
    const leidos = todos.filter(d => matchesQuery(d, consulta, AHORA.getTime()));
    const iguales = instantes.filter(t => {
      const hasta = (lista: FakeDoc[]) => normalizeWazuhAlerts(lista.filter(d => Date.parse(d._source['@timestamp']) <= t.getTime()));
      return ids(keepLatestRunStateFacts(controlId, hasta(todos), t)) === ids(keepLatestRunStateFacts(controlId, hasta(leidos), t));
    }).length;
    const que = `${controlId} en ${agente}`;
    comprueba(`${que}: ${debePodar ? 'se leen menos hechos' : 'ante la duda, se lee todo'}`, debePodar ? leidos.length < todos.length : leidos.length === todos.length && clausula === undefined, [leidos.length, todos.length, [...cortes.keys()]]);
    comprueba(`${que}: a fecha de cada uno de los ${instantes.length} instantes (ahora y 6 días), el motor conserva exactamente lo mismo`, iguales === instantes.length, iguales);
    const fuera = todos.filter(d => !matchesQuery(d, consulta, AHORA.getTime()));
    comprueba(`${que}: nunca se poda un latido ni un hecho que declara otra evidencia`, fuera.every(d => d._source.data.event !== 'collector_run' && d._source.data.evidence_id !== 'EV-99'));
  }
  const deMpInfo6 = (await podaDe('mp.info.6', '024')).cortes;
  comprueba('mp.info.6: cada recolector (pbs, zimbra y el sin `origen`) tiene su corte', ['pbs', 'zimbra', ''].every(c => deMpInfo6.has(c)), [...deMpInfo6.keys()]);

  // Una agregación recortada (cubos que no cupieron): nada se atribuye, nada se poda.
  const dia = { buckets: [{ last: { value: AHORA.getTime() - 3600e3 } }] };
  const tipos = { sum_other_doc_count: 3, buckets: [{ key: 'service_running', ids: { buckets: [{ key: 'EV-04', days: dia }] } }] };
  const recortada = readStateFactLastSeen('op.exp.3', {
    aggregations: { alt: { doc_count: 0 }, collectors: { buckets: { __none__: { types: tipos } } } },
  });
  const entera = readStateFactLastSeen('op.exp.3', {
    aggregations: { alt: { doc_count: 0 }, collectors: { buckets: { __none__: { types: { ...tipos, sum_other_doc_count: 0 } } } } },
  });
  comprueba('(la misma agregación entera sí da el último hecho)', entera.lastFactOf('', 'EV-04', AHORA.getTime()) === AHORA.getTime() - 3600e3);
  comprueba('cubos que no cupieron en la agregación: sin último hecho (no se poda)', recortada.lastFactOf('', 'EV-04', AHORA.getTime()) === undefined);
  comprueba('un control sin hechos de estado no poda nada', buildStateFactKeepClause('op.acc.3', '024', new Map([['', [{ from: 0, to: 1 }]]])) === undefined);
  comprueba('sin huecos no hay cláusula', buildStateFactKeepClause('op.exp.3', '024', new Map([['', []]])) === undefined);

  // --- lo que no puede romper el indexador -----------------------------------
  comprueba('el orden de lectura no usa `_id` (su fielddata) y desempata con keywords', !JSON.stringify(FACTS_SORT).includes('"_id"') && JSON.stringify(FACTS_SORT).includes('"id"') && JSON.stringify(FACTS_SORT).includes('manager.name'));
  {
    // Muchos recolectores con un hueco por día: la poda se acota y la consulta
    // entera queda lejos del límite de 1024 cláusulas.
    const huecos = new Map<string, { from: number; to: number }[]>();
    for (let r = 0; r < 40; r++) huecos.set(`r${r}`, Array.from({ length: 30 }, (_, i) => ({ from: i * 10, to: i * 10 + 5 })));
    const hojas = (q: any): number => Array.isArray(q) ? q.reduce((n, x) => n + hojas(x), 0) : q && typeof q === 'object'
      ? (q.bool ? ['filter', 'must', 'should', 'must_not'].reduce((n, k) => n + (q.bool[k] ? hojas([].concat(q.bool[k])) : 0), 0) : 1) : 0;
    const clausula = buildStateFactKeepClause('mp.info.6', '024', huecos);
    const consulta = buildFactsQuery(buildViewFilters(w, alcance), 'mp.info.6', '024', clausula);
    comprueba(`la poda se acota a ${PRUNING_MAX_LEAVES} hojas (los recolectores que no caben se leen)`, hojas(clausula) <= PRUNING_MAX_LEAVES + 20, hojas(clausula));
    comprueba('y la consulta entera queda por debajo de 1024 cláusulas', hojas(consulta) < 1024, hojas(consulta));
  }

  fallos.length ? console.log(`\n${fallos.length} FAILURES`) : console.log('\nAll checks pass.');
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
