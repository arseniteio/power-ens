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
 * La secuencia es la del controlador de la 1.2.0: lista de controles en frío
 * (la primera respuesta, por partes, y cuándo están todas las filas), el panel
 * con 7 días, la ficha de un control con 30 días, la de un control en una
 * máquina, todos los resultados y, en caliente, otra vez. Después, el desglose
 * de la carga en frío por control (esperando turno, esperando al indexador,
 * normalizando, el motor, la serie en segundo plano), el tiempo de red y de
 * análisis del JSON, y lo leído por control y clase (estado, acciones,
 * genéricos, latidos) frente a lo que hay en la ventana.
 *
 * Cada línea sale en cuanto se mide (escritura directa en la salida, sin
 * búfer). Al final espera a que termine lo que el servicio hace en segundo
 * plano (series, refrescos) como mucho `--wait` segundos (300 por defecto) y
 * sale con `process.exit`; un vigilante corta la medida entera a los
 * `--timeout` segundos (900).
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
  wait: Number(argumento('wait', 'ENSFACIL_WAIT') || 300),
  timeout: Number(argumento('timeout', 'ENSFACIL_TIMEOUT') || 900),
};

// Cada línea, ya: escritura síncrona en la salida estándar (sin búfer, aunque
// la salida sea una tubería).
const linea = (texto = '') => {
  try {
    fs.writeSync(1, `${texto}\n`);
  } catch {
    // salida cerrada: nada que hacer
  }
};
const vigilante = setTimeout(() => {
  linea(`CORTADO: la medida pasó de ${opciones.timeout} s`);
  process.exit(3);
}, opciones.timeout * 1000);
(vigilante as any).unref?.();
if (!opciones.cert || !opciones.key) {
  linea('Faltan --cert y --key (o ENSFACIL_INDEXER_CERT y ENSFACIL_INDEXER_KEY): el certificado con que se lee el indexador.');
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

// Llamadas, bytes, tiempo de red (de enviar a recibir la respuesta entera) y
// tiempo de análisis del JSON.
const medida = { calls: 0, bytes: 0, redMs: 0, parseMs: 0 };
const pide = (metodo: string, ruta: string, consulta: Record<string, unknown> = {}, cuerpo?: unknown): Promise<any> => {
  const motivo = permitida(metodo, ruta, consulta);
  if (motivo) return Promise.reject(new ENSWriteRefusedError(`Rechazado (la medida es de solo lectura): ${metodo} ${ruta} — ${motivo}`));
  const qs = Object.entries(consulta).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const datos = cuerpo === undefined ? undefined : JSON.stringify(cuerpo);
  return new Promise((resolve, reject) => {
    medida.calls += 1;
    const enviada = Date.now();
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
          medida.redMs += Date.now() - enviada;
          const buffer = Buffer.concat(trozos);
          medida.bytes += buffer.length;
          const texto = buffer.toString('utf8');
          const t0 = Date.now();
          const json = texto ? JSON.parse(texto) : {};
          medida.parseMs += Date.now() - t0;
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
  warn: (...a: unknown[]) => linea(`AVISO ${a.map(String).join(' ')}`),
  error: (...a: unknown[]) => linea(`ERROR ${a.map(String).join(' ')}`),
  get() {
    return logger;
  },
};
const servicio = createEvaluationService({ logger, securityEnabled: false });
const clientes = { asCurrentUser: cliente, asInternalUser: cliente };
const espera = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

const mide = async (nombre: string, q: Record<string, unknown>) => {
  const c0 = medida.calls;
  const b0 = medida.bytes;
  const t0 = Date.now();
  const salida: any = await servicio.run(clientes as any, { timeZone: opciones.tz, ...q } as any, { allowStale: true });
  const ms = Date.now() - t0;
  const meta = salida.meta;
  const serie = salida.timeline ? `serie=${salida.timeline.length}` : meta.seriesPending ? 'serie=PENDIENTE' : '';
  const pendiente = meta.pending ? `  pendiente=${meta.pending.rows}/${meta.pending.total} filas (${meta.pending.controls.length} controles)` : '';
  linea(
    `${nombre.padEnd(30)} ${String(ms).padStart(7)} ms  llamadas=${medida.calls - c0}  leído=${mb(medida.bytes - b0)}` +
      `  filas calculadas=${meta.stats.computed} hechos=${meta.stats.hits}  ${serie}${pendiente}${meta.refreshing && !meta.pending ? '  refreshing' : ''}${meta.refreshError ? `  refreshError=${meta.refreshError.message}` : ''}`
  );
  return salida;
};

// Espera a que el servicio no tenga nada en marcha (filas, series,
// lecturas, motor), como mucho `segundos`.
const esperaTranquilo = async (segundos: number): Promise<number> => {
  const t0 = Date.now();
  while (!servicio.idle() && Date.now() - t0 < segundos * 1000) await espera(100);
  return Date.now() - t0;
};

const desglose = (titulo: string) => {
  const filas = [...servicio.metrics.entries()].sort((a, b) => b[1].fetchMs + b[1].evaluateMs - (a[1].fetchMs + a[1].evaluateMs));
  const suma = { rows: 0, hits: 0, queueMs: 0, fetchMs: 0, normalizeMs: 0, evaluateMs: 0, seriesRows: 0, seriesHits: 0, seriesFetchMs: 0, seriesNormalizeMs: 0, seriesEvaluateMs: 0 };
  linea(`== ${titulo}: por control (filas, hechos | turno, indexador, normalizar, motor | serie: filas, hechos, indexador, normalizar, motor), en ms`);
  for (const [controlId, m] of filas) {
    for (const k of Object.keys(suma) as (keyof typeof suma)[]) suma[k] += m[k];
    linea(
      `   ${controlId.padEnd(14)} ${String(m.rows).padStart(3)} ${String(m.hits).padStart(7)} | ${String(m.queueMs).padStart(7)} ${String(m.fetchMs).padStart(7)} ${String(m.normalizeMs).padStart(6)} ${String(m.evaluateMs).padStart(6)}` +
        ` | ${String(m.seriesRows).padStart(3)} ${String(m.seriesHits).padStart(7)} ${String(m.seriesFetchMs).padStart(7)} ${String(m.seriesNormalizeMs).padStart(6)} ${String(m.seriesEvaluateMs).padStart(6)}`
    );
  }
  linea(
    `   ${'TOTAL'.padEnd(14)} ${String(suma.rows).padStart(3)} ${String(suma.hits).padStart(7)} | ${String(suma.queueMs).padStart(7)} ${String(suma.fetchMs).padStart(7)} ${String(suma.normalizeMs).padStart(6)} ${String(suma.evaluateMs).padStart(6)}` +
      ` | ${String(suma.seriesRows).padStart(3)} ${String(suma.seriesHits).padStart(7)} ${String(suma.seriesFetchMs).padStart(7)} ${String(suma.seriesNormalizeMs).padStart(6)} ${String(suma.seriesEvaluateMs).padStart(6)}`
  );
  linea(`   (turno e indexador se solapan entre lecturas a la vez; «(por máquina)» = latidos, hechos sin control y últimos hechos de estado, una vez por máquina)`);
};

(async () => {
  const t0 = Date.now();
  linea(`== ${opciones.url}  zona ${opciones.tz}  (solo lecturas)`);
  linea('== en frío');
  const c0 = medida.calls;
  const b0 = medida.bytes;
  const red0 = medida.redMs;
  const parse0 = medida.parseMs;
  const primera = await mide('summary (primera respuesta)', { include: 'summary' });
  linea(`   ventana ${primera.meta.window.from} → ${primera.meta.window.to}; ${primera.meta.facts.count} hechos; alcance ${primera.meta.scope.map((a: any) => a.id).join(',')}`);
  const inicio = Date.now() - (primera.meta.stats.totalMs || 0);
  // Las filas que faltaban siguen detrás: cuándo están todas (sin sondear).
  while (servicio.backgroundWork().rows > 0 && Date.now() - inicio < opciones.wait * 1000) await espera(50);
  const completo = Date.now() - inicio;
  linea(`summary completo (todas las filas)  ${String(completo).padStart(7)} ms  llamadas=${medida.calls - c0}  leído=${mb(medida.bytes - b0)}  red=${medida.redMs - red0} ms (suma de llamadas)  JSON.parse=${medida.parseMs - parse0} ms`);
  await mide('summary (otra vez)', { include: 'summary' });
  desglose('carga en frío');
  await mide('dashboard 7 días', { include: 'dashboard', timelineDays: 7 });
  const serieEn = await esperaTranquilo(opciones.wait);
  linea(`   serie en segundo plano terminada ${serieEn} ms después`);
  await mide('dashboard 7 días (con la serie)', { include: 'dashboard', timelineDays: 7 });
  await mide(`control ${opciones.control} 30 días`, { include: 'control', controlId: opciones.control, timelineDays: 30 });
  await mide(`control op.mon.3 en ${opciones.agent}`, { include: 'control', controlId: 'op.mon.3', agentId: opciones.agent, timelineDays: 30 });
  await mide('results', { include: 'results' });
  linea('== en caliente');
  await mide('summary', { include: 'summary' });
  await mide('dashboard 7 días', { include: 'dashboard', timelineDays: 7 });
  await mide(`control ${opciones.control} 30 días`, { include: 'control', controlId: opciones.control, timelineDays: 30 });
  await mide(`summary máquina ${opciones.agent}`, { include: 'summary', agentId: opciones.agent });
  desglose('todo (carga en frío + serie)');

  // Lo que hay en la ventana por control y clase, frente a lo leído.
  const ventana = primera.meta.window;
  const enVentana = await cliente.search({
    index: 'wazuh-alerts-*',
    body: {
      size: 0,
      query: { bool: { filter: [{ range: { '@timestamp': { gte: ventana.from, lte: ventana.to } } }, { exists: { field: 'data.ensfacil' } }] } },
      aggs: { c: { terms: { field: 'data.ensfacil', size: 200 }, aggs: { e: { terms: { field: 'data.event', size: 500 } } } } },
    },
  });
  linea('== por control: leído (carga en frío y serie) / en la ventana (estado, acciones, genéricos, latidos)');
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
    linea(`   ${String(c.key).padEnd(10)} ${celdas.join('  ')}`);
  }
  linea(`   TOTAL      ${Object.entries(total).map(([k, [a, b]]) => `${k} ${a}/${b}`).join('  ')}`);
  const resto = await esperaTranquilo(opciones.wait);
  linea(
    `memoria del proceso ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB; ${medida.calls} llamadas, ${mb(medida.bytes)} leídos, red ${medida.redMs} ms, JSON.parse ${medida.parseMs} ms, en ${((Date.now() - t0) / 1000).toFixed(1)} s` +
      (servicio.idle() ? '' : `; quedaba trabajo en segundo plano tras ${resto} ms: ${JSON.stringify(servicio.backgroundWork())}`)
  );
  process.exit(0);
})().catch(e => {
  linea(`FALLO ${e?.message || e}`);
  process.exit(1);
});
