/**
 * Los parámetros de las rutas de evaluación, como llegan de verdad (1.2.0).
 *
 *   npx --yes tsx tests/evaluation-route-query.test.ts
 *
 * La ruta valida la consulta con `unknowns: 'ignore'`, y en
 * `@osd/config-schema` eso QUITA lo no declarado: la tendencia de la Vista
 * general mandaba `timelineControls` y nunca llegaba al servicio (la franja
 * por control salía vacía, sin ningún error). Las pruebas del servicio no lo
 * veían porque lo llamaban directamente. Aquí:
 *
 *   1. Lo que lee el servidor de la consulta está declarado en la ruta.
 *   2. Lo que mandan las pantallas (los parámetros de cada `useEnsEvaluation`,
 *      más lo que añade el cliente) está declarado.
 *   3. Las consultas reales (las que arma el cliente del navegador, como cadena
 *      de URL) pasan por el esquema de la ruta y por el manejador: la
 *      tendencia recibe el estado de cada control; sin declarar el indicador,
 *      no (el fallo que había).
 *   4. `include=overview` con `controlId`: 400.
 *
 * `@osd/config-schema` solo existe dentro del árbol de OpenSearch Dashboards;
 * el esquema se arma aquí con un constructor que hace lo mismo que él con
 * estos tipos: `maybe(string({ maxLength }))` y `unknowns: 'ignore'` (quita).
 */
import * as fs from 'fs';
import * as path from 'path';
import { createFakeIndexer, FakeDoc } from './fixtures/fake-indexer';
import { createEvaluationService } from '../server/lib/evaluation/evaluation-service';
import { createEvaluationHandlers } from '../server/lib/evaluation-handlers';
import { buildEvaluationQuerySchema, EVALUATION_QUERY_FIELDS } from '../server/routes/evaluation-query';
import { setServices } from '../public/services';
import { fetchEvaluation, fetchEvaluationProbe, fetchTraceabilityPage } from '../public/evaluation/evaluation-client';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';

declare const process: { exit(code: number): void };
declare const __dirname: string;
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) fallos.push(n);
};
const raiz = path.join(__dirname, '..');
const lee = (f: string) => fs.readFileSync(path.join(raiz, f), 'utf8');

// Lo que hace `@osd/config-schema` con estos tipos (como `@kbn/config-schema`,
// `object_type.js`: `unknowns: 'ignore'` = `stripUnknown`).
const esquema = {
  string: (o: { maxLength: number }) => ({ tipo: 'string', maxLength: o.maxLength, opcional: false }),
  maybe: (t: any) => ({ ...t, opcional: true }),
  object: (props: Record<string, any>, opciones: { unknowns: string }) => ({
    validate: (valor: Record<string, unknown>) => {
      const salida: Record<string, unknown> = {};
      for (const [clave, v] of Object.entries(valor || {})) {
        const tipo = props[clave];
        if (!tipo) {
          if (opciones.unknowns === 'ignore') continue;
          throw Object.assign(new Error(`[request query.${clave}]: definition for this key is missing`), { statusCode: 400 });
        }
        if (typeof v !== 'string') throw Object.assign(new Error(`[request query.${clave}]: expected value of type [string] but got [${typeof v}]`), { statusCode: 400 });
        if (v.length > tipo.maxLength) throw Object.assign(new Error(`[request query.${clave}]: value has length [${v.length}] but it must have a maximum length of [${tipo.maxLength}].`), { statusCode: 400 });
        salida[clave] = v;
      }
      return salida;
    },
  }),
};
const ruta = buildEvaluationQuerySchema(esquema);
const declarados = Object.keys(EVALUATION_QUERY_FIELDS);

