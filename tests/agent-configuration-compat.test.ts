/**
 * Compatibilidad de `configuration.agents` (1.2.0) hacia atrás y en el guardado.
 *
 *   npx --yes tsx tests/agent-configuration-compat.test.ts
 *
 *   1. Un plugin 1.1.0 carga un documento de la 1.2.0: su validador estructural
 *      (copia congelada en tests/fixtures) lo acepta e ignora `agents`, y lo que
 *      lee —`controls[].parameters[].value`— sigue siendo el valor de la
 *      organización.
 *   2. El guardado del servidor: valida la forma de `agents` (400 y nada
 *      escrito si no vale), guarda la que se manda, conserva la que había si el
 *      cuerpo no trae la clave y la vacía solo si se manda vacía. El documento
 *      anterior queda en el historial.
 */
import { validateENSConfigurationStructure as validador110 } from './fixtures/configuration-structure-validator-1.1.0';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { planMigrationToSystems } from '../common/ens/configuration/agents/migration';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`);
  if (!c) fallos.push(n);
};

const base: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
base.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-07').value = ['ana | web01 | admin', 'svc | dir01 | servicio'];
const migrado: any = planMigrationToSystems(base, [{ id: '101', name: 'web01' }, { id: '102', name: 'dir01' }]).configuration;
migrado.agents['102'].templates = ['zimbra-ldap', 'pbs-backup'];
migrado.agents['102'].typeOverride = 'zimbra-ldap';
migrado.agents['102'].detectedType = 'linux';

console.log('1. Un plugin 1.1.0 con un documento 1.2.0');
{
  comprueba('el documento migrado tiene agents', Object.keys(migrado.agents || {}).length === 2, migrado.agents);
  comprueba('el validador 1.2.0 lo acepta', validateENSConfigurationStructure(migrado).valid, validateENSConfigurationStructure(migrado).errors);
  const r = validador110(migrado);
  comprueba('el validador 1.1.0 (congelado) lo acepta: el entorno carga', r.valid, r.errors);
  comprueba('el 1.1.0 no conoce agents: ni lo mira (acepta hasta uno roto)', validador110({ ...migrado, agents: 'cualquier cosa' }).valid);
  comprueba('lo que lee un 1.1.0 es el valor de organización',
    JSON.stringify(migrado.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-01').value) ===
    JSON.stringify(base.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-01').value));
}

console.log('2. El guardado del servidor');
const indice = () => {
  const docs = new Map<string, any>();
  return {
    docs,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
    search: async (p: any) => {
      const ids = p.body?.query?.ids?.values;
      const tipo = p.body?.query?.term?.documentType;
      // Como OpenSearch: el historial, del más reciente al más antiguo, y `size`.
      const hits = [...docs.entries()]
        .filter(([id, d]) => (ids ? ids.includes(id) : d.documentType === tipo))
        .map(([, d]) => ({ _source: d }))
        .sort((a, b) => String(b._source.createdAt || '').localeCompare(String(a._source.createdAt || '')))
        .slice(0, p.body?.size || 10);
      return { body: { hits: { hits } } };
    },
    bulk: async (p: any) => {
      const lineas = String(p.body).split('\n').filter(Boolean).map(l => JSON.parse(l));
      for (let i = 0; i < lineas.length; i += 2) {
        const accion = lineas[i].create || lineas[i].index;
        docs.set(accion._id, lineas[i + 1]);
      }
      return { body: { errors: false } };
    },
  };
};
const usuario = { transport: { request: async () => ({ body: { user_name: 'rsis', roles: ['ensfacil_admin'] } }) } };
const contexto = (ix: any) => ({ core: { opensearch: { client: { asInternalUser: ix, asCurrentUser: usuario } } } });
const respuestas = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const registro = { info: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined };
const h = createConfigurationHandlers({ logger: registro as any, securityEnabled: true });
const guarda = (ix: any, configuration: any) => h.save(contexto(ix) as any, { body: { configuration } } as any, respuestas as any);

(async () => {
  const ix = indice();
  let r: any = await guarda(ix, migrado);
  comprueba('guarda agents tal cual', r.status === 200 && JSON.stringify(ix.docs.get('active')?.configuration?.agents) === JSON.stringify(migrado.agents), r);

  const sinClave = { ...migrado };
  delete sinClave.agents;
  r = await guarda(ix, sinClave);
  comprueba('un cuerpo sin la clave agents no la borra', r.status === 200 && JSON.stringify(ix.docs.get('active')?.configuration?.agents) === JSON.stringify(migrado.agents), ix.docs.get('active')?.configuration?.agents);

  const historial = [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY');
  comprueba('cada guardado deja su versión en el historial, con agents', historial.length === 2 && historial.every(d => d.configuration.agents), historial.length);

  const antes = JSON.stringify(ix.docs.get('active'));
  r = await guarda(ix, { ...migrado, agents: { '102': { controls: { 'op.acc.1': { parameters: { 'P-07': null } } } } } });
  comprueba('un valor null en un agente: 400, diciendo dónde', r.status === 400 && /agents\.102\.controls\.op\.acc\.1\.parameters\.P-07/.test(r.body.message), r);
  comprueba('y no se escribe nada', JSON.stringify(ix.docs.get('active')) === antes);
  r = await guarda(ix, { ...migrado, agents: [] });
  comprueba('agents que no es un mapa: 400', r.status === 400);

  r = await guarda(ix, { ...migrado, agents: { srvWeb01: { templates: ['linux-ubuntu'] } } });
  comprueba('un perfil por nombre y no por id: 400 con el remedio', r.status === 400 && /«srvWeb01» no es un id de agente/.test(r.body.message), r);
  r = await guarda(ix, { ...migrado, agents: { '102': { attributes: { criticidad: 'alta' }, templates: ['zimbra-ldap'] } } });
  comprueba('claves de una versión posterior: se aceptan (se ignoran)', r.status === 200, r);

  r = await guarda(ix, { ...migrado, agents: {} });
  comprueba('agents vacío lo vacía', r.status === 200 && JSON.stringify(ix.docs.get('active')?.configuration?.agents) === '{}');

  // L5: la versión anterior a CUALQUIER guardado queda en el historial, también
  // si la escribió una herramienta de config/ sin pasar por el plugin.
  const fuera = { ...JSON.parse(JSON.stringify(migrado)), changeReason: 'escrito por inject-control.py' };
  ix.docs.set('active', { documentType: 'ACTIVE_CONFIGURATION', configuration: fuera, updatedAt: '2026-10-17T09:00:00.000Z', updatedBy: 'script' });
  const antesDe = [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY').length;
  r = await guarda(ix, { ...migrado, changeReason: 'Migración a sistemas' });
  const historia = [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY');
  comprueba('un activo escrito fuera del plugin entra en el historial antes de sustituirse', r.status === 200 && historia.length === antesDe + 2 && historia.some(d => d.configuration?.changeReason === 'escrito por inject-control.py'), historia.length - antesDe);
  r = await guarda(ix, { ...migrado, changeReason: 'otro guardado' });
  comprueba('si ya es la última versión del historial, no se repite', [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY').length === historia.length + 1);

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
