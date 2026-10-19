/**
 * Cómo se resuelve un valor: agente → plantillas del agente → organización.
 *
 *   npx --yes tsx tests/agent-configuration-resolution.test.ts
 *
 *   1. Un parámetro resuelto en cada nivel, con su origen; un parámetro de
 *      organización nunca sale de un agente; plantillas en orden.
 *   2. UNIÓN en los controles que se miden en el manager y hablan de otras
 *      máquinas (op.exp.7 P-04/P-07, op.cont.3 P-07, op.mon.1 P-01; op.exp.8
 *      P-02 en la fila del manager) y en el alcance declarado de mp.info.6.
 *   3. PARIDAD: sin la clave `agents` (o con perfiles sin valores), la
 *      configuración que recibe el motor es EL MISMO objeto que hoy para cada
 *      control y cada fila, y los veredictos del motor son idénticos.
 *   4. El motor evalúa la fila de cada agente con SU valor.
 */
import { readFileSync, readdirSync } from 'fs';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import {
  isUnionParameter,
  resolveControlConfigurationForAgent,
  resolveControlConfigurationWithOrigins,
} from '../common/ens/configuration/agents/configuration-resolver';
import type { ENSConfigurationVersion } from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

// `kibana-services` de mentira, ANTES de cargar el motor.
{
  const Module = require('module');
  const cargar = Module._load;
  Module._load = function (peticion: string, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) return {};
    return cargar.call(this, peticion, ...resto);
  };
}

const { getENSComplianceState, getENSComplianceResultByControl } =
  require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');
const { getActiveControlConfiguration } =
  require('../common/ens/configuration/services/configuration-state-service') as typeof import('../common/ens/configuration/services/configuration-state-service');

