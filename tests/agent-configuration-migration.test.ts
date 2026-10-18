/**
 * Migración a sistemas sin pérdida.
 *
 *   npx --yes tsx tests/agent-configuration-migration.test.ts
 *
 * Con un documento como el de un laboratorio real (la misma máquina nombrada de
 * tres maneras: su nombre de agente, su hostname y su hostname corto):
 *
 *   1. las filas de las tablas con columna de sistema que casan con un agente
 *      pasan a ese agente; las que no, se quedan en la organización y se avisan;
 *      las `*` se quedan y se copian al agente con filas propias;
 *   2. ninguna fila se pierde: organización + agentes = lo que había;
 *   3. idempotente, sin tocar el original, y el documento sigue siendo válido;
 *   4. lo que ve cada fila después es lo suyo, y la fila del manager ve en la
 *      unión lo mismo que antes.
 *
 * También sobre una copia real, si se le pasa (nunca se sube al repositorio):
 *
 *   ENSFACIL_LAB_DOC=active.json ENSFACIL_LAB_MONITORING=monitoring.json \
 *     npx --yes tsx tests/agent-configuration-migration.test.ts
 *
 * `active.json` es `GET wazuh-ens-configuration/_doc/active`; `monitoring.json`,
 * la búsqueda del inventario de `wazuh-monitoring-*` (agregación `agentes`).
 */
import { readFileSync, readdirSync } from 'fs';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import {
  describeMigrationWarning,
  planMigrationToSystems,
  summarizeMigrationPlan,
} from '../common/ens/configuration/agents/migration';
import { resolveControlConfigurationForAgent, rowKey } from '../common/ens/configuration/agents/configuration-resolver';
import { ENS_SYSTEM_KEY_COLUMNS } from '../common/ens/configuration/agents/parameter-classes';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateAgentsConfiguration } from '../common/ens/configuration/agents/agent-configuration-validator';
import { toParameterTableRows } from '../common/ens/configuration/services/parameter-value-validator';
import { inventoryFromMonitoring } from '../common/agents/agent-inventory';
import type { ENSConfigurationVersion } from '../common/ens/configuration/types';
import type { ENSAgentScope } from '../common/ens/core/scope/types';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const __dirname: string;
declare const require: (id: string) => any;

