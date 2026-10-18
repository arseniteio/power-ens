/**
 * La evaluación en el servidor cuando las cosas no van bien o no son simples:
 * shards fallidos, peticiones mal hechas, lo guardado mientras se recalcula,
 * cálculos compartidos y cancelados, eventos operativos de una máquina, la
 * trazabilidad por páginas, una serie en Europe/Madrid que cruza el cambio de
 * hora, hechos sin control y el latido de otro control que op.acc.3 acepta.
 *
 *   npx --yes tsx tests/evaluation-server-robustness.test.ts
 */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService, normalizeQuery } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse } from '../server/lib/evaluation/responses';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { CancelSignal } from '../server/lib/evaluation/cache';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { getENSComplianceResultByControl, getENSComplianceState } from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { buildImpactEventsModel } from '../common/ens/core/dashboard-adapter/presenters/impact-events.presenter';
import { planENSTimelineCuts } from '../common/ens/core/timeline/timeline-cuts';
import { resolveENSScopeAgents, normalizeInventory } from '../common/ens/core/scope/runtime';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) fallos.push(n); };
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const igual = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const sinTraza = (r: any) => (r ? { ...r, traceability: [] } : r);
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

// Después del cambio de hora de Europa (25/10/2026, 03:00 → 02:00).
let reloj = new Date('2026-10-28T10:00:00Z');
const hora = (h: number) => new Date(reloj.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const hecho = (agente: string, nombre: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.28',
  _source: {
    '@timestamp': hora(horas), timestamp: hora(horas), id: `${Date.parse(hora(horas)) / 1000}.${n}`,
    manager: { name: 'wazuh-manager' }, agent: { id: agente, name: nombre }, rule: { id: '100', groups: ['ENS'] }, data,
  },
});

const docs: FakeDoc[] = [];
// op.exp.3 en 024 durante 10 días (la serie cruza el cambio de hora).
for (let h = 240; h >= 1; h -= 6) {
  docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-04' }, h));
  docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', servicio: h > 120 ? 'telnet' : 'sshd' }, h - 0.01));
}
// op.acc.3 en 024 (acciones y latido propio) y 028 SIN nada de op.acc.3, pero
// con el latido de otro control: 1.1.0 lo daba por «mirado».
for (let i = 0; i < 300; i++) docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: `u${i % 5}`, funcion: i % 2 ? 'operacion' : 'desarrollo' }, 2 + i / 10));
docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(hecho('028', 'zimbraHldap', { ensfacil: 'op.exp.1', event: 'collector_run' }, 3));
// Eventos operativos de copias en 024 y en 028 (para el panel de una máquina).
docs.push(hecho('024', 'wazuh-real', { ensfacil: 'mp.info.6', event: 'backup_ok', origen: 'pbs' }, 5));
docs.push(hecho('028', 'zimbraHldap', { ensfacil: 'mp.info.6', event: 'backup_error', origen: 'pbs' }, 5));
docs.push(hecho('028', 'zimbraHldap', { ensfacil: 'mp.info.6', event: 'backup_error', origen: 'pbs' }, 6));
// Hechos que no nombran ningún control (los admite el filtro por el grupo ENS).
docs.push(hecho('024', 'wazuh-real', { event: 'service_running', evidence_id: 'EV-04', servicio: 'cron' }, 4));
docs.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));

