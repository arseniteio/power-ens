/**
 * Un índice diario de la ventana sin ningún hecho de ENSFácil (1.2.0).
 *
 *   npx --yes tsx tests/evaluation-unmapped-sort.test.ts
 *
 * La plantilla de Wazuh mapea `data.*` de forma dinámica: un día sin hechos de
 * ENSFácil (recolectores parados, o los días anteriores a instalarlo) no tiene
 * `data.ensfacil`. La lectura por máquina ordena por ese campo y nombra cada
 * índice diario de la ventana; sin `unmapped_type`, OpenSearch responde 400
 * («No mapping found for [data.ensfacil] in order to sort on») y no carga nada.
 *
 *   1. El falso hace lo mismo que OpenSearch: 400 sin `unmapped_type`, bien con él.
 *   2. Con un día sin hechos de ENSFácil en la ventana, la primera carga
 *      responde, y con lo mismo que sin ese día.
 *   3. Si el flujo por máquina recibe cualquier 4xx del indexador, las filas se
 *      leen una a una (con el orden de siempre) y salen igual; la serie también.
 */
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { buildEvaluationResponse } from '../server/lib/evaluation/responses';
import { STREAM_SORT, FACTS_SORT } from '../server/lib/evaluation/queries';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) fallos.push(n);
};
const canon = (v: any): any => Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.keys(v).sort().filter(k => k !== 'evaluatedAt' && k !== 'meta').map(k => [k, canon(v[k])])) : v;
const igual = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const reloj = new Date('2026-10-17T12:00:00Z');
const hora = (h: number) => new Date(reloj.getTime() - h * 3600 * 1000).toISOString();
const diaDe = (iso: string) => iso.slice(0, 10).replace(/-/g, '.');
let n = 0;
const hecho = (agente: string, nombre: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
  _id: `h${String(++n).padStart(5, '0')}`,
  _index: `wazuh-alerts-4.x-${diaDe(hora(horas))}`,
  _source: { '@timestamp': hora(horas), timestamp: hora(horas), id: `${Date.parse(hora(horas)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agente, name: nombre }, rule: { id: '100', groups: ['ENS'] }, data },
});

// Hechos de ENSFácil el 15 y el 17; el 16, solo una alerta de Wazuh sin nada
// de ENSFácil (su índice no mapea `data.ensfacil`).
const ens: FakeDoc[] = [];
for (const [agente, nombre] of [['101', 'srv-web01'], ['102', 'ldap01']]) {
  for (const h of [50, 3, 1]) {
    ens.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
    ens.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: nombre, servicio: 'ssh.service', estado: 'CUMPLE' }, h - 0.01));
    ens.push(hecho(agente, nombre, { ensfacil: 'op.acc.1', event: 'collector_run' }, h));
  }
}
const ajena: FakeDoc = {
  _id: 'otra-1',
  _index: 'wazuh-alerts-4.x-2026.10.16',
  _source: { '@timestamp': hora(24), timestamp: hora(24), id: 'x.1', manager: { name: 'wazuh-manager' }, agent: { id: '101', name: 'srv-web01' }, rule: { id: '5715', groups: ['sshd'] }, data: { srcip: '192.0.2.10' } },
};
comprueba('preparación: la alerta ajena cae en un día sin hechos de ENSFácil', !ens.some(d => d._index === ajena._index));

const monitor = (id: string, name: string): FakeDoc => ({
  _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17',
  _source: { id, name, group: ['ens'], status: 'active', timestamp: hora(0.1), manager: 'manager' },
});
const configuracion: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
configuracion.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
configuracion.updatedAt = '2026-10-14T10:00:00.000Z';
const resto: FakeDoc[] = [
  monitor('101', 'srv-web01'),
  monitor('102', 'ldap01'),
  { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuracion, updatedAt: configuracion.updatedAt } },
];
const indexador = (docs: FakeDoc[]) => createFakeIndexer([...docs, ...resto], { clock: () => reloj.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
const logger: any = { info() {}, warn() {}, debug() {}, error() {} };

// Pide como el navegador: otra vez mientras haya filas o serie pendientes.
const pide = async (servicio: any, clientes: any, q: any) => {
  let r = buildEvaluationResponse(await servicio.run(clientes, { timeZone: 'UTC', ...q }, { allowStale: true })) as any;
  for (let i = 0; i < 600 && (r.meta?.pending || r.meta?.seriesPending); i++) {
    await new Promise(listo => setTimeout(listo, 50));
    r = buildEvaluationResponse(await servicio.run(clientes, { timeZone: 'UTC', ...q }, { allowStale: true })) as any;
  }
  return r;
};

(async () => {
  console.log('1. El falso, como OpenSearch');
  const conAjena = indexador([...ens, ajena]);
  const busca = (sort: unknown[]) =>
    conAjena.search({ index: 'wazuh-alerts-4.x-2026.10.15,wazuh-alerts-4.x-2026.10.16,wazuh-alerts-4.x-2026.10.17', body: { size: 1, sort, query: { match_all: {} } } });
  let error: any;
  try {
    await busca([{ 'data.ensfacil': { order: 'asc' } }]);
  } catch (e) {
    error = e;
  }
  comprueba('ordenar por data.ensfacil sin unmapped_type sobre un día que no lo mapea: 400 «No mapping found»', error?.meta?.statusCode === 400 && /No mapping found for \[data\.ensfacil\] in order to sort on/.test(error?.message), error?.message);
  const bien = await busca([{ 'data.ensfacil': { order: 'asc', missing: '_last', unmapped_type: 'keyword' } }]);
  comprueba('con unmapped_type responde', bien.body.hits.hits.length === 1);
  comprueba('el orden del flujo lleva unmapped_type en todas sus claves salvo la fecha', STREAM_SORT.every((s: any) => {
    const [campo, o] = Object.entries(s)[0] as [string, any];
    return campo === '@timestamp' || o.unmapped_type === 'keyword';
  }) && STREAM_SORT.length === FACTS_SORT.length + 1);

  console.log('2. Un día sin hechos de ENSFácil en la ventana');
  const referencia = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
  const sinAjena = indexador(ens);
  const clientesRef = { asCurrentUser: sinAjena, asInternalUser: sinAjena };
  const servicio = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
  const clientes = { asCurrentUser: conAjena, asInternalUser: conAjena };
  let respuesta: any;
  let fallo: any;
  try {
    respuesta = await pide(servicio, clientes, { include: 'results' });
  } catch (e) {
    fallo = e;
  }
  comprueba('la primera carga responde', !fallo && Array.isArray(respuesta?.results), fallo?.message);
  const nombrado = conAjena.log.some(l => typeof l.index === 'string' && l.index.split(',').includes('wazuh-alerts-4.x-2026.10.16') && (l.body?.sort || [])[0]?.['data.ensfacil']);
  comprueba('y el flujo por máquina sí nombró el día sin hechos', nombrado);
  const esperado = await pide(referencia, clientesRef, { include: 'results' });
  comprueba('con lo mismo que sin ese día', respuesta && igual(respuesta.results, esperado.results) && igual(respuesta.agents, esperado.agents));

  console.log('3. Un 400 del flujo: fila a fila');
  const rechazos: string[] = [];
  const rechazador = {
    ...conAjena,
    search: async (p: any) => {
      if ((p.body?.sort || [])[0]?.['data.ensfacil']) {
        rechazos.push(p.index);
        throw Object.assign(new Error('illegal_argument_exception'), { statusCode: 400, meta: { statusCode: 400 } });
      }
      return conAjena.search(p);
    },
  };
  const servicio3 = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
  const clientes3 = { asCurrentUser: rechazador, asInternalUser: rechazador };
  let r3: any;
  let f3: any;
  try {
    r3 = await pide(servicio3, clientes3, { include: 'results' });
  } catch (e) {
    f3 = e;
  }
  comprueba('el flujo se rechazó y aun así responde', rechazos.length > 0 && !f3, f3?.message);
  comprueba('con las filas leídas una a una, igual que el flujo', r3 && igual(r3.results, esperado.results) && igual(r3.agents, esperado.agents));
  let serie: any;
  let fs: any;
  try {
    serie = await pide(servicio3, clientes3, { include: 'dashboard', timelineDays: 3 });
  } catch (e) {
    fs = e;
  }
  const serieRef = await pide(referencia, clientesRef, { include: 'dashboard', timelineDays: 3 });
  comprueba('la serie también se calcula fila a fila', !fs && !serie?.meta?.seriesPending && (serie?.timeline || []).length > 1, fs?.message || serie?.meta);
  comprueba('y es la misma', serie && igual((serie.timeline || []).map((p: any) => [p.label, p.score]), (serieRef.timeline || []).map((p: any) => [p.label, p.score])));

  console.log('4. Solo un 400 pasa a fila a fila: 401/403 y 429/5xx fallan con su motivo');
  for (const estado of [401, 403, 429, 503]) {
    const lecturas: string[] = [];
    const conEstado = {
      ...conAjena,
      search: async (p: any) => {
        if ((p.body?.sort || [])[0]?.['data.ensfacil']) {
          throw Object.assign(new Error(`estado ${estado}`), { statusCode: estado, meta: { statusCode: estado } });
        }
        if (p.body?.size > 0) lecturas.push(JSON.stringify(p.body.query).slice(0, 80));
        return conAjena.search(p);
      },
    };
    const s4 = createEvaluationService({ logger, securityEnabled: true, clock: () => reloj });
    let f4: any;
    try {
      await pide(s4, { asCurrentUser: conEstado, asInternalUser: conEstado }, { include: 'results' });
    } catch (e) {
      f4 = e;
    }
    comprueba(`${estado}: falla con su estado y su motivo (no se reintenta fila a fila)`, Number(f4?.meta?.statusCode ?? f4?.statusCode) === estado && new RegExp(`estado ${estado}`).test(f4?.message || ''), f4?.message);
  }

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
