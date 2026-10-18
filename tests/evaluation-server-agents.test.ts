/**
 * La evaluación en el servidor con la configuración POR SISTEMA (1.2.0): cada
 * fila se evalúa con la configuración resuelta para su máquina (agente →
 * plantillas → organización) y la del manager con las uniones, por el mismo
 * punto único que usa el motor del navegador (`getActiveControlConfiguration`
 * con el agente de la fila, ver `configuration-state-service.ts`).
 *
 *   npx --yes tsx tests/evaluation-server-agents.test.ts
 *
 *   1. Sin `agents`, con `agents: {}` o con perfiles sin valores: el servidor da
 *      exactamente lo mismo que con la configuración sin la clave.
 *   2. 024 con su propio op.exp.3 P-02: solo cambian las filas de 024 (y la
 *      consolidación de ese control); las de 000 y 028, idénticas. Y todo igual
 *      que el motor sobre todos los hechos con esa configuración.
 *      La fila del manager, con las uniones (op.exp.7 P-07).
 *   3. Guardar por la ruta de configuración (solo `agents`) cambia la huella:
 *      la sonda lo ve y la siguiente evaluación usa el documento nuevo.
 */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { getENSComplianceState } from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import { resolveENSScopeAgents, normalizeInventory } from '../common/ens/core/scope/runtime';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`);
  if (!c) fallos.push(n);
};
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const igual = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const sinTraza = (r: any) => (r ? { ...r, traceability: [] } : r);

const reloj = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(reloj.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const hecho = (agente: string, nombre: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.17',
  _source: { '@timestamp': hora(horas), timestamp: hora(horas), id: `${Date.parse(hora(horas)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agente, name: nombre }, rule: { id: '100', groups: ['ENS'] }, data },
});

// Los hechos: op.exp.3 EV-04 (servicios en ejecución juzgados contra P-02, un
// parámetro POR SISTEMA) en 024 y 028; además controles que la configuración
// por sistema no toca, para ver que no se mueven.
const docs: FakeDoc[] = [];
const servicios: [string, string, string[]][] = [
  ['024', 'wazuh-real', ['ssh.service', 'telnet.service']],
  ['028', 'zimbraHldap', ['ssh.service', 'slapd.service']],
];
for (const [agente, nombre, lista] of servicios) {
  for (const h of [5, 1]) {
    docs.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
    lista.forEach(servicio =>
      docs.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: nombre, servicio, estado: 'CUMPLE' }, h - 0.01)));
  }
}
for (let i = 0; i < 60; i++) {
  docs.push(hecho(i % 3 ? '024' : '028', i % 3 ? 'wazuh-real' : 'zimbraHldap', { ensfacil: 'op.acc.3', event: 'account_action', usuario: `u${i % 7}`, funcion: i % 2 ? 'operacion' : 'desarrollo' }, 2 + i / 10));
}
for (const [a, nm] of [['024', 'wazuh-real'], ['028', 'zimbraHldap']]) docs.push(hecho(a, nm, { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'log_source_observed', fuente: '/var/log/syslog' }, 1));
docs.push(hecho('000', 'manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, 2));
docs.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', estado: 'CUMPLE' }, 2));

const monitor = (id: string, name: string, group: string[]): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group, status: 'active', timestamp: hora(0.1), manager: 'manager' },
});

// La organización autoriza ssh en wazuh-real (telnet no) y ssh + slapd en
// zimbraHldap. El valor propio de 024 autoriza además telnet.
const P02_ORGANIZACION = ['wazuh-real | ssh.service', 'zimbraHldap | ssh.service,slapd.service'];
const P02_DE_024 = ['wazuh-real | ssh.service,telnet.service'];
const copia = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const sinClave: any = (() => {
  const c: any = copia(defaultENSConfigurationTemplate);
  c.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
  c.updatedAt = '2026-10-14T10:00:00.000Z';
  c.controls.find((x: any) => x.controlId === 'op.exp.3').parameters.find((p: any) => p.id === 'P-02').value = P02_ORGANIZACION;
  return c;
})();
const conAgentes = (agents: unknown, sello: string) => ({ ...copia(sinClave), agents: copia(agents), updatedAt: sello });
const CON_024 = { '024': { name: 'wazuh-real', controls: { 'op.exp.3': { parameters: { 'P-02': P02_DE_024 } } } } };

