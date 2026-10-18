/**
 * Configuración por sistema (1.2.0): el modelo, la clasificación de los
 * parámetros y las plantillas.
 *
 *   npx --yes tsx tests/agent-configuration-model.test.ts
 *
 *   1. Clasificación: cada parámetro de los 23 bloques semilla tiene clase
 *      (organisation, system o platform), ninguna sobra, y los totales son los
 *      del análisis (163 · 41 · 35). Las columnas «de sistema» existen.
 *   2. Plantillas: solo tocan parámetros por sistema o por plataforma, cada
 *      valor es válido para su parámetro (el bloque semilla, que es lo que hay
 *      en el índice), no llevan nombres ni direcciones de un laboratorio, y la
 *      de Windows solo fija op.acc.1-4.
 *   3. Forma de `configuration.agents`: lo que acepta y lo que rechaza el
 *      validador estructural (que es el de la hidratación).
 *   4. Significado: el validador de agentes avisa de un control o un parámetro
 *      que no existe, de un parámetro de organización, de una plantilla
 *      desconocida o incompatible y de un valor inválido.
 */
import { readFileSync, readdirSync } from 'fs';
import {
  ENS_PARAMETER_CLASSES,
  ENS_SYSTEM_KEY_COLUMNS,
} from '../common/ens/configuration/agents/parameter-classes';
import { ENS_CONFIGURATION_TEMPLATES, templateConflict } from '../common/ens/configuration/templates';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { checkAgentsConfigurationKeys, validateAgentsConfigurationShape } from '../common/agent-configuration';
import { resolveControlConfigurationForAgent } from '../common/ens/configuration/agents/configuration-resolver';
import {
  summarizeAgentsConfiguration,
  validateAgentsConfiguration,
} from '../common/ens/configuration/agents/agent-configuration-validator';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
declare const __dirname: string;
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`);
  if (!c) fallos.push(n);
};

const CONFIG = `${__dirname}/../config`;
const bloques: Record<string, any> = {};
readdirSync(CONFIG)
  .filter(f => f.endsWith('-control-block.json'))
  .forEach(f => {
    const b = JSON.parse(readFileSync(`${CONFIG}/${f}`, 'utf8'));
    bloques[b.controlId] = b;
  });

console.log('1. Clasificación');
{
  comprueba('23 bloques semilla', Object.keys(bloques).length === 23, Object.keys(bloques));
  const sinClase: string[] = [];
  const sobran: string[] = [];
  const totales: Record<string, number> = { organisation: 0, system: 0, platform: 0 };

  Object.values(bloques).forEach(b => {
    b.parameters.forEach((p: any) => {
      const clase = ENS_PARAMETER_CLASSES[b.controlId]?.[p.id];
      if (!clase) sinClase.push(`${b.controlId} ${p.id}`);
      else totales[clase] += 1;
    });
  });
  Object.entries(ENS_PARAMETER_CLASSES).forEach(([c, ps]) => {
    Object.keys(ps).forEach(p => {
      if (!bloques[c]?.parameters.some((x: any) => x.id === p)) sobran.push(`${c} ${p}`);
    });
  });

  comprueba('cada parámetro de los 23 bloques tiene clase', sinClase.length === 0, sinClase);
  comprueba('ninguna clase sobra', sobran.length === 0, sobran);
  comprueba('239 parámetros: 163 de organización, 41 por sistema y 35 por plataforma',
    totales.organisation === 163 && totales.system === 41 && totales.platform === 35, totales);

  const malas: string[] = [];
  Object.entries(ENS_SYSTEM_KEY_COLUMNS).forEach(([c, ps]) => {
    Object.entries(ps).forEach(([p, columna]) => {
      const par = bloques[c]?.parameters.find((x: any) => x.id === p);
      const ok = par && par.type === 'table' && ENS_PARAMETER_CLASSES[c][p] === 'system' &&
        (par.columns || []).some((col: any) => col.name === columna);
      if (!ok) malas.push(`${c} ${p} ${columna}`);
    });
  });
  comprueba('la columna «de sistema» de cada tabla existe y la tabla es por sistema', malas.length === 0, malas);

  // Lo lee config/set-parameters.py tal cual: tiene que ser JSON.
  const fuente = readFileSync(`${__dirname}/../common/ens/configuration/agents/parameter-classes.ts`, 'utf8');
  const inicio = fuente.indexOf('{', fuente.indexOf('ENS_PARAMETER_CLASSES:'));
  const fin = fuente.indexOf('\n};', inicio);
  let json: any;
  try { json = JSON.parse(fuente.slice(inicio, fin + 2)); } catch (e) { json = undefined; }
  comprueba('la clasificación es JSON entre sus llaves (la lee set-parameters.py)', json && Object.keys(json).length === 23);
}

console.log('2. Plantillas');
{
  const PROHIBIDO = /qsprueba|zimbraH|wazuh-real|wazuh-fake|WIN-OPACC|dioni|fran\b|22121|Wazuh-4|hetzner|tailscale|\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/i;
  const ids = ENS_CONFIGURATION_TEMPLATES.map(t => t.id);
  comprueba('las seis plantillas aprobadas', JSON.stringify(ids) === JSON.stringify(['linux-ubuntu', 'zimbra-ldap', 'windows-server', 'manager-wazuh', 'pbs-backup', 'zimbra-ne-backup']), ids);

  const problemas: string[] = [];
  ENS_CONFIGURATION_TEMPLATES.forEach(t => {
    Object.entries(t.values).forEach(([c, ps]) => {
      Object.entries(ps).forEach(([p, valor]) => {
        const donde = `${t.id} ${c} ${p}`;
        const par = bloques[c]?.parameters.find((x: any) => x.id === p);
        if (!par) { problemas.push(`${donde}: no existe en el bloque`); return; }
        const clase = ENS_PARAMETER_CLASSES[c][p];
        if (clase !== 'system' && clase !== 'platform') problemas.push(`${donde}: es de ${clase}`);
        const v = validateParameterValue(par, valor);
        if (!v.valid) problemas.push(`${donde}: ${v.reason}`);
        if (PROHIBIDO.test(JSON.stringify(valor))) problemas.push(`${donde}: nombra algo de un laboratorio`);
      });
    });
    if (PROHIBIDO.test(JSON.stringify({ ...t, values: undefined }))) problemas.push(`${t.id}: nombra algo de un laboratorio`);
  });
  comprueba('cada valor existe, no es de organización, es válido y no es de un laboratorio', problemas.length === 0, problemas);

  const windows = ENS_CONFIGURATION_TEMPLATES.find(t => t.id === 'windows-server')!;
  comprueba('Windows declara que solo op.acc.1-4 tienen recolector', JSON.stringify(windows.onlyControls) === JSON.stringify(['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4']));
  comprueba('y solo fija valores de esos controles', Object.keys(windows.values).every(c => windows.onlyControls!.includes(c)), Object.keys(windows.values));
  comprueba('LDAP: fuente de identidad LDAP', ENS_CONFIGURATION_TEMPLATES[1].values['op.acc.1']['P-01'] === 'LDAP');
  comprueba('LDAP: sin «adm» entre los grupos privilegiados', !(ENS_CONFIGURATION_TEMPLATES[1].values['op.acc.2']['P-12'] as string[]).includes('adm'));
  comprueba('Linux: con «adm»', (ENS_CONFIGURATION_TEMPLATES[0].values['op.acc.2']['P-12'] as string[]).includes('adm'));
  comprueba('Linux no lleva cuentas de Zimbra', !(ENS_CONFIGURATION_TEMPLATES[0].values['op.acc.1']['P-03'] as string[]).includes('zimbra'));
  comprueba('PBS y Zimbra NE no se combinan', /no se combina/.test(templateConflict('zimbra-ne-backup', ['linux-ubuntu', 'pbs-backup']) || ''));
  comprueba('dos plataformas base no se combinan', /plataforma/.test(templateConflict('zimbra-ldap', ['linux-ubuntu']) || ''));
  comprueba('base + añadido sí', templateConflict('pbs-backup', ['linux-ubuntu']) === undefined);
}

console.log('3. Forma de configuration.agents');
{
  const valido = { '024': { name: 'srv-a', aliases: ['srv-a.example.com'], detectedType: 'linux', detectedBy: 'os.platform = ubuntu', templates: ['linux-ubuntu'], controls: { 'op.acc.1': { parameters: { 'P-07': ['u | srv-a | admin'], 'P-10': 1000 } } } } };
  comprueba('un perfil completo es válido', validateAgentsConfigurationShape(valido).length === 0, validateAgentsConfigurationShape(valido));
  comprueba('sin la clave, válido', validateAgentsConfigurationShape(undefined).length === 0);
  comprueba('un valor null no', validateAgentsConfigurationShape({ '024': { controls: { 'op.acc.1': { parameters: { 'P-07': null } } } } }).length === 1);
  comprueba('un objeto como valor no', validateAgentsConfigurationShape({ '024': { controls: { 'op.acc.1': { parameters: { 'P-07': { a: 1 } } } } } }).length === 1);
  comprueba('un tipo que no es texto no', validateAgentsConfigurationShape({ '024': { typeOverride: 3 } }).length === 1);
  comprueba('plantillas que no son una lista de texto no', validateAgentsConfigurationShape({ '024': { templates: 'linux-ubuntu' } }).length === 1);

  // L3: la clave es el id normalizado. No tumba el entorno (no es de forma),
  // pero es un error de significado: el valor no se aplicaría a ninguna fila.
  comprueba('una clave que no es un id no es de forma (no tumba el entorno)', validateAgentsConfigurationShape({ srvWeb01: {}, '24': {} }).length === 0);
  const claves = checkAgentsConfigurationKeys({ srvWeb01: {}, '24': {}, '024': {} });
  comprueba('pero es un error, con el remedio', claves.errors.length === 2 && claves.errors.some(e => /«srvWeb01» no es un id de agente; usar el id numérico/.test(e)) && claves.errors.some(e => /«24» no es un id de agente normalizado; usar 024/.test(e)), claves.errors);

  // L4: lo que esta versión no conoce se ignora con un aviso, nunca un error.
  const futuro = { '024': { platform: 'zimbra-ldap', platformSource: 'hechos', attributes: { criticidad: 'alta' }, typeOverride: 'macos', templates: ['linux-ubuntu'], controls: { 'op.acc.1': { assigned: true, parameters: { 'P-07': ['u | srv-a | admin'] } }, 'op.exp.1': { assigned: true } } } };
  comprueba('claves de una versión posterior: forma válida', validateAgentsConfigurationShape(futuro).length === 0, validateAgentsConfigurationShape(futuro));
  const avisos = checkAgentsConfigurationKeys(futuro);
  comprueba('y avisos, no errores', avisos.errors.length === 0 && avisos.warnings.length === 6 && avisos.warnings.every(w => /ignora/.test(w)), avisos);
  comprueba('una lista no es un mapa de agentes', validateAgentsConfigurationShape([]).length === 1);

  const conFuturo: any = { ...defaultENSConfigurationTemplate, agents: futuro };
  comprueba('un documento con claves de una versión posterior carga', validateENSConfigurationStructure(conFuturo).valid, validateENSConfigurationStructure(conFuturo).errors);
  comprueba('y se evalúa: el valor propio se aplica', JSON.stringify(resolveControlConfigurationForAgent(conFuturo, 'op.acc.1', '024')?.parameters.find(p => p.id === 'P-07')?.value) === '["u | srv-a | admin"]');
  comprueba('el validador de significado lo da como avisos', validateAgentsConfiguration(conFuturo).filter(i => i.severity === 'warning').length === 6 && validateAgentsConfiguration(conFuturo).filter(i => i.severity === 'error').length === 0, validateAgentsConfiguration(conFuturo));
  const doc: any = { ...defaultENSConfigurationTemplate, agents: valido };
  comprueba('el validador estructural acepta un documento con agents', validateENSConfigurationStructure(doc).valid, validateENSConfigurationStructure(doc).errors);
  const roto: any = { ...defaultENSConfigurationTemplate, agents: { '024': { controls: { 'op.acc.1': { parameters: { 'P-07': null } } } } } };
  const r = validateENSConfigurationStructure(roto);
  comprueba('y rechaza uno con un valor null en un agente, diciendo dónde', !r.valid && r.errors.some(e => /agents\.024\.controls\.op\.acc\.1\.parameters\.P-07/.test(e)), r.errors);
}

console.log('4. Significado');
{
  const controls = [bloques['op.acc.1'], bloques['op.acc.2']];
  const issues = validateAgentsConfiguration({
    controls,
    agents: {
      '024': {
        templates: ['linux-ubuntu', 'zimbra-ldap', 'no-existe'],
        controls: {
          'op.acc.1': { parameters: { 'P-04': ['admin'], 'P-99': 'x', 'P-07': ['u | srv-a | admin'], 'P-10': 'mil' } },
          'op.exp.1': { parameters: { 'P-01': ['a | b | c | d'] } },
        },
      },
    },
  } as any);
  const m = issues.map(i => i.message).join(' || ');
  comprueba('parámetro de organización por agente: error, huérfano (no se aplica)', /P-04 es un parámetro de organización/.test(m) && issues.find(i => i.parameterId === 'P-04')?.kind === 'huerfano', m);
  comprueba('un valor inválido sí se aplica: de tipo valor', issues.find(i => i.parameterId === 'P-10')?.kind === 'valor');
  const porNombre = validateAgentsConfiguration({ controls, agents: { srvWeb01: { controls: { 'op.acc.1': { parameters: { 'P-07': ['u | s | r'] } } } } } } as any);
  comprueba('un perfil guardado por nombre: error que lo dice', porNombre.some(i => i.severity === 'error' && /no es un id de agente/.test(i.message)), porNombre);
  comprueba('parámetro que no existe: error', /no declara el parámetro P-99/.test(m), m);
  comprueba('control no sembrado: error', /op\.exp\.1 no está en la configuración/.test(m), m);
  comprueba('plantilla desconocida: error', /no-existe/.test(m), m);
  comprueba('dos plataformas: error', /ya tiene la plantilla de plataforma/.test(m), m);
  comprueba('valor inválido: error con el motivo', issues.some(i => i.parameterId === 'P-10'), m);
  comprueba('un valor válido no da error', !issues.some(i => i.parameterId === 'P-07'), m);
  const resumen = summarizeAgentsConfiguration({ agents: { '028': { typeOverride: 'zimbra-ldap', detectedType: 'linux', templates: ['zimbra-ldap'], controls: { 'op.acc.1': { parameters: { 'P-07': ['x | y | z'] } } } } } } as any);
  comprueba('resumen por agente', resumen[0].type === 'zimbra-ldap' && resumen[0].typeSource === 'manual' && resumen[0].ownValues === 1, resumen);
}

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
