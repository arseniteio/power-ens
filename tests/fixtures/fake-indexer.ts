// Un indexador en memoria con lo justo del DSL que usa el servidor de ENSFácil:
// bool, range (con `now-Nd`), term, terms, match_phrase, exists, ids,
// match_none; `_source` (solo los campos pedidos), orden por fecha y por
// `keyword` con `search_after`; y las agregaciones de la sonda, del inventario
// y de la serie (`max`, `min`, `filters`, `filter`, `terms` con `size`,
// `top_hits` con `_source`, `date_histogram` diario con `time_zone`).
// También puede responder con shards fallidos (`failShards`).
//
// LOS MAPEOS: la plantilla de Wazuh mapea `data.*` de forma dinámica, así que
// un índice diario sin ningún hecho de ENSFácil no tiene `data.ensfacil`.
// Ordenar por un campo que un índice no mapea, sin `unmapped_type`, es un 400
// en OpenSearch («No mapping found for [campo] in order to sort on»), también
// si el índice no aporta ningún resultado. El falso hace lo mismo con los
// campos `data.*`: un índice los mapea si alguno de sus documentos los lleva.
// Los demás (los de la plantilla, los del índice de configuración) se dan por
// mapeados.
//
// NO es OpenSearch: lo que valida es que el servidor arma bien las consultas
// y que, con la semántica de esos operadores, el resultado es el del motor
// sobre todos los hechos.

import { startOfDayIn } from '../../common/ens/core/timeline/timeline-cuts';

export interface FakeDoc {
  _id: string;
  _index: string;
  _source: any;
}

// Los valores de un campo con puntos, anidado (`agent.id`) o literal
// (`data.evidence_id` dentro de `data`), aplanando listas.
const valoresDe = (obj: any, campo: string): any[] => {
  if (obj === null || obj === undefined) return [];
  if (Array.isArray(obj)) return obj.flatMap(o => valoresDe(o, campo));
  if (typeof obj !== 'object') return [];
  const salida: any[] = [];
  if (Object.prototype.hasOwnProperty.call(obj, campo)) salida.push(...[].concat(obj[campo]));
  for (let p = campo.indexOf('.'); p !== -1; p = campo.indexOf('.', p + 1)) {
    salida.push(...valoresDe(obj[campo.slice(0, p)], campo.slice(p + 1)));
  }
  return salida.filter(v => v !== undefined && v !== null && typeof v !== 'object');
};