// La cadena de la URL, como la arma el cliente HTTP del dashboard
// (`url.format({ query })`) y como la recibe la ruta (todo cadenas).
const comoUrl = (query: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
const deUrl = (cadena: string) => Object.fromEntries(new URLSearchParams(cadena));

// El cliente del navegador, con un `http` que apunta lo que se pide.
const pedidas: { path: string; query: Record<string, unknown> }[] = [];
setServices({ http: { get: async (p: string, o: any) => { pedidas.push({ path: p, query: o.query }); return { statusCode: 200, error: 0, data: {} }; } } } as any, {} as any);

(async () => {
  console.log('1. Lo que lee el servidor está declarado');
  const servicio = lee('server/lib/evaluation/evaluation-service.ts');
  const normalize = servicio.slice(servicio.indexOf('export const normalizeQuery'), servicio.indexOf('export interface ENSEvaluationContext'));
  const handlers = lee('server/lib/evaluation-handlers.ts');
  const campos = lee('server/lib/evaluation/overview-fields.ts');
  const leidos = new Set<string>([
    ...[...normalize.matchAll(/query\.(\w+)/g)].map(m => m[1]),
    ...[...handlers.matchAll(/request\?\.query\?\.(\w+)/g)].map(m => m[1]),
    ...[...handlers.matchAll(/\bq\.(\w+)/g)].map(m => m[1]),
    ...[...campos.matchAll(/overviewQueryFlags[\s\S]{0,200}?query\.(\w+)/g)].map(m => m[1]),
  ]);
  comprueba('se encuentran las lecturas (include, timelineDays, timelineControls, retryRefresh, from, size…)', ['include', 'timelineDays', 'timelineControls', 'retryRefresh', 'from', 'size', 'timeZone'].every(c => leidos.has(c)), [...leidos]);
  const sinDeclarar = [...leidos].filter(c => !declarados.includes(c));
  comprueba('todas declaradas en la ruta', sinDeclarar.length === 0, sinDeclarar);

  console.log('2. Lo que mandan las pantallas está declarado');
  const pantallas = ['public/ens/controls/index.tsx', 'public/ens/dashboard/ens-dashboard-main.tsx', 'public/ens/controls/control-detail/index.tsx', 'public/ens/overview/index.tsx', 'public/ens/evidences/index.tsx', 'public/ens/reports/index.tsx'];
  const enviados = new Set<string>();
  let llamadas = 0;
  for (const f of pantallas) {
    for (const m of lee(f).matchAll(/useEnsEvaluation(?:<[^(]*?>)?\(\s*\{([^}]*)\}/g)) {
      llamadas += 1;
      // `enabled` es del gancho (`use-evaluation.ts` lo separa), no se manda.
      for (const c of m[1].matchAll(/(?:^|,)\s*(\w+)\s*(?=[:,]|$)/g)) if (c[1] !== 'enabled') enviados.add(c[1]);
    }
  }
  comprueba('el gancho separa `enabled` de lo que manda', /const \{ enabled = true, \.\.\.pedido \} = params;/.test(lee('public/evaluation/use-evaluation.ts')));
  comprueba('se encuentran las peticiones de las pantallas (con timelineControls)', llamadas >= 7 && enviados.has('timelineControls') && enviados.has('include'), { llamadas, enviados: [...enviados] });
  const params = { include: 'summary' as const, timelineDays: 30, timelineControls: true, agentId: '101', controlId: 'op.exp.3' };
  await fetchEvaluation(params, undefined, { retryRefresh: true });
  await fetchEvaluationProbe(params);
  await fetchTraceabilityPage({ controlId: 'op.exp.3', agentId: '101', from: 100, size: 50 });
  pedidas.forEach(p => Object.keys(p.query).forEach(c => enviados.add(c)));
  const noDeclarados = [...enviados].filter(c => !declarados.includes(c));
  comprueba('todo lo que se manda (y lo que añade el cliente: timeZone, retryRefresh, from, size) está declarado', noDeclarados.length === 0 && ['timeZone', 'retryRefresh', 'from', 'size'].every(c => enviados.has(c)), noDeclarados);

  console.log('3. Las consultas reales, por la ruta y el manejador');
  const reloj = new Date('2026-10-17T12:00:00Z');
  const hora = (h: number) => new Date(reloj.getTime() - h * 3600 * 1000).toISOString();
  let n = 0;
  const hecho = (agente: string, nombre: string, data: Record<string, unknown>, horas: number): FakeDoc => ({
    _id: `h${String(++n).padStart(5, '0')}`,
    _index: 'wazuh-alerts-4.x-2026.10.17',
    _source: { '@timestamp': hora(horas), timestamp: hora(horas), id: `${Date.parse(hora(horas)) / 1000}.${n}`, manager: { name: 'wazuh-manager' }, agent: { id: agente, name: nombre }, rule: { id: '100', groups: ['ENS'] }, data },
  });
  const docs: FakeDoc[] = [];
  for (const [agente, nombre] of [['101', 'srv-web01'], ['102', 'ldap01']]) {
    for (const h of [50, 30, 5, 1]) {
      docs.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'collector_run', evidencias_cubiertas: 'EV-01,EV-02,EV-03,EV-04' }, h));
      docs.push(hecho(agente, nombre, { ensfacil: 'op.exp.3', event: 'service_running', evidence_id: 'EV-04', perfil: nombre, servicio: 'ssh.service', estado: 'CUMPLE' }, h - 0.01));
    }
  }
  const configuracion: any = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  configuracion.scope = { mode: 'group', agentIds: [], groupIds: ['ens'] };
  configuracion.updatedAt = '2026-10-14T10:00:00.000Z';
  const monitor = (id: string, name: string): FakeDoc => ({ _id: `m${id}`, _index: 'wazuh-monitoring-2026.10.17', _source: { id, name, group: ['ens'], status: 'active', timestamp: hora(0.1), manager: 'manager' } });
  const indice = createFakeIndexer([
    ...docs,
    monitor('101', 'srv-web01'),
    monitor('102', 'ldap01'),
    { _id: 'active', _index: 'wazuh-ens-configuration', _source: { documentType: 'ACTIVE_CONFIGURATION', configuration: configuracion, updatedAt: configuracion.updatedAt } },
  ], { clock: () => reloj.getTime(), user: { user_name: 'ana', roles: ['all_access'] } });
  const logger: any = { info() {}, warn() {}, debug() {}, error() {} };
  const h = createEvaluationHandlers({ logger, securityEnabled: true, service: createEvaluationService({ logger, securityEnabled: true, clock: () => reloj }) });
  const contexto = { core: { opensearch: { client: { asCurrentUser: indice, asInternalUser: indice } } } };
  const respuesta = { ok: (r: any) => ({ status: 200, data: r.body.data }), customError: (r: any) => ({ status: r.statusCode, message: r.body?.message }) };
  // Como el navegador: otra vez mientras haya filas o serie pendientes.
  const porLaRuta = async (cadena: string, validador = ruta) => {
    let r: any;
    for (let i = 0; i < 600; i++) {
      r = await h.evaluate(contexto, { query: validador.validate(deUrl(cadena)), events: {} }, respuesta);
      if (r.status !== 200 || (!r.data.meta?.pending && !r.data.meta?.seriesPending)) break;
      await new Promise(listo => setTimeout(listo, 50));
    }
    return r;
  };
  pedidas.length = 0;
  await fetchEvaluation({ include: 'summary', timelineDays: 30, timelineControls: true });
  const tendencia = comoUrl(pedidas[0].query);
  comprueba('la consulta de la tendencia lleva el indicador', /(^|&)timelineControls=true(&|$)/.test(tendencia), tendencia);
  const conIndicador = await porLaRuta(tendencia);
  const puntos = conIndicador.data?.timeline || [];
  comprueba('por la ruta, la tendencia recibe el estado de cada control en cada punto', conIndicador.status === 200 && puntos.length > 1 && puntos.every((p: any) => p.controls && Object.keys(p.controls).length > 0), { status: conIndicador.status, puntos: puntos.length, primero: puntos[0] });
  // El fallo que había: sin declararlo, el esquema lo quita y no llega.
  const sinElCampo = { ...EVALUATION_QUERY_FIELDS };
  delete sinElCampo.timelineControls;
  const rutaVieja = esquema.object(Object.fromEntries(Object.entries(sinElCampo).map(([k, max]) => [k, esquema.maybe(esquema.string({ maxLength: max }))])), { unknowns: 'ignore' });
  const sinIndicador = await porLaRuta(tendencia, rutaVieja);
  comprueba('sin declararlo, la ruta lo quitaría y los puntos llegarían sin controles (el fallo de antes)', sinIndicador.status === 200 && (sinIndicador.data?.timeline || []).every((p: any) => p.controls === undefined));
  const panel = await porLaRuta(comoUrl({ include: 'dashboard', timelineDays: 7, timeZone: 'UTC' }));
  comprueba('el Panel, por la ruta, sin las cifras por control', panel.status === 200 && (panel.data?.timeline || []).length > 0 && panel.data.timeline.every((p: any) => p.controls === undefined));
  const general = await porLaRuta(comoUrl({ include: 'overview', timeZone: 'UTC' }));
  comprueba('la Vista general, por la ruta: frescura y cola', general.status === 200 && Array.isArray(general.data?.freshness?.cells) && Array.isArray(general.data?.nonConformities));

  console.log('4. La Vista general es de todos los controles');
  const conControl = await h.evaluate(contexto, { query: ruta.validate(deUrl(comoUrl({ include: 'overview', controlId: 'op.exp.3' }))), events: {} }, respuesta);
  comprueba('include=overview con controlId: 400 con el motivo', conControl.status === 400 && /Vista general/.test(conControl.message || ''), conControl);

  console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
