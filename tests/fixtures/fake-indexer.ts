// Un indexador en memoria con lo justo del DSL que usa el servidor de ENSFácil
// (bool, range, term, terms, match_phrase, exists, ids, match_none; orden,
// search_after; y las agregaciones de la sonda, del inventario y de la serie).
// Para probar el camino del servidor sin OpenSearch. NO es OpenSearch: lo que
// valida es que el servidor arma bien las consultas y que, con la semántica
// de esos operadores, el resultado es el del motor sobre todos los hechos.

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

const ordena = (docs: FakeDoc[], sort: any[] = []) =>
  [...docs].sort((a, b) => {
    for (const s of sort) {
      const [campo, o]: [string, any] = Object.entries(s)[0] as any;
      const orden = (o?.order || o) === 'desc' ? -1 : 1;
      const va = campo === '_id' ? a._id : tiempo(valoresDe(a._source, campo)[0]);
      const vb = campo === '_id' ? b._id : tiempo(valoresDe(b._source, campo)[0]);
      if (va < vb) return -orden;
      if (va > vb) return orden;
    }
    return 0;
  });

const valorDeOrden = (doc: FakeDoc, sort: any[]) =>
  sort.map(s => {
    const campo = Object.keys(s)[0];
    return campo === '_id' ? doc._id : tiempo(valoresDe(doc._source, campo)[0]);
  });

const agrega = (docs: FakeDoc[], aggs: any): any => {
  const salida: any = {};
  for (const [nombre, def] of Object.entries<any>(aggs || {})) {
    if (def.max || def.min) {
      const campo = (def.max || def.min).field;
      const ts = docs.flatMap(d => valoresDe(d._source, campo)).map(tiempo).filter(Number.isFinite);
      salida[nombre] = { value: ts.length ? (def.max ? Math.max(...ts) : Math.min(...ts)) : null };
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
      docs.forEach(d => valoresDe(d._source, def.terms.field).forEach(v => grupos.set(String(v), [...(grupos.get(String(v)) || []), d])));
      salida[nombre] = { buckets: [...grupos.entries()].map(([key, ds]) => ({ key, doc_count: ds.length, ...agrega(ds, def.aggs) })) };
    } else if (def.top_hits) {
      const ordenados = ordena(docs, def.top_hits.sort);
      salida[nombre] = { hits: { hits: ordenados.slice(0, def.top_hits.size || 3).map(d => ({ _id: d._id, _source: d._source })) } };
    } else if (def.date_histogram) {
      const dias = new Map<number, number>();
      docs.forEach(d => valoresDe(d._source, def.date_histogram.field).forEach(v => {
        const t = new Date(tiempo(v));
        const dia = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
        dias.set(dia, (dias.get(dia) || 0) + 1);
      }));
      salida[nombre] = { buckets: [...dias.entries()].sort((a, b) => a[0] - b[0]).map(([key, doc_count]) => ({ key, doc_count })) };
    } else {
      throw new Error(`fake-indexer: agregación no soportada ${nombre}`);
    }
  }
  return salida;
};

export const createFakeIndexer = (initial: FakeDoc[], options: { user?: any; clock?: () => number } = {}) => {
  if (options.clock) ahoraDelIndice = options.clock;
  const docs = [...initial];
  const log: { index?: string; body: any; hits: number }[] = [];
  const indiceCasa = (patron: string | undefined, indice: string) =>
    !patron || new RegExp(`^${patron.replace(/\*/g, '.*')}$`).test(indice);

  const search = async ({ index, body }: any) => {
    let candidatos = docs.filter(d => indiceCasa(index, d._index) && casa(d, body?.query));
    const sort = body?.sort || [];
    if (sort.length) candidatos = ordena(candidatos, sort);
    if (body?.search_after) {
      const despues = body.search_after;
      candidatos = candidatos.filter(d => {
        const v = valorDeOrden(d, sort);
        for (let i = 0; i < sort.length; i++) {
          const orden = (Object.values<any>(sort[i])[0]?.order || Object.values<any>(sort[i])[0]) === 'desc' ? -1 : 1;
          if (v[i] === despues[i]) continue;
          return orden === 1 ? v[i] > despues[i] : v[i] < despues[i];
        }
        return false;
      });
    }
    const from = body?.from || 0;
    const size = body?.size ?? 10;
    const pagina = candidatos.slice(from, from + size);
    log.push({ index, body, hits: pagina.length });
    return {
      body: {
        took: 1,
        hits: {
          total: { value: candidatos.length, relation: 'eq' },
          hits: pagina.map(d => ({ _id: d._id, _index: d._index, _source: d._source, sort: sort.length ? valorDeOrden(d, sort) : undefined })),
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
        // Sin PIT: el servidor pagina igual sin él.
        throw Object.assign(new Error('no handler found for uri'), { statusCode: 400 });
      },
    },
  };
};