const activo = (configuration: any, updatedAt: string): FakeDoc => ({
  _id: 'active', _index: 'wazuh-ens-configuration',
  _source: { documentType: 'ACTIVE_CONFIGURATION', configuration, updatedAt },
});
const indice = createFakeIndexer([
  ...docs,
  monitor('024', 'wazuh-real', ['ens']),
  monitor('028', 'zimbraHldap', ['ens']),
  activo(sinClave, sinClave.updatedAt),
], { clock: () => reloj.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
// El guardado escribe con `bulk` (historial + activo): lo justo para esta prueba.
(indice as any).bulk = async ({ body }: any) => {
  const lineas = String(body).split('\n').filter(Boolean).map(l => JSON.parse(l));
  for (let i = 0; i < lineas.length; i += 2) {
    const [op, meta] = Object.entries<any>(lineas[i])[0];
    const doc: FakeDoc = { _id: meta._id, _index: meta._index, _source: lineas[i + 1] };
    const j = indice.docs.findIndex(d => d._id === meta._id && d._index === meta._index);
    if (op === 'index' && j >= 0) indice.docs[j] = doc;
    else indice.docs.push(doc);
  }
  return { body: { errors: false, items: [] } };
};
const clientes = { asCurrentUser: indice, asInternalUser: indice };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
const ponActivo = (configuration: any) => {
  const j = indice.docs.findIndex(d => d._id === 'active');
  indice.docs[j] = activo(configuration, configuration.updatedAt);
};
const activoAhora = () => indice.docs.find(d => d._id === 'active')!._source.configuration;

// La referencia: el motor del navegador con todos los hechos y la
// configuración dada, para el conjunto y para cada máquina.
const AGENTES = ['000', '024', '028'];
const referencia = (configuration: any) => {
  ensConfigurationRepository.replaceActive(configuration);
  const todos = indice.docs
    .filter(d => d._index.startsWith('wazuh-alerts'))
    .sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || (a._source.id < b._source.id ? -1 : a._source.id > b._source.id ? 1 : 0));
  const inventario = inventoryFromMonitoring({ agentes: { buckets: ['024', '028'].map(id => ({ key: id, ultimo: { hits: { hits: [indice.docs.find(d => d._id === `m${id}`)] } } })) } }, reloj.getTime());
  const alcance = resolveENSScopeAgents(normalizeInventory(inventario.agents), configuration.scope);
  const eventos = normalizeWazuhAlerts(todos);
  const nivel = configuration.global.ensLevel;
  return {
    conjunto: getENSComplianceState(nivel, eventos, undefined, alcance, reloj),
    vistas: Object.fromEntries(AGENTES.map(a => [a, getENSComplianceState(nivel, eventos, a, alcance, reloj)])),
  };
};

// Lo que da el servidor (servicio nuevo, sin memoria) para una configuración.
type Toma = { conjunto: any; filas: Record<string, Record<string, any>>; vistas: Record<string, any[]> };
const filasDe = (state: any) => Object.fromEntries(state.agents.map((a: any) =>
  [a.agentId, Object.fromEntries(a.results.map((r: any) => [r.control.id, sinTraza(r)]))]));
const toma = async (servicio: ReturnType<typeof createEvaluationService>): Promise<Toma> => {
  const conjunto = (await servicio.run(clientes, { include: 'results', timeZone: 'UTC' })).state!;
  const vistas: Record<string, any[]> = {};
  for (const agente of AGENTES) {
    vistas[agente] = (await servicio.run(clientes, { include: 'results', agentId: agente, timeZone: 'UTC' })).state!.results.map(sinTraza);
  }
  return { conjunto, filas: filasDe(conjunto), vistas };
};
const evalua = async (configuration: any): Promise<Toma> => {
  ponActivo(configuration);
  return toma(createEvaluationService({ logger, securityEnabled: true, clock: () => reloj, firstResponseMs: 600000 }));
};
const identicas = (a: Toma, b: Toma) =>
  igual(a.conjunto.results.map(sinTraza), b.conjunto.results.map(sinTraza)) &&
  igual(a.conjunto.controlSummary, b.conjunto.controlSummary) &&
  igual(a.filas, b.filas) &&
  igual(a.vistas, b.vistas);
const ev04 = (r: any) => r?.evidences?.find((e: any) => e.id === 'EV-04')?.status;
const aplicado = (r: any) => r?.policyRuntime?.appliedParameters?.find((p: any) => p.id === 'P-02')?.value;

(async () => {
  console.log('1. Sin valores por sistema, lo mismo que sin la clave');
  const base = await evalua(sinClave);
  comprueba('el alcance de la prueba: 000, 024 y 028', igual(Object.keys(base.filas).sort(), AGENTES), Object.keys(base.filas));
  comprueba('sin la clave: igual que el motor sobre todos los hechos',
    igual(base.conjunto.results.map(sinTraza), referencia(sinClave).conjunto.results.map(sinTraza)));
  comprueba('sin la clave: 024 no cumple EV-04 (telnet no autorizado)', ev04(base.filas['024']['op.exp.3']) === 'NO_CUMPLE', ev04(base.filas['024']['op.exp.3']));
  comprueba('sin la clave: 028 cumple EV-04', ev04(base.filas['028']['op.exp.3']) === 'CUMPLE', ev04(base.filas['028']['op.exp.3']));
  const vacia = await evalua(conAgentes({}, '2026-10-15T10:00:00.000Z'));
  comprueba('`agents: {}`: idéntico a sin la clave (conjunto, filas y vistas)', identicas(vacia, base));
  const perfiles = await evalua(conAgentes({ '024': { name: 'wazuh-real', aliases: ['wazuh-real.lab'], templates: [], controls: {} }, '028': { name: 'zimbraHldap', controls: {} } }, '2026-10-15T11:00:00.000Z'));
  comprueba('perfiles sin valores: idéntico a sin la clave (conjunto, filas y vistas)', identicas(perfiles, base));

  console.log('2. 024 con su propio P-02 de op.exp.3');
  const configuracion024 = conAgentes(CON_024, '2026-10-15T12:00:00.000Z');
  const propia = await evalua(configuracion024);
  comprueba('la fila de 024 se evalúa con su valor', igual(aplicado(propia.filas['024']['op.exp.3']), P02_DE_024), aplicado(propia.filas['024']['op.exp.3']));
  comprueba('la de 028, con el de la organización', igual(aplicado(propia.filas['028']['op.exp.3']), P02_ORGANIZACION), aplicado(propia.filas['028']['op.exp.3']));
  comprueba('024 ahora cumple EV-04', ev04(propia.filas['024']['op.exp.3']) === 'CUMPLE', ev04(propia.filas['024']['op.exp.3']));
  const cambiadas = AGENTES.flatMap(a => Object.keys({ ...base.filas[a], ...propia.filas[a] })
    .filter(c => !igual(base.filas[a][c], propia.filas[a][c])).map(c => `${a}:${c}`));
  comprueba('solo cambia la fila de 024 en op.exp.3', igual(cambiadas, ['024:op.exp.3']), cambiadas);
  const consolidadas = propia.conjunto.results.filter((r: any, i: number) => !igual(sinTraza(r), sinTraza(base.conjunto.results[i]))).map((r: any) => r.control.id);
  comprueba('en el conjunto solo cambia la consolidación de op.exp.3', consolidadas.every((c: string) => c === 'op.exp.3'), consolidadas);
  comprueba('las vistas de 000 y 028, idénticas', igual(propia.vistas['000'], base.vistas['000']) && igual(propia.vistas['028'], base.vistas['028']));
  const vista024 = propia.vistas['024'].filter((r: any, i: number) => !igual(r, base.vistas['024'][i])).map((r: any) => r.control.id);
  comprueba('en la vista de 024 solo cambia op.exp.3', igual(vista024, ['op.exp.3']), vista024);
  const ref = referencia(configuracion024);
  comprueba('el conjunto, igual que el motor del navegador con esa configuración',
    igual(propia.conjunto.results.map(sinTraza), ref.conjunto.results.map(sinTraza)) && igual(propia.filas, filasDe(ref.conjunto)));
  comprueba('cada vista, igual que el motor del navegador', AGENTES.every(a => igual(propia.vistas[a], ref.vistas[a].results.map(sinTraza))));

  console.log('2b. La fila del manager evalúa con las UNIONES');
  // op.exp.7 se mide en el manager y su P-07 (por sistema) habla de otras
  // máquinas: en la fila del manager se evalúa la organización MÁS lo que
  // aporta cada agente; en la de 024 no hay fila de op.exp.7.
  const conUnion = conAgentes({ '024': { controls: { 'op.exp.7': { parameters: { 'P-07': ['wazuh-real | nóminas'] } } } } }, '2026-10-15T13:00:00.000Z');
  conUnion.controls.find((x: any) => x.controlId === 'op.exp.7').parameters.find((p: any) => p.id === 'P-07').value = ['srv-x | proveedores'];
  const union = await evalua(conUnion);
  const p07 = (r: any) => r?.policyRuntime?.appliedParameters?.find((p: any) => p.id === 'P-07')?.value;
  comprueba('manager: P-07 de op.exp.7 = organización + aportación de 024', igual(p07(union.filas['000']['op.exp.7']), ['srv-x | proveedores', 'wazuh-real | nóminas']), p07(union.filas['000']['op.exp.7']));
  const refUnion = referencia(conUnion);
  comprueba('igual que el motor del navegador con esa configuración', igual(union.filas, filasDe(refUnion.conjunto)) &&
    AGENTES.every(a => igual(union.vistas[a], refUnion.vistas[a].results.map(sinTraza))));

  console.log('3. Un guardado cambia la huella');
  ponActivo(sinClave);
  const servicio = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj, firstResponseMs: 600000 });
  const antes = await toma(servicio);
  comprueba('antes de guardar: lo de sin la clave', identicas(antes, base));
  comprueba('repetir no recalcula nada', (await servicio.run(clientes, { include: 'summary', timeZone: 'UTC' })).meta.stats.computed === 0);
  const h = createEvaluationHandlers({ logger, securityEnabled: true, service: servicio });
  const ctx = { core: { opensearch: { client: clientes } } };
  const resp = { ok: (r: any) => r.body, customError: (r: any) => ({ error: r }) };
  const sonda1: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  // Lo que manda la pantalla: el documento entero con el valor del agente.
  const guardado: any = await createConfigurationHandlers({ logger, securityEnabled: true })
    .save(ctx, { body: { configuration: { ...copia(activoAhora()), agents: copia(CON_024) }, changeReason: 'Valor propio de 024' } }, resp);
  comprueba('el guardado responde con la configuración', guardado?.statusCode === 200 && Boolean(guardado?.data?.configuration?.agents?.['024']), guardado);
  comprueba('y cambia la fecha del activo', activoAhora().updatedAt !== sinClave.updatedAt);
  const sonda2: any = await h.probe(ctx, { query: { timeZone: 'UTC' } }, resp);
  comprueba('la sonda ve el cambio (otra huella)', Boolean(sonda1?.data?.fingerprint) && sonda2?.data?.fingerprint !== sonda1.data.fingerprint);
  const tras = await servicio.run(clientes, { include: 'summary', timeZone: 'UTC' });
  comprueba('la evaluación siguiente recalcula', tras.meta.stats.computed > 0, tras.meta.stats.computed);
  const despues = await toma(servicio);
  const refGuardada = referencia(activoAhora());
  comprueba('y usa el documento guardado: 024 cumple EV-04', ev04(despues.filas['024']['op.exp.3']) === 'CUMPLE');
  comprueba('igual que el motor con el documento guardado', igual(despues.filas, filasDe(refGuardada.conjunto)) &&
    igual(despues.conjunto.results.map(sinTraza), refGuardada.conjunto.results.map(sinTraza)));

  fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
  process.exit(fallos.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