const monitor = (id: string, name: string, group: string[]) => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.28',
  _source: { id, name, group, status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
// op.acc.3 con P-02 y P-03 declarados: así su juicio llega a mirar el latido.
const conValores = (plantilla: any, controlId: string, valores: Record<string, unknown>) => ({
  ...plantilla,
  controls: plantilla.controls.map((c: any) => c.controlId !== controlId ? c : {
    ...c,
    parameters: c.parameters.map((p: any) => (p.id in valores ? { ...p, value: valores[p.id] } : p)),
  }),
});
const configuracion = {
  ...conValores(defaultENSConfigurationTemplate, 'op.acc.3', {
    'P-02': ['desarrollo | operacion', 'autorizacion | control'],
    'P-03': ['desarrollo | /usr/bin/git', 'operacion | /usr/bin/systemctl'],
  }),
  scope: { mode: 'group', agentIds: [], groupIds: ['ens'] },
  updatedAt: '2026-10-14T10:00:00.000Z',
};
let fallar = 0;
const indice = createFakeIndexer([
  ...docs,
  monitor('024', 'wazuh-real', ['ens']),
  monitor('028', 'zimbraHldap', ['ens']),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuracion, updatedAt: '2026-10-14T10:00:00.000Z' } },
], { clock: () => reloj.getTime(), failShards: (body, index) => (fallar && index?.startsWith('wazuh-alerts') && body?.size > 0 ? fallar : 0) });
const clientes = { asCurrentUser: indice, asInternalUser: indice };
const avisos: string[] = [];
const logger: any = { info() {}, warn: (m: string) => avisos.push(m), debug() {}, error: (m: string) => avisos.push(m) };
const respuesta = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const contexto = { core: { opensearch: { client: clientes } } };

const referencia = () => {
  ensConfigurationRepository.replaceActive(configuracion as any);
  const desde = reloj.getTime() - 30 * 86400e3;
  const todos = indice.docs
    .filter(d => d._index.startsWith('wazuh-alerts') && ['000', '024', '028'].includes(d._source.agent.id))
    .filter(d => Date.parse(d._source['@timestamp']) >= desde && Date.parse(d._source['@timestamp']) <= reloj.getTime())
    .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || (a._source.id < b._source.id ? -1 : 1));
  const inventario = inventoryFromMonitoring({ agentes: { buckets: ['024', '028'].map(id => ({ key: id, ultimo: { hits: { hits: [indice.docs.find(d => d._id === `m${id}`)] } } })) } }, reloj.getTime());
  const alcance = resolveENSScopeAgents(normalizeInventory(inventario.agents), configuracion.scope as any);
  return { eventos: normalizeWazuhAlerts(todos), alcance, nivel: (configuracion as any).global.ensLevel, docs: todos };
};

