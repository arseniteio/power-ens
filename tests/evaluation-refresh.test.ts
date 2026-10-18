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
import { ENSRequestTimeoutError, withRequestTimeout } from '../common/platform/request-timeout';
import { traceabilityPageSource } from '../public/evaluation/traceability-paging';
import {
  backoffAfter,
  createEvaluationController,
  EVALUATION_BACKOFF_MAX_MS,
  EVALUATION_REFRESHING_RETRY_MS,
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
import { CancelSignal, EvaluationCache, Semaphore, SharedTasks } from '../server/lib/evaluation/cache';

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
  comprueba('lo que se enseñaba mientras se recalculaba se recarga', shouldReload('a', 'refreshing:a', hace(1000), ahora));
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

  // --- el ciclo de una pantalla (lo que hace `useEnsEvaluation`) -------------
  {
    let reloj = 1_000_000;
    let visible = true;
    const pendientes: { resolve: (v: any) => void; reject: (e: any) => void; controller: AbortController; tipo: string }[] = [];
    const estados: any[] = [];
    const promesa = (tipo: string, controller: AbortController) =>
      new Promise<any>((resolve, reject) => {
        pendientes.push({ resolve, reject, controller, tipo });
        controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    const c = createEvaluationController<any>({
      fetch: controller => promesa('fetch', controller),
      probe: controller => promesa('probe', controller),
      now: () => reloj,
      visible: () => visible,
      onChange: st => estados.push(st),
    });
    const ultimo = () => estados[estados.length - 1];
    const tick = () => c.tick();
    const resuelve = (tipo: string, valor: any) => {
      const p = pendientes.filter(x => x.tipo === tipo && !x.controller.signal.aborted).pop()!;
      pendientes.splice(pendientes.indexOf(p), 1);
      p.resolve(valor);
    };
    const espera0 = () => new Promise(r => setTimeout(r, 0));

    c.setKey('A');
    comprueba('primera carga: cargando, sin datos', ultimo().loading && ultimo().data === undefined);
    reloj += 10 * 60 * 1000;
    comprueba('una vuelta durante la primera carga no sondea ni la interrumpe', (await tick()) === 'busy' && pendientes.filter(p => p.tipo === 'fetch' && !p.controller.signal.aborted).length === 1);
    resuelve('fetch', { meta: { fingerprint: 'f1', evaluatedAt: new Date(reloj).toISOString() } });
    await espera0();
    comprueba('llega: datos de A', ultimo().key === 'A' && ultimo().data?.meta.fingerprint === 'f1');
    comprueba('justo después, no se sondea (5 min)', (await tick()) === 'skip');
    reloj += EVALUATION_REFRESH_INTERVAL_MS;
    visible = false;
    comprueba('pestaña oculta: nada', (await tick()) === 'skip' && pendientes.length === 0);
    visible = true;
    const sondeo = tick();
    resuelve('probe', { fingerprint: 'f1' });
    comprueba('visible otra vez: sonda; misma huella, no recarga', (await sondeo) === 'unchanged' && pendientes.length === 0);
    reloj += EVALUATION_REFRESH_INTERVAL_MS;
    const sondeo2 = tick();
    resuelve('probe', { fingerprint: 'f2' });
    comprueba('huella nueva: recarga encima (se sigue viendo lo de A)', (await sondeo2) === 'reload' && ultimo().data?.meta.fingerprint === 'f1' && ultimo().refreshing);
    resuelve('fetch', { meta: { fingerprint: 'f2', evaluatedAt: new Date(reloj).toISOString(), refreshing: true } });
    await espera0();
    reloj += EVALUATION_REFRESHING_RETRY_MS;
    comprueba('el servidor estaba recalculando: se vuelve a pedir a los 10 s', (await tick()) === 'reload');
    resuelve('fetch', { meta: { fingerprint: 'f3', evaluatedAt: new Date(reloj).toISOString() } });
    await espera0();

    // Cambio de máquina con la carga anterior en curso.
    reloj += EVALUATION_REFRESH_INTERVAL_MS;
    const sondeo3 = tick();
    c.setKey('B');
    comprueba('cambiar de clave anula la sonda en curso', (await sondeo3) === 'busy');
    comprueba('B: cargando, nada de A', ultimo().key === 'B' && ultimo().data === undefined && ultimo().loading);
    comprueba('cambiar de clave no deja ningún error', !estados.some(e => e.error));
    resuelve('fetch', { meta: { fingerprint: 'b1', evaluatedAt: new Date(reloj).toISOString() } });
    await espera0();
    comprueba('el reloj de la sonda vuelve a cero con la clave nueva', (await tick()) === 'skip');
    c.setKey('B');
    comprueba('pedir otra vez la misma clave no borra lo que se ve', ultimo().data?.meta.fingerprint === 'b1');

    // Un tiempo agotado se dice.
    const c2Estados: any[] = [];
    const c2 = createEvaluationController<any>({
      fetch: controller => withRequestTimeout(signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), 'evaluación ENS', controller, 20),
      probe: () => Promise.resolve({ fingerprint: 'x' }),
      now: () => reloj,
      visible: () => true,
      onChange: st => c2Estados.push(st),
    });
    c2.setKey('lenta');
    await new Promise(r => setTimeout(r, 60));
    const fin = c2Estados[c2Estados.length - 1];
    comprueba('un tiempo agotado llega como error (no se calla)', fin.error instanceof ENSRequestTimeoutError && !fin.loading, fin.error?.message);
    c2.retry();
    comprueba('«Reintentar» lo vuelve a pedir', c2Estados[c2Estados.length - 1].loading);
    c2.dispose();
    c.dispose();

    // Una respuesta tardía de verdad: la petición de A no atiende al abort y
    // resuelve DESPUÉS de cambiar a B. No se enseña en B.
    {
      const sueltas: { resolve: (v: any) => void; opciones?: any }[] = [];
      const e3: any[] = [];
      const c3 = createEvaluationController<any>({
        fetch: (_controller, opciones) => new Promise(resolve => sueltas.push({ resolve, opciones })),
        probe: () => Promise.resolve({ fingerprint: 'x' }),
        now: () => reloj,
        visible: () => true,
        onChange: st => e3.push(st),
      });
      c3.setKey('A');
      c3.setKey('B');
      sueltas[0].resolve({ meta: { fingerprint: 'de-A' } });
      await espera0();
      const enB = e3[e3.length - 1];
      comprueba('respuesta tardía de A con B a la vista: no aparece, B sigue cargando', enB.key === 'B' && enB.loading && enB.data === undefined);
      sueltas[1].resolve({ meta: { fingerprint: 'de-B' } });
      await espera0();
      comprueba('y la de B sí', e3[e3.length - 1].data?.meta.fingerprint === 'de-B');
      c3.dispose();
    }

    // U-N1: un refresco en segundo plano que falla. El servidor devuelve lo
    // último bueno con `refreshError`: se enseña (con el motivo) y no se pide
    // otra vez cada 10 s, sino cada vez más espaciado, hasta 5 min.
    {
      const sueltas: { resolve: (v: any) => void; reject: (e: any) => void; opciones?: any }[] = [];
      const e4: any[] = [];
      let r4 = 5_000_000;
      const c4 = createEvaluationController<any>({
        fetch: (_controller, opciones) => new Promise((resolve, reject) => sueltas.push({ resolve, reject, opciones })),
        probe: () => Promise.resolve({ fingerprint: 'otra' }),
        now: () => r4,
        visible: () => true,
        onChange: st => e4.push(st),
      });
      const conFallo = (n: number) => ({ meta: { fingerprint: `refreshing:f${n}`, evaluatedAt: new Date(r4).toISOString(), refreshing: true, refreshError: { message: 'Datos incompletos', at: new Date(r4).toISOString() } } });
      c4.setKey('A');
      sueltas.pop()!.resolve(conFallo(1));
      await espera0();
      comprueba('refreshError: se enseña lo último bueno con el motivo', e4[e4.length - 1].data?.meta.refreshError?.message === 'Datos incompletos' && !e4[e4.length - 1].loading);
      const esperas: number[] = [];
      for (let i = 0; i < 8; i++) {
        const desde = r4;
        let vueltas = 0;
        while ((await c4.tick()) !== 'reload') {
          r4 += 1000;
          if (++vueltas > 400) break;
        }
        esperas.push(Math.round((r4 - desde) / 1000));
        sueltas.pop()!.resolve(conFallo(i + 2));
        await espera0();
      }
      comprueba('no cada 10 s: 10, 20, 40, 80, 160 s y luego 300 s como mucho', esperas.join() === '10,20,40,80,160,300,300,300', esperas.join());
      comprueba('backoffAfter: tope de 5 min', backoffAfter(1) === 10000 && backoffAfter(30) === EVALUATION_BACKOFF_MAX_MS);
      c4.retry();
      comprueba('«Reintentar» pide ya y pide al servidor que intente el refresco', sueltas[sueltas.length - 1]?.opciones?.retryRefresh === true);
      sueltas.pop()!.resolve({ meta: { fingerprint: 'f-bien', evaluatedAt: new Date(r4).toISOString() } });
      await espera0();
      comprueba('cuando vuelve a ir bien, sin error y sin espera', !e4[e4.length - 1].data?.meta.refreshError && c4.failures === 0);
      c4.dispose();
    }

    // Tras un fallo de la carga, el reintento automático NO cambia el error
    // por la rueda: el error sigue a la vista mientras se vuelve a pedir.
    {
      const sueltas: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];
      const e5: any[] = [];
      let r5 = 9_000_000;
      const c5 = createEvaluationController<any>({
        fetch: () => new Promise((resolve, reject) => sueltas.push({ resolve, reject })),
        probe: () => Promise.resolve({ fingerprint: 'f' }),
        now: () => r5,
        visible: () => true,
        onChange: st => e5.push(st),
      });
      c5.setKey('A');
      sueltas.pop()!.reject(new Error('caído'));
      await espera0();
      comprueba('fallo: el error', Boolean(e5[e5.length - 1].error));
      r5 += 5000;
      comprueba('a los 5 s no se reintenta (espera)', (await c5.tick()) === 'skip');
      r5 += 5000;
      comprueba('a los 10 s se reintenta solo', (await c5.tick()) === 'reload');
      const durante = visibleEvaluation(e5[e5.length - 1], 'A');
      comprueba('y mientras, el error sigue a la vista (sin rueda)', Boolean(durante.error) && !durante.isLoading && durante.isRefreshing);
      sueltas.pop()!.reject(new Error('caído otra vez'));
      await espera0();
      r5 += 15000;
      comprueba('segundo fallo: a los 15 s todavía no', (await c5.tick()) === 'skip');
      c5.retry();
      comprueba('«Reintentar» (a mano) sí enseña que carga', visibleEvaluation(e5[e5.length - 1], 'A').isLoading);
      c5.dispose();
    }

    // Una pantalla que se oculta suelta su carga (libera la plaza) sin error y,
    // al volver, la repite.
    {
      const e7: any[] = [];
      const pedidas: AbortController[] = [];
      const c7 = createEvaluationController<any>({
        fetch: controller => new Promise((_, reject) => {
          pedidas.push(controller);
          controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
        probe: () => Promise.resolve({ fingerprint: 'f' }),
        now: () => reloj,
        visible: () => true,
        onChange: st => e7.push(st),
      });
      c7.setKey('lista');
      c7.suspend();
      await espera0();
      comprueba('oculta: la carga en curso se suelta, sin error', pedidas[0].signal.aborted && !e7.some(st => st.error) && !c7.loading);
      c7.setKey('lista');
      comprueba('visible otra vez (misma clave): se vuelve a pedir', pedidas.length === 2 && !pedidas[1].signal.aborted && c7.loading);
      c7.dispose();
    }

    // Una sonda que agota su tiempo es un fallo de la sonda, no «ocupado».
    {
      const c6 = createEvaluationController<any>({
        fetch: () => Promise.resolve({ meta: { fingerprint: 'f', evaluatedAt: new Date(reloj).toISOString() } }),
        probe: controller => withRequestTimeout(signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), 'sonda', controller, 20),
        now: () => reloj,
        visible: () => true,
        onChange: () => undefined,
      });
      c6.setKey('A');
      await espera0();
      reloj += EVALUATION_REFRESH_INTERVAL_MS;
      comprueba('sonda agotada: probe-failed', (await c6.tick()) === 'probe-failed');
      c6.dispose();
    }
  }

  // --- la tabla de trazabilidad ------------------------------------------------
  comprueba('página dentro de lo que trajo la ficha: local', traceabilityPageSource({ initialCount: 100, available: 200, pageFrom: 90, pageSize: 10 }) === 'local');
  comprueba('7 entradas y página de 10: local (no se pide nada)', traceabilityPageSource({ initialCount: 7, available: 7, pageFrom: 0, pageSize: 10 }) === 'local');
  comprueba('más allá de lo que trajo: al servidor', traceabilityPageSource({ initialCount: 100, available: 200, pageFrom: 100, pageSize: 10 }) === 'remote');
  comprueba('última página parcial dentro de lo traído: local', traceabilityPageSource({ initialCount: 95, available: 95, pageFrom: 90, pageSize: 10 }) === 'local');

  // --- servidor ----------------------------------------------------------------
  let reloj = 0;
  const memoria = new EvaluationCache<string>(3, 1000, () => reloj);
  const porTamano = new EvaluationCache<string>(100, 1000, () => reloj, 10, v => v.length);
  porTamano.set('x', 'h', '123456');
  porTamano.set('y', 'h', '123456');
  comprueba('memoria: con el tope de tamaño se va la más antigua', porTamano.get('x', 'h') === undefined && porTamano.get('y', 'h') === '123456' && porTamano.bytes === 6);
  memoria.set('k', 'huella-1', 'valor');
  comprueba('memoria: misma huella, el valor', memoria.get('k', 'huella-1') === 'valor');
  comprueba('memoria: otra huella (hechos nuevos), nada', memoria.get('k', 'huella-2') === undefined);
  memoria.set('k', 'huella-1', 'valor');
  reloj = 1001;
  comprueba('memoria: caducada, nada', memoria.get('k', 'huella-1') === undefined);
  reloj = 0;
  ['a', 'b', 'c', 'd'].forEach(k => memoria.set(k, 'h', k));
  comprueba('memoria: con el tope, se va la que lleva más sin usarse', memoria.size === 3 && memoria.get('a', 'h') === undefined && memoria.get('d', 'h') === 'd');

  const compartido = new SharedTasks<number>();
  let calculos = 0;
  let cancelado = false;
  const calcula = async (signal: any) => { calculos += 1; await espera(10); if (signal.aborted) { cancelado = true; throw new Error('cancelado'); } return 42; };
  const [x, y] = await Promise.all([compartido.run('fila', calcula, new CancelSignal()), compartido.run('fila', calcula, new CancelSignal())]);
  comprueba('dos peticiones del mismo cálculo a la vez: uno solo', calculos === 1 && x === 42 && y === 42);
  await compartido.run('fila', calcula, new CancelSignal());
  comprueba('terminado, el siguiente calcula de nuevo', calculos === 2);
  const a1 = new CancelSignal();
  const a2 = new CancelSignal();
  const p1 = compartido.run('otra', calcula, a1).catch(() => 'x');
  const p2 = compartido.run('otra', calcula, a2).catch(() => 'x');
  a1.cancel();
  comprueba('si se va uno de dos, el cálculo sigue', !cancelado);
  a2.cancel();
  await Promise.all([p1, p2]);
  comprueba('si se van todos, el cálculo se cancela', cancelado);
  cancelado = false;
  const sinEspera = compartido.run('fondo', calcula);
  const a3 = new CancelSignal();
  const p3 = compartido.run('fondo', calcula, a3).catch(() => 'x');
  a3.cancel();
  await Promise.all([sinEspera, p3]);
  comprueba('el que se refresca en segundo plano no se cancela', !cancelado);

  // S-N1: quien llega cuando el cálculo en curso ya está cancelado (se fueron
  // todos los que esperaban) no se une a él: empieza uno nuevo y le llega su
  // resultado, no el error del cancelado.
  {
    let arrancados = 0;
    const lento = async (signal: any) => {
      arrancados += 1;
      await espera(15);
      if (signal.aborted) throw new Error('cancelado');
      return 7;
    };
    const tareas = new SharedTasks<number>();
    const primero = new CancelSignal();
    const pPrimero = tareas.run('fila', lento, primero).catch(e => e.message);
    primero.cancel();
    comprueba('S-N1: cancelado, ya no cuenta como en curso', !tareas.has('fila'));
    const segundo = await tareas.run('fila', lento, new CancelSignal()).catch(e => `error: ${e.message}`);
    comprueba('S-N1: el que llega después no hereda la cancelación: calcula de nuevo', segundo === 7 && arrancados === 2, { segundo, arrancados });
    comprueba('S-N1: el cancelado termina en error para quien se fue', (await pPrimero) === 'cancelado');
    comprueba('S-N1: y su final no borra al nuevo de la lista', tareas.size === 0);
  }

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

  // R4: lo que alguien espera pasa delante de lo que se refresca en segundo
  // plano (que ya estaba en la cola).
  {
    const sem = new Semaphore(1);
    const orden: string[] = [];
    const trabajo = (nombre: string, background: boolean) => sem.use(async () => { orden.push(nombre); await espera(2); }, { background });
    const todas = [trabajo('ocupa', false), trabajo('fondo-1', true), trabajo('fondo-2', true), trabajo('primer-plano', false)];
    await Promise.all(todas);
    comprueba('R4: el de primer plano adelanta a los de fondo en cola', orden.join() === 'ocupa,primer-plano,fondo-1,fondo-2', orden);
  }

  fallos.length ? console.log(`\n${fallos.length} FALLOS`) : console.log('\nTodas las comprobaciones pasan.');
  process.exit(fallos.length ? 1 : 0);
})();
