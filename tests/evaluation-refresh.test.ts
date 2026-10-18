/**
 * Cuándo se vuelve a pedir una evaluación (navegador) y cuándo se recalcula
 * (servidor).
 *
 *   npx --yes tsx tests/evaluation-refresh.test.ts
 *
 * Navegador: sonda cada 5 minutos solo con la pestaña a la vista; se recarga
 * solo si la huella cambió o el resultado tiene más de 10 minutos; como mucho
 * 2 peticiones a la vez; nunca se enseña lo de otra clave como actual.
 * Servidor: memoria por huella y tiempo de vida, sin mezclar entradas;
 * peticiones iguales a la vez comparten cálculo; tope de cálculos a la vez.
 */
import {
  EVALUATION_MAX_AGE_MS,
  EVALUATION_REFRESH_INTERVAL_MS,
  evaluationKey,
  evaluationReducer,
  initialEvaluationState,
  RequestLimiter,
  shouldProbe,
  shouldReload,
  visibleEvaluation,
} from '../public/evaluation/refresh-policy';
import { EvaluationCache, InFlight, Semaphore } from '../server/lib/evaluation/cache';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };
const espera = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
  // --- navegador ---------------------------------------------------------------
  comprueba('el intervalo es de 5 minutos', EVALUATION_REFRESH_INTERVAL_MS === 5 * 60 * 1000);
  comprueba('sonda: la primera vez, sí', shouldProbe(undefined, 1000, true));
  comprueba('sonda: antes de 5 minutos, no', !shouldProbe(0, EVALUATION_REFRESH_INTERVAL_MS - 1, true));
  comprueba('sonda: a los 5 minutos, sí', shouldProbe(0, EVALUATION_REFRESH_INTERVAL_MS, true));
  comprueba('sonda: con la pestaña oculta, nunca', !shouldProbe(0, 10 * EVALUATION_REFRESH_INTERVAL_MS, false) && !shouldProbe(undefined, 0, false));
  const ahora = Date.parse('2026-10-17T12:00:00Z');
  const hace = (ms: number) => new Date(ahora - ms).toISOString();
  comprueba('misma huella y resultado reciente: no se recarga', !shouldReload('a', 'a', hace(60000), ahora));
  comprueba('huella distinta: se recarga', shouldReload('b', 'a', hace(60000), ahora));
  comprueba('misma huella pero resultado viejo (el motor mide contra el reloj): se recarga', shouldReload('a', 'a', hace(EVALUATION_MAX_AGE_MS), ahora));
  comprueba('sin resultado: se carga', shouldReload('a', undefined, undefined, ahora));
  comprueba('la clave no depende del orden de los parámetros', evaluationKey({ include: 'x', agentId: '024' }) === evaluationKey({ agentId: '024', include: 'x' }));
  comprueba('otra máquina, otra clave', evaluationKey({ include: 'x', agentId: '024' }) !== evaluationKey({ include: 'x', agentId: '028' }));

  // Como mucho 2 a la vez; el resto, en cola, y todas terminan.
  const cola = new RequestLimiter(2);
  let enCurso = 0;
  let pico = 0;
  const tarea = async (i: number) => {
    enCurso += 1;
    pico = Math.max(pico, enCurso);
    await espera(5);
    enCurso -= 1;
    return i;
  };
  const hechas = await Promise.all(Array.from({ length: 23 }, (_, i) => cola.run(() => tarea(i))));
  comprueba('23 peticiones (una por control): nunca más de 2 a la vez', pico === 2, pico);
  comprueba('y todas terminan, en su orden', hechas.join() === Array.from({ length: 23 }, (_, i) => i).join());
  await cola.run(async () => { throw new Error('x'); }).catch(() => undefined);
  comprueba('un fallo libera su plaza', cola.running === 0 && cola.queued === 0);

  // Lo que se ve render a render.
  let e = initialEvaluationState<string>();
  const A = evaluationKey({ agentId: 'A' });
  const B = evaluationKey({ agentId: 'B' });
  comprueba('al montar: cargando y sin datos', visibleEvaluation(e, A).isLoading && visibleEvaluation(e, A).data === undefined);
  e = evaluationReducer(e, { type: 'load', key: A });
  e = evaluationReducer(e, { type: 'success', key: A, data: 'de A' });
  e = evaluationReducer(e, { type: 'refresh', key: A });
  comprueba('refrescando la misma clave: se sigue viendo, marcado', visibleEvaluation(e, A).data === 'de A' && visibleEvaluation(e, A).isRefreshing);
  comprueba('otra máquina: nada de A, cargando', visibleEvaluation(e, B).data === undefined && visibleEvaluation(e, B).isLoading);
  e = evaluationReducer(e, { type: 'load', key: B });
  e = evaluationReducer(e, { type: 'success', key: A, data: 'tarde' });
  comprueba('una respuesta tardía de A no aparece en B', visibleEvaluation(e, B).data === undefined && visibleEvaluation(e, A).data === undefined);
  e = evaluationReducer(e, { type: 'failure', key: B, error: new Error('caído') });
  comprueba('con un fallo, el error y ningún dato', visibleEvaluation(e, B).data === undefined && Boolean(visibleEvaluation(e, B).error) && !visibleEvaluation(e, B).isLoading);

  // --- servidor ----------------------------------------------------------------
  let reloj = 0;
  const memoria = new EvaluationCache<string>(3, 1000, () => reloj);
  memoria.set('k', 'huella-1', 'valor');
  comprueba('memoria: misma huella, el valor', memoria.get('k', 'huella-1') === 'valor');
  comprueba('memoria: otra huella (hechos nuevos), nada', memoria.get('k', 'huella-2') === undefined);
  memoria.set('k', 'huella-1', 'valor');
  reloj = 1001;
  comprueba('memoria: caducada, nada', memoria.get('k', 'huella-1') === undefined);
  reloj = 0;
  ['a', 'b', 'c', 'd'].forEach(k => memoria.set(k, 'h', k));
  comprueba('memoria: con el tope, se va la que lleva más sin usarse', memoria.size === 3 && memoria.get('a', 'h') === undefined && memoria.get('d', 'h') === 'd');

  const compartido = new InFlight<number>();
  let calculos = 0;
  const calcula = async () => { calculos += 1; await espera(5); return 42; };
  const [x, y] = await Promise.all([compartido.run('vista', calcula), compartido.run('vista', calcula)]);
  comprueba('dos peticiones iguales a la vez: un solo cálculo', calculos === 1 && x === 42 && y === 42);
  await compartido.run('vista', calcula);
  comprueba('terminada, la siguiente calcula de nuevo', calculos === 2);

  const semaforo = new Semaphore(2);
  let activos = 0;
  let maximo = 0;
  await Promise.all(Array.from({ length: 7 }, () => semaforo.use(async () => {
    activos += 1;
    maximo = Math.max(maximo, activos);
    await espera(3);
    activos -= 1;
  })));
  comprueba('servidor: como mucho 2 evaluaciones a la vez', maximo === 2, maximo);

  fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
  process.exit(fallos.length ? 1 : 0);
})();
