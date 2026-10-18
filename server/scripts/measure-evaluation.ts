/**
 * Mide la evaluación del servidor de ENSFácil contra un indexador real, con
 * el mismo servicio que la ruta (`createEvaluationService`) y sin la capa
 * HTTP. Herramienta de mantenimiento: no la carga el plugin.
 *
 * SOLO LECTURAS, POR CONSTRUCCIÓN. El cliente que recibe el servicio solo
 * sabe hacer `POST /<índice>/_search` (con una lista cerrada de parámetros,
 * sin `scroll` ni PIT), `HEAD /<índice>` y `GET /_plugins/_security/authinfo`.
 * Cualquier otra cosa —crear el índice de configuración si falta, `_bulk`,
 * `_doc`, `_update`, un PIT— se rechaza ANTES de enviarse y la medida falla.
 * No escribe ficheros: todo sale por la salida estándar.
 *
 *   npx --yes tsx server/scripts/measure-evaluation.ts \
 *     --url https://127.0.0.1:9200 \
 *     --ca /ruta/root-ca.pem --cert /ruta/admin.pem --key /ruta/admin-key.pem \
 *     [--tz Europe/Madrid] [--control op.acc.1] [--agent 000]
 *
 * Las mismas opciones por entorno: ENSFACIL_INDEXER_URL, ENSFACIL_INDEXER_CA,
 * ENSFACIL_INDEXER_CERT, ENSFACIL_INDEXER_KEY, ENSFACIL_TZ. `--insecure`
 * (o ENSFACIL_INDEXER_INSECURE=1) no comprueba el certificado del indexador.
 *
 * La secuencia es la del controlador de la 1.2.0: lista de controles en frío,
 * el panel con 7 días, la ficha de un control con 30 días, la de un control en
 * una máquina, todos los resultados y, en caliente, otra vez. Al final, lo que
 * se leyó por control (estado, acciones, genéricos, latidos) frente a lo que
 * hay en la ventana.
 */
import * as fs from 'fs';
import * as https from 'https';
import { createEvaluationService } from '../lib/evaluation/evaluation-service';
import { getStateFactEventTypes } from '../../common/ens/core/evidence/state-facts';

declare const process: any;
declare const Buffer: any;

// --- opciones -------------------------------------------------------------------
const argumento = (nombre: string, entorno: string): string | undefined => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : process.env[entorno];
};
const opciones = {
  url: argumento('url', 'ENSFACIL_INDEXER_URL') || 'https://127.0.0.1:9200',
  ca: argumento('ca', 'ENSFACIL_INDEXER_CA'),
  cert: argumento('cert', 'ENSFACIL_INDEXER_CERT'),
  key: argumento('key', 'ENSFACIL_INDEXER_KEY'),
  tz: argumento('tz', 'ENSFACIL_TZ') || 'Europe/Madrid',
  control: argumento('control', 'ENSFACIL_CONTROL') || 'op.acc.1',
  agent: argumento('agent', 'ENSFACIL_AGENT') || '000',
  insecure: process.argv.includes('--insecure') || process.env.ENSFACIL_INDEXER_INSECURE === '1',
};
if (!opciones.cert || !opciones.key) {
  console.error('Faltan --cert y --key (o ENSFACIL_INDEXER_CERT y ENSFACIL_INDEXER_KEY): el certificado con que se lee el indexador.');
  process.exit(2);
}
const destino = new URL(opciones.url);

// --- el cliente de solo lectura ---------------------------------------------------
const agente = new https.Agent({
  ca: opciones.ca ? fs.readFileSync(opciones.ca) : undefined,
  cert: fs.readFileSync(opciones.cert),
  key: fs.readFileSync(opciones.key),
  rejectUnauthorized: !opciones.insecure,
  keepAlive: true,
});

export class ENSWriteRefusedError extends Error {}

