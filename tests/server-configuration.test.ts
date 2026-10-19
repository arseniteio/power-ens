/** Configuration is saved as in the integrated version and changed only by `ensfacil_admin` or `all_access`. */
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const index = () => {
  const docs = new Map<string, any>();
  let exists = false;
  return {
    docs,
    indices: {
      exists: async () => ({ body: exists }),
      create: async (p: any) => { exists = true; (index as any).mapping = p.body; return { body: {} }; },
    },
    search: async (p: any) => {
      const ids = p.body?.query?.ids?.values;
      const type = p.body?.query?.term?.documentType;
      const hits = [...docs.entries()]
        .filter(([id, d]) => (ids ? ids.includes(id) : d.documentType === type))
        .map(([, d]) => ({ _source: d }));
      return { body: { hits: { hits } } };
    },
    bulk: async (p: any) => {
      const lines = String(p.body).split('\n').filter(Boolean).map(l => JSON.parse(l));
      for (let i = 0; i < lines.length; i += 2) {
        const action = lines[i].create || lines[i].index;
        docs.set(action._id, lines[i + 1]);
      }
      return { body: { errors: false } };
    },
  };
};

const calls: any[] = [];
const user = (body: any) => ({ transport: { request: async (a: any) => { calls.push(a); if (body instanceof Error) throw body; return { body: body }; } } });
const context = (internal: any, actual: any) => ({ core: { opensearch: { client: { asInternalUser: internal, asCurrentUser: actual } } } });
const responses = {
  ok: (r: any) => ({ status: 200, body: r.body }),
  customError: (r: any) => ({ status: r.statusCode, body: r.body }),
};
const notices: string[] = [];
const record = { info: () => undefined, error: () => undefined, warn: (m: string) => { notices.push(m); }, debug: () => undefined };
const h = createConfigurationHandlers({ logger: record as any, securityEnabled: true });
const config = { version: '1.0.0', global: { ensLevel: 'MEDIO' }, controls: [] };