const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`);
  if (!c) fallos.push(n);
};

// El documento tal como queda en el índice: los 23 bloques semilla, con
// valores de organización.
const CONFIG = `${__dirname}/../config`;
const bloques = readdirSync(CONFIG)
  .filter(f => f.endsWith('-control-block.json'))
  .map(f => JSON.parse(readFileSync(`${CONFIG}/${f}`, 'utf8')));
const conValores = (controlId: string, valores: Record<string, unknown>) => {
  const b = JSON.parse(JSON.stringify(bloques.find(x => x.controlId === controlId)));
  b.parameters.forEach((p: any) => {
    if (p.id in valores) p.value = valores[p.id];
  });
  return b;
};

// A 1.2.0 document: without the 1.3.0 `templates` key.
const base = (): ENSConfigurationVersion => ({
  ...defaultENSConfigurationTemplate,
  templates: undefined,
  controls: bloques.map(b => {
    if (b.controlId === 'op.acc.1') {
      return conValores('op.acc.1', {
        'P-01': 'Local',
        'P-04': ['admin', 'test'],
        'P-07': ['ana | srv-a | admin', 'luis | srv-b | admin'],
        'P-11': ['sudo'],
      });
    }
    if (b.controlId === 'op.exp.7') {
      return conValores('op.exp.7', { 'P-04': ['srv-x | R. Info | R. Serv'], 'P-07': ['srv-x | nóminas'] });
    }
    if (b.controlId === 'op.exp.8') {
      return conValores('op.exp.8', { 'P-02': ['srv-x | Ubuntu 24.04 | web'], 'P-12': 24 });
    }
    if (b.controlId === 'mp.info.6') {
      return conValores('mp.info.6', { 'P-01': 24, 'P-04': ['srv-a | ALTA'] });
    }
    return JSON.parse(JSON.stringify(b));
  }),
});

console.log('1. Niveles');
{
  const doc = {
    ...base(),
    agents: {
      '101': {
        templates: ['linux-ubuntu'],
        controls: {
          'op.acc.1': { parameters: { 'P-07': ['ana | srv-a | admin'], 'P-04': ['solo-para-este'] } },
        },
      },
      '102': { templates: ['zimbra-ldap', 'linux-ubuntu'] },
      '104': { controls: { 'op.acc.1': { parameters: { 'P-07': ['eva | srv-d | admin'] } } } },
      '105': { templates: ['linux-ubuntu'], controls: { 'op.acc.1': { parameters: { 'P-11': ['wheel'] } } } },
    },
  } as ENSConfigurationVersion;

  const r = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '101')!;
  const v = (id: string) => r.configuration.parameters.find(p => p.id === id)?.value;
  comprueba('valor del agente', JSON.stringify(v('P-07')) === '["ana | srv-a | admin"]' && r.origins['P-07'].source === 'agent', r.origins['P-07']);
  comprueba('valor de su plantilla', JSON.stringify(v('P-11')) === '["sudo","wheel","admin"]' && r.origins['P-11'].source === 'template' && r.origins['P-11'].templateId === 'linux-ubuntu', r.origins['P-11']);
  const r4 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '104')!;
  comprueba('valor de la organización: el que hay en la organización llega a la fila', JSON.stringify(r4.configuration.parameters.find(p => p.id === 'P-11')?.value) === '["sudo"]' && r4.origins['P-11'].source === 'organisation', r4.origins['P-11']);
  const r5 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '105')!;
  comprueba('valor propio y plantilla sobre el mismo parámetro: gana el propio', JSON.stringify(r5.configuration.parameters.find(p => p.id === 'P-11')?.value) === '["wheel"]' && r5.origins['P-11'].source === 'agent', r5.origins['P-11']);
  comprueba('y la plantilla sigue dando los demás', r5.origins['P-10'].source === 'template' && r5.configuration.parameters.find(p => p.id === 'P-10')?.value === 1000);
  comprueba('un parámetro de organización no sale del agente', JSON.stringify(v('P-04')) === '["admin","test"]' && r.origins['P-04'].source === 'organisation');
  const r2 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '102')!;
  comprueba('plantillas en orden: gana la primera que fija el parámetro', r2.configuration.parameters.find(p => p.id === 'P-01')?.value === 'LDAP' && r2.origins['P-01'].templateId === 'zimbra-ldap');
  const r3 = resolveControlConfigurationWithOrigins(doc, 'op.acc.1', '103')!;
  comprueba('un agente sin perfil: la organización, el mismo objeto', r3.configuration === doc.controls.find(c => c.controlId === 'op.acc.1'));
  const d24 = { ...doc, agents: { '024': doc.agents!['101'] } } as ENSConfigurationVersion;
  comprueba('el id se normaliza: la fila «24» es el agente 024', JSON.stringify(resolveControlConfigurationForAgent(d24, 'op.acc.1', '24')?.parameters.find(p => p.id === 'P-07')?.value) === '["ana | srv-a | admin"]');
  comprueba('el original no se toca', JSON.stringify(doc.controls.find(c => c.controlId === 'op.acc.1')!.parameters.find(p => p.id === 'P-07')!.value) === '["ana | srv-a | admin","luis | srv-b | admin"]');
  comprueba('control sin sembrar: undefined', resolveControlConfigurationWithOrigins({ ...doc, controls: [] }, 'op.acc.1', '101') === undefined);
}

console.log('2. Unión');
{
  const doc = {
    ...base(),
    agents: {
      '101': { controls: { 'op.exp.7': { parameters: { 'P-04': ['srv-a | A. Info | A. Serv'], 'P-07': ['srv-a | clientes', 'srv-x | nóminas'] } }, 'op.exp.8': { parameters: { 'P-02': ['srv-a | Ubuntu 22.04 | directorio'] } }, 'mp.info.6': { parameters: { 'P-04': ['srv-a | ALTA', 'srv-c | MEDIA'] } } } },
      '102': { controls: { 'op.exp.7': { parameters: { 'P-04': ['srv-b | B. Info | B. Serv'] } } } },
      '000': { controls: { 'op.exp.8': { parameters: { 'P-02': ['mgr | Ubuntu 22.04 | SIEM'] } } } },
    },
  } as ENSConfigurationVersion;

  comprueba('op.exp.7 P-04, op.exp.7 P-07, op.cont.3 P-07, op.mon.1 P-01: unión en el manager',
    ['op.exp.7|P-04', 'op.exp.7|P-07', 'op.cont.3|P-07', 'op.mon.1|P-01'].every(k => isUnionParameter(k.split('|')[0], k.split('|')[1], '000')));
  comprueba('op.exp.8 P-02: unión en la fila del manager, herencia en la de un agente', isUnionParameter('op.exp.8', 'P-02', '000') && !isUnionParameter('op.exp.8', 'P-02', '101'));
  comprueba('mp.info.6 P-04 (alcance declarado): unión en cualquier fila', isUnionParameter('mp.info.6', 'P-04', '101') && isUnionParameter('mp.info.6', 'P-04'));
  comprueba('un parámetro de organización nunca', !isUnionParameter('op.exp.7', 'P-01', '000'));

  const m = resolveControlConfigurationWithOrigins(doc, 'op.exp.7', '000')!;
  const p04 = m.configuration.parameters.find(p => p.id === 'P-04')!.value;
  comprueba('fila del manager: organización + cada agente', JSON.stringify(p04) === JSON.stringify(['srv-x | R. Info | R. Serv', 'srv-a | A. Info | A. Serv', 'srv-b | B. Info | B. Serv']), p04);
  comprueba('con quién aporta', JSON.stringify(m.origins['P-04']) === JSON.stringify({ source: 'union', contributors: ['101', '102'] }), m.origins['P-04']);
  const p07 = m.configuration.parameters.find(p => p.id === 'P-07')!.value;
  comprueba('sin repetir filas', JSON.stringify(p07) === JSON.stringify(['srv-x | nóminas', 'srv-a | clientes']), p07);
  const sinFila = resolveControlConfigurationForAgent(doc, 'op.exp.7');
  comprueba('la vista de organización hace la misma unión', JSON.stringify(sinFila?.parameters.find(p => p.id === 'P-04')?.value) === JSON.stringify(p04));
  const e8m = resolveControlConfigurationForAgent(doc, 'op.exp.8', '000')!.parameters.find(p => p.id === 'P-02')!.value;
  comprueba('op.exp.8 P-02 en el manager: todos los servidores, también el suyo', JSON.stringify(e8m) === JSON.stringify(['srv-x | Ubuntu 24.04 | web', 'mgr | Ubuntu 22.04 | SIEM', 'srv-a | Ubuntu 22.04 | directorio']), e8m);
  const e8a = resolveControlConfigurationForAgent(doc, 'op.exp.8', '101')!.parameters.find(p => p.id === 'P-02')!.value;
  comprueba('op.exp.8 P-02 en la fila del agente: el suyo', JSON.stringify(e8a) === JSON.stringify(['srv-a | Ubuntu 22.04 | directorio']), e8a);
  const mp = resolveControlConfigurationForAgent(doc, 'mp.info.6', '102')!.parameters.find(p => p.id === 'P-04')!.value;
  comprueba('mp.info.6 P-04: el alcance declarado junta a todos', JSON.stringify(mp) === JSON.stringify(['srv-a | ALTA', 'srv-c | MEDIA']), mp);
  const vacio = { ...base(), agents: { '101': {} } } as ENSConfigurationVersion;
  const tabla = resolveControlConfigurationWithOrigins(vacio, 'op.exp.7', '000')!;
  comprueba('sin aportes: el mismo objeto', tabla.configuration === vacio.controls.find(c => c.controlId === 'op.exp.7') && tabla.origins['P-04'].source === 'organisation');
}

console.log('3. Paridad');
{
  const doc = base();
  const filas = [undefined, '000', '101', '102'];
  const distintos: string[] = [];
  const variantes: [string, ENSConfigurationVersion][] = [
    ['sin agents', doc],
    ['agents vacío', { ...doc, agents: {} }],
    ['perfiles sin valores ni plantillas', { ...doc, agents: { '101': { name: 'srv-a', detectedType: 'linux', detectedBy: 'os.platform = ubuntu', aliases: ['srv-a.example.com'] }, '000': { typeOverride: 'manager' } } }],
  ];
  variantes.forEach(([nombre, d]) => {
    d.controls.forEach(c => {
      filas.forEach(f => {
        if (resolveControlConfigurationForAgent(d, c.controlId, f) !== c) distintos.push(`${nombre}: ${c.controlId} ${f}`);
      });
    });
  });
  comprueba('23 controles × 4 filas × 3 variantes: el motor recibe el MISMO objeto que hoy', distintos.length === 0, distintos.slice(0, 5));

  // Y el motor de verdad: mismos hechos, mismo resultado entero.
  const AHORA = new Date('2026-10-17T10:00:00Z');
  const agentes: ENSAgentScope[] = [
    { id: '000', name: 'mgr', groups: [], isManager: true },
    { id: '101', name: 'srv-a', groups: ['ens'] },
    { id: '102', name: 'srv-b', groups: ['ens'] },
  ];
  const ev = (agentId: string, agentName: string, controlId: string, eventType: string, status: string, extra: any = {}): ENSNormalizedEvent => ({
    id: `${agentId}-${controlId}-${eventType}`, agentId, agentName, controlId, eventType, sourceType: 'WAZUH_ALERT', status,
    timestamp: new Date(AHORA.getTime() - 3600_000).toISOString(), tool: 'ENSFácil', ruleId: '0', ...extra,
  } as any);
  const hechos = [
    ev('101', 'srv-a', 'mp.info.6', 'backup_ok', 'CUMPLE'),
    ev('102', 'srv-b', 'mp.info.6', 'backup_ok', 'CUMPLE'),
    ev('101', 'srv-a', 'op.acc.1', 'identity_inventory', 'CUMPLE'),
    ev('000', 'mgr', 'op.exp.7', 'incident_register_read', 'CUMPLE'),
  ];
  const sinInstante = (v: unknown) => JSON.stringify(v, (k, x) => (k === 'evaluatedAt' ? undefined : x));
  const resultados = variantes.map(([, d]) => {
    ensConfigurationRepository.replaceActive(d);
    return sinInstante(getENSComplianceState('MEDIO', hechos, undefined, agentes, AHORA));
  });
  comprueba('getENSComplianceState idéntico con y sin agents', resultados[0] === resultados[1] && resultados[0] === resultados[2]);
  const porFila = variantes.map(([, d]) => {
    ensConfigurationRepository.replaceActive(d);
    return sinInstante(['mp.info.6', 'op.acc.1', 'op.exp.7', 'op.exp.8'].map(c => getENSComplianceResultByControl(c, 'MEDIO', hechos, '101', agentes, AHORA)));
  });
  comprueba('y el resultado por control en la vista de una máquina', porFila[0] === porFila[1] && porFila[0] === porFila[2]);
}

console.log('4. El motor usa el valor de la fila');
{
  const doc = {
    ...base(),
    agents: {
      '101': { controls: { 'op.acc.1': { parameters: { 'P-07': ['ana | srv-a | admin'] } } } },
      '102': { templates: ['zimbra-ldap'] },
    },
  } as ENSConfigurationVersion;
  ensConfigurationRepository.replaceActive(doc);
  comprueba('getActiveControlConfiguration(control, agente) resuelve', JSON.stringify(getActiveControlConfiguration('op.acc.1', '101')?.parameters.find(p => p.id === 'P-07')?.value) === '["ana | srv-a | admin"]');
  comprueba('y sin agente, la organización', getActiveControlConfiguration('op.acc.1') === doc.controls.find(c => c.controlId === 'op.acc.1'));
  const agentes: ENSAgentScope[] = [{ id: '101', name: 'srv-a', groups: ['ens'] }, { id: '102', name: 'srv-b', groups: ['ens'] }];
  const aplicado = (agentId: string, id: string) =>
    getENSComplianceResultByControl('op.acc.1', 'MEDIO', [], agentId, agentes, new Date('2026-10-17T10:00:00Z'))
      ?.policyRuntime?.appliedParameters.find(p => p.id === id)?.value;
  comprueba('fila 101: P-07 del agente', JSON.stringify(aplicado('101', 'P-07')) === '["ana | srv-a | admin"]', aplicado('101', 'P-07'));
  comprueba('fila 102: P-07 de la organización', JSON.stringify(aplicado('102', 'P-07')) === '["ana | srv-a | admin","luis | srv-b | admin"]', aplicado('102', 'P-07'));
  comprueba('fila 102: P-01 de su plantilla LDAP', aplicado('102', 'P-01') === 'LDAP', aplicado('102', 'P-01'));
  comprueba('fila 101: P-01 de la organización', aplicado('101', 'P-01') === 'Local', aplicado('101', 'P-01'));
}

// Sobre hechos REALES de 30 días, si se pasan (nunca se suben al repositorio):
//   ENSFACIL_GOLDEN_FACTS=facts.jsonl ENSFACIL_GOLDEN_DOC=active.json \
//   ENSFACIL_GOLDEN_INVENTORY=inventory.json [ENSFACIL_GOLDEN_AT=2026-10-17T16:11:25Z]
// `facts.jsonl`, un hit de wazuh-alerts-* por línea; `inventory.json`, la
// búsqueda del inventario de wazuh-monitoring-*. El estado ENTERO (23 controles,
// todas las filas, veredictos, requisitos y evidencias) tiene que salir idéntico
// sin agents y con perfiles sin valores.
const GF = (process as any).env?.ENSFACIL_GOLDEN_FACTS;
const GD = (process as any).env?.ENSFACIL_GOLDEN_DOC;
const GI = (process as any).env?.ENSFACIL_GOLDEN_INVENTORY;
if (GF && GD && GI) {
  console.log('5. Hechos reales');
  const { readFileSync: leer } = require('fs');
  const { normalizeWazuhAlert } = require('../common/ens/core/data-source/data-source-engine');
  const { inventoryFromMonitoring } = require('../common/agents/agent-inventory');
  const { resolveENSScopeAgents } = require('../common/ens/core/scope/runtime');
  const real = JSON.parse(leer(GD, 'utf8'));
  const config = real._source ? real._source.configuration : real.configuration || real;
  const instante = new Date((process as any).env?.ENSFACIL_GOLDEN_AT || Date.now());
  const inv = inventoryFromMonitoring(JSON.parse(leer(GI, 'utf8')).aggregations, instante.getTime()).agents;
  const alcance = resolveENSScopeAgents(inv, config.scope);
  const hechos = String(leer(GF, 'utf8')).split('\n').filter(Boolean).map((l: string) => normalizeWazuhAlert(JSON.parse(l)));
  const estado = (d: any) => {
    ensConfigurationRepository.replaceActive(d);
    return JSON.stringify(getENSComplianceState(d.global.ensLevel, hechos, undefined, alcance, instante), (k, x) => (k === 'evaluatedAt' ? undefined : x));
  };
  const sin = estado(config);
  const conPerfiles = estado({ ...config, agents: Object.fromEntries(alcance.map((a: any) => [a.id, { name: a.name, detectedType: 'linux', aliases: ['x.example.com'] }])) });
  console.log(`    ${hechos.length} hechos, ${alcance.length} filas, estado de ${sin.length} bytes`);
  comprueba('hechos reales: el estado entero es idéntico sin agents y con perfiles sin valores', sin === conPerfiles);
}

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
