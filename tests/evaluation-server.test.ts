/**
 * La evaluación en el servidor (`/api/ensfacil/evaluation`), de punta a punta
 * contra un indexador en memoria: consultas, poda de hechos de estado,
 * paginación, memoria por huella, sonda y serie diaria.
 *
 *   npx --yes tsx tests/evaluation-server.test.ts
 *
 * La referencia es el motor sobre TODOS los hechos a la vez, como lo
 * evaluaba el navegador sin tope: el servidor tiene que dar lo mismo.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse } from '../server/lib/evaluation/responses';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { getENSComplianceResultByControl, getENSComplianceState } from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { planENSTimelineCuts } from '../common/ens/core/timeline/timeline-cuts';
import { resolveENSScopeAgents, normalizeInventory } from '../common/ens/core/scope/runtime';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';
import { FACTS_PAGE_SIZE } from '../server/lib/evaluation/facts-reader';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) fallos.push(n); };
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const igual = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const sinTraza = (r: any) => (r ? { ...r, traceability: [] } : r);

let reloj = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(reloj.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const hecho = (agente: string, nombre: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.17',
  _source: { '@timestamp': hora(horas), timestamp: hora(horas), agent: { id: agente, name: nombre }, rule: { id: '100', groups: ['ENS'] }, data },
});

const docs: FakeDoc[] = [];
for (const linea of fs.readFileSync(path.join(__dirname, 'fixtures/mp-info-6-pbs-pass.ndjson'), 'utf8').split('\n').filter(Boolean)) {
  docs.push(hecho('024', 'wazuh-real', JSON.parse(linea), 3));
}
// op.exp.3: estado en muchas pasadas horarias, cada una con su latido que la
// declara cubierta: el servidor no necesita leer las viejas.
for (let h = 200; h >= 1; h -= 1) {
  docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
  docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: h > 100 ? 'telnet' : 'sshd', estado: 'CUMPLE' }, h - 0.01));
}
// op.acc.3: acciones (más de una página de lectura) en 024 y en 028.
for (let i = 0; i < FACTS_PAGE_SIZE + 300; i++) {
  docs.push(hecho(i % 3 ? '024' : '028', i % 3 ? 'wazuh-real' : 'zimbraHldap', { ensfacil: 'op.acc.3', event: 'account_action', usuario: `u${i % 7}`, funcion: i % 2 ? 'operacion' : 'desarrollo' }, 2 + (i % 500) / 10));
}
for (const [a, nm] of [['024', 'wazuh-real'], ['028', 'zimbraHldap']]) docs.push(hecho(a, nm, { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'log_source_observed', fuente: '/var/log/syslog' }, 1));
docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(hecho('000', 'manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, 2));
docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', estado: 'CUMPLE' }, 2));
// Un hecho fuera de la ventana y otro de una máquina fuera del alcance: no cuentan.
docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'viejo', funcion: 'operacion' }, 40 * 24));
docs.push(hecho('099', 'fuera', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'x', funcion: 'operacion' }, 2));

const monitor = (id: string, name: string, group: string[]) => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group, status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
const configuracion = {
  ...defaultENSConfigurationTemplate,
  scope: { mode: 'group', agentIds: [], groupIds: ['ens'] },
  updatedAt: '2026-10-14T10:00:00.000Z',
};
const indice = createFakeIndexer([
  ...docs,
  monitor('024', 'wazuh-real', ['ens']),
  monitor('028', 'zimbraHldap', ['ens']),
  monitor('099', 'fuera', ['default']),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuracion, updatedAt: '2026-10-14T10:00:00.000Z' } },
], { clock: () => reloj.getTime() });
const clientes = { asCurrentUser: indice, asInternalUser: indice };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
const servicio = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });

// La referencia: el motor con todos los hechos de la ventana y del alcance,
// del más reciente al más antiguo, como los leía el navegador sin tope.
const referencia = () => {
  ensConfigurationRepository.replaceActive(configuracion as any);
  const desde = reloj.getTime() - 30 * 86400e3;
  const todos = indice.docs
    .filter(d => d._index.startsWith('wazuh-alerts') && ['000', '024', '028'].includes(d._source.agent.id))
    .filter(d => Date.parse(d._source['@timestamp']) >= desde && Date.parse(d._source['@timestamp']) <= reloj.getTime())
    .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || a._id.localeCompare(b._id));
  const inventario = inventoryFromMonitoring({ agentes: { buckets: ['024', '028', '099'].map(id => ({ key: id, ultimo: { hits: { hits: [indice.docs.find(d => d._id === `m${id}`)] } } })) } }, reloj.getTime());
  const alcance = resolveENSScopeAgents(normalizeInventory(inventario.agents), configuracion.scope as any);
  return { eventos: normalizeWazuhAlerts(todos), alcance, nivel: (configuracion as any).global.ensLevel, docs: todos };
};

(async () => {
  const ref = referencia();
  comprueba('el alcance de la prueba: manager, 024 y 028', JSON.stringify(ref.alcance.map(a => a.id).sort()) === '["000","024","028"]', ref.alcance.map(a => a.id));

  // 1. El conjunto: estado, filas y cada control, iguales al motor sobre todo.
  const conjunto = await servicio.run(clientes, { include: 'results', timeZone: 'UTC' });
  const esperado = getENSComplianceState(ref.nivel, ref.eventos, undefined, ref.alcance, reloj);
  comprueba('conjunto: los resultados son los del motor sobre todos los hechos', igual(conjunto.state!.results.map(sinTraza), esperado.results.map(sinTraza)),
    esperado.results.filter((r, i) => !igual(sinTraza(r), sinTraza(conjunto.state!.results[i]))).map(r => r.control.id));
  comprueba('conjunto: el resumen y las máquinas, iguales', igual(conjunto.state!.controlSummary, esperado.controlSummary) &&
    igual(conjunto.state!.agents.map(a => [a.agentId, a.summary, a.results.map(r => [r.control.id, r.status, r.score])]), esperado.agents.map(a => [a.agentId, a.summary, a.results.map(r => [r.control.id, r.status, r.score])])));
  const totalTraza = esperado.results.find(r => r.control.id === 'op.acc.3')!.traceability.length;
  comprueba('la trazabilidad se cuenta entera aunque no viaje', conjunto.views.get('op.acc.3')!.traceabilityTotal === totalTraza && totalTraza > 100, totalTraza);

  // 2. Hechos de estado podados: op.exp.3 no lee las pasadas viejas y juzga igual.
  const leidosExp3 = conjunto.meta.stats.controls.find((c: any) => c.controlId === 'op.exp.3');
  comprueba('op.exp.3: se podan los hechos de estado de pasadas anteriores', Boolean(leidosExp3?.pruned) && leidosExp3!.hits < 400 + 200, leidosExp3);
  comprueba('op.acc.3: se lee en varias páginas (sin el tope de una sola búsqueda)', (conjunto.meta.stats.controls.find((c: any) => c.controlId === 'op.acc.3')?.pages || 0) >= 2);
  comprueba('ninguna lectura pide más de una página por vez', indice.log.every(l => (l.body?.size ?? 0) <= FACTS_PAGE_SIZE));
  comprueba('cada hecho se lee con `_source` filtrado (sin el documento entero)', indice.log.filter(l => l.body?.size > 0 && l.index?.startsWith('wazuh-alerts')).every(l => Array.isArray(l.body._source) && !l.body._source.includes('full_log')));

  // 3. La vista de una máquina sale de las filas, sin leer nada más.
  const lecturas = indice.log.length;
  for (const agente of ['000', '024', '028']) {
    const vista = await servicio.run(clientes, { include: 'results', agentId: agente, timeZone: 'UTC' });
    const suya = getENSComplianceState(ref.nivel, ref.eventos, agente, ref.alcance, reloj);
    comprueba(`${agente}: igual que el motor sobre todo`, igual(vista.state!.results.map(sinTraza), suya.results.map(sinTraza)) && igual(vista.state!.controlSummary, suya.controlSummary));
    comprueba(`${agente}: cada control como la ficha`, vista.state!.results.every(r => igual(sinTraza(r), sinTraza(getENSComplianceResultByControl(r.control.id, ref.nivel, ref.eventos, agente, ref.alcance, reloj)))));
    comprueba(`${agente}: sin volver a evaluar`, vista.meta.stats.computed === 0, vista.meta.stats.computed);
  }
  comprueba('las vistas de máquina solo hacen la sonda (ninguna lectura de hechos)', indice.log.slice(lecturas).every(l => l.body?.size === 0 || l.index === 'wazuh-ens-configuration'));

  // 4. Memoria y sonda.
  const otra = await servicio.run(clientes, { include: 'summary', timeZone: 'UTC' });
  comprueba('segunda vez, nada se recalcula', otra.meta.stats.computed === 0);
  const h = createEvaluationHandlers({ logger, securityEnabled: true, service: servicio });
  const ctx = { core: { opensearch: { client: clientes } } };
  const resp = { ok: (r: any) => r.body, customError: (r: any) => ({ error: r }) };
  const sonda: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  comprueba('la sonda: pocos bytes', JSON.stringify(sonda).length < 400, JSON.stringify(sonda).length);
  comprueba('la sonda dice la misma huella que la evaluación', sonda.data.fingerprint === otra.meta.fingerprint);
  indice.docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'nuevo', funcion: 'desarrollo' }, 0.5));
  const sonda2: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  comprueba('un hecho nuevo cambia la huella', sonda2.data.fingerprint !== sonda.data.fingerprint);
  const tras = await servicio.run(clientes, { include: 'summary', timeZone: 'UTC' });
  comprueba('y solo se recalcula su control', tras.meta.stats.computed === 1 && tras.meta.stats.controls.find((c: any) => !c.fromCache)?.controlId === 'op.acc.3', tras.meta.stats.controls.filter((c: any) => !c.fromCache).map((c: any) => c.controlId));
  const ref2 = referencia();
  comprueba('con el hecho nuevo, sigue igual que el motor sobre todo', igual(tras.state!.results.map(sinTraza), getENSComplianceState(ref2.nivel, ref2.eventos, undefined, ref2.alcance, reloj).results.map(sinTraza)));

  // Otro usuario no comparte la memoria (sus permisos pueden ser otros).
  const otroIndice = { ...indice, transport: { request: async () => ({ body: { user_name: 'luis', roles: ['readall'] } }) } };
  const deLuis = await servicio.run({ asCurrentUser: otroIndice, asInternalUser: indice }, { include: 'summary', timeZone: 'UTC' });
  comprueba('otro usuario: su propia evaluación', deLuis.meta.stats.computed > 0);

  // Pasado el tiempo de vida, se recalcula aunque no haya hechos nuevos.
  reloj = new Date(reloj.getTime() + 11 * 60 * 1000);
  const caducado = await servicio.run(clientes, { include: 'summary', timeZone: 'UTC' });
  comprueba('caducado (10 min): se vuelve a evaluar', caducado.meta.stats.computed > 0);

  // 5. Las respuestas: compactas y sin hechos.
  const resumen = JSON.stringify(buildEvaluationResponse(caducado));
  const ficha = JSON.stringify(buildEvaluationResponse(await servicio.run(clientes, { include: 'control', controlId: 'op.acc.3', timeZone: 'UTC' })));
  comprueba('ninguna respuesta lleva documentos del índice', !/"_source"|"full_log"/.test(resumen + ficha));
  comprueba('la ficha trae como mucho 100 entradas de trazabilidad', (JSON.parse(ficha).result.traceability || []).length <= 100);

  // 6. La serie diaria del panel: cada día, el motor sobre lo conocido hasta
  // ese día y a fecha de ese día; el último punto es el número del panel.
  const ref3 = referencia();
  const conSerie = await servicio.run(clientes, { include: 'dashboard', timelineDays: 7, timeZone: 'UTC' });
  const asc = ref3.eventos.map(e => ({ e, t: Date.parse(e.timestamp) })).sort((a, b) => a.t - b.t);
  const plan = planENSTimelineCuts(Math.min(...asc.map(x => x.t)), asc.length, { now: reloj, days: 7, timeZone: 'UTC', maxEvaluatedEvents: Infinity });
  const esperada = plan.map(c => getENSComplianceState(ref3.nivel, c.isCurrent ? ref3.eventos : asc.filter(x => x.t <= c.cutoff.getTime()).map(x => x.e), undefined, ref3.alcance, c.cutoff).controlSummary.scoreAverage);
  comprueba('la serie del panel: los mismos puntos que el motor día a día', igual((conSerie.timeline || []).map(p => p.score), esperada), [(conSerie.timeline || []).map(p => p.score), esperada]);
  const deNuevo = await servicio.run(clientes, { include: 'dashboard', timelineDays: 7, timeZone: 'UTC' });
  comprueba('los días pasados se guardan: la segunda vez no se evalúa nada', deNuevo.meta.stats.computed === 0 && igual(deNuevo.timeline, conSerie.timeline));
  const modelo = (buildEvaluationResponse(conSerie) as any).dashboard;
  comprueba('el panel recibe el modelo hecho (con su serie)', modelo && modelo.evolution.rows.length === esperada.length);

  fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
