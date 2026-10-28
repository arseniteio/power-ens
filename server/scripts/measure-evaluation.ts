/**
 * Measures the Power ENS server evaluation against a real indexer, with the same service as the
 * route (`createEvaluationService`) and without the HTTP layer. Maintenance tool: the plugin does not load it.
 *
 * READ-ONLY BY CONSTRUCTION. The client given to the service can only `POST /<index>/_search` (closed
 * parameter list, no `scroll` or PIT), `HEAD /<index>` and `GET /_plugins/_security/authinfo`; anything
 * else (creating the configuration index, `_bulk`, `_doc`, `_update`, a PIT) is refused BEFORE it is sent
 * and the measurement fails. It writes no files: everything goes to standard output.
 *
 *   npx --yes tsx server/scripts/measure-evaluation.ts \
 *     --url https://127.0.0.1:9200 \
 *     --ca /path/root-ca.pem --cert /path/admin.pem --key /path/admin-key.pem \
 *     [--tz Europe/Madrid] [--control op.acc.1] [--agent 000]
 *
 * The same options by environment: POWER_ENS_INDEXER_URL, POWER_ENS_INDEXER_CA, POWER_ENS_INDEXER_CERT,
 * POWER_ENS_INDEXER_KEY, POWER_ENS_TZ. `--insecure` (or POWER_ENS_INDEXER_INSECURE=1) skips the indexer
 * certificate check.
 *
 * Sequence of the 1.2.0 controller: cold control list (first partial response, and when all rows exist),
 * the panel with 7 days, a control with 30 days, a control on one machine, all results, then hot again.
 * Then the cold-load breakdown per control (waiting for a turn, waiting for the indexer, normalising, the
 * engine, the background series), network and JSON parse time, and what was read per control and class
 * (state, actions, generic, heartbeats) against what is in the window.
 *
 * Each line is written as soon as it is measured (unbuffered). At the end it waits up to `--wait` seconds
 * (300 by default) for the service's background work (series, refreshes) and exits with `process.exit`;
 * a watchdog cuts the whole measurement after `--timeout` seconds (900).
 */
import * as fs from 'fs';
import * as https from 'https';
import { createEvaluationService } from '../lib/evaluation/evaluation-service';
import { getStateFactEventTypes } from '../../common/ens/core/evidence/state-facts';

declare const process: any;
declare const Buffer: any;

// --- options ---
const argument = (name: string, environmentVariable: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : process.env[environmentVariable];
};
const options = {
  url: argument('url', 'POWER_ENS_INDEXER_URL') || 'https://127.0.0.1:9200',
  ca: argument('ca', 'POWER_ENS_INDEXER_CA'),
  cert: argument('cert', 'POWER_ENS_INDEXER_CERT'),
  key: argument('key', 'POWER_ENS_INDEXER_KEY'),
  tz: argument('tz', 'POWER_ENS_TZ') || 'Europe/Madrid',
  control: argument('control', 'POWER_ENS_CONTROL') || 'op.acc.1',
  agent: argument('agent', 'POWER_ENS_AGENT') || '000',
  insecure: process.argv.includes('--insecure') || process.env.POWER_ENS_INDEXER_INSECURE === '1',
  wait: Number(argument('wait', 'POWER_ENS_WAIT') || 300),
  timeout: Number(argument('timeout', 'POWER_ENS_TIMEOUT') || 900),
};

// Each line at once: synchronous write to standard output (unbuffered, even through a pipe).
const line = (text = '') => {
  try {
    fs.writeSync(1, `${text}\n`);
  } catch {
    // output closed: nothing to do
  }
};
const watchdog = setTimeout(() => {
  line(`CUT: the measurement exceeded ${options.timeout} s`);
  process.exit(3);
}, options.timeout * 1000);
(watchdog as any).unref?.();
if (!options.cert || !options.key) {
  line('Missing --cert and --key (or POWER_ENS_INDEXER_CERT and POWER_ENS_INDEXER_KEY): the certificate used to read the indexer.');
  process.exit(2);
}
const target = new URL(options.url);

// --- the read-only client ---
const httpsAgent = new https.Agent({
  ca: options.ca ? fs.readFileSync(options.ca) : undefined,
  cert: fs.readFileSync(options.cert),
  key: fs.readFileSync(options.key),
  rejectUnauthorized: !options.insecure,
  keepAlive: true,
});