// `kibana-services` de mentira, por si se carga el motor (copia real).
{
  const Module = require('module');
  const cargar = Module._load;
  Module._load = function (peticion: string, ...resto: unknown[]) {
    if (/kibana-services$/.test(peticion)) return {};
    return cargar.call(this, peticion, ...resto);
  };
}
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`);
  if (!c) fallos.push(n);
};

const CONFIG = `${__dirname}/../config`;
const bloques = readdirSync(CONFIG)
  .filter(f => f.endsWith('-control-block.json'))
  .map(f => JSON.parse(readFileSync(`${CONFIG}/${f}`, 'utf8')));
const conValores = (controlId: string, valores: Record<string, unknown>) => {
  const b = JSON.parse(JSON.stringify(bloques.find(x => x.controlId === controlId)));
  b.parameters.forEach((p: any) => { if (p.id in valores) p.value = valores[p.id]; });
  return b;
};

// La forma de un documento real: la máquina del directorio aparece como
// `dir01.example.com` (hostname), `dir01` (hostname corto) y `dirHost` (nombre
// del agente); el manager por su nombre; una fila `*` y una fila sin agente.
const doc: ENSConfigurationVersion = {
  ...defaultENSConfigurationTemplate,
  controls: [
    conValores('op.acc.1', {
      'P-01': 'Local',
      'P-07': ['Ana | web01 | Administrador', 'ana | web01 | Administrador', 'svc | dir01.example.com | Cuenta de servicio', 'root | DIR01.example.com | Cuenta de sistema', 'eva | srv-sin-agente | Administradora'],
    }),
    conValores('op.exp.1', { 'P-06': ['dir01 | alta | directorio'] }),
    conValores('op.exp.4', { 'P-04': ['* | * 06:00-08:00'], 'P-09': ['web01 | 1.0 | anual', 'dir01 | 2.0 | anual'] }),
    conValores('op.exp.7', { 'P-07': ['dirHost | directorio de usuarios'] }),
    conValores('op.exp.8', { 'P-02': ['web01 | Ubuntu 24.04 | servidor', 'mgr-01 | Ubuntu 22.04 | SIEM', 'dirHost | Ubuntu 22.04 | directorio'] }),
    conValores('op.exp.2', { 'P-04': ['ninguno | ninguna | Sin excepciones autorizadas |  | '] }),
    conValores('mp.info.6', { 'P-04': ['web01 | MEDIA'] }),
  ],
};
const inventario: ENSAgentScope[] = [
  { id: '000', name: 'mgr-01', groups: [] },
  { id: '101', name: 'web01', groups: ['ens'], os: { platform: 'ubuntu', uname: 'Linux |web01 |6.8 |x86_64' } },
  { id: '102', name: 'dirHost', groups: ['ens'], os: { platform: 'ubuntu', uname: 'Linux |dir01.example.com |6.8 |x86_64' } },
  { id: '103', name: 'win01', groups: ['ens'], os: { platform: 'windows' } },
];

const original = JSON.stringify(doc);
const plan = planMigrationToSystems(doc, inventario, { scopeAgentIds: ['000', '101', '102', '103'] });
const m = plan.configuration;
const valor = (d: ENSConfigurationVersion, c: string, p: string) => d.controls.find(x => x.controlId === c)?.parameters.find(x => x.id === p)?.value;
const propio = (d: ENSConfigurationVersion, a: string, c: string, p: string) => d.agents?.[a]?.controls?.[c]?.parameters?.[p];

console.log('1. Reparto');
{
  comprueba('hay cambios', plan.changed);
  comprueba('la misma máquina por su hostname, en mayúsculas o no: al agente 102', JSON.stringify(propio(m, '102', 'op.acc.1', 'P-07')) === JSON.stringify(['svc | dir01.example.com | Cuenta de servicio', 'root | DIR01.example.com | Cuenta de sistema']), propio(m, '102', 'op.acc.1', 'P-07'));
  comprueba('por su hostname corto', JSON.stringify(propio(m, '102', 'op.exp.1', 'P-06')) === JSON.stringify(['dir01 | alta | directorio']));
  comprueba('por su nombre de agente', JSON.stringify(propio(m, '102', 'op.exp.7', 'P-07')) === JSON.stringify(['dirHost | directorio de usuarios']));
  comprueba('el manager por su nombre', JSON.stringify(propio(m, '000', 'op.exp.8', 'P-02')) === JSON.stringify(['mgr-01 | Ubuntu 22.04 | SIEM']));
  comprueba('lo que no casa se queda en la organización', JSON.stringify(valor(m, 'op.acc.1', 'P-07')) === JSON.stringify(['eva | srv-sin-agente | Administradora']));
  comprueba('y se avisa', plan.warnings.some(w => w.key === 'srv-sin-agente' && w.reason === 'sin-agente'), plan.warnings);
  comprueba('el aviso se lee', /srv-sin-agente.*no es ningún agente conocido; se queda en la organización/.test(describeMigrationWarning(plan.warnings[0])), describeMigrationWarning(plan.warnings[0]));
  comprueba('una tabla sin filas propias no se toca (op.exp.2 P-04)', JSON.stringify(valor(m, 'op.exp.2', 'P-04')) === JSON.stringify(valor(doc, 'op.exp.2', 'P-04')));
  comprueba('la fila * se queda en la organización…', JSON.stringify(valor(m, 'op.exp.4', 'P-04')) === JSON.stringify(['* | * 06:00-08:00']));
  comprueba('… y las listas de alcance no se tocan (mp.info.6 P-04)', JSON.stringify(valor(m, 'mp.info.6', 'P-04')) === JSON.stringify(['web01 | MEDIA']));
  comprueba('sin filas en la organización: la clave value desaparece (nunca null)', !('value' in m.controls.find(x => x.controlId === 'op.exp.1')!.parameters.find(x => x.id === 'P-06')!));
  comprueba('el perfil nuevo guarda el nombre y el hostname como alias', m.agents?.['102']?.name === 'dirHost' && JSON.stringify(m.agents?.['102']?.aliases) === '["dir01.example.com"]', m.agents?.['102']);
  comprueba('un agente sin filas no tiene perfil', !m.agents?.['103']);
  comprueba('resumen: cuántas salen y cuántas se copian', /a 3 agente/.test(summarizeMigrationPlan(plan)) && /se copian/.test(summarizeMigrationPlan(plan)), summarizeMigrationPlan(plan));
  comprueba('las mayúsculas cuentan: Ana y ana son dos filas y las dos pasan a 101', JSON.stringify(propio(m, '101', 'op.acc.1', 'P-07')) === JSON.stringify(['Ana | web01 | Administrador', 'ana | web01 | Administrador']), propio(m, '101', 'op.acc.1', 'P-07'));
  const modo = (c: string, p: string) => Array.from(new Set(plan.moves.filter(x => x.controlId === c && x.parameterId === p).map(x => x.mode))).join();
  comprueba('op.acc.1 P-07 sale de la organización: la máquina sin filas propias sigue teniendo valor', modo('op.acc.1', 'P-07') === 'movida');
  comprueba('op.exp.8 P-02 (obligatorio) se COPIA: quitarlo dejaría sin valor a 103', modo('op.exp.8', 'P-02') === 'copiada' && JSON.stringify(valor(m, 'op.exp.8', 'P-02')) === JSON.stringify(valor(doc, 'op.exp.8', 'P-02')), plan.moves.filter(x => x.controlId === 'op.exp.8'));
  comprueba('op.exp.1 P-06 (opcional) sale de la organización', modo('op.exp.1', 'P-06') === 'movida');
  comprueba('ninguna máquina del alcance se queda sin un obligatorio que tenía', plan.incomplete.length === 0, plan.incomplete);
}

console.log('2. Sin pérdida');
{
  const perdidas: string[] = [];
  doc.controls.forEach(c => {
    Object.keys(ENS_SYSTEM_KEY_COLUMNS[c.controlId] || {}).forEach(pid => {
      const antes = toParameterTableRows(valor(doc, c.controlId, pid) as any).filter(r => r.trim()).map(rowKey).sort();
      const despues = [
        ...toParameterTableRows(valor(m, c.controlId, pid) as any),
        ...Object.keys(m.agents || {}).flatMap(a => toParameterTableRows(propio(m, a, c.controlId, pid) as any)),
      ].filter(r => r.trim()).map(rowKey);
      const sinRepetir = Array.from(new Set(despues)).sort();
      if (JSON.stringify(antes) !== JSON.stringify(sinRepetir)) perdidas.push(`${c.controlId} ${pid}`);
    });
  });
  comprueba('organización + agentes = lo que había, parámetro a parámetro', perdidas.length === 0, perdidas);
}

console.log('3. Idempotente y válido');
{
  comprueba('el original no se toca', JSON.stringify(doc) === original);
  const otra = planMigrationToSystems(m, inventario, { scopeAgentIds: ['000', '101', '102', '103'] });
  comprueba('una segunda pasada no cambia nada', !otra.changed && otra.configuration === m);
  comprueba('y sigue avisando de lo mismo', otra.warnings.length === plan.warnings.length);
  comprueba('el documento migrado es válido', validateENSConfigurationStructure(m).valid, validateENSConfigurationStructure(m).errors);
  comprueba('y sus valores por agente también', validateAgentsConfiguration(m).length === 0, validateAgentsConfiguration(m));
  const nada = planMigrationToSystems({ ...defaultENSConfigurationTemplate, controls: [conValores('op.acc.1', { 'P-07': ['x | nadie | y'] })] }, inventario);
  comprueba('sin nada que mover: el mismo documento', !nada.changed && nada.warnings.length === 1);
  // Con el alcance vacío no se puede comprobar que ninguna máquina se quede
  // sin un obligatorio: la migración no hace nada.
  const vacio = planMigrationToSystems(doc, inventario, { scopeAgentIds: [] });
  comprueba('alcance vacío: no migra nada', vacio.emptyScope === true && !vacio.changed && vacio.moves.length === 0 && vacio.configuration === doc);
  comprueba('sin alcance ni inventario: tampoco', planMigrationToSystems(doc, []).emptyScope === true);
  // Una fila nueva en la organización que casa con un agente que ya tiene
  // valor propio se AÑADE a lo suyo.
  const mas = JSON.parse(JSON.stringify(m));
  mas.controls.find((c: any) => c.controlId === 'op.exp.4').parameters.find((p: any) => p.id === 'P-09').value = ['dir01 | 2.1 | trimestral', '* | - | anual'];
  const tercera = planMigrationToSystems(mas, inventario);
  comprueba('una fila nueva se añade a lo que ya tenía el agente (con la *)', JSON.stringify(propio(tercera.configuration, '102', 'op.exp.4', 'P-09')) === JSON.stringify(['dir01 | 2.0 | anual', 'dir01 | 2.1 | trimestral', '* | - | anual']), propio(tercera.configuration, '102', 'op.exp.4', 'P-09'));
}

console.log('4. Lo que ve cada fila');
{
  const filas = (d: ENSConfigurationVersion, c: string, p: string, a?: string) =>
    toParameterTableRows(resolveControlConfigurationForAgent(d, c, a)?.parameters.find(x => x.id === p)?.value as any).filter(r => r.trim()).map(rowKey).sort();
  comprueba('fila 102: sus cuentas de op.acc.1 P-07, tal cual', JSON.stringify(filas(m, 'op.acc.1', 'P-07', '102')) === JSON.stringify(['root|DIR01.example.com|Cuenta de sistema', 'svc|dir01.example.com|Cuenta de servicio']), filas(m, 'op.acc.1', 'P-07', '102'));
  comprueba('fila 103 (sin perfil): lo que queda en la organización', JSON.stringify(filas(m, 'op.acc.1', 'P-07', '103')) === JSON.stringify(['eva|srv-sin-agente|Administradora']));
  comprueba('fila 103, op.exp.8 P-02 copiado: sigue viendo la tabla de hoy', JSON.stringify(filas(m, 'op.exp.8', 'P-02', '103')) === JSON.stringify(filas(doc, 'op.exp.8', 'P-02', '103')));
  comprueba('fila del manager, op.exp.8 P-02: todos los servidores, como antes', JSON.stringify(filas(m, 'op.exp.8', 'P-02', '000')) === JSON.stringify(filas(doc, 'op.exp.8', 'P-02', '000')));
  comprueba('fila del manager, op.exp.7 P-07: como antes', JSON.stringify(filas(m, 'op.exp.7', 'P-07', '000')) === JSON.stringify(filas(doc, 'op.exp.7', 'P-07', '000')));
  comprueba('fila 101, op.exp.4 P-09: la suya', JSON.stringify(filas(m, 'op.exp.4', 'P-09', '101')) === JSON.stringify(['web01|1.0|anual']));
  const rowsAll = (d: ENSConfigurationVersion) => [
    ...toParameterTableRows(valor(d, 'op.acc.1', 'P-07') as any),
    ...Object.keys(d.agents || {}).flatMap(a => toParameterTableRows(propio(d, a, 'op.acc.1', 'P-07') as any)),
  ];
  comprueba('sin pérdida, fila exacta: «Ana» y «ana» siguen en el documento', rowsAll(m).includes('Ana | web01 | Administrador') && rowsAll(m).includes('ana | web01 | Administrador'));
}

// Sobre una copia real, si se pasa. Solo comprueba invariantes y cuenta.
const LAB = process.env.ENSFACIL_LAB_DOC;
const MON = process.env.ENSFACIL_LAB_MONITORING;
if (LAB && MON) {
  console.log('5. Copia real');
  const real = JSON.parse(readFileSync(LAB, 'utf8'));
  const config: ENSConfigurationVersion = real._source ? real._source.configuration : real.configuration || real;
  const mon = JSON.parse(readFileSync(MON, 'utf8'));
  const cubos = (mon.aggregations?.agentes || mon.aggregations?.a)?.buckets || [];
  const inv = inventoryFromMonitoring({ agentes: { buckets: cubos.map((b: any) => ({ key: b.key, ultimo: b.ultimo || b.u })) } }).agents;
  const { resolveENSScopeAgents } = require('../common/ens/core/scope/runtime');
  const alcance: string[] = resolveENSScopeAgents(inv, config.scope).map((a: any) => a.id);
  const p = planMigrationToSystems(config, inv, { scopeAgentIds: alcance });
  console.log(`    ${summarizeMigrationPlan(p)}`);
  p.warnings.forEach(w => console.log(`    aviso: ${describeMigrationWarning(w)}`));
  comprueba('real: válido', validateENSConfigurationStructure(p.configuration).valid && validateAgentsConfiguration(p.configuration).length === 0);
  comprueba('real: idempotente', !planMigrationToSystems(p.configuration, inv, { scopeAgentIds: alcance }).changed);
  comprueba('real: ningún obligatorio se queda sin valor en el alcance', p.incomplete.length === 0, p.incomplete);
  // El motor de verdad, sin hechos, antes y después: ni un NC-CFG nuevo.
  const { getENSComplianceResultByControl } = require('../common/ens/core/ens-engine');
  const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
  const agentesAlcance = resolveENSScopeAgents(inv, config.scope);
  const ncCfg = (d: ENSConfigurationVersion) => {
    ensConfigurationRepository.replaceActive(d);
    const salida: string[] = [];
    alcance.forEach(a => d.controls.forEach(c => {
      const r = getENSComplianceResultByControl(c.controlId, d.global.ensLevel, [], a, agentesAlcance, new Date('2026-10-17T10:00:00Z'));
      (r?.nonConformities || []).filter((n: any) => n.id === 'NC-CFG').forEach((n: any) => salida.push(`${a} ${c.controlId} ${n.finding}`));
    }));
    return salida;
  };
  const antes = new Set(ncCfg(config));
  const nuevos = ncCfg(p.configuration).filter(x => !antes.has(x));
  console.log(`    NC-CFG sin hechos: ${antes.size} antes; nuevos después: ${nuevos.length}`);
  comprueba('real: el motor no da ningún NC-CFG nuevo en ninguna máquina del alcance', nuevos.length === 0, nuevos.slice(0, 5));
  const perdidas: string[] = [];
  config.controls.forEach(c => {
    Object.keys(ENS_SYSTEM_KEY_COLUMNS[c.controlId] || {}).forEach(pid => {
      const antes = toParameterTableRows(valor(config, c.controlId, pid) as any).filter(r => r.trim()).map(rowKey).sort();
      const despues = Array.from(new Set([
        ...toParameterTableRows(valor(p.configuration, c.controlId, pid) as any),
        ...Object.keys(p.configuration.agents || {}).flatMap(a => toParameterTableRows(propio(p.configuration, a, c.controlId, pid) as any)),
      ].filter(r => r.trim()).map(rowKey))).sort();
      if (JSON.stringify(antes) !== JSON.stringify(despues)) perdidas.push(`${c.controlId} ${pid}`);
    });
  });
  comprueba('real: ninguna fila se pierde', perdidas.length === 0, perdidas);
}

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
