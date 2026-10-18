/**
 * El servidor evalúa control a control (sus hechos y los de presencia) y arma
 * el estado después. Tiene que dar EXACTAMENTE lo mismo que el motor sobre
 * todos los hechos a la vez: estado del panel (conjunto y cada máquina, con
 * sus filas) y resultado de cada control.
 *
 *   npx --yes tsx tests/control-partition.test.ts
 *
 * Y sin los hechos de presencia NO da lo mismo: op.mon.3 sabe en qué fila
 * está por los hechos de cualquier control (ver `control-partition.ts`).
 */
import * as fs from 'fs';
import * as path from 'path';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { ENSCatalog } from '../common/ens/catalog';
import {
  getENSComplianceResultByControl,
  getENSComplianceState,
} from '../common/ens/core/ens-engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import {
  assembleENSComplianceState,
  buildENSPresenceEvents,
  evaluateENSControlPartition,
} from '../common/ens/core/control-partition';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`); if (!c) fallos.push(n); };

// JSON estable y sin los instantes de cálculo (`evaluatedAt`).
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt').map(k => [k, canon(v[k])])) : v;
const igual = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

ensConfigurationRepository.replaceActive(defaultENSConfigurationTemplate as any);
const nivel = (defaultENSConfigurationTemplate as any).global.ensLevel;
const AHORA = new Date('2026-10-17T12:00:00Z');
const alcance: ENSAgentScope[] = [
  { id: '000', name: 'manager', groups: [] },
  { id: '024', name: 'wazuh-real', groups: ['ens'] },
  { id: '028', name: 'zimbraHldap', groups: ['ens'] },
];
const hora = (h: number) => new Date(AHORA.getTime() - h * 3600 * 1000).toISOString();
let n = 0;
const hecho = (agente: string, nombre: string, data: Record<string, unknown>, horas: number) => ({
  _id: `h${++n}`,
  _source: { '@timestamp': hora(horas), timestamp: hora(horas), agent: { id: agente, name: nombre }, rule: { id: '100', groups: ['ENS'] }, data },
});

const hits: any[] = [];
// mp.info.6 en 024: el lote real de la prueba de restauración.
for (const linea of fs.readFileSync(path.join(__dirname, 'fixtures/mp-info-6-pbs-pass.ndjson'), 'utf8').split('\n').filter(Boolean)) {
  const data = JSON.parse(linea);
  hits.push(hecho('024', 'wazuh-real', data, 3));
}
// op.exp.3: estado (`service_running`) en varias pasadas con su latido.
for (const h of [30, 20, 10, 2]) {
  hits.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03' }, h));
  hits.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-02', servicio: h > 10 ? 'telnet' : 'sshd', estado: 'CUMPLE' }, h - 0.01));
}
// op.acc.3: acciones en 024 y en 028 (028 no tiene ningún hecho de op.mon.3).
for (const [agente, nombre] of [['024', 'wazuh-real'], ['028', 'zimbraHldap']]) {
  hits.push(hecho(agente, nombre, { ensfacil: 'op.acc.3', event: 'collector_run' }, 1));
  hits.push(hecho(agente, nombre, { ensfacil: 'op.acc.3', event: 'account_action', usuario: 'ana', funcion: 'operacion' }, 5));
}
// op.mon.3: el manager y el agente 024.
hits.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
hits.push(hecho('000', 'manager', { ensfacil: 'op.mon.3', event: 'log_source_observed', fuente: '/var/log/syslog' }, 1));
hits.push(hecho('024', 'wazuh-real', { ensfacil: 'op.mon.3', event: 'collector_run' }, 1));
// op.exp.7 (solo manager) y op.exp.8 (los dos planos).
hits.push(hecho('000', 'manager', { ensfacil: 'op.exp.7', event: 'collector_run' }, 2));
hits.push(hecho('000', 'manager', { ensfacil: 'op.exp.8', event: 'collector_run' }, 2));
hits.push(hecho('024', 'wazuh-real', { ensfacil: 'op.exp.8', event: 'audit_log_status', evidence_id: 'EV-01', estado: 'CUMPLE' }, 2));

// Como los lee el navegador: del más reciente al más antiguo.
hits.sort((a, b) => b._source['@timestamp'].localeCompare(a._source['@timestamp']) || a._id.localeCompare(b._id));
const todos = normalizeWazuhAlerts(hits);
const controles = ENSCatalog.map(c => c.id);
const deControl = (c: string) => normalizeWazuhAlerts(hits.filter(h => h._source.data.ensfacil === c));

// Presencia: el primer hecho de cada máquina en la ventana.
const primero = new Map<string, any>();
for (const h of hits) primero.set(h._source.agent.id, h);
const presencia = buildENSPresenceEvents([...primero.values()].map(h => ({ agentId: h._source.agent.id, agentName: h._source.agent.name, earliest: h._source['@timestamp'] })), 'UTC');

for (const vista of [undefined, '000', '024', '028']) {
  const etiqueta = vista || 'conjunto';
  const referencia = getENSComplianceState(nivel, todos, vista, alcance, AHORA);
  const particiones = controles.map(c => evaluateENSControlPartition(c, nivel, [...deControl(c), ...presencia], vista, alcance, AHORA));
  const armado = assembleENSComplianceState(particiones, vista, alcance, []);
  comprueba(`${etiqueta}: el estado armado control a control es el del motor sobre todo`, igual(armado, referencia),
    referencia.results.filter((r, i) => !igual(r, armado.results[i])).map(r => r.control.id));
  comprueba(`${etiqueta}: mismas máquinas y mismas filas`, igual(armado.agents, referencia.agents));
  const distintos = controles.filter(c => !igual(
    particiones.find(p => p.controlId === c)!.result,
    getENSComplianceResultByControl(c, nivel, todos, vista, alcance, AHORA)
  ));
  comprueba(`${etiqueta}: cada control, igual que la ficha sobre todos los hechos`, distintos.length === 0, distintos);
}

// Sin presencia, la fila de 028 en op.mon.3 no sabe que la máquina existe.
const sinPresencia = evaluateENSControlPartition('op.mon.3', nivel, deControl('op.mon.3'), '028', alcance, AHORA).result;
const conTodo = getENSComplianceResultByControl('op.mon.3', nivel, todos, '028', alcance, AHORA);
comprueba('sin presencia op.mon.3 en 028 cambia (por eso existe)', !igual(sinPresencia, conTodo));

// La presencia no es un hecho de ningún control: no aparece en la trazabilidad.
const ref024 = getENSComplianceState(nivel, todos, '024', alcance, AHORA);
comprueba('la presencia no entra en la trazabilidad', !JSON.stringify(ref024).includes('agent_presence') &&
  !JSON.stringify(assembleENSComplianceState(controles.map(c => evaluateENSControlPartition(c, nivel, [...deControl(c), ...presencia], '024', alcance, AHORA)), '024', alcance)).includes('agent_presence'));

fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
process.exit(fallos.length ? 1 : 0);