(async () => {
  // 1. Peticiones mal hechas: 400 con el motivo.
  const motivo = (f: () => unknown) => { try { f(); return ''; } catch (e: any) { return `${e.statusCode} ${e.message}`; } };
  comprueba('control fuera del catálogo: 400', /^400 .*op\.zzz\.9/.test(motivo(() => normalizeQuery({ controlId: 'op.zzz.9' }))));
  comprueba('zona horaria inventada: 400', /^400 .*Mars\/Olympus/.test(motivo(() => normalizeQuery({ timeZone: 'Mars/Olympus' }))));
  comprueba('serie de 400 días: 400', /^400 /.test(motivo(() => normalizeQuery({ timelineDays: '400' }))));
  comprueba('sin zona: UTC', normalizeQuery({}).timeZone === 'UTC');
  comprueba('`24` es la máquina 024', normalizeQuery({ agentId: '24' }).agentId === '024');
  const h = createEvaluationHandlers({ logger, securityEnabled: true });
  const fuera: any = await h.evaluate(contexto, { query: { agentId: '099', timeZone: 'UTC' } }, respuesta);
  comprueba('máquina fuera del alcance: 400 con su motivo', fuera.status === 400 && /099.*alcance/.test(fuera.body.message), fuera);
  const pagina: any = await h.traceability(contexto, { query: { controlId: 'op.acc.3', size: '100000' } }, respuesta);
  comprueba('página de trazabilidad desmedida: 400', pagina.status === 400, pagina);
  const sinControl: any = await h.traceability(contexto, { query: {} }, respuesta);
  comprueba('trazabilidad sin control: 400 (no 500)', sinControl.status === 400, sinControl);

  // 2. Shards fallidos: no se evalúa ni se guarda nada.
  const servicio = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
  fallar = 1;
  const roto = await servicio.run(clientes, normalizeQuery({ include: 'summary', timeZone: 'UTC' })).then(() => undefined, (e: any) => e);
  comprueba('un shard fallido: la evaluación falla con el motivo (503)', roto?.statusCode === 503 && /Datos incompletos: 1 de 10 shards fallaron/.test(roto?.message), roto?.message);
  comprueba('y no se guarda nada', servicio.rows.size === 0, servicio.rows.size);
  const viaRuta: any = await createEvaluationHandlers({ logger, securityEnabled: true, service: servicio }).evaluate(contexto, { query: { timeZone: 'UTC' } }, respuesta);
  comprueba('la ruta lo devuelve como 503 con el motivo', viaRuta.status === 503 && /reintentar/.test(viaRuta.body.message), viaRuta);
  fallar = 0;

  // 3. Lo mismo que el motor: hechos sin control, latido de otro control.
  const ref = referencia();
  const conjunto = await servicio.run(clientes, normalizeQuery({ include: 'results', timeZone: 'UTC' }));
  const esperado = getENSComplianceState(ref.nivel, ref.eventos, undefined, ref.alcance, reloj);
  comprueba('con hechos sin control y el latido de otro control: igual que el motor', igual(conjunto.state!.results.map(sinTraza), esperado.results.map(sinTraza)),
    esperado.results.filter((r, i) => !igual(sinTraza(r), sinTraza(conjunto.state!.results[i]))).map(r => r.control.id));
  const deLa028 = getENSComplianceResultByControl('op.acc.3', ref.nivel, ref.eventos, '028', ref.alcance, reloj);
  const vista028 = await servicio.run(clientes, normalizeQuery({ include: 'control', controlId: 'op.acc.3', agentId: '028', timeZone: 'UTC' }));
  comprueba('op.acc.3 en 028 (sin hechos propios, con el latido de op.exp.1): como 1.1.0', igual(sinTraza(vista028.views.get('op.acc.3')!.result), sinTraza(deLa028)));
  const sinLatidoAjeno = getENSComplianceResultByControl('op.acc.3', ref.nivel, ref.eventos.filter(e => !(e.agentId === '028' && e.controlId === 'op.exp.1')), '028', ref.alcance, reloj);
  comprueba('(y ese latido ajeno cambia el resultado: la prueba lo mira de verdad)', !igual(sinTraza(sinLatidoAjeno), sinTraza(deLa028)));

  // 4. Lo guardado se enseña mientras se recalcula detrás.
  indice.docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'nueva', funcion: 'desarrollo' }, 0.5));
  const t0 = Date.now();
  const viejo = await servicio.run(clientes, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true });
  comprueba('con datos nuevos: responde con lo guardado, marcado, sin esperar', viejo.meta.refreshing && viejo.meta.fingerprint.startsWith('refreshing:') && viejo.meta.stats.computed === 0 && viejo.meta.stats.refreshingInBackground === 1, viejo.meta.stats);
  await espera(50);
  while (servicio.tasks.size) await espera(10);
  const nuevo = await servicio.run(clientes, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { allowStale: true });
  const ref2 = referencia();
  comprueba('al volver a pedir: el recalculado, sin marca', !nuevo.meta.refreshing && nuevo.meta.stats.computed === 0 && igual(nuevo.state!.results.map(sinTraza), getENSComplianceState(ref2.nivel, ref2.eventos, undefined, ref2.alcance, reloj).results.map(sinTraza)));
  void t0;

  // 5. Dos vistas a la vez comparten cada fila; si todos se van, se cancela.
  const otro = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
  const lecturas = indice.log.length;
  await Promise.all([
    otro.run(clientes, normalizeQuery({ include: 'summary', timeZone: 'UTC' })),
    otro.run(clientes, normalizeQuery({ include: 'dashboard', timeZone: 'UTC' })),
  ]);
  const deHechos = indice.log.slice(lecturas).filter(l => l.body?.size > 0 && l.index?.startsWith('wazuh-alerts'));
  const repetidas = deHechos.length - new Set(deHechos.map(l => JSON.stringify([l.body.query, l.body.search_after]))).size;
  comprueba('panel y lista a la vez: cada lectura una sola vez', repetidas === 0, repetidas);
  const tercero = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
  // Un indexador lento: cada lectura de hechos tarda 30 ms.
  const lento = { ...indice, search: async (p: any) => { if (p.body?.size > 0) await espera(30); return indice.search(p); } };
  const senal = new CancelSignal();
  const promesa = tercero.run({ asCurrentUser: lento, asInternalUser: lento }, normalizeQuery({ include: 'summary', timeZone: 'UTC' }), { signal: senal }).then(() => 'terminó', (e: any) => e?.statusCode);
  await espera(40);
  senal.cancel();
  const fin = await promesa;
  while (tercero.tasks.size) await espera(5);
  comprueba('el navegador se va y nadie más espera: se cancela', fin === 499 && tercero.rows.size < 23, [fin, tercero.rows.size]);

  // 6. Eventos operativos del panel de UNA máquina: los suyos y los del manager.
  const panel024 = buildEvaluationResponse(await servicio.run(clientes, normalizeQuery({ include: 'dashboard', agentId: '024', timeZone: 'UTC' }))) as any;
  const ref3 = referencia();
  const esperados = buildImpactEventsModel(ref3.eventos.filter(e => e.agentId === '024' || e.agentId === '000'));
  comprueba('«eventos con impacto» de 024: solo los de 024 y el manager', igual(panel024.dashboard.impactEvents, esperados) && !JSON.stringify(panel024.dashboard.impactEvents).includes('backup_error'), panel024.dashboard.impactEvents);
  const panelTodo = buildEvaluationResponse(await servicio.run(clientes, normalizeQuery({ include: 'dashboard', timeZone: 'UTC' }))) as any;
  comprueba('y los de todo el alcance en la vista de conjunto', igual(panelTodo.dashboard.impactEvents, buildImpactEventsModel(ref3.eventos)));

  // 7. La trazabilidad por páginas.
  const hs = createEvaluationHandlers({ logger, securityEnabled: true, service: servicio });
  const p1: any = await hs.traceability(contexto, { query: { controlId: 'op.acc.3', agentId: '024', from: '100', size: '50', timeZone: 'UTC' } }, respuesta);
  const fichaRef = getENSComplianceResultByControl('op.acc.3', ref3.nivel, ref3.eventos, '024', ref3.alcance, reloj)!;
  comprueba('página de la trazabilidad pasada la 100: las entradas del motor', p1.status === 200 && igual(p1.body.data.items, fichaRef.traceability.slice(100, 150)) && p1.body.data.total === fichaRef.traceability.length, [p1.status, p1.body?.data?.total]);
  comprueba('`available` dice cuántas se pueden recorrer', p1.body.data.available === Math.min(fichaRef.traceability.length, 500));

  // 8. Una serie en Europe/Madrid que cruza el cambio de hora.
  const tz = 'Europe/Madrid';
  const serie = await servicio.run(clientes, normalizeQuery({ include: 'control', controlId: 'op.exp.3', agentId: '024', timelineDays: '7', timeZone: tz }));
  const ref4 = referencia();
  const propios = ref4.docs.filter(d => d._source.data.ensfacil === 'op.exp.3' && d._source.agent.id === '024');
  const plan = planENSTimelineCuts(Math.min(...propios.map(d => Date.parse(d._source['@timestamp']))), propios.length, { now: reloj, days: 7, timeZone: tz, maxEvaluatedEvents: Infinity });
  const asc = ref4.eventos.map(e => ({ e, t: Date.parse(e.timestamp) })).sort((a, b) => a.t - b.t);
  const esperada = plan.map(c => {
    const r = getENSComplianceResultByControl('op.exp.3', ref4.nivel, c.isCurrent ? ref4.eventos : asc.filter(x => x.t <= c.cutoff.getTime()).map(x => x.e), '024', ref4.alcance, c.cutoff);
    return [c.label, r?.score, r?.status];
  });
  comprueba('serie de 7 días en Europe/Madrid (con el cambio de hora): los puntos del motor', igual((serie.timeline || []).map(p => [p.label, p.score, p.status]), esperada), [(serie.timeline || []).map(p => p.label), esperada.map(e => e[0])]);
  const delDia = (corte: Date) => ref4.docs.filter(d => (d._source.data.ensfacil === 'op.exp.3' || d._source.data.control === 'op.exp.3') && ['024', '000'].includes(d._source.agent.id) && Date.parse(d._source['@timestamp']) <= corte.getTime()).length;
  comprueba('los hechos de cada día, contados hasta el final del día en Madrid', (serie.timeline || []).filter(p => !p.isCurrent).every((p, i) => p.events === delDia(plan[i].cutoff)));

  fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
