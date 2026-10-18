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
import { FakeDoc, matchesQuery } from './fixtures/fake-indexer';
import {
  buildFactsQuery,
  buildProbeRequest,
  buildStateFactPruningClause,
  buildViewFilters,
  FACTS_SORT,
  PRUNING_MAX_KEYS,
  ENGINE_SOURCE_FIELDS,
  readProbeResponse,
  resolveEvaluationWindow,
} from '../server/lib/evaluation/queries';
import { computeStateFactPruningCutoffs, keepLatestRunStateFacts } from '../common/ens/core/evidence/state-facts';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) fallos.push(n); };

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

// --- la poda -------------------------------------------------------------------
// op.exp.3: `service_running` es de EV-04. mp.info.6: varios recolectores por
// máquina (`origen`), cada uno delimita los suyos.
const hora = (h: number) => new Date(AHORA.getTime() - h * 3600e3).toISOString();
let n = 0;
const doc = (agente: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
  _id: `d${String(++n).padStart(5, '0')}`, _index: 'wazuh-alerts-4.x-x',
  _source: { '@timestamp': hora(horas), agent: { id: agente, name: agente }, data },
});
const docs: FakeDoc[] = [];
for (let h = 120; h >= 1; h -= 1) {
  docs.push(doc('024', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: h % 24 === 0 ? 'EV-01' : 'EV-01,EV-04' }, h));
  docs.push(doc('024', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: `s${h % 5}` }, h - 0.01));
  // Un hecho del mismo tipo que declara OTRA evidencia: para el motor no es de estado.
  if (h % 10 === 0) docs.push(doc('024', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-99' }, h - 0.02));
  // Uno con la evidencia en otro campo: ante la duda, se lee.
  if (h % 15 === 0) docs.push(doc('024', { ensfacil: 'op.exp.3', event: 'service_running', evidencias: 'EV-04' }, h - 0.03));
  // Una máquina cuyo latido nunca declara EV-04: sin corte, no se poda nada suyo.
  docs.push(doc('028', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01' }, h));
  docs.push(doc('028', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04' }, h - 0.01));
  for (const origen of ['pbs', 'zimbra']) {
    docs.push(doc('024', { ensfacil: 'mp.info.6', origen, event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04,EV-06' }, h - (origen === 'pbs' ? 0 : 0.5)));
    docs.push(doc('024', { ensfacil: 'mp.info.6', origen, event: 'backup_run', evidence_id: 'EV-01', resultado: 'ok' }, h - (origen === 'pbs' ? 0.01 : 0.51)));
  }
}
const todosDe = (controlId: string) => docs
  .filter(d => d._source.data.ensfacil === controlId)
  .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || a._id.localeCompare(b._id));

for (const controlId of ['op.exp.3', 'mp.info.6']) {
  for (const [nombre, at] of [['ahora', AHORA], ['hace dos días', new Date(AHORA.getTime() - 48 * 3600e3)]] as [string, Date][]) {
    const todos = todosDe(controlId);
    const runs = normalizeWazuhAlerts(todos.filter(d => d._source.data.event === 'collector_run'));
    const cortes = computeStateFactPruningCutoffs(controlId, runs, at);
    const poda = buildStateFactPruningClause(controlId, cortes);
    const consulta = buildFactsQuery([], controlId, undefined, poda);
    const leidosOrden = todos.filter(d => matchesQuery(d, consulta, AHORA.getTime()));
    // Todos los cortes que el motor puede pedir a partir de `at`.
    const instantes = [at, new Date((at.getTime() + AHORA.getTime()) / 2), AHORA];
    const iguales = instantes.every(t => {
      const completo = keepLatestRunStateFacts(controlId, normalizeWazuhAlerts(todos.filter(d => Date.parse(d._source['@timestamp']) <= t.getTime())), t).map(e => e.id);
      const podado = keepLatestRunStateFacts(controlId, normalizeWazuhAlerts(leidosOrden.filter(d => Date.parse(d._source['@timestamp']) <= t.getTime())), t).map(e => e.id);
      return JSON.stringify(completo) === JSON.stringify(podado);
    });
    comprueba(`${controlId}, poda a fecha de ${nombre}: se leen menos hechos`, leidosOrden.length < todos.length, [leidosOrden.length, todos.length]);
    comprueba(`${controlId}, poda a fecha de ${nombre}: el motor conserva exactamente lo mismo, hoy y en los días siguientes`, iguales);
  }
}
{
  const todos = todosDe('op.exp.3');
  const poda = buildStateFactPruningClause('op.exp.3', computeStateFactPruningCutoffs('op.exp.3', normalizeWazuhAlerts(todos.filter(d => d._source.data.event === 'collector_run')), AHORA));
  const consulta = buildFactsQuery([], 'op.exp.3', undefined, poda);
  const fuera = todos.filter(d => !matchesQuery(d, consulta, AHORA.getTime()));
  comprueba('nunca se poda un latido', fuera.every(d => d._source.data.event !== 'collector_run'));
  comprueba('ni un hecho que declara otra evidencia', fuera.every(d => d._source.data.evidence_id !== 'EV-99'));
  comprueba('ni uno con la evidencia en otro campo (ante la duda, se lee)', fuera.every(d => d._source.data.evidencias === undefined));
  comprueba('ni nada de la máquina cuyo latido nunca declara la evidencia', fuera.every(d => d._source.agent.id !== '028'));
  comprueba('sin latidos no hay corte', computeStateFactPruningCutoffs('op.exp.3', [], AHORA).size === 0);
  comprueba('un control sin hechos de estado no poda nada', buildStateFactPruningClause('op.acc.3', computeStateFactPruningCutoffs('op.acc.3', normalizeWazuhAlerts(todos), AHORA)) === undefined);
}

// --- lo que no puede romper el indexador -----------------------------------
comprueba('el orden de lectura no usa `_id` (su fielddata) y desempata con keywords', !JSON.stringify(FACTS_SORT).includes('"_id"') && JSON.stringify(FACTS_SORT).includes('"id"') && JSON.stringify(FACTS_SORT).includes('manager.name'));
{
  // Una máquina con muchísimas claves (recolectores × tipos): la cláusula se
  // acota y la consulta entera queda lejos del límite de 1024 cláusulas.
  const cortes = new Map<string, number>();
  for (let r = 0; r < 20; r++) for (const tipo of ['log_source_observed', 'agent_forwarding_observed', 'syslog_source_observed', 'correlation_rules_inventory', 'config_assessment_observed']) cortes.set(`024|r${r}|${tipo}`, Date.parse('2026-10-10T00:00:00Z'));
  const hojas = (q: any): number => Array.isArray(q) ? q.reduce((n, x) => n + hojas(x), 0) : q && typeof q === 'object'
    ? (q.bool ? ['filter', 'must', 'should', 'must_not'].reduce((n, k) => n + (q.bool[k] ? hojas([].concat(q.bool[k])) : 0), 0) : 1) : 0;
  const consulta = buildFactsQuery(buildViewFilters(w, alcance), 'op.mon.3', '024', buildStateFactPruningClause('op.mon.3', cortes));
  comprueba(`la poda de una máquina se acota a ${PRUNING_MAX_KEYS} claves`, (buildStateFactPruningClause('op.mon.3', cortes) as any).bool.should.length === PRUNING_MAX_KEYS);
  comprueba('y la consulta entera queda por debajo de 1024 cláusulas', hojas(consulta) < 1024, hojas(consulta));
}

fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
process.exit(fallos.length ? 1 : 0);