export class ENSWriteRefusedError extends Error {}

// The only thing that goes to the indexer, checked at the last point before the network: method, path and
// parameters.
const INDEX_NAME = /^[a-z0-9*][a-z0-9*._,-]*$/;
const SEARCH_PARAMETERS = new Set(['allow_partial_search_results', 'ignore_unavailable', 'track_total_hits']);
const refusalReason = (method: string, path: string, query: Record<string, unknown>): string | undefined => {
  const parts = path.split('/').filter(Boolean);
  if (method === 'POST' && parts.length === 2 && parts[1] === '_search' && INDEX_NAME.test(parts[0])) {
    const foreign = Object.keys(query).find(k => !SEARCH_PARAMETERS.has(k));
    return foreign ? `parameter not allowed in a search: ${foreign}` : undefined;
  }
  if (method === 'HEAD' && parts.length === 1 && INDEX_NAME.test(parts[0]) && !Object.keys(query).length) return undefined;
  if (method === 'GET' && path === '/_plugins/_security/authinfo' && !Object.keys(query).length) return undefined;
  return 'only searches, HEAD of an index and authinfo';
};

// Calls, bytes, network time (from sending to receiving the whole response) and JSON parse time.
const measurement = { calls: 0, bytes: 0, networkMs: 0, parseMs: 0 };
// A reused connection the other side had already closed (`ECONNRESET`, `EPIPE`) is retried once: every request
// is a read.
const request = (method: string, path: string, query: Record<string, unknown> = {}, body?: unknown): Promise<any> =>
  requestOnce(method, path, query, body).catch((error: any) =>
    ['ECONNRESET', 'EPIPE'].includes(error?.code) ? requestOnce(method, path, query, body) : Promise.reject(error)
  );