// Lo único que sale hacia el indexador. Se comprueba aquí, en el último
// punto antes de la red: método, ruta y parámetros.
const INDICE = /^[a-z0-9*][a-z0-9*._,-]*$/;
const PARAMETROS_DE_BUSQUEDA = new Set(['allow_partial_search_results', 'ignore_unavailable', 'track_total_hits']);
const permitida = (metodo: string, ruta: string, consulta: Record<string, unknown>): string | undefined => {
  const partes = ruta.split('/').filter(Boolean);
  if (metodo === 'POST' && partes.length === 2 && partes[1] === '_search' && INDICE.test(partes[0])) {
    const ajeno = Object.keys(consulta).find(k => !PARAMETROS_DE_BUSQUEDA.has(k));
    return ajeno ? `parámetro no permitido en una búsqueda: ${ajeno}` : undefined;
  }
  if (metodo === 'HEAD' && partes.length === 1 && INDICE.test(partes[0]) && !Object.keys(consulta).length) return undefined;
  if (metodo === 'GET' && ruta === '/_plugins/_security/authinfo' && !Object.keys(consulta).length) return undefined;
  return 'solo búsquedas, HEAD de un índice y authinfo';
};

const medida = { calls: 0, bytes: 0 };
const pide = (metodo: string, ruta: string, consulta: Record<string, unknown> = {}, cuerpo?: unknown): Promise<any> => {
  const motivo = permitida(metodo, ruta, consulta);
  if (motivo) return Promise.reject(new ENSWriteRefusedError(`Rechazado (la medida es de solo lectura): ${metodo} ${ruta} — ${motivo}`));
  const qs = Object.entries(consulta).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const datos = cuerpo === undefined ? undefined : JSON.stringify(cuerpo);
  return new Promise((resolve, reject) => {
    medida.calls += 1;
    const req = https.request(
      {
        host: destino.hostname,
        port: destino.port || 443,
        method: metodo,
        path: ruta.split('/').map(encodeURIComponent).join('/').replace(/%2C/g, ',').replace(/%2A/g, '*') + (qs ? `?${qs}` : ''),
        agent: agente,
        headers: { 'content-type': 'application/json', ...(datos ? { 'content-length': Buffer.byteLength(datos) } : {}) },
      },
      (res: any) => {
        const trozos: any[] = [];
        res.on('data', (c: any) => trozos.push(c));
        res.on('end', () => {
          const texto = Buffer.concat(trozos).toString('utf8');
          medida.bytes += texto.length;
          const json = texto ? JSON.parse(texto) : {};
          const status = res.statusCode || 500;
          if (status >= 400) {
            const e: any = new Error(`${status} ${texto.slice(0, 300)}`);
            e.statusCode = status;
            e.body = json;
            e.meta = { statusCode: status, body: json };
            return reject(e);
          }
          resolve({ body: json, statusCode: status });
        });
      }
    );
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
};

// Lo que se leyó de hechos, por control y clase (para el resumen final).
const leido = new Map<string, Record<string, number>>();
const GENERICOS = ['evidence_state', 'control_state', 'score_snapshot'];
const claseDe = (controlId: string, evento: string): string =>
  evento === 'collector_run' ? 'latidos' : GENERICOS.includes(evento) ? 'genéricos' : getStateFactEventTypes(controlId).has(evento) ? 'estado' : 'acciones';
const anota = (body: any) => {
  for (const hit of body?.hits?.hits || []) {
    const control = String(hit?._source?.data?.ensfacil || '(sin control)');
    const fila = leido.get(control) || {};
    const clase = claseDe(control, String(hit?._source?.data?.event || ''));
    fila[clase] = (fila[clase] || 0) + 1;
    leido.set(control, fila);
  }
};

const cliente = {
  search: async ({ index, body, ...resto }: any) => {
    const r = await pide('POST', `/${index}/_search`, resto, body);
    if (body?.size > 0) anota(r.body);
    return r;
  },
  indices: {
    exists: ({ index }: any) => pide('HEAD', `/${index}`).then(() => ({ body: true }), (e: any) => (e?.statusCode === 404 ? { body: false } : Promise.reject(e))),
    create: ({ index }: any) => Promise.reject(new ENSWriteRefusedError(`Rechazado (la medida es de solo lectura): crear el índice ${index}`)),
  },
  transport: {
    request: ({ method, path, querystring, body }: any) => pide(String(method || 'GET').toUpperCase(), path, querystring || {}, body),
  },
};

// --- la secuencia ------------------------------------------------------------------
const logger: any = {
  debug() {},
  info() {},
  warn: (...a: unknown[]) => console.error('AVISO', ...a),
  error: (...a: unknown[]) => console.error('ERROR', ...a),
  get() {
    return logger;
  },
};
const servicio = createEvaluationService({ logger, securityEnabled: false });
const clientes = { asCurrentUser: cliente, asInternalUser: cliente };

const mide = async (nombre: string, q: Record<string, unknown>) => {
  const c0 = medida.calls;
  const b0 = medida.bytes;
  const t0 = Date.now();
  const salida: any = await servicio.run(clientes as any, { timeZone: opciones.tz, ...q } as any, { allowStale: true });
  const ms = Date.now() - t0;
  const meta = salida.meta;
  const serie = salida.timeline ? `serie=${salida.timeline.length}` : meta.timelinePending ? 'serie=PENDIENTE' : '';
  console.log(
    `${nombre.padEnd(30)} ${String(ms).padStart(7)} ms  llamadas=${medida.calls - c0}  leído=${((medida.bytes - b0) / 1e6).toFixed(1)} MB` +
      `  filas calculadas=${meta.stats.computed} hechos=${meta.stats.hits}  ${serie}${meta.refreshing ? '  refreshing' : ''}${meta.refreshError ? `  refreshError=${meta.refreshError.message}` : ''}`
  );
  return salida;
};

(async () => {
  const t0 = Date.now();
  console.log(`== ${opciones.url}  zona ${opciones.tz}  (solo lecturas)`);
  console.log('== en frío');
  const resumen = await mide('summary', { include: 'summary' });
  console.log(`   ventana ${resumen.meta.window.from} → ${resumen.meta.window.to}; ${resumen.meta.facts.count} hechos; alcance ${resumen.meta.scope.map((a: any) => a.id).join(',')}`);
  await mide('dashboard 7 días', { include: 'dashboard', timelineDays: 7 });
  await mide(`control ${opciones.control} 30 días`, { include: 'control', controlId: opciones.control, timelineDays: 30 });
  await mide(`control op.mon.3 en ${opciones.agent}`, { include: 'control', controlId: 'op.mon.3', agentId: opciones.agent, timelineDays: 30 });
  await mide('results', { include: 'results' });
  console.log('== en caliente');
  await mide('summary', { include: 'summary' });
  await mide('dashboard 7 días', { include: 'dashboard', timelineDays: 7 });
  await mide(`control ${opciones.control} 30 días`, { include: 'control', controlId: opciones.control, timelineDays: 30 });
  await mide(`summary máquina ${opciones.agent}`, { include: 'summary', agentId: opciones.agent });

  // Lo que hay en la ventana por control y clase, frente a lo leído.
  const ventana = resumen.meta.window;
  const enVentana = await cliente.search({
    index: 'wazuh-alerts-*',
    body: {
      size: 0,
      query: { bool: { filter: [{ range: { '@timestamp': { gte: ventana.from, lte: ventana.to } } }, { exists: { field: 'data.ensfacil' } }] } },
      aggs: { c: { terms: { field: 'data.ensfacil', size: 200 }, aggs: { e: { terms: { field: 'data.event', size: 500 } } } } },
    },
  });
  console.log('== por control: leído / en la ventana (estado, acciones, genéricos, latidos)');
  const total: Record<string, [number, number]> = {};
  for (const c of enVentana.body?.aggregations?.c?.buckets || []) {
    const hay: Record<string, number> = {};
    for (const e of c.e?.buckets || []) {
      const clase = claseDe(String(c.key), String(e.key));
      hay[clase] = (hay[clase] || 0) + e.doc_count;
    }
    const lei = leido.get(String(c.key)) || {};
    const celdas = ['estado', 'acciones', 'genéricos', 'latidos'].map(k => {
      total[k] = [(total[k]?.[0] || 0) + (lei[k] || 0), (total[k]?.[1] || 0) + (hay[k] || 0)];
      return `${k} ${lei[k] || 0}/${hay[k] || 0}`;
    });
    console.log(`   ${String(c.key).padEnd(10)} ${celdas.join('  ')}`);
  }
  console.log(`   TOTAL      ${Object.entries(total).map(([k, [a, b]]) => `${k} ${a}/${b}`).join('  ')}`);
  console.log(`memoria del proceso ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB; ${medida.calls} llamadas, ${(medida.bytes / 1e6).toFixed(1)} MB leídos en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  process.exit(0);
})().catch(e => {
  console.error('FALLO', e?.message || e);
  process.exit(1);
});
