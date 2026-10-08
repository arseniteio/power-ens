/**
 * La configuración se guarda igual que en la versión integrada (documento
 * `active` + historial en wazuh-ens-configuration) y solo la cambian
 * `ensfacil_admin` o `all_access`.
 *
 *   npx --yes tsx tests/server-configuration.test.ts
 */
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

// Índice en memoria con la forma del cliente de OpenSearch.
const indice = () => {
  const docs = new Map<string, any>();
  let existe = false;
  return {
    docs,
    indices: {
      exists: async () => ({ body: existe }),
      create: async (p: any) => { existe = true; (indice as any).mapping = p.body; return { body: {} }; },
    },
    search: async (p: any) => {
      const ids = p.body?.query?.ids?.values;
      const tipo = p.body?.query?.term?.documentType;
      const hits = [...docs.entries()]
        .filter(([id, d]) => (ids ? ids.includes(id) : d.documentType === tipo))
        .map(([, d]) => ({ _source: d }));
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

const llamadas: any[] = [];
const usuario = (cuerpo: any) => ({ transport: { request: async (a: any) => { llamadas.push(a); if (cuerpo instanceof Error) throw cuerpo; return { body: cuerpo }; } } });
const contexto = (interno: any, actual: any) => ({ core: { opensearch: { client: { asInternalUser: interno, asCurrentUser: actual } } } });
const respuestas = {
  ok: (r: any) => ({ status: 200, body: r.body }),
  customError: (r: any) => ({ status: r.statusCode, body: r.body }),
};
const avisos: string[] = [];
const registro = { info: () => undefined, error: () => undefined, warn: (m: string) => { avisos.push(m); }, debug: () => undefined };
const h = createConfigurationHandlers({ logger: registro as any, securityEnabled: true });
const config = { version: '1.0.0', global: { ensLevel: 'MEDIO' }, controls: [] };

(async () => {
  const ix = indice();

  let r: any = await h.getActive(contexto(ix, usuario({ user_name: 'ana', roles: [] })) as any, {} as any, respuestas as any);
  comprueba('GET sin configuración: null, 200', r.status === 200 && r.body.data.configuration === null && r.body.statusCode === 200 && r.body.error === 0);

  r = await h.save(contexto(ix, usuario({ user_name: 'ana', roles: ['readall'] })) as any, { body: { configuration: config } } as any, respuestas as any);
  comprueba('sin rol de administración: 403', r.status === 403 && /ensfacil_admin/.test(r.body.message), r);
  comprueba('y no se guarda nada', ix.docs.size === 0);
  comprueba('el intento queda en el log con el usuario', avisos.length === 1 && /ana/.test(avisos[0]) && /guardar/.test(avisos[0]), avisos);
  comprueba('sin el cuerpo de la petición', !/MEDIO|ensLevel|configuration/.test(avisos[0]), avisos[0]);

  r = await h.history(contexto(ix, usuario({ user_name: 'ana', roles: ['readall'] })) as any, {} as any, respuestas as any);
  comprueba('historial sin rol: 403', r.status === 403);
  comprueba('también en el log', avisos.length === 2 && /ana/.test(avisos[1]) && /historial/.test(avisos[1]), avisos);
  avisos.length = 0;

  r = await h.save(contexto(ix, usuario({ user_name: 'rsis', roles: ['ensfacil_admin'] })) as any, { body: { configuration: config, changeReason: 'alta' } } as any, respuestas as any);
  comprueba('ensfacil_admin guarda: 200', r.status === 200, r);
  const activa = ix.docs.get('active');
  comprueba('documento active', activa?.documentType === 'ACTIVE_CONFIGURATION' && activa?.updatedBy === 'rsis');
  comprueba('y su historial', [...ix.docs.values()].filter(d => d.documentType === 'CONFIGURATION_HISTORY').length === 1);
  comprueba('rastro de auditoría', activa?.configuration?.auditTrail?.[0]?.action === 'CREATED' && activa?.configuration?.auditTrail?.[0]?.summary === 'alta');

  r = await h.save(contexto(ix, usuario({ user_name: 'root', roles: ['all_access'] })) as any, { body: { configuration: { ...config, global: { ensLevel: 'ALTO' } } } } as any, respuestas as any);
  comprueba('all_access guarda', r.status === 200);
  comprueba('UPDATED y creador conservado', ix.docs.get('active')?.configuration?.auditTrail?.[1]?.action === 'UPDATED' && ix.docs.get('active')?.configuration?.createdBy === 'rsis');

  r = await h.history(contexto(ix, usuario({ user_name: 'root', roles: ['all_access'] })) as any, {} as any, respuestas as any);
  comprueba('historial con rol: dos versiones', r.status === 200 && r.body.data.length === 2);
  comprueba('lo permitido no deja aviso', avisos.length === 0, avisos);

  r = await h.save(contexto(ix, usuario({ user_name: 'rsis', roles: ['ensfacil_admin'] })) as any, { body: { configuration: [1, 2] } } as any, respuestas as any);
  comprueba('cuerpo inválido: 400', r.status === 400);

  const sinSesion = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  r = await h.save(contexto(ix, usuario(sinSesion)) as any, { body: { configuration: config } } as any, respuestas as any);
  comprueba('sin sesión: 401, no 500', r.status === 401, r);

  const libre = createConfigurationHandlers({ logger: registro as any, securityEnabled: false });
  const ix2 = indice();
  r = await libre.save(contexto(ix2, usuario(Object.assign(new Error('no handler found for uri [/_plugins/_security/authinfo]'), { statusCode: 400 }))) as any, { body: { configuration: config } } as any, respuestas as any);
  comprueba('sin plugin de seguridad: guarda como desconocido', r.status === 200 && ix2.docs.get('active')?.updatedBy === 'desconocido', r);

  // Seguridad cerrada por defecto.
  const sinManejador = Object.assign(new Error('no handler found for uri [/_plugins/_security/authinfo]'), { statusCode: 400 });
  const ix3 = indice();
  const nadie = createConfigurationHandlers({ logger: registro as any, securityEnabled: false });
  r = await nadie.save(contexto(ix3, usuario({ user_name: 'ana', roles: ['readall'] })) as any, { body: { configuration: config } } as any, respuestas as any);
  comprueba('flag false pero authinfo responde con no admin: 403', r.status === 403 && ix3.docs.size === 0, r);
  r = await nadie.save(contexto(ix3, usuario(sinManejador)) as any, { body: { configuration: config } } as any, respuestas as any);
  comprueba('flag false y "no handler": sin restricción', r.status === 200 && ix3.docs.get('active')?.updatedBy === 'desconocido', r);
  const cerrado = createConfigurationHandlers({ logger: registro as any, securityEnabled: true });
  r = await cerrado.save(contexto(ix3, usuario(sinManejador)) as any, { body: { configuration: config } } as any, respuestas as any);
  comprueba('flag true y "no handler": 500 genérico', r.status === 500 && !/handler/.test(JSON.stringify(r.body)), r);
  const caducada = Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  r = await cerrado.history(contexto(ix3, usuario(caducada)) as any, {} as any, respuestas as any);
  comprueba('flag true y authinfo 401: 401 en historial', r.status === 401, r);
  r = await cerrado.save(contexto(ix3, usuario(caducada)) as any, { body: { configuration: config } } as any, respuestas as any);
  comprueba('flag true y authinfo 401: 401 en PUT', r.status === 401, r);

  // El cliente no puede falsear los campos del servidor.
  const ix4 = indice();
  const falsa = { ...config, createdBy: 'x', updatedBy: 'y', createdAt: '2000-01-01', updatedAt: '2000-01-01', changeReason: 'cliente', auditTrail: [{ action: 'FAKE' }] };
  r = await h.save(contexto(ix4, usuario({ user_name: 'rsis', roles: ['ensfacil_admin'] })) as any, { body: { configuration: falsa, changeReason: 'real' } } as any, respuestas as any);
  const c4 = ix4.docs.get('active')?.configuration;
  comprueba('campos del servidor sobrescriben los del cliente', c4?.createdBy === 'rsis' && c4?.updatedBy === 'rsis' && c4?.createdAt !== '2000-01-01' && c4?.updatedAt !== '2000-01-01' && c4?.changeReason === 'real' && c4?.auditTrail?.length === 1 && c4?.auditTrail[0].action === 'CREATED', c4);

  comprueba('authinfo: GET y ruta exacta', llamadas.length > 0 && llamadas.every(a => a.method === 'GET' && a.path === '/_plugins/_security/authinfo'), llamadas[0]);

  // Un fallo de OpenSearch no llega en crudo al navegador.
  const roto = { ...indice(), indices: { exists: async () => { throw new Error('secreto interno 10.0.0.5'); } } };
  r = await h.getActive(contexto(roto, usuario({ user_name: 'a', roles: [] })) as any, {} as any, respuestas as any);
  comprueba('GET con fallo: 500 genérico', r.status === 500 && !/10\.0\.0\.5/.test(JSON.stringify(r.body)), r);

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