const requestOnce = (method: string, path: string, query: Record<string, unknown> = {}, body?: unknown): Promise<any> => {
  const reason = refusalReason(method, path, query);
  if (reason) return Promise.reject(new ENSWriteRefusedError(`Refused (the measurement is read-only): ${method} ${path} — ${reason}`));
  const queryString = Object.entries(query).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    measurement.calls += 1;
    const sentAt = Date.now();
    const req = https.request(
      {
        host: target.hostname,
        port: target.port || 443,
        method,
        path: path.split('/').map(encodeURIComponent).join('/').replace(/%2C/g, ',').replace(/%2A/g, '*') + (queryString ? `?${queryString}` : ''),
        agent: httpsAgent,
        headers: { 'content-type': 'application/json', ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}) },
      },
      (res: any) => {
        const chunks: any[] = [];
        res.on('data', (c: any) => chunks.push(c));
        res.on('end', () => {
          measurement.networkMs += Date.now() - sentAt;
          const buffer = Buffer.concat(chunks);
          measurement.bytes += buffer.length;
          const text = buffer.toString('utf8');
          const t0 = Date.now();
          const json = text ? JSON.parse(text) : {};
          measurement.parseMs += Date.now() - t0;
          const status = res.statusCode || 500;
          if (status >= 400) {
            const e: any = new Error(`${status} ${text.slice(0, 300)}`);
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
    if (payload) req.write(payload);
    req.end();
  });
};

// Facts read, per control and class (for the final summary).
const factsRead = new Map<string, Record<string, number>>();
const GENERIC = ['evidence_state', 'control_state', 'score_snapshot'];
const classOf = (controlId: string, event: string): string =>
  event === 'collector_run' ? 'heartbeats' : GENERIC.includes(event) ? 'generic' : getStateFactEventTypes(controlId).has(event) ? 'state' : 'actions';
const annotate = (body: any) => {
  for (const hit of body?.hits?.hits || []) {
    const control = String(hit?._source?.data?.power_ens || '(no control)');
    const counts = factsRead.get(control) || {};
    const factClass = classOf(control, String(hit?._source?.data?.event || ''));
    counts[factClass] = (counts[factClass] || 0) + 1;
    factsRead.set(control, counts);
  }
};

const client = {
  search: async ({ index, body, ...rest }: any) => {
    const r = await request('POST', `/${index}/_search`, rest, body);
    if (body?.size > 0) annotate(r.body);
    return r;
  },
  indices: {
    exists: ({ index }: any) => request('HEAD', `/${index}`).then(() => ({ body: true }), (e: any) => (e?.statusCode === 404 ? { body: false } : Promise.reject(e))),
    create: ({ index }: any) => Promise.reject(new ENSWriteRefusedError(`Refused (the measurement is read-only): create index ${index}`)),
  },
  transport: {
    request: ({ method, path, querystring, body }: any) => request(String(method || 'GET').toUpperCase(), path, querystring || {}, body),
  },
};

// --- the sequence ---
const logger: any = {
  debug() {},
  info() {},
  warn: (...a: unknown[]) => line(`WARNING ${a.map(String).join(' ')}`),
  error: (...a: unknown[]) => line(`ERROR ${a.map(String).join(' ')}`),
  get() {
    return logger;
  },
};
const service = createEvaluationService({ logger, securityEnabled: false });
const clients = { asCurrentUser: client, asInternalUser: client };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

const measureRun = async (name: string, q: Record<string, unknown>) => {
  const c0 = measurement.calls;
  const b0 = measurement.bytes;
  const t0 = Date.now();
  const output: any = await service.run(clients as any, { timeZone: options.tz, ...q } as any, { allowStale: true });
  const ms = Date.now() - t0;
  const meta = output.meta;
  const series = output.timeline ? `series=${output.timeline.length}` : meta.seriesPending ? 'series=PENDING' : '';
  const pending = meta.pending ? `  pending=${meta.pending.rows}/${meta.pending.total} rows (${meta.pending.controls.length} controls)` : '';
  line(
    `${name.padEnd(30)} ${String(ms).padStart(7)} ms  calls=${measurement.calls - c0}  read=${mb(measurement.bytes - b0)}` +
      `  rows computed=${meta.stats.computed} facts=${meta.stats.hits}  ${series}${pending}${meta.refreshing && !meta.pending ? '  refreshing' : ''}${meta.refreshError ? `  refreshError=${meta.refreshError.message}` : ''}`
  );
  return output;
};

// Waits until the service has nothing running (rows, series, reads, engine), at most `seconds`.
const waitUntilIdle = async (seconds: number): Promise<number> => {
  const t0 = Date.now();
  while (!service.idle() && Date.now() - t0 < seconds * 1000) await sleep(100);
  return Date.now() - t0;
};

const breakdown = (title: string) => {
  const entries = [...service.metrics.entries()].sort((a, b) => b[1].fetchMs + b[1].evaluateMs - (a[1].fetchMs + a[1].evaluateMs));
  const total = { rows: 0, hits: 0, queueMs: 0, fetchMs: 0, normalizeMs: 0, evaluateMs: 0, seriesRows: 0, seriesHits: 0, seriesFetchMs: 0, seriesNormalizeMs: 0, seriesEvaluateMs: 0 };
  line(`== ${title}: per control (rows, facts | turn, indexer, normalise, engine | series: rows, facts, indexer, normalise, engine), in ms`);
  for (const [controlId, m] of entries) {
    for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += m[k];
    line(
      `   ${controlId.padEnd(14)} ${String(m.rows).padStart(3)} ${String(m.hits).padStart(7)} | ${String(m.queueMs).padStart(7)} ${String(m.fetchMs).padStart(7)} ${String(m.normalizeMs).padStart(6)} ${String(m.evaluateMs).padStart(6)}` +
        ` | ${String(m.seriesRows).padStart(3)} ${String(m.seriesHits).padStart(7)} ${String(m.seriesFetchMs).padStart(7)} ${String(m.seriesNormalizeMs).padStart(6)} ${String(m.seriesEvaluateMs).padStart(6)}`
    );
  }
  line(
    `   ${'TOTAL'.padEnd(14)} ${String(total.rows).padStart(3)} ${String(total.hits).padStart(7)} | ${String(total.queueMs).padStart(7)} ${String(total.fetchMs).padStart(7)} ${String(total.normalizeMs).padStart(6)} ${String(total.evaluateMs).padStart(6)}` +
      ` | ${String(total.seriesRows).padStart(3)} ${String(total.seriesHits).padStart(7)} ${String(total.seriesFetchMs).padStart(7)} ${String(total.seriesNormalizeMs).padStart(6)} ${String(total.seriesEvaluateMs).padStart(6)}`
  );
  line(`   (turn and indexer overlap between concurrent reads; «(por máquina)» = heartbeats, facts without a control and last state facts, once per machine)`);
};

(async () => {
  const t0 = Date.now();
  line(`== ${options.url}  zone ${options.tz}  (reads only)`);
  line('== cold');
  const c0 = measurement.calls;
  const b0 = measurement.bytes;
  const network0 = measurement.networkMs;
  const parse0 = measurement.parseMs;
  const first = await measureRun('summary (first response)', { include: 'summary' });
  line(`   window ${first.meta.window.from} → ${first.meta.window.to}; ${first.meta.facts.count} facts; scope ${first.meta.scope.map((a: any) => a.id).join(',')}`);
  const startedAt = Date.now() - (first.meta.stats.totalMs || 0);
  // The missing rows continue behind: when are they all there (without polling).
  while (service.backgroundWork().rows > 0 && Date.now() - startedAt < options.wait * 1000) await sleep(50);
  const complete = Date.now() - startedAt;
  line(`summary complete (all rows)  ${String(complete).padStart(7)} ms  calls=${measurement.calls - c0}  read=${mb(measurement.bytes - b0)}  network=${measurement.networkMs - network0} ms (sum of calls)  JSON.parse=${measurement.parseMs - parse0} ms`);
  await measureRun('summary (again)', { include: 'summary' });
  breakdown('cold load');
  await measureRun('dashboard 7 days', { include: 'dashboard', timelineDays: 7 });
  const seriesDone = await waitUntilIdle(options.wait);
  line(`   background series finished ${seriesDone} ms later`);
  await measureRun('dashboard 7 days (with the series)', { include: 'dashboard', timelineDays: 7 });
  await measureRun(`control ${options.control} 30 days`, { include: 'control', controlId: options.control, timelineDays: 30 });
  await measureRun(`control op.mon.3 on ${options.agent}`, { include: 'control', controlId: 'op.mon.3', agentId: options.agent, timelineDays: 30 });
  await measureRun('results', { include: 'results' });
  line('== hot');
  await measureRun('summary', { include: 'summary' });
  await measureRun('dashboard 7 days', { include: 'dashboard', timelineDays: 7 });
  await measureRun(`control ${options.control} 30 days`, { include: 'control', controlId: options.control, timelineDays: 30 });
  await measureRun(`summary machine ${options.agent}`, { include: 'summary', agentId: options.agent });
  breakdown('everything (cold load + series)');

  // What is in the window per control and class, against what was read.
  const window = first.meta.window;
  const inWindow = await client.search({
    index: 'wazuh-alerts-*',
    body: {
      size: 0,
      query: { bool: { filter: [{ range: { '@timestamp': { gte: window.from, lte: window.to } } }, { exists: { field: 'data.power_ens' } }] } },
      aggs: { c: { terms: { field: 'data.power_ens', size: 200 }, aggs: { e: { terms: { field: 'data.event', size: 500 } } } } },
    },
  });
  line('== per control: read (cold load and series) / in the window (state, actions, generic, heartbeats)');
  const totals: Record<string, [number, number]> = {};
  for (const c of inWindow.body?.aggregations?.c?.buckets || []) {
    const present: Record<string, number> = {};
    for (const e of c.e?.buckets || []) {
      const factClass = classOf(String(c.key), String(e.key));
      present[factClass] = (present[factClass] || 0) + e.doc_count;
    }
    const read = factsRead.get(String(c.key)) || {};
    const cells = ['state', 'actions', 'generic', 'heartbeats'].map(k => {
      totals[k] = [(totals[k]?.[0] || 0) + (read[k] || 0), (totals[k]?.[1] || 0) + (present[k] || 0)];
      return `${k} ${read[k] || 0}/${present[k] || 0}`;
    });
    line(`   ${String(c.key).padEnd(10)} ${cells.join('  ')}`);
  }
  line(`   TOTAL      ${Object.entries(totals).map(([k, [a, b]]) => `${k} ${a}/${b}`).join('  ')}`);
  const remaining = await waitUntilIdle(options.wait);
  line(
    `process memory ${(process.memoryUsage().rss / 1e6).toFixed(0)} MB; ${measurement.calls} calls, ${mb(measurement.bytes)} read, network ${measurement.networkMs} ms, JSON.parse ${measurement.parseMs} ms, in ${((Date.now() - t0) / 1000).toFixed(1)} s` +
      (service.idle() ? '' : `; background work remained after ${remaining} ms: ${JSON.stringify(service.backgroundWork())}`)
  );
  process.exit(0);
})().catch(e => {
  line(`FAILURE ${e?.message || e}`);
  process.exit(1);
});