// `_source` con solo los campos pedidos (como OpenSearch: el campo entero,
// con lo que cuelgue de él).
export const pickSource = (source: any, fields: string[] | undefined): any => {
  if (!Array.isArray(fields)) return source;
  const out: any = {};
  for (const f of fields) {
    const partes = f.split('.');
    let desde = source;
    let ok = true;
    for (const p of partes) {
      if (desde && typeof desde === 'object' && p in desde) desde = desde[p];
      else {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    let hacia = out;
    partes.slice(0, -1).forEach(p => {
      hacia = hacia[p] = hacia[p] || {};
    });
    hacia[partes[partes.length - 1]] = desde;
  }
  return out;
};

// El reloj del indexador, para `now-7d` y compañía.
let ahoraDelIndice: () => number = () => Date.now();
const UNIDAD: Record<string, number> = { m: 60e3, h: 3600e3, d: 86400e3 };
const tiempo = (v: any): number => {
  if (typeof v === 'number') return v;
  const texto = String(v);
  if (texto === 'now') return ahoraDelIndice();
  const m = /^now-(\d+)([mhd])$/.exec(texto);
  return m ? ahoraDelIndice() - Number(m[1]) * UNIDAD[m[2]] : Date.parse(texto);
};

const CAMPOS_FECHA = new Set(['@timestamp', 'timestamp']);

const casa = (doc: FakeDoc, q: any): boolean => {
  if (!q || typeof q !== 'object') return true;
  if (q.match_all) return true;
  if (q.match_none) return false;
  if (q.ids) return q.ids.values.includes(doc._id);
  if (q.bool) {
    const b = q.bool;
    const lista = (x: any) => (x === undefined ? [] : Array.isArray(x) ? x : [x]);
    if (!lista(b.filter).every((c: any) => casa(doc, c))) return false;
    if (!lista(b.must).every((c: any) => casa(doc, c))) return false;
    if (lista(b.must_not).some((c: any) => casa(doc, c))) return false;
    const should = lista(b.should);
    if (should.length) {
      const minimo = b.minimum_should_match ?? (lista(b.filter).length || lista(b.must).length ? 0 : 1);
      if (should.filter((c: any) => casa(doc, c)).length < minimo) return false;
    }
    return true;
  }
  if (q.range) {
    const [campo, r]: [string, any] = Object.entries(q.range)[0] as any;
    return valoresDe(doc._source, campo).some(v => {
      const t = tiempo(v);
      return (r.gte === undefined || t >= tiempo(r.gte)) && (r.lte === undefined || t <= tiempo(r.lte)) &&
        (r.gt === undefined || t > tiempo(r.gt)) && (r.lt === undefined || t < tiempo(r.lt));
    });
  }
  if (q.term) {
    const [campo, valor]: [string, any] = Object.entries(q.term)[0] as any;
    const buscado = valor && typeof valor === 'object' && 'value' in valor ? valor.value : valor;
    return valoresDe(doc._source, campo).some(v => String(v) === String(buscado));
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
  throw new Error(`fake-indexer: consulta no soportada ${JSON.stringify(q).slice(0, 120)}`);
};

// ¿Casa el documento con la consulta? (síncrono, para las pruebas).
export const matchesQuery = (doc: FakeDoc, query: unknown, now?: number): boolean => {
  if (now !== undefined) ahoraDelIndice = () => now;
  return casa(doc, query);
};

// El valor de orden de un documento para una clave de `sort` (fecha en ms o
// cadena; el que falta va al final).
const valorDeOrden = (doc: FakeDoc, campo: string): number | string | null => {
  if (campo === '_id') throw new Error('fake-indexer: ordenar por _id no se admite (carga su fielddata en OpenSearch)');
  const v = valoresDe(doc._source, campo)[0];
  if (v === undefined) return null;
  return CAMPOS_FECHA.has(campo) ? tiempo(v) : String(v);
};

const ordenDe = (s: any): { campo: string; desc: boolean } => {
  const [campo, o]: [string, any] = Object.entries(s)[0] as any;
  return { campo, desc: (o?.order || o) === 'desc' };
};

const compara = (a: number | string | null, b: number | string | null, desc: boolean): number => {
  if (a === b) return 0;
  if (a === null) return 1; // missing: _last
  if (b === null) return -1;
  const r = a < b ? -1 : 1;
  return desc ? -r : r;
};

const ordena = (docs: FakeDoc[], sort: any[] = []) => {
  const claves = sort.map(ordenDe);
  return [...docs].sort((a, b) => {
    for (const { campo, desc } of claves) {
      const r = compara(valorDeOrden(a, campo), valorDeOrden(b, campo), desc);
      if (r) return r;
    }
    return 0;
  });
};

// El inicio del día (en ms) de un instante en una zona IANA (el calendario de
// la serie, que ya se prueba aparte).
const inicioDelDia = (t: number, timeZone: string): number => startOfDayIn(new Date(t), timeZone).getTime();

const agrega = (docs: FakeDoc[], aggs: any): any => {
  const salida: any = {};
  for (const [nombre, def] of Object.entries<any>(aggs || {})) {
    if (def.max || def.min) {
      const campo = (def.max || def.min).field;
      let valor: number | null = null;
      for (const d of docs) {
        for (const v of valoresDe(d._source, campo)) {
          const t = tiempo(v);
          if (!Number.isFinite(t)) continue;
          if (valor === null || (def.max ? t > valor : t < valor)) valor = t;
        }
      }
      salida[nombre] = { value: valor };
    } else if (def.filters) {
      salida[nombre] = {
        buckets: Object.fromEntries(
          Object.entries<any>(def.filters.filters).map(([k, q]) => {
            const dentro = docs.filter(d => casa(d, q));
            return [k, { doc_count: dentro.length, ...agrega(dentro, def.aggs) }];
          })
        ),
      };
    } else if (def.filter) {
      const dentro = docs.filter(d => casa(d, def.filter));
      salida[nombre] = { doc_count: dentro.length, ...agrega(dentro, def.aggs) };
    } else if (def.terms) {
      const grupos = new Map<string, FakeDoc[]>();
      for (const d of docs) {
        const valores = def.terms.field === '_index' ? [d._index] : valoresDe(d._source, def.terms.field);
        // `missing`: los que no tienen el campo van a un cubo con ese nombre.
        const claves = valores.length ? valores.map(String) : def.terms.missing !== undefined ? [String(def.terms.missing)] : [];
        for (const k of claves) {
          const g = grupos.get(k);
          if (g) g.push(d);
          else grupos.set(k, [d]);
        }
      }
      // Como OpenSearch: los más numerosos primero y como mucho `size`.
      const todos = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
      const cubos = todos.slice(0, def.terms.size ?? 10);
      salida[nombre] = {
        // Lo que no cabe en `size` se cuenta aparte, como en OpenSearch.
        sum_other_doc_count: todos.slice(def.terms.size ?? 10).reduce((n, [, ds]) => n + ds.length, 0),
        buckets: cubos.map(([key, ds]) => ({ key, doc_count: ds.length, ...agrega(ds, def.aggs) })),
      };
    } else if (def.value_count) {
      salida[nombre] = { value: docs.reduce((n, d) => n + valoresDe(d._source, def.value_count.field).length, 0) };
    } else if (def.top_hits) {
      const ordenados = ordena(docs, def.top_hits.sort);
      salida[nombre] = {
        hits: { hits: ordenados.slice(0, def.top_hits.size || 3).map(d => ({ _id: d._id, _source: pickSource(d._source, def.top_hits._source) })) },
      };
    } else if (def.date_histogram) {
      const zona = def.date_histogram.time_zone || 'UTC';
      const dias = new Map<number, FakeDoc[]>();
      for (const d of docs) {
        for (const v of valoresDe(d._source, def.date_histogram.field)) {
          const dia = inicioDelDia(tiempo(v), zona);
          const g = dias.get(dia);
          if (g) g.push(d);
          else dias.set(dia, [d]);
        }
      }
      salida[nombre] = {
        buckets: [...dias.entries()].sort((a, b) => a[0] - b[0]).map(([key, ds]) => ({ key, doc_count: ds.length, ...agrega(ds, def.aggs) })),
      };
    } else {
      throw new Error(`fake-indexer: agregación no soportada ${nombre}`);
    }
  }
  return salida;
};

export const createFakeIndexer = (
  initial: FakeDoc[],
  options: { user?: any; clock?: () => number; failShards?: (body: any, index?: string) => number } = {}
) => {
  if (options.clock) ahoraDelIndice = options.clock;
  const docs = [...initial];
  const log: { index?: string; body: any; hits: number; params: any }[] = [];
  const indiceCasa = (patron: string | undefined, indice: string) =>
    !patron || patron.split(',').some(p => new RegExp(`^${p.trim().replace(/\./g, '\\.').replace(/\*/g, '.*')}$`).test(indice));

  // ¿Mapea el índice el campo? (ver «LOS MAPEOS» arriba)
  const mapea = (indice: string, campo: string) =>
    !campo.startsWith('data.') || docs.some(d => d._index === indice && valoresDe(d._source, campo).length > 0);
  const compruebaOrden = (index: string | undefined, sort: any[]) => {
    const indices = [...new Set(docs.map(d => d._index))].filter(i => indiceCasa(index, i));
    for (const s of sort) {
      const [campo, o]: [string, any] = Object.entries(s)[0] as any;
      if (o && typeof o === 'object' && o.unmapped_type) continue;
      const sinMapeo = indices.find(i => !mapea(i, campo));
      if (sinMapeo) {
        const motivo = `No mapping found for [${campo}] in order to sort on`;
        throw Object.assign(new Error(`search_phase_execution_exception: [query_shard_exception] Reason: ${motivo}`), {
          name: 'ResponseError',
          statusCode: 400,
          meta: { statusCode: 400, body: { error: { type: 'search_phase_execution_exception', root_cause: [{ type: 'query_shard_exception', reason: motivo, index: sinMapeo }] }, status: 400 } },
        });
      }
    }
  };

  const search = async (params: any) => {
    const { index, body } = params;
    if (options.clock) ahoraDelIndice = options.clock;
    compruebaOrden(index, body?.sort || []);
    let candidatos = docs.filter(d => indiceCasa(index, d._index) && casa(d, body?.query));
    const sort = body?.sort || [];
    if (sort.length) candidatos = ordena(candidatos, sort);
    if (body?.search_after) {
      const claves = sort.map(ordenDe);
      const despues = body.search_after;
      candidatos = candidatos.filter(d => {
        for (let i = 0; i < claves.length; i++) {
          const r = compara(valorDeOrden(d, claves[i].campo), despues[i], claves[i].desc);
          if (r) return r > 0;
        }
        return false;
      });
    }
    const from = body?.from || 0;
    const size = body?.size ?? 10;
    const pagina = candidatos.slice(from, from + size);
    log.push({ index, body, hits: pagina.length, params });
    const fallidos = options.failShards ? options.failShards(body, index) : 0;
    return {
      body: {
        took: 1,
        timed_out: false,
        _shards: { total: 10, successful: 10 - fallidos, skipped: 0, failed: fallidos },
        hits: {
          total: { value: candidatos.length, relation: 'eq' },
          hits: pagina.map(d => ({
            _id: d._id,
            _index: d._index,
            _source: pickSource(d._source, body?._source),
            sort: sort.length ? sort.map((s: any) => valorDeOrden(d, ordenDe(s).campo)) : undefined,
          })),
        },
        aggregations: body?.aggs ? agrega(candidatos, body.aggs) : undefined,
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