(async () => {
  const ix = index();

  let r: any = await h.getActive(context(ix, user({ user_name: 'ana', roles: [] })) as any, {} as any, responses as any);
  check('GET without configuration: null, 200', r.status === 200 && r.body.data.configuration === null && r.body.statusCode === 200 && r.body.error === 0);

  r = await h.save(context(ix, user({ user_name: 'ana', roles: ['readall'] })) as any, { body: { configuration: config } } as any, responses as any);
  check('without the administration role: 403', r.status === 403 && /ensfacil_admin/.test(r.body.message), r);
  check('and nothing is saved', ix.docs.size === 0);
  check('the attempt stays in the log with the user', notices.length === 1 && /ana/.test(notices[0]) && /guardar/.test(notices[0]), notices);
  check('without the request body', !/MEDIO|ensLevel|configuration/.test(notices[0]), notices[0]);

  r = await h.history(context(ix, user({ user_name: 'ana', roles: ['readall'] })) as any, {} as any, responses as any);
  check('history without role: 403', r.status === 403);
  check('also in the log', notices.length === 2 && /ana/.test(notices[1]) && /historial/.test(notices[1]), notices);
  notices.length = 0;

  r = await h.save(context(ix, user({ user_name: 'rsis', roles: ['ensfacil_admin'] })) as any, { body: { configuration: config, changeReason: 'alta' } } as any, responses as any);
  check('ensfacil_admin saves: 200', r.status === 200, r);
  const active2 = ix.docs.get('active');
  check('active document', active2?.documentType === 'ACTIVE_CONFIGURATION' && active2?.updatedBy === 'rsis');
  check('y su historial', [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY').length === 1);
  const settings = (index as any).mapping?.settings?.index;
  check('the index is created with automatic replicas (0-1) and one shard', settings?.auto_expand_replicas === '0-1' && settings?.number_of_shards === 1 && settings?.number_of_replicas === undefined, settings);
  check('audit trail', active2?.configuration?.auditTrail?.[0]?.action === 'CREATED' && active2?.configuration?.auditTrail?.[0]?.summary === 'alta');

  r = await h.save(context(ix, user({ user_name: 'root', roles: ['all_access'] })) as any, { body: { configuration: { ...config, global: { ensLevel: 'ALTO' } } } } as any, responses as any);
  check('all_access saves', r.status === 200);
  check('UPDATED and creator kept', ix.docs.get('active')?.configuration?.auditTrail?.[1]?.action === 'UPDATED' && ix.docs.get('active')?.configuration?.createdBy === 'rsis');

  r = await h.history(context(ix, user({ user_name: 'root', roles: ['all_access'] })) as any, {} as any, responses as any);
  check('history with role: two versions', r.status === 200 && r.body.data.length === 2);
  check('what is allowed leaves no warning', notices.length === 0, notices);

  r = await h.save(context(ix, user({ user_name: 'rsis', roles: ['ensfacil_admin'] })) as any, { body: { configuration: [1, 2] } } as any, responses as any);
  check('invalid body: 400', r.status === 400);

  const withoutSession = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  r = await h.save(context(ix, user(withoutSession)) as any, { body: { configuration: config } } as any, responses as any);
  check('no session: 401, not 500', r.status === 401, r);

  const free = createConfigurationHandlers({ logger: record as any, securityEnabled: false });
  const ix2 = index();
  r = await free.save(context(ix2, user(Object.assign(new Error('no handler found for uri [/_plugins/_security/authinfo]'), { statusCode: 400 }))) as any, { body: { configuration: config } } as any, responses as any);
  check('without the security plugin: saves as unknown', r.status === 200 && ix2.docs.get('active')?.updatedBy === 'desconocido', r);

  const withoutHandler = Object.assign(new Error('no handler found for uri [/_plugins/_security/authinfo]'), { statusCode: 400 });
  const ix3 = index();
  const nobody = createConfigurationHandlers({ logger: record as any, securityEnabled: false });
  r = await nobody.save(context(ix3, user({ user_name: 'ana', roles: ['readall'] })) as any, { body: { configuration: config } } as any, responses as any);
  check('flag false but authinfo answers with non-admin: 403', r.status === 403 && ix3.docs.size === 0, r);
  r = await nobody.save(context(ix3, user(withoutHandler)) as any, { body: { configuration: config } } as any, responses as any);
  check('flag false and "no handler": no restriction', r.status === 200 && ix3.docs.get('active')?.updatedBy === 'desconocido', r);
  const closed = createConfigurationHandlers({ logger: record as any, securityEnabled: true });
  r = await closed.save(context(ix3, user(withoutHandler)) as any, { body: { configuration: config } } as any, responses as any);
  check('flag true and "no handler": generic 500', r.status === 500 && !/handler/.test(JSON.stringify(r.body)), r);
  const expiredOne = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  r = await closed.history(context(ix3, user(expiredOne)) as any, {} as any, responses as any);
  check('flag true and authinfo 401: 401 in history', r.status === 401, r);
  r = await closed.save(context(ix3, user(expiredOne)) as any, { body: { configuration: config } } as any, responses as any);
  check('flag true and authinfo 401: 401 in PUT', r.status === 401, r);

  const ix4 = index();
  const fake = { ...config, createdBy: 'x', updatedBy: 'y', createdAt: '2000-01-01', updatedAt: '2000-01-01', changeReason: 'cliente', auditTrail: [{ action: 'FAKE' }] };
  r = await h.save(context(ix4, user({ user_name: 'rsis', roles: ['ensfacil_admin'] })) as any, { body: { configuration: fake, changeReason: 'real' } } as any, responses as any);
  const c4 = ix4.docs.get('active')?.configuration;
  check('server fields overwrite the client\'s', c4?.createdBy === 'rsis' && c4?.updatedBy === 'rsis' && c4?.createdAt !== '2000-01-01' && c4?.updatedAt !== '2000-01-01' && c4?.changeReason === 'real' && c4?.auditTrail?.length === 1 && c4?.auditTrail[0].action === 'CREATED', c4);

  check('authinfo: GET and exact route', calls.length > 0 && calls.every(a => a.method === 'GET' && a.path === '/_plugins/_security/authinfo'), calls[0]);

  const roto = { ...index(), indices: { exists: async () => { throw new Error('internal secret 10.0.0.5'); } } };
  r = await h.getActive(context(roto, user({ user_name: 'a', roles: [] })) as any, {} as any, responses as any);
  check('GET with failure: generic 500', r.status === 500 && !/10\.0\.0\.5/.test(JSON.stringify(r.body)), r);

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
