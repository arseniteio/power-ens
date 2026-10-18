/**
 * Lo que la ruta de evaluación añade para las vistas generales (1.2.0, Task 2):
 *
 *   npx --yes tsx tests/evaluation-overview.test.ts
 *
 *   1. `include=summary`: cada máquina con el resumen de cada control EN SU
 *      FILA (`agents[].controls`), igual que la vista de esa máquina; los que
 *      no se miden en ella no aparecen.
 *   2. `include=overview`: lo mismo + la frescura de la recogida (de la sonda,
 *      sin lecturas nuevas) + las no conformidades de la vista de conjunto con
 *      su control (la cola de trabajo).
 *   3. La serie (`timelineDays`) en `summary`, con el estado de cada control
 *      cada día; el último punto es el resultado de arriba.
 *   4. La vista se acepta en la petición; ninguna lectura de hechos de más.
 */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService, normalizeQuery } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse, controlSummaryOf } from '../server/lib/evaluation/responses';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) fallos.push(n);
};

const reloj = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(reloj.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const hecho = (agente: string, nombre: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: 'wazuh-alerts-4.x-2026.10.17',
  _source: { '@timestamp': hora(horas), timestamp: hora(horas), id: `${Date.parse(hora(horas)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agente, name: nombre }, rule: { id: '100', groups: ['ENS'] }, data },
});
const docs: FakeDoc[] = [];
for (const [agente, nombre, lista] of [['101', 'srv-web01', ['ssh.service', 'telnet.service']], ['102', 'ldap01', ['ssh.service']]] as [string, string, string[]][]) {
  for (const h of [50, 5, 1]) {
    docs.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
    lista.forEach(servicio => docs.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: nombre, servicio, estado: 'CUMPLE' }, h - 0.01)));
  }
}
// 102 deja de enviar op.acc.3 hace 40 h (frescura).
docs.push(hecho('101', 'srv-web01', { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
docs.push(hecho('102', 'ldap01', { ensfacil: 'op.acc.3', event: 'collector_run' }, 40));
docs.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
docs.push(hecho('000', 'manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, 2));
const monitor = (id: string, name: string): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group: ['ens'], status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
const configuracion: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
configuracion.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
configuracion.updatedAt = '2026-10-14T10:00:00.000Z';
configuracion.controls.find((x: any) => x.controlId === 'op.exp.3').parameters.find((p: any) => p.id === 'P-02').value = ['srv-web01 | ssh.service', 'ldap01 | ssh.service'];
const indice = createFakeIndexer([
  ...docs,
  monitor('101', 'srv-web01'),
  monitor('102', 'ldap01'),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuracion, updatedAt: configuracion.updatedAt } },
], { clock: () => reloj.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
const clientes = { asCurrentUser: indice, asInternalUser: indice };
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };

(async () => {
  const servicio = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
  const pide = async (q: any) => buildEvaluationResponse(await servicio.run(clientes, { timeZone: 'UTC', ...q })) as any;

  console.log('1. Cada máquina, cada control en su fila');
  const resumen = await pide({ include: 'summary' });
  const maquinas = (resumen.agents || []).map((a: any) => a.agentId).sort();
  comprueba('summary trae las máquinas del alcance (000, 101, 102)', JSON.stringify(maquinas) === JSON.stringify(['000', '101', '102']), maquinas);
  comprueba('cada una con `controls` (estado, número, no conformidades)', resumen.agents.every((a: any) => Array.isArray(a.controls) && a.controls.every((c: any) => 'status' in c && 'requirementsNotMet' in c)));
  const de = (id: string) => resumen.agents.find((a: any) => a.agentId === id).controls.map((c: any) => c.controlId);
  comprueba('101: los de plano agent (op.acc.1, op.exp.3…), ninguno solo de manager', de('101').includes('op.acc.1') && de('101').includes('op.exp.3') && !de('101').includes('op.exp.7'), de('101'));
  comprueba('000: solo los que se miden en el manager', de('000').includes('op.exp.7') && !de('000').includes('op.acc.1'), de('000'));
  for (const agente of ['101', '102', '000']) {
    const vista = await pide({ include: 'summary', agentId: agente });
    const propios = resumen.agents.find((a: any) => a.agentId === agente).controls;
    const iguales = propios.every((c: any) => {
      const v = vista.controls.find((x: any) => x.controlId === c.controlId);
      return v && v.status === c.status && v.score === c.score && v.requirementsNotMet === c.requirementsNotMet && v.requirementsNotEvidenced === c.requirementsNotEvidenced;
    });
    comprueba(`${agente}: lo de su fila es lo que da la vista de esa máquina`, iguales);
  }
  const run = await servicio.run(clientes, { include: 'summary', timeZone: 'UTC' });
  comprueba('es `controlSummaryOf` del resultado de la fila', JSON.stringify(resumen.agents.map((a: any) => a.controls)) ===
    JSON.stringify(run.state!.agents.map(a => a.results.map(r => controlSummaryOf(r.control.id, r)))));

  console.log('2. overview');
  const general = await pide({ include: 'overview' });
  comprueba('lo mismo que summary en controles y máquinas', JSON.stringify(general.controls) === JSON.stringify(resumen.controls) && JSON.stringify(general.agents) === JSON.stringify(resumen.agents));
  const celda = (c: string, a: string) => general.freshness.cells.find((x: any) => x.controlId === c && x.agentId === a);
  const cuenta = (c: string, a: string) => docs.filter(d => d._source.data.ensfacil === c && d._source.agent.id === a).length;
  const ultimo = (c: string, a: string) => docs.filter(d => d._source.data.ensfacil === c && d._source.agent.id === a).map(d => d._source['@timestamp']).sort().pop();
  comprueba('frescura por control y máquina: recuento y último hecho', [['op.exp.3', '101'], ['op.exp.3', '102'], ['op.acc.3', '102'], ['op.mon.3', '000']].every(([c, a]) =>
    celda(c, a)?.count === cuenta(c, a) && Date.parse(celda(c, a)?.newest) === Date.parse(ultimo(c, a)!)), general.freshness.cells);
  comprueba('op.acc.3 en 102: último hecho hace 40 h', Date.parse(celda('op.acc.3', '102').newest) === Date.parse(hora(40)));
  comprueba('sin hechos, sin celda (op.acc.1 en 101)', !celda('op.acc.1', '101'));
  const a101 = general.freshness.agents.find((a: any) => a.agentId === '101');
  comprueba('por máquina: recuento, primero, último y último latido', a101.count === docs.filter(d => d._source.agent.id === '101').length && Date.parse(a101.newest) === Date.parse(hora(1 - 0.01)) && Date.parse(a101.lastHeartbeat) === Date.parse(hora(1)), a101);
  comprueba('las máquinas de la frescura son las del alcance', general.freshness.agents.map((a: any) => a.agentId).sort().join() === '000,101,102');
  const ncs = run.state!.results.reduce((t, r) => t + (r.nonConformities || []).length, 0);
  comprueba('la cola: todas las no conformidades de la vista de conjunto, con su control', general.nonConformities.length === ncs && ncs > 0 &&
    general.nonConformities.every((x: any) => x.controlId && x.requirementId && x.finding && Array.isArray(x.agents) && Array.isArray(x.parameterIds)), { ncs, n: general.nonConformities.length });
  comprueba('compacta: sin evidencias ni trazas', !JSON.stringify(general).includes('"traceability"') && !JSON.stringify(general).includes('"evidences"'));

  console.log('3. La serie en summary, con cada control');
  const serie = await pide({ include: 'summary', timelineDays: 3 });
  comprueba('trae `timeline`', Array.isArray(serie.timeline) && serie.timeline.length > 1, serie.timeline?.length);
  const hoy = serie.timeline[serie.timeline.length - 1];
  comprueba('el último punto es el de ahora, con cada control como arriba', hoy.isCurrent &&
    serie.controls.every((c: any) => hoy.controls[c.controlId]?.status === c.status && hoy.controls[c.controlId]?.score === c.score), hoy);
  comprueba('los días pasados también traen cada control', serie.timeline.slice(0, -1).every((p: any) => p.controls && Object.keys(p.controls).length > 0));
  comprueba('sin `timelineDays`, sin serie', resumen.timeline === undefined);

  console.log('4. La petición');
  comprueba('overview es una vista válida', normalizeQuery({ include: 'overview' }).include === 'overview');
  let rechaza = false;
  try { normalizeQuery({ include: 'nada' }); } catch (e) { rechaza = (e as any).statusCode === 400; }
  comprueba('una vista desconocida, 400', rechaza);
  const run2 = await servicio.run(clientes, { include: 'overview', timeZone: 'UTC' });
  comprueba('la vista general, con todo en memoria, no calcula ninguna fila', run2.meta.stats.computed === 0, run2.meta.stats);

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
