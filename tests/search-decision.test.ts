/**
 *   npx --yes tsx tests/search-decision.test.ts
 *
 * Lo que decide `useEsSearch` cuando cambian sus parámetros, y el aviso único
 * por mensaje.
 */
import { decideSearch, ENS_SEARCH_TOAST_WINDOW_MS, isAbortError, searchDataKey, shouldToast } from '../public/search/search-decision';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const filtros = [{ match_phrase: { 'agent.id': '024' } }];
const a = searchDataKey({ preAppliedFilters: filtros, size: 0, refreshKey: 1 });
const aRefrescada = searchDataKey({ preAppliedFilters: filtros, size: 0, refreshKey: 2 });
const b = searchDataKey({ preAppliedFilters: [{ match_phrase: { 'agent.id': '028' } }], size: 0, refreshKey: 2 });

comprueba('el refreshKey no cuenta en la clave de los datos', a === aRefrescada, [a, aRefrescada]);
comprueba('otro filtro sí cambia la clave de los datos', a !== b);
comprueba('sin refreshKey: la misma clave que con él', searchDataKey({ preAppliedFilters: filtros, size: 0 }) === a);

comprueba('nada en curso: se busca', decideSearch(undefined, a) === 'start');
comprueba('solo sube el refreshKey con la misma búsqueda en curso: se espera a esa', decideSearch(a, aRefrescada) === 'skip');
comprueba('cambian los datos con otra búsqueda en curso: se cancela y se busca', decideSearch(a, b) === 'abort-and-start');

comprueba('cancelación por la señal propia: no es un fallo', isAbortError(new Error('x'), { aborted: true }));
comprueba('AbortError del servicio de búsqueda: no es un fallo', isAbortError({ name: 'AbortError', message: 'Aborted' }, { aborted: false }));
comprueba('un fallo de verdad sí lo es', !isAbortError(new Error('403 Forbidden'), { aborted: false }));

{
  const registro = new Map<string, number>();
  const t0 = Date.parse('2026-10-08T10:00:00Z');
  const avisos = Array.from({ length: 17 }, (_, i) => shouldToast(registro, 'Request Timeout', t0 + i * 10)).filter(Boolean).length;
  comprueba('17 filas que fallan igual a la vez: un solo aviso', avisos === 1, avisos);
  comprueba('otro mensaje: su propio aviso', shouldToast(registro, 'Forbidden', t0 + 200));
  comprueba('el mismo mensaje dentro del minuto: callado', !shouldToast(registro, 'Request Timeout', t0 + ENS_SEARCH_TOAST_WINDOW_MS - 1));
  comprueba('pasado el minuto: se vuelve a avisar', shouldToast(registro, 'Request Timeout', t0 + ENS_SEARCH_TOAST_WINDOW_MS));
}

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
