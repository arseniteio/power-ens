/** In-memory indexer with the subset of the DSL used by the ENSFácil server. */

import { startOfDayIn } from '../../common/ens/core/timeline/timeline-cuts';

export interface FakeDoc {
  _id: string;
  _index: string;
  _source: any;
}

const valoresDe = (obj: any, campo: string): any[] => {
  if (obj === null || obj === undefined) return [];
  if (Array.isArray(obj)) return obj.flatMap(o => valoresDe(o, campo));
  if (typeof obj !== 'object') return [];
  const output: any[] = [];
  if (Object.prototype.hasOwnProperty.call(obj, campo)) output.push(...[].concat(obj[campo]));
  for (let p = campo.indexOf('.'); p !== -1; p = campo.indexOf('.', p + 1)) {
    output.push(...valoresDe(obj[campo.slice(0, p)], campo.slice(p + 1)));
  }
  return output.filter(v => v !== undefined && v !== null && typeof v !== 'object');
};

export const pickSource = (source: any, fields: string[] | undefined): any => {
  if (!Array.isArray(fields)) return source;
  const out: any = {};
  for (const f of fields) {
    const partes = f.split('.');
    let since = source;
    let ok = true;
    for (const p of partes) {
      if (since && typeof since === 'object' && p in since) since = since[p];
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let towards = out;
    partes.slice(0, -1).forEach(p => {
      towards = towards[p] = towards[p] || {};
    });
    towards[partes[partes.length - 1]] = since;
  }
  return out;
};

let indexNow: () => number = () => Date.now();
const UNIT: Record<string, number> = { m: 60e3, h: 3600e3, d: 86400e3 };
const time = (v: any): number => {
  if (typeof v === 'number') return v;
  const text = String(v);
  if (text === 'now') return indexNow();
  const m = /^now-(\d+)([mhd])$/.exec(text);
  return m ? indexNow() - Number(m[1]) * UNIT[m[2]] : Date.parse(text);
};

const DATE_FIELDS = new Set(['@timestamp', 'timestamp']);

const matches = (doc: FakeDoc, q: any): boolean => {
  if (!q || typeof q !== 'object') return true;
  if (q.match_all) return true;
  if (q.match_none) return false;
  if (q.ids) return q.ids.values.includes(doc._id);
  if (q.bool) {
    const b = q.bool;
    const list = (x: any) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
    if (!list(b.filter).every((c: any) => matches(doc, c))) return false;
    if (!list(b.must).every((c: any) => matches(doc, c))) return false;
    if (list(b.must_not).some((c: any) => matches(doc, c))) return false;
    const should = list(b.should);
    if (should.length) {
      const minimum = b.minimum_should_match ?? (list(b.filter).length || list(b.must).length ? 0 : 1);
      if (should.filter((c: any) => matches(doc, c)).length < minimum) return false;
    }
    return true;
  }
  if (q.range) {
    const [campo, r]: [string, any] = Object.entries(q.range)[0] as any;
    return valoresDe(doc._source, campo).some(v => {
      const t = time(v);
      return (r.gte === undefined || t >= time(r.gte)) && (r.lte === undefined || t <= time(r.lte)) &&
        (r.gt === undefined || t > time(r.gt)) && (r.lt === undefined || t < time(r.lt));
    });
  }
  if (q.term) {
    const [campo, valor]: [string, any] = Object.entries(q.term)[0] as any;
    const searched = valor && typeof valor === 'object' && 'value' in valor ? valor.value : valor;
    return valoresDe(doc._source, campo).some(v => String(v) === String(searched));
  }
  if (q.terms) {
    const [campo, valores]: [string, any] = Object.entries(q.terms)[0] as any;
    return valoresDe(doc._source, campo).some(v => valores.map(String).includes(String(v)));
  }
  if (q.match_phrase) {
    const [campo, valor]: [string, any] = Object.entries(q.match_phrase)[0] as any;
    return valoresDe(doc._source, campo).some(v => String(v) === String(valor));
  }
  if (q.exists) return valoresDe(doc._source, q.exists.field).length > 0;
  throw new Error(`fake-indexer: unsupported query ${JSON.stringify(q).slice(0, 120)}`);
};

export const matchesQuery = (doc: FakeDoc, query: unknown, now?: number): boolean => {
  if (now !== undefined) indexNow = () => now;
  return matches(doc, query);
};

const orderValue = (doc: FakeDoc, campo: string): number | string | null => {
  if (campo === '_id') throw new Error('fake-indexer: sorting by _id is not supported (it loads its fielddata in OpenSearch)');
  const v = valoresDe(doc._source, campo)[0];
  if (v === undefined) return null;
  return DATE_FIELDS.has(campo) ? time(v) : String(v);
};

const orderOf = (s: any): { campo: string; desc: boolean } => {
  const [campo, o]: [string, any] = Object.entries(s)[0] as any;
  return { campo, desc: (o?.order || o) === 'desc' };
};

const compare = (a: number | string | null, b: number | string | null, desc: boolean): number => {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const r = a < b ? -1 : 1;
  return desc ? -r : r;
};

const sorts = (docs: FakeDoc[], sort: any[] = []) => {
  const claves = sort.map(orderOf);
  return [...docs].sort((a, b) => {
    for (const { campo, desc } of claves) {
      const r = compare(orderValue(a, campo), orderValue(b, campo), desc);
      if (r) return r;
    }
    return 0;
  });
};

const startOfDay = (t: number, timeZone: string): number => startOfDayIn(new Date(t), timeZone).getTime();

const aggregate = (docs: FakeDoc[], aggs: any): any => {
  const output: any = {};
  for (const [name, def] of Object.entries<any>(aggs || {})) {
    if (def.max || def.min) {
      const campo = (def.max || def.min).field;
      let valor: number | null = null;
      for (const d of docs) {
        for (const v of valoresDe(d._source, campo)) {
          const t = time(v);
          if (!Number.isFinite(t)) continue;
          if (valor === null || (def.max ? t > valor : t < valor)) valor = t;
        }
      }
      output[name] = { value: valor };
    } else if (def.filters) {
      output[name] = {
        buckets: Object.fromEntries(
          Object.entries<any>(def.filters.filters).map(([k, q]) => {
            const inside = docs.filter(d => matches(d, q));
            return [k, { doc_count: inside.length, ...aggregate(inside, def.aggs) }];
          })
        ),
      };
    } else if (def.filter) {
      const inside = docs.filter(d => matches(d, def.filter));
      output[name] = { doc_count: inside.length, ...aggregate(inside, def.aggs) };
    } else if (def.terms) {
      const groups = new Map<string, FakeDoc[]>();
      for (const d of docs) {
        const valores = def.terms.field === '_index' ? [d._index] : valoresDe(d._source, def.terms.field);
        const claves = valores.length ? valores.map(String) : def.terms.missing !== undefined ? [String(def.terms.missing)] : [];
        for (const k of claves) {
          const g = groups.get(k);
          if (g) g.push(d);
          else groups.set(k, [d]);
        }
      }
      const all = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
      const buckets = all.slice(0, def.terms.size ?? 10);
      output[name] = {
        sum_other_doc_count: all.slice(def.terms.size ?? 10).reduce((n, [, ds]) => n + ds.length, 0),
        buckets: buckets.map(([key, ds]) => ({ key, doc_count: ds.length, ...aggregate(ds, def.aggs) })),
      };
    } else if (def.value_count) {
      output[name] = { value: docs.reduce((n, d) => n + valoresDe(d._source, def.value_count.field).length, 0) };
    } else if (def.top_hits) {
      const sorted = sorts(docs, def.top_hits.sort);
      output[name] = {
        hits: { hits: sorted.slice(0, def.top_hits.size || 3).map(d => ({ _id: d._id, _source: pickSource(d._source, def.top_hits._source) })) },
      };
    } else if (def.date_histogram) {
      const zone = def.date_histogram.time_zone || 'UTC';
      const days = new Map<number, FakeDoc[]>();
      for (const d of docs) {
        for (const v of valoresDe(d._source, def.date_histogram.field)) {
          const day = startOfDay(time(v), zone);
          const g = days.get(day);
          if (g) g.push(d);
          else days.set(day, [d]);
        }
      }
      output[name] = {
        buckets: [...days.entries()].sort((a, b) => a[0] - b[0]).map(([key, ds]) => ({ key, doc_count: ds.length, ...aggregate(ds, def.aggs) })),
      };
    } else {
      throw new Error(`fake-indexer: unsupported aggregation ${name}`);
    }
  }
  return output;
};

export const createFakeIndexer = (
  initial: FakeDoc[],
  options: { user?: any; clock?: () => number; failShards?: (body: any, index?: string) => number } = {}
) => {
  if (options.clock) indexNow = options.clock;
  const docs = [...initial];
  const log: { index?: string; body: any; hits: number; params: any }[] = [];
  const matchingIndex = (patron: string | undefined, index: string) =>
    !patron || patron.split(',').some(p => new RegExp(`^${p.trim().replace(/\./g, '\\.').replace(/\*/g, '.*')}$`).test(index));

  const maps = (index: string, campo: string) =>
    !campo.startsWith('data.') || docs.some(d => d._index === index && valoresDe(d._source, campo).length > 0);
  const checkOrder = (index: string | undefined, sort: any[]) => {
    const indices = [...new Set(docs.map(d => d._index))].filter(i => matchingIndex(index, i));
    for (const s of sort) {
      const [campo, o]: [string, any] = Object.entries(s)[0] as any;
      if (o && typeof o === 'object' && o.unmapped_type) continue;
      const unmapped = indices.find(i => !maps(i, campo));
      if (unmapped) {
        const motive = `No mapping found for [${campo}] in order to sort on`;
        throw Object.assign(new Error(`search_phase_execution_exception: [query_shard_exception] Reason: ${motive}`), {
          name: 'ResponseError',
          statusCode: 400,
          meta: { statusCode: 400, body: { error: { type: 'search_phase_execution_exception', root_cause: [{ type: 'query_shard_exception', reason: motive, index: unmapped }] }, status: 400 } },
        });
      }
    }
  };

  const search = async (params: any) => {
    const { index, body } = params;
    if (options.clock) indexNow = options.clock;
    checkOrder(index, body?.sort || []);
    let candidates = docs.filter(d => matchingIndex(index, d._index) && matches(d, body?.query));
    const sort = body?.sort || [];
    if (sort.length) candidates = sorts(candidates, sort);
    if (body?.search_after) {
      const claves = sort.map(orderOf);
      const after = body.search_after;
      candidates = candidates.filter(d => {
        for (let i = 0; i < claves.length; i++) {
          const r = compare(orderValue(d, claves[i].campo), after[i], claves[i].desc);
          if (r) return r > 0;
        }
        return false;
      });
    }
    const from = body?.from || 0;
    const size = body?.size ?? 10;
    const pagina = candidates.slice(from, from + size);
    log.push({ index, body, hits: pagina.length, params });
    const failed = options.failShards ? options.failShards(body, index) : 0;
    return {
      body: {
        took: 1,
        timed_out: false,
        _shards: { total: 10, successful: 10 - failed, skipped: 0, failed: failed },
        hits: {
          total: { value: candidates.length, relation: 'eq' },
          hits: pagina.map(d => ({
            _id: d._id,
            _index: d._index,
            _source: pickSource(d._source, body?._source),
            sort: sort.length ? sort.map((s: any) => orderValue(d, orderOf(s).campo)) : undefined,
          })),
        },
        aggregations: body?.aggs ? aggregate(candidates, body.aggs) : undefined,
      },
    };
  };

  return {
    docs,
    log,
    search,
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
    transport: {
      request: async ({ path }: any) => {
        if (path === '/_plugins/_security/authinfo') return { body: options.user || { user_name: 'ana', roles: ['readall'] } };
        throw Object.assign(new Error('no handler found for uri'), { statusCode: 400 });
      },
    },
  };
};
