/** When an evaluation is requested again (browser) and when it is recomputed (server). */
import { ENSRequestTimeoutError, withRequestTimeout } from '../common/platform/request-timeout';
import { traceabilityPageSource } from '../public/evaluation/traceability-paging';
import { controlRowWaitLabel } from '../public/ens/controls/control-row-state';
import {
  backoffAfter,
  createEvaluationController,
  EVALUATION_BACKOFF_MAX_MS,
  EVALUATION_PENDING_RETRY_MS,
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
declare const require: any;
declare const __dirname: string;
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

(async () => {
  check('the interval is 5 minutes', EVALUATION_REFRESH_INTERVAL_MS === 5 * 60 * 1000);
  check('probe: the first time, yes', shouldProbe(undefined, 1000, true));
  check('probe: before 5 minutes, no', !shouldProbe(0, EVALUATION_REFRESH_INTERVAL_MS - 1, true));
  check('probe: at 5 minutes, yes', shouldProbe(0, EVALUATION_REFRESH_INTERVAL_MS, true));
  check('probe: with the tab hidden, never', !shouldProbe(0, 10 * EVALUATION_REFRESH_INTERVAL_MS, false) && !shouldProbe(undefined, 0, false));
  const now = Date.parse('2026-10-17T12:00:00Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();
  check('same fingerprint and recent result: not reloaded', !shouldReload('a', 'a', ago(60000), now));
  check('different fingerprint: reloaded', shouldReload('b', 'a', ago(60000), now));
  check('same fingerprint but old result (the engine measures against the clock): reloaded', shouldReload('a', 'a', ago(EVALUATION_MAX_AGE_MS), now));
  check('what was shown while recomputing is reloaded', shouldReload('a', 'refreshing:a', ago(1000), now));
  check('no result: loaded', shouldReload('a', undefined, undefined, now));
  check('the key does not depend on the order of the parameters', evaluationKey({ include: 'x', agentId: '024' }) === evaluationKey({ agentId: '024', include: 'x' }));
  check('another machine, another key', evaluationKey({ include: 'x', agentId: '024' }) !== evaluationKey({ include: 'x', agentId: '028' }));

  const cola = new RequestLimiter(2);
  let inProgress = 0;
  let pico = 0;
  const tarea = async (i: number) => {
    inProgress += 1;
    pico = Math.max(pico, inProgress);
    await wait(5);
    inProgress -= 1;
    return i;
  };
  const made = await Promise.all(Array.from({ length: 23 }, (_, i) => cola.run(() => tarea(i))));
  check('23 requests (one per control): never more than 2 at a time', pico === 2, pico);
  check('and all finish, in their order', made.join() === Array.from({ length: 23 }, (_, i) => i).join());
  await cola.run(async () => { throw new Error('x'); }).catch(() => undefined);
  check('a failure releases its slot', cola.running === 0 && cola.queued === 0);

  let e = initialEvaluationState<string>();
  const A = evaluationKey({ agentId: 'A' });
  const B = evaluationKey({ agentId: 'B' });
  check('on mount: loading and no data', visibleEvaluation(e, A).isLoading && visibleEvaluation(e, A).data === undefined);
  e = evaluationReducer(e, { type: 'load', key: A });
  e = evaluationReducer(e, { type: 'success', key: A, data: 'de A' });
  e = evaluationReducer(e, { type: 'refresh', key: A });
  check('refreshing the same key: it stays visible, marked', visibleEvaluation(e, A).data === 'de A' && visibleEvaluation(e, A).isRefreshing);
  check('another machine: nothing from A, loading', visibleEvaluation(e, B).data === undefined && visibleEvaluation(e, B).isLoading);
  e = evaluationReducer(e, { type: 'load', key: B });
  e = evaluationReducer(e, { type: 'success', key: A, data: 'tarde' });
  check('a late response from A does not show in B', visibleEvaluation(e, B).data === undefined && visibleEvaluation(e, A).data === undefined);
  e = evaluationReducer(e, { type: 'failure', key: B, error: new Error('down') });
  check('with a failure, the error and no data', visibleEvaluation(e, B).data === undefined && Boolean(visibleEvaluation(e, B).error) && !visibleEvaluation(e, B).isLoading);

  {
    let clock = 1_000_000;
    let visible = true;
    const pending: { resolve: (v: any) => void; reject: (e: any) => void; controller: AbortController; tipo: string }[] = [];
    const states: any[] = [];
    const promise = (type: string, controller: AbortController) =>
      new Promise<any>((resolve, reject) => {
        pending.push({ resolve, reject, controller, tipo: type });
        controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    const c = createEvaluationController<any>({
      fetch: controller => promise('fetch', controller),
      probe: controller => promise('probe', controller),
      now: () => clock,
      visible: () => visible,
      onChange: st => states.push(st),
    });
    const ultimo = () => states[states.length - 1];
    const tick = () => c.tick();
    const resolves = (type: string, value: any) => {
      const p = pending.filter(x => x.tipo === type && !x.controller.signal.aborted).pop()!;
      pending.splice(pending.indexOf(p), 1);
      p.resolve(value);
    };
    const wait0 = () => new Promise(r => setTimeout(r, 0));

    c.setKey('A');
    check('first load: loading, no data', ultimo().loading && ultimo().data === undefined);
    clock += 10 * 60 * 1000;
    check('a lap during the first load neither probes nor interrupts it', (await tick()) === 'busy' && pending.filter(p => p.tipo === 'fetch' && !p.controller.signal.aborted).length === 1);
    resolves('fetch', { meta: { fingerprint: 'f1', evaluatedAt: new Date(clock).toISOString() } });
    await wait0();
    check('arrives: A\'s data', ultimo().key === 'A' && ultimo().data?.meta.fingerprint === 'f1');
    check('right after, no probe (5 min)', (await tick()) === 'skip');
    clock += EVALUATION_REFRESH_INTERVAL_MS;
    visible = false;
    check('hidden tab: nothing', (await tick()) === 'skip' && pending.length === 0);
    visible = true;
    const probing = tick();
    resolves('probe', { fingerprint: 'f1' });
    check('visible again: probe; same fingerprint, no reload', (await probing) === 'unchanged' && pending.length === 0);
    clock += EVALUATION_REFRESH_INTERVAL_MS;
    const probing2 = tick();
    resolves('probe', { fingerprint: 'f2' });
    check('new fingerprint: reloads on top (A\'s data stays visible)', (await probing2) === 'reload' && ultimo().data?.meta.fingerprint === 'f1' && ultimo().refreshing);
    resolves('fetch', { meta: { fingerprint: 'f2', evaluatedAt: new Date(clock).toISOString(), refreshing: true } });
    await wait0();
    clock += EVALUATION_REFRESHING_RETRY_MS;
    check('the server was recomputing: requested again after 10 s', (await tick()) === 'reload');
    resolves('fetch', { meta: { fingerprint: 'f3', evaluatedAt: new Date(clock).toISOString() } });
    await wait0();

    clock += EVALUATION_REFRESH_INTERVAL_MS;
    const probing3 = tick();
    c.setKey('B');
    check('changing key cancels the probe in progress', (await probing3) === 'busy');
    check('B: loading, nothing from A', ultimo().key === 'B' && ultimo().data === undefined && ultimo().loading);
    check('changing key leaves no error', !states.some(e => e.error));
    resolves('fetch', { meta: { fingerprint: 'b1', evaluatedAt: new Date(clock).toISOString() } });
    await wait0();
    check('the probe clock goes back to zero with the new key', (await tick()) === 'skip');
    c.setKey('B');
    check('requesting the same key again does not erase what is seen', ultimo().data?.meta.fingerprint === 'b1');

    const c2States: any[] = [];
    const c2 = createEvaluationController<any>({
      fetch: controller => withRequestTimeout(signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), 'evaluación ENS', controller, 20),
      probe: () => Promise.resolve({ fingerprint: 'x' }),
      now: () => clock,
      visible: () => true,
      onChange: st => c2States.push(st),
    });
    c2.setKey('lenta');
    await new Promise(r => setTimeout(r, 60));
    const end = c2States[c2States.length - 1];
    check('a timeout arrives as an error (it is not silenced)', end.error instanceof ENSRequestTimeoutError && !end.loading, end.error?.message);
    c2.retry();
    check('«Reintentar» requests it again', c2States[c2States.length - 1].loading);
    c2.dispose();
    c.dispose();

    {
      const loose: { resolve: (v: any) => void; opciones?: any }[] = [];
      const e3: any[] = [];
      const c3 = createEvaluationController<any>({
        fetch: (_controller, options) => new Promise(resolve => loose.push({ resolve, opciones: options })),
        probe: () => Promise.resolve({ fingerprint: 'x' }),
        now: () => clock,
        visible: () => true,
        onChange: st => e3.push(st),
      });
      c3.setKey('A');
      c3.setKey('B');
      loose[0].resolve({ meta: { fingerprint: 'de-A' } });
      await wait0();
      const onB = e3[e3.length - 1];
      check('late response from A with B in view: it does not appear, B keeps loading', onB.key === 'B' && onB.loading && onB.data === undefined);
      loose[1].resolve({ meta: { fingerprint: 'de-B' } });
      await wait0();
      check('and B\'s does', e3[e3.length - 1].data?.meta.fingerprint === 'de-B');
      c3.dispose();
    }

    {
      const loose: { resolve: (v: any) => void; reject: (e: any) => void; opciones?: any }[] = [];
      const e4: any[] = [];
      let r4 = 5_000_000;
      const c4 = createEvaluationController<any>({
        fetch: (_controller, options) => new Promise((resolve, reject) => loose.push({ resolve, reject, opciones: options })),
        probe: () => Promise.resolve({ fingerprint: 'otra' }),
        now: () => r4,
        visible: () => true,
        onChange: st => e4.push(st),
      });
      const withFailure = (n: number) => ({ meta: { fingerprint: `refreshing:f${n}`, evaluatedAt: new Date(r4).toISOString(), refreshing: true, refreshError: { message: 'Datos incompletos', at: new Date(r4).toISOString() } } });
      c4.setKey('A');
      loose.pop()!.resolve(withFailure(1));
      await wait0();
      check('refreshError: the last good data is shown with the motive', e4[e4.length - 1].data?.meta.refreshError?.message === 'Datos incompletos' && !e4[e4.length - 1].loading);
      const waits: number[] = [];
      for (let i = 0; i < 8; i++) {
        const since = r4;
        let laps = 0;
        while ((await c4.tick()) !== 'reload') {
          r4 += 1000;
          if (++laps > 400) break;
        }
        waits.push(Math.round((r4 - since) / 1000));
        loose.pop()!.resolve(withFailure(i + 2));
        await wait0();
      }
      check('not every 10 s: 10, 20, 40, 80, 160 s and then 300 s at most', waits.join() === '10,20,40,80,160,300,300,300', waits.join());
      check('backoffAfter: 5 min cap', backoffAfter(1) === 10000 && backoffAfter(30) === EVALUATION_BACKOFF_MAX_MS);
      c4.retry();
      check('«Reintentar» requests now and asks the server to try the refresh', loose[loose.length - 1]?.opciones?.retryRefresh === true && c4.failures === 0);
      const during = visibleEvaluation(e4[e4.length - 1], 'A');
      check('N4: while retrying, the retry is visible (stored data, refreshing)', during.isRefreshing && Boolean(during.data));
      const retryIn = r4;
      loose.pop()!.resolve({ meta: { fingerprint: 'refreshing:f-viejo', evaluatedAt: new Date(r4).toISOString(), refreshing: true } });
      await wait0();
      check('N4: the response to the retry (stored data, updating) does not count as a failure', c4.failures === 0 && !e4[e4.length - 1].data?.meta.refreshError);
      let laps = 0;
      while ((await c4.tick()) !== 'reload' && laps++ < 60) r4 += 1000;
      check('N4: requests again after 10 s (not the 5 min of the earlier wait)', r4 - retryIn <= 20000, (r4 - retryIn) / 1000);
      loose.pop()!.resolve({ meta: { fingerprint: 'f-bien', evaluatedAt: new Date(r4).toISOString() } });
      await wait0();
      check('N4: and picks up the new data, with no error and no wait', e4[e4.length - 1].data?.meta.fingerprint === 'f-bien' && !e4[e4.length - 1].data?.meta.refreshError && c4.failures === 0);
      c4.dispose();
    }

    {
      const loose: { resolve: (v: any) => void }[] = [];
      let r8 = 7_000_000;
      const c8 = createEvaluationController<any>({
        fetch: () => new Promise(resolve => loose.push({ resolve })),
        probe: () => Promise.resolve({ fingerprint: 'otra' }),
        now: () => r8,
        visible: () => true,
        onChange: () => undefined,
      });
      const same = { meta: { fingerprint: 'refreshing:f', evaluatedAt: new Date(r8).toISOString(), refreshing: true, refreshError: { message: 'Datos incompletos', at: '2026-10-28T10:00:00.000Z' } } };
      c8.setKey('A');
      loose.pop()!.resolve(same);
      await wait0();
      for (let i = 0; i < 4; i++) {
        let v = 0;
        while ((await c8.tick()) !== 'reload' && v++ < 400) r8 += 1000;
        loose.pop()!.resolve(same);
        await wait0();
      }
      check('the same repeated error counts once', c8.failures === 1, c8.failures);
      c8.dispose();
    }

    {
      const loose: { resolve: (v: any) => void }[] = [];
      let r9 = 3_000_000;
      const c9 = createEvaluationController<any>({
        fetch: () => new Promise(resolve => loose.push({ resolve })),
        probe: () => Promise.resolve({ fingerprint: 'x' }),
        now: () => r9,
        visible: () => true,
        onChange: () => undefined,
      });
      c9.setKey('A');
      loose.pop()!.resolve({ meta: { fingerprint: 'refreshing:p', evaluatedAt: new Date(r9).toISOString(), refreshing: true, pending: { rows: 40, controls: ['op.acc.3'], total: 86 } } });
      await wait0();
      r9 += 1000;
      check('pending: at the second, not yet', (await c9.tick()) === 'skip');
      r9 += EVALUATION_PENDING_RETRY_MS - 1000;
      check('pending: at 2 s it requests again', (await c9.tick()) === 'reload');
      loose.pop()!.resolve({ meta: { fingerprint: 'refreshing:s', evaluatedAt: new Date(r9).toISOString(), refreshing: true, seriesPending: true } });
      await wait0();
      r9 += EVALUATION_PENDING_RETRY_MS;
      check('pending series: every 2 s too', (await c9.tick()) === 'reload');
      loose.pop()!.resolve({ meta: { fingerprint: 'listo', evaluatedAt: new Date(r9).toISOString() } });
      await wait0();
      r9 += EVALUATION_PENDING_RETRY_MS;
      check('with everything ready, the 5-min probe', (await c9.tick()) === 'skip');
      c9.dispose();
    }

    {
      const loose: { resolve: (v: any) => void }[] = [];
      let r11 = 13_000_000;
      let visible11 = true;
      const c11 = createEvaluationController<any>({
        fetch: () => new Promise(resolve => loose.push({ resolve })),
        probe: () => Promise.resolve({ fingerprint: 'x' }),
        now: () => r11,
        visible: () => visible11,
        onChange: () => undefined,
      });
      const halfDone = () => ({ meta: { fingerprint: 'refreshing:s', evaluatedAt: new Date(r11).toISOString(), refreshing: true, seriesPending: true } });
      c11.setKey('A');
      loose.pop()!.resolve(halfDone());
      await wait0();
      const waits: number[] = [];
      for (let i = 0; i < 70; i++) {
        const since = r11;
        let v = 0;
        while ((await c11.tick()) !== 'reload' && v++ < 100) r11 += 1000;
        waits.push((r11 - since) / 1000);
        loose.pop()!.resolve(halfDone());
        await wait0();
      }
      check('M6: every 2 s for the first 2 minutes', waits.slice(0, 55).every(e => e === 2), waits.slice(0, 62).join());
      check('M6: then, every 15 s', waits.slice(-5).every(e => e === 15), waits.slice(-8).join());
      visible11 = false;
      r11 += 60000;
      check('M6: with the tab hidden, nothing', (await c11.tick()) === 'skip');
      c11.dispose();
    }

    check('row: pending control → «Calculando…»', controlRowWaitLabel(false, { controlId: 'op.acc.3', status: 'NO_EVALUABLE', evaluated: false, pending: true, requirementsNotMet: 0, requirementsNotEvidenced: 0 }) === 'Calculando…');
    check('row: first load without summary → «Evaluando…»; with a result → nothing', controlRowWaitLabel(true, undefined) === 'Evaluando…' && controlRowWaitLabel(false, { controlId: 'op.acc.3', status: 'CUMPLE', evaluated: true, requirementsNotMet: 0, requirementsNotEvidenced: 0 }) === undefined);
    const chart = require('fs').readFileSync(require('path').join(__dirname, '../public/ens/controls/control-detail/evolution-chart.tsx'), 'utf8');
    const vista = require('fs').readFileSync(require('path').join(__dirname, '../public/ens/overview/index.tsx'), 'utf8');
    check('I1: the Overview trend paints nothing with pending rows, with or without series', /const pendingSeries =\s*Boolean\(trend\.data\?\.meta\?\.pending\) \|\|/.test(vista));
    check('the sheet\'s evolution says «Calculando la serie…» with the series pending (not «ningún día medido»)', /if \(pending && !points\.length\)[\s\S]{0,300}Calculando la serie…/.test(chart));
    const panel = require('fs').readFileSync(require('path').join(__dirname, '../public/ens/dashboard/ens-dashboard-main.tsx'), 'utf8');
    check('the Panel\'s evolution too: «Calculando la serie…», without the loose current point or «todavía no hay eventos»',
      /const pendingSeries = Boolean\(evaluation\.data\?\.meta\?\.seriesPending\)/.test(panel) &&
      /pendingSeries \? \[\] : dashboardModel\.evolution\.rows/.test(panel) &&
      /\{pendingSeries && \([\s\S]{0,600}Calculando la serie…/.test(panel) &&
      !/dashboardModel\.evolution\.rows\.(length|map)/.test(panel));

    {
      const loose: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];
      const e5: any[] = [];
      let r5 = 9_000_000;
      const c5 = createEvaluationController<any>({
        fetch: () => new Promise((resolve, reject) => loose.push({ resolve, reject })),
        probe: () => Promise.resolve({ fingerprint: 'f' }),
        now: () => r5,
        visible: () => true,
        onChange: st => e5.push(st),
      });
      c5.setKey('A');
      loose.pop()!.reject(new Error('down'));
      await wait0();
      check('failure: the error', Boolean(e5[e5.length - 1].error));
      r5 += 5000;
      check('at 5 s it does not retry (waiting)', (await c5.tick()) === 'skip');
      r5 += 5000;
      check('at 10 s it retries by itself', (await c5.tick()) === 'reload');
      const during = visibleEvaluation(e5[e5.length - 1], 'A');
      check('and meanwhile, the error stays in view (no spinner)', Boolean(during.error) && !during.isLoading && during.isRefreshing);
      loose.pop()!.reject(new Error('down again'));
      await wait0();
      r5 += 15000;
      check('second failure: at 15 s not yet', (await c5.tick()) === 'skip');
      c5.retry();
      check('«Reintentar» (manual) does show that it loads', visibleEvaluation(e5[e5.length - 1], 'A').isLoading);
      c5.dispose();
    }

    {
      const e7: any[] = [];
      const requested: AbortController[] = [];
      const c7 = createEvaluationController<any>({
        fetch: controller => new Promise((_, reject) => {
          requested.push(controller);
          controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
        probe: () => Promise.resolve({ fingerprint: 'f' }),
        now: () => clock,
        visible: () => true,
        onChange: st => e7.push(st),
      });
      c7.setKey('lista');
      c7.suspend();
      await wait0();
      check('hidden: the load in progress is dropped, with no error', requested[0].signal.aborted && !e7.some(st => st.error) && !c7.loading);
      c7.setKey('lista');
      check('visible again (same key): requested again', requested.length === 2 && !requested[1].signal.aborted && c7.loading);
      c7.dispose();
    }

    {
      const requested: { controller: AbortController; opciones?: any; resolve: (v: any) => void }[] = [];
      const e10: any[] = [];
      let r10 = 11_000_000;
      const c10 = createEvaluationController<any>({
        fetch: (controller, options) => new Promise((resolve, reject) => {
          requested.push({ controller, opciones: options, resolve });
          controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
        probe: controller => new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('aborted')))),
        now: () => r10,
        visible: () => true,
        onChange: st => e10.push(st),
      });
      c10.setKey('A');
      requested[0].resolve({ meta: { fingerprint: 'f', evaluatedAt: new Date(r10).toISOString() } });
      await wait0();
      c10.retry();
      c10.suspend();
      c10.setKey('A');
      check('hidden during «Reintentar»: on return it repeats as «Reintentar»', requested[requested.length - 1].opciones?.retryRefresh === true);
      check('and refreshes on top of what was seen', visibleEvaluation(e10[e10.length - 1], 'A').data?.meta.fingerprint === 'f' && visibleEvaluation(e10[e10.length - 1], 'A').isRefreshing);
      requested[requested.length - 1].resolve({ meta: { fingerprint: 'f2', evaluatedAt: new Date(r10).toISOString() } });
      await wait0();
      r10 += EVALUATION_REFRESH_INTERVAL_MS;
      const probing = c10.tick();
      c10.suspend();
      check('probe dropped on hiding: «busy», no error', (await probing) === 'busy' && !e10.some(st => st.error));
      c10.setKey('A');
      const otherProbe = c10.tick();
      check('on return it probes at once (the dropped one did not count)', (await Promise.race([otherProbe.then(() => 'terminó'), wait0().then(() => 'sondeando')])) === 'sondeando');
      c10.suspend();
      await otherProbe;
      c10.setKey('B');
      check('another key while hidden: the new one is loaded', e10[e10.length - 1].key === 'B' && e10[e10.length - 1].loading);
      c10.dispose();
    }

    {
      const c6 = createEvaluationController<any>({
        fetch: () => Promise.resolve({ meta: { fingerprint: 'f', evaluatedAt: new Date(clock).toISOString() } }),
        probe: controller => withRequestTimeout(signal => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))), 'sonda', controller, 20),
        now: () => clock,
        visible: () => true,
        onChange: () => undefined,
      });
      c6.setKey('A');
      await wait0();
      clock += EVALUATION_REFRESH_INTERVAL_MS;
      check('probe timed out: probe-failed', (await c6.tick()) === 'probe-failed');
      c6.dispose();
    }
  }

  check('page within what the sheet brought: local', traceabilityPageSource({ initialCount: 100, available: 200, pageFrom: 90, pageSize: 10 }) === 'local');
  check('7 entries and page of 10: local (nothing is requested)', traceabilityPageSource({ initialCount: 7, available: 7, pageFrom: 0, pageSize: 10 }) === 'local');
  check('beyond what it brought: to the server', traceabilityPageSource({ initialCount: 100, available: 200, pageFrom: 100, pageSize: 10 }) === 'remote');
  check('last partial page within what was brought: local', traceabilityPageSource({ initialCount: 95, available: 95, pageFrom: 90, pageSize: 10 }) === 'local');

  let clock = 0;
  const memoria = new EvaluationCache<string>(3, 1000, () => clock);
  const bySize = new EvaluationCache<string>(100, 1000, () => clock, 10, v => v.length);
  bySize.set('x', 'h', '123456');
  bySize.set('y', 'h', '123456');
  check('memory: with the size cap the oldest goes', bySize.get('x', 'h') === undefined && bySize.get('y', 'h') === '123456' && bySize.bytes === 6);
  memoria.set('k', 'huella-1', 'valor');
  check('memory: same fingerprint, the value', memoria.get('k', 'huella-1') === 'valor');
  check('memory: another fingerprint (new facts), nothing', memoria.get('k', 'huella-2') === undefined);
  memoria.set('k', 'huella-1', 'valor');
  clock = 1001;
  check('memory: expired, nothing', memoria.get('k', 'huella-1') === undefined);
  clock = 0;
  ['a', 'b', 'c', 'd'].forEach(k => memoria.set(k, 'h', k));
  check('memory: with the cap, the least recently used goes', memoria.size === 3 && memoria.get('a', 'h') === undefined && memoria.get('d', 'h') === 'd');

  const shared = new SharedTasks<number>();
  let computations = 0;
  let cancelled = false;
  const computes = async (signal: any) => { computations += 1; await wait(10); if (signal.aborted) { cancelled = true; throw new Error('cancelled'); } return 42; };
  const [x, y] = await Promise.all([shared.run('fila', computes, new CancelSignal()), shared.run('fila', computes, new CancelSignal())]);
  check('two requests for the same computation at once: only one', computations === 1 && x === 42 && y === 42);
  await shared.run('fila', computes, new CancelSignal());
  check('finished, the next computes again', computations === 2);
  const a1 = new CancelSignal();
  const a2 = new CancelSignal();
  const p1 = shared.run('otra', computes, a1).catch(() => 'x');
  const p2 = shared.run('otra', computes, a2).catch(() => 'x');
  a1.cancel();
  check('if one of two leaves, the computation goes on', !cancelled);
  a2.cancel();
  await Promise.all([p1, p2]);
  check('if all leave, the computation is cancelled', cancelled);
  cancelled = false;
  const withoutWait = shared.run('fondo', computes);
  const a3 = new CancelSignal();
  const p3 = shared.run('fondo', computes, a3).catch(() => 'x');
  a3.cancel();
  await Promise.all([withoutWait, p3]);
  check('the one refreshing in the background is not cancelled', !cancelled);

  {
    let started = 0;
    const lento = async (signal: any) => {
      started += 1;
      await wait(15);
      if (signal.aborted) throw new Error('cancelled');
      return 7;
    };
    const tasks = new SharedTasks<number>();
    const primero = new CancelSignal();
    const pPrimero = tasks.run('fila', lento, primero).catch(e => e.message);
    primero.cancel();
    check('S-N1: cancelled, it no longer counts as in progress', !tasks.has('fila'));
    const second = await tasks.run('fila', lento, new CancelSignal()).catch(e => `error: ${e.message}`);
    check('S-N1: the one arriving later does not inherit the cancellation: computes again', second === 7 && started === 2, { segundo: second, arrancados: started });
    check('S-N1: the cancelled one ends in error for whoever left', (await pPrimero) === 'cancelled');
    check('S-N1: and its end does not erase the new one from the list', tasks.size === 0);
  }

  const traffic = new Semaphore(2);
  let actives = 0;
  let max = 0;
  await Promise.all(Array.from({ length: 7 }, () => traffic.use(async () => {
    actives += 1;
    max = Math.max(max, actives);
    await wait(3);
    actives -= 1;
  })));
  check('server: at most 2 evaluations at a time', max === 2, max);

  {
    const week = new Semaphore(1);
    const order: string[] = [];
    const job = (name: string, background: boolean) => week.use(async () => { order.push(name); await wait(2); }, { background });
    const allOnes = [job('ocupa', false), job('fondo-1', true), job('fondo-2', true), job('primer-plano', false)];
    await Promise.all(allOnes);
    check('R4: the foreground one overtakes the background ones in the queue', order.join() === 'ocupa,primer-plano,fondo-1,fondo-2', order);
  }

  failures.length ? console.log(`\n${failures.length} FAILURES`) : console.log('\nAll checks pass.');
  process.exit(failures.length ? 1 : 0);
})();
