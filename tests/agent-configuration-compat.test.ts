/** Backward compatibility of `configuration.agents` (1.2.0) and its handling on save. */
import { validateENSConfigurationStructure as validador110 } from './fixtures/configuration-structure-validator-1.1.0';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { planMigrationToSystems } from '../common/ens/configuration/agents/migration';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 300)}` : ''}`);
  if (!c) failures.push(n);
};

const base: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
base.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-07').value = ['ana | web01 | admin', 'svc | dir01 | servicio'];
const migrated: any = planMigrationToSystems(base, [{ id: '101', name: 'web01' }, { id: '102', name: 'dir01' }]).configuration;
migrated.agents['102'].templates = ['zimbra-ldap', 'pbs-backup'];
migrated.agents['102'].typeOverride = 'zimbra-ldap';
migrated.agents['102'].detectedType = 'linux';

console.log('1. A 1.1.0 plugin with a 1.2.0 document');
{
  check('the migrated document has agents', Object.keys(migrated.agents || {}).length === 2, migrated.agents);
  check('the 1.2.0 validator accepts it', validateENSConfigurationStructure(migrated).valid, validateENSConfigurationStructure(migrated).errors);
  const r = validador110(migrated);
  check('the (frozen) 1.1.0 validator accepts it: the environment loads', r.valid, r.errors);
  check('1.1.0 does not know agents: it does not even look at it (accepts a broken one)', validador110({ ...migrated, agents: 'cualquier cosa' }).valid);
  check('what a 1.1.0 reads is the organization value',
    JSON.stringify(migrated.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-01').value) ===
    JSON.stringify(base.controls.find((c: any) => c.controlId === 'op.acc.1').parameters.find((p: any) => p.id === 'P-01').value));
}

console.log('2. Server save');
const index = () => {
  const docs = new Map<string, any>();
  return {
    docs,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
    search: async (p: any) => {
      const ids = p.body?.query?.ids?.values;
      const type = p.body?.query?.term?.documentType;
      const hits = [...docs.entries()]
        .filter(([id, d]) => (ids ? ids.includes(id) : d.documentType === type))
        .map(([, d]) => ({ _source: d }))
        .sort((a, b) => String(b._source.createdAt || '').localeCompare(String(a._source.createdAt || '')))
        .slice(0, p.body?.size || 10);
      return { body: { hits: { hits } } };
    },
    bulk: async (p: any) => {
      const lineas = String(p.body).split('\n').filter(Boolean).map(l => JSON.parse(l));
      for (let i = 0; i < lineas.length; i += 2) {
        const action = lineas[i].create || lineas[i].index;
        docs.set(action._id, lineas[i + 1]);
      }
      return { body: { errors: false } };
    },
  };
};
const user = { transport: { request: async () => ({ body: { user_name: 'rsis', roles: ['ensfacil_admin'] } }) } };
const context = (ix: any) => ({ core: { opensearch: { client: { asInternalUser: ix, asCurrentUser: user } } } });
const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
const record = { info: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined };
const h = createConfigurationHandlers({ logger: record as any, securityEnabled: true });
const save = (ix: any, configuration: any) => h.save(context(ix) as any, { body: { configuration } } as any, responses as any);

(async () => {
  const ix = index();
  let r: any = await save(ix, migrated);
  check('saves agents as is', r.status === 200 && JSON.stringify(ix.docs.get('active')?.configuration?.agents) === JSON.stringify(migrated.agents), r);

  const sinClave = { ...migrated };
  delete sinClave.agents;
  r = await save(ix, sinClave);
  check('a body without the agents key does not delete it', r.status === 200 && JSON.stringify(ix.docs.get('active')?.configuration?.agents) === JSON.stringify(migrated.agents), ix.docs.get('active')?.configuration?.agents);

  const historial = [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY');
  check('each save leaves its version in the history, with agents', historial.length === 2 && historial.every(d => d.configuration.agents), historial.length);

  const antes = JSON.stringify(ix.docs.get('active'));
  r = await save(ix, { ...migrated, agents: { '102': { controls: { 'op.acc.1': { parameters: { 'P-07': null } } } } } });
  check('a null value in an agent: 400, saying where', r.status === 400 && /agents\.102\.controls\.op\.acc\.1\.parameters\.P-07/.test(r.body.message), r);
  check('and nothing is written', JSON.stringify(ix.docs.get('active')) === antes);
  r = await save(ix, { ...migrated, agents: [] });
  check('agents that is not a map: 400', r.status === 400);

  r = await save(ix, { ...migrated, agents: { srvWeb01: { templates: ['linux-ubuntu'] } } });
  check('a profile by name and not by id: 400 with the remedy', r.status === 400 && /«srvWeb01» no es un id de agente/.test(r.body.message), r);
  r = await save(ix, { ...migrated, agents: { '102': { attributes: { criticidad: 'alta' }, templates: ['zimbra-ldap'] } } });
  check('keys from a later version: accepted (ignored)', r.status === 200, r);

  r = await save(ix, { ...migrated, agents: {} });
  check('empty agents empties it', r.status === 200 && JSON.stringify(ix.docs.get('active')?.configuration?.agents) === '{}');

  const outside = { ...JSON.parse(JSON.stringify(migrated)), changeReason: 'escrito por inject-control.py' };
  ix.docs.set('active', { documentType: 'ACTIVE_CONFIGURATION', configuration: outside, updatedAt: '2026-10-17T09:00:00.000Z', updatedBy: 'script' });
  const antesDe = [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY').length;
  r = await save(ix, { ...migrated, changeReason: 'Migración a sistemas' });
  const history = [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY');
  check('an asset written outside the plugin enters the history before being replaced', r.status === 200 && history.length === antesDe + 2 && history.some(d => d.configuration?.changeReason === 'escrito por inject-control.py'), history.length - antesDe);
  r = await save(ix, { ...migrated, changeReason: 'otro guardado' });
  check('if it is already the latest version in the history, it is not repeated', [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY').length === history.length + 1);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
