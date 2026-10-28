// Maturity next to the evaluation: the organisation's view, inputs refreshed behind, and the day's snapshots (job only).
import type { Logger } from '../../../../../src/core/server';
import { ENSCatalog } from '../../../common/ens/catalog';
import {
  addDays,
  computeControlMaturity,
  configuredTimeZone,
  dayIn,
  ENS_MATURITY_PERIOD_DAYS,
  ENS_MATURITY_TREND_WINDOW_DAYS,
} from '../../../common/ens/maturity/maturity-engine';
import type { ENSMaturityActivity, ENSMaturityPeriod } from '../../../common/ens/maturity/maturity-engine';
import { readControlMaturityRecord, resolveMaturityTargets } from '../../../common/ens/maturity/maturity-records';
import type { ENSControlMaturity, ENSControlSnapshot, ENSMaturityGate, ENSMaturityLevel, ENSMaturityVersion } from '../../../common/ens/maturity/types';
import type { ENSEvaluationClients, ENSEvaluationContext, ENSEvaluationQuery, ENSEvaluationService } from '../evaluation/evaluation-service';
import { ENSBadRequestError, normalizeQuery } from '../evaluation/evaluation-service';
import { CancelSignal } from '../evaluation/cache';
import { searchComplete, throwIfCancelled, yieldToEventLoop } from '../evaluation/facts-reader';
import { buildViewFilters, catalogControlIds } from '../evaluation/queries';
import { buildActivityRequest, buildMachinesRequest, firstFactsOfScope, groupActivityControls, readActivityResponse, readMachinesResponse } from './activity';
import { ENS_SNAPSHOT_RETENTION_DAYS, purgeSnapshots, readSnapshots, snapshotId, writeSnapshots } from './snapshot-storage';

type RunOutput = Awaited<ReturnType<ENSEvaluationService['run']>>;

// A view's maturity: `pending` while it is computed (or out of date); `error` once the retries are spent.
export interface ENSMaturityOfView {
  controls: Map<string, ENSControlMaturity>;
  complete: boolean;
  pending: boolean;
  version: ENSMaturityVersion | null;
  error?: string;
}

// What the maturity reads besides the evaluation; `failures`: what could not be read (the daily job writes nothing then).
interface ENSMaturityInputs {
  at: number;
  activity?: Map<string, ENSMaturityActivity>;
  since: Map<string, string>;
  // The first-fact lookup ran: a machine without one there has its first fact within its activity.
  firstFactsRead: boolean;
  period: ENSMaturityPeriod;
  snapshots: ENSControlSnapshot[];
  snapshotsError?: string;
  failures: string[];
}

export interface ENSMaturityServiceOptions {
  logger: Logger;
  evaluation: ENSEvaluationService;
  inputsTtlMs?: number;
  clock?: () => number;
  justificationTimeoutMs?: number;
}

const DAY_MS = 86400e3;
// The justification rule judges with inputs read at most this long ago.
export const ENS_JUSTIFICATION_INPUTS_MAX_AGE_MS = 15 * 60e3;
// Machine view's organisation pass: 3 failed passes (5 s, 30 s apart), then an error unless a current view is cached,
// retried behind every 5 min until it clears. Only a pass that throws fails; rows still missing are pending while
// their number goes down.
export const ENS_ORGANISATION_ATTEMPTS = 3;
const RETRY_WAITS_MS = [5e3, 30e3];
const RETRY_AFTER_ERROR_MS = 5 * 60e3;
// Missing organisation rows whose number has not gone down for this long make the pass a failed attempt.
export const ENS_ORGANISATION_STALL_MS = 10 * 60e3;
export const ENS_MATURITY_FAILED = 'No se ha podido calcular la madurez.';
// Waits after consecutive failures (daily job runs, first-fact lookups): 30 min, 1 h, 2 h, 4 h, then 8 h.
export const ENS_RETRY_BACKOFF_MS = [30 * 60e3, 60 * 60e3, 2 * 3600e3, 4 * 3600e3, 8 * 3600e3];
export const retryBackoffMs = (failures: number): number => ENS_RETRY_BACKOFF_MS[Math.min(Math.max(1, failures), ENS_RETRY_BACKOFF_MS.length) - 1];
export const ENS_ACCREDITED_TIMEOUT = 'No se ha podido calcular a tiempo el nivel acreditado del control; vuelve a intentarlo en unos minutos.';

export class ENSMaturityUnavailableError extends Error {
  statusCode = 503;
}

const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 0;
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const noView = (version: ENSMaturityVersion | null, extra: Partial<ENSMaturityOfView> = {}): ENSMaturityOfView => ({
  controls: new Map(),
  complete: false,
  pending: true,
  version,
  ...extra,
});
// What changes the maturity itself (not new facts): the records, the configuration and the scope.
const stateOf = (ctx: ENSEvaluationContext): string => `${ctx.configurationKey}|${ctx.maturityKey}|${ctx.scopeKey}`;

export const createMaturityService = ({
  logger,
  evaluation,
  inputsTtlMs = 5 * 60e3,
  clock = Date.now,
  justificationTimeoutMs = 20e3,
}: ENSMaturityServiceOptions) => {
  const inputs = new Map<string, ENSMaturityInputs>();
  const loading = new Map<string, Promise<ENSMaturityInputs | undefined>>();
  // Each machine's first fact: read once a day per user, and again when a machine joins the scope.
  const firstFacts = new Map<string, { at: number; agents: string[]; firsts: Map<string, number> }>();
  // A failed first-fact lookup is not repeated before its backoff (per user); a new local day or «Reintentar» resets it.
  const firstFactFailures = new Map<string, { day: string; count: number; until: number }>();
  const organisation = new Map<string, { state: string; fingerprint: string; complete: boolean; inputsAt: number; view: ENSMaturityOfView }>();
  const refreshing = new Map<string, Promise<void>>();
  // Per key: the fewest organisation rows missing so far, with their state and when that number was reached.
  const stalled = new Map<string, { state: string; rows: number; at: number }>();
  const failures = new Map<string, { count: number; nextAt: number }>();
  const accrediting = new Map<string, Promise<ENSMaturityInputs>>();
  const background = new Set<Promise<unknown>>();
  const stopped = new CancelSignal();
  const written = new Map<string, string>();
  const warned = new Map<string, number>();
  let purgedOn: string | undefined;

  const zoneOf = (ctx: ENSEvaluationContext): string => configuredTimeZone(ctx.configuration.global.timezone);
  const inputsKey = (ctx: ENSEvaluationContext): string => `${ctx.userKey}|${ctx.scopeKey}`;
  // A warning at most once an hour per user and cause: a viewer without permission is not logged every few minutes.
  const warnOnce = (key: string, message: string) => {
    const last = warned.get(key);
    if (last !== undefined && clock() - last < 3600e3) return;
    if (warned.size > 1000) warned.clear();
    warned.set(key, clock());
    logger.warn(message);
  };
  const track = <T>(promise: Promise<T>): Promise<T> => {
    background.add(promise);
    void promise.then(() => background.delete(promise), () => background.delete(promise));
    return promise;
  };
  // Reads share the evaluation's limit of 4 at once, behind what someone is waiting for; they stop with the service.
  const read = <T>(task: () => Promise<T>): Promise<T> =>
    evaluation.reads.use(async () => {
      throwIfCancelled(stopped);
      return task();
    }, { background: true });

  // Undefined when it could not be read: the activity is still read and every machine counts from the period start.
  // The oldest fact is the earliest first fact of the current scope's machines, so a smaller scope reuses the read.
  const firstFactsOf = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, zone: string) => {
    const key = ctx.userKey;
    const agents = ctx.scope.map(agent => agent.id);
    const cached = firstFacts.get(key);
    if (cached && clock() - cached.at < DAY_MS && agents.every(id => cached.agents.includes(id))) return firstFactsOfScope(cached.firsts, agents, zone);
    const today = dayIn(ctx.now, zone);
    const failure = firstFactFailures.get(key);
    if (failure && failure.day === today && clock() < failure.until) return undefined;
    try {
      const scopeFilters = buildViewFilters({ from: ctx.now.toISOString(), to: ctx.now.toISOString() }, ctx.scope).slice(1);
      const firsts = readMachinesResponse(
        await read(() => searchComplete(clients.asCurrentUser, buildMachinesRequest(scopeFilters, ctx.now, agents.length + 1), 'el primer hecho de cada máquina'))
      );
      if (firstFacts.size > 200) firstFacts.clear();
      firstFacts.set(key, { at: clock(), agents, firsts });
      firstFactFailures.delete(key);
      return firstFactsOfScope(firsts, agents, zone);
    } catch (error: any) {
      if (stopped.aborted) throw error;
      const count = failure?.day === today ? failure.count + 1 : 1;
      if (firstFactFailures.size > 200) firstFactFailures.clear();
      firstFactFailures.set(key, { day: today, count, until: clock() + retryBackoffMs(count) });
      warnOnce(`first:${ctx.userKey}:${statusOf(error)}`, `Power ENS: could not read each machine's first fact for maturity: ${error?.message || error}`);
      return undefined;
    }
  };

  // All controls' inputs, or `controlIds` only; `snapshotsClient`: the viewer for screens, the internal user to judge.
  const loadInputs = async (
    clients: ENSEvaluationClients,
    ctx: ENSEvaluationContext,
    options: { controlIds?: string[]; snapshotsClient?: any } = {}
  ): Promise<ENSMaturityInputs> => {
    const zone = zoneOf(ctx);
    const to = ctx.now.toISOString();
    const from = new Date(ctx.now.getTime() - ENS_MATURITY_PERIOD_DAYS * DAY_MS).toISOString();
    const filters = buildViewFilters({ from, to }, ctx.scope);
    const failed: string[] = [];
    const machines = await firstFactsOf(clients, ctx, zone);
    if (!machines) failed.push("each machine's first fact");
    let activity: Map<string, ENSMaturityActivity> | undefined = new Map();
    try {
      for (const group of groupActivityControls(options.controlIds || catalogControlIds(), ctx.scope.length + 1, ENS_MATURITY_PERIOD_DAYS)) {
        const body = await read(() => searchComplete(clients.asCurrentUser, buildActivityRequest(filters, group, zone), 'la actividad diaria de los controles'));
        readActivityResponse(body, zone).forEach((value, controlId) => activity!.set(controlId, value));
        await yieldToEventLoop();
      }
    } catch (error: any) {
      if (stopped.aborted) throw error;
      warnOnce(`activity:${ctx.userKey}:${statusOf(error)}`, `Power ENS: could not read the daily activity for maturity: ${error?.message || error}`);
      activity = undefined;
      failed.push('the daily activity');
    }
    // The history is short only if some whole day of the period predates the oldest fact kept.
    const firstWholeDay = addDays(dayIn(new Date(from), zone), 1);
    const historyFrom = machines?.oldest && dayIn(new Date(machines.oldest), zone) > firstWholeDay ? machines.oldest : undefined;
    const today = dayIn(ctx.now, zone);
    let snapshots: ENSControlSnapshot[] = [];
    let snapshotsError: string | undefined;
    try {
      snapshots = await read(() =>
        readSnapshots(options.snapshotsClient || clients.asCurrentUser, { from: addDays(today, -ENS_MATURITY_TREND_WINDOW_DAYS), to: today, controlIds: options.controlIds })
      );
    } catch (error: any) {
      if (stopped.aborted) throw error;
      snapshotsError = statusOf(error) === 403 ? 'sin permiso de lectura de wazuh-ens-snapshots' : 'error del indexador';
      failed.push('the snapshots');
      warnOnce(`snapshots:${ctx.userKey}:${statusOf(error)}`, `Power ENS: could not read the maturity snapshots for ${ctx.userKey.split('|')[0] || 'a user'}: ${error?.message || error}`);
    }
    return {
      at: clock(),
      activity,
      since: machines?.since || new Map(),
      firstFactsRead: Boolean(machines),
      period: { from, to, historyFrom, firstFactsUnknown: !machines },
      snapshots,
      snapshotsError,
      failures: failed,
    };
  };

  // Screens: inputs from memory (even old) and a refresh behind when old (or forced); undefined until the first read.
  const peekInputs = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext, force = false): ENSMaturityInputs | undefined => {
    const key = inputsKey(ctx);
    const cached = inputs.get(key);
    if ((force || !cached || clock() - cached.at >= inputsTtlMs) && !loading.has(key)) {
      const task = track(
        loadInputs(clients, ctx).then(
          value => {
            if (inputs.size > 200) inputs.clear();
            inputs.set(key, value);
            return value;
          },
          (error: any) => {
            if (!stopped.aborted) logger.warn(`Power ENS: could not read the maturity inputs: ${error?.message || error}`);
            return undefined;
          }
        )
      );
      loading.set(key, task);
      void task.then(() => loading.delete(key));
    }
    return cached;
  };

  // The control's days on the machines that measure it (its rows), with the day each entered the scope.
  const activityOfView = (data: ENSMaturityInputs, controlId: string, rowAgents: string[], run: RunOutput): ENSMaturityActivity | undefined => {
    if (!data.activity) return undefined;
    const found = data.activity.get(controlId);
    const name = (agentId: string) => run.rowName(agentId) || run.meta.scope.find(agent => agent.id === agentId)?.name;
    const byAgent = new Map((found?.machines || []).map(machine => [machine.agentId, machine.days]));
    const agents = rowAgents.length ? rowAgents : Array.from(byAgent.keys());
    // A machine the lookup found without facts sent its first one later: its first day of activity.
    const sinceOf = (agentId: string) => data.since.get(agentId) || (data.firstFactsRead ? (byAgent.get(agentId) || []).slice().sort()[0] : undefined);
    return {
      days: found?.days || [],
      machines: agents.map(agentId => ({ agentId, agentName: name(agentId), days: byAgent.get(agentId) || [], since: sinceOf(agentId) })),
    };
  };

  // Maturity of every control of an organisation view that has its result (pending ones are left out).
  const compute = (run: RunOutput, data: ENSMaturityInputs): Map<string, ENSControlMaturity> => {
    const { ctx } = run;
    const zone = zoneOf(ctx);
    const today = dayIn(ctx.now, zone);
    const targets = resolveMaturityTargets(ctx.configuration);
    const maturity = new Map<string, ENSControlMaturity>();
    run.views.forEach((view, controlId) => {
      const control = ENSCatalog.find(entry => entry.id === controlId);
      if (!control || (!view.result && control.status === 'ACTIVE')) return;
      maturity.set(
        controlId,
        computeControlMaturity({
          control,
          result: view.result,
          configured: ctx.configuration.controls.some(entry => entry.controlId === controlId),
          activity: activityOfView(data, controlId, view.rows.map(row => row.agentId), run),
          period: data.period,
          timeZone: zone,
          record: readControlMaturityRecord(ctx.maturityRecords, controlId),
          targets,
          ensLevel: ctx.configuration.global.ensLevel,
          global: ctx.configuration.global,
          snapshots: data.snapshots.filter(snapshot => snapshot.controlId === controlId && snapshot.date < today),
          snapshotsError: data.snapshotsError,
          now: ctx.now,
        })
      );
    });
    return maturity;
  };

  // Deletes what is older than the retention, once a day; false when it failed (the job retries within the hour).
  const purge = async (client: any, date: string): Promise<boolean> => {
    if (purgedOn === date) return true;
    try {
      const deleted = await purgeSnapshots(client, addDays(date, -ENS_SNAPSHOT_RETENTION_DAYS));
      purgedOn = date;
      if (deleted) logger.info(`Power ENS: ${deleted} maturity snapshots older than ${ENS_SNAPSHOT_RETENTION_DAYS} days deleted`);
      return true;
    } catch (error: any) {
      logger.warn(`Power ENS: could not purge the old maturity snapshots: ${error?.message || error}`);
      return false;
    }
  };

  // Writes the day's snapshot of each control (only the daily job calls it); returns how many changed.
  const writeDay = async (client: any, run: RunOutput, maturity: Map<string, ENSControlMaturity>, recordedBy: string): Promise<{ written: number; purged: boolean }> => {
    const date = dayIn(run.ctx.now, zoneOf(run.ctx));
    const pending: { id: string; signature: string; snapshot: ENSControlSnapshot }[] = [];
    maturity.forEach((entry, controlId) => {
      const result = run.views.get(controlId)?.result;
      if (!result) return;
      const values = {
        date,
        controlId,
        status: result.status,
        score: result.score,
        coverage: result.coverage,
        applicableRequirements: result.applicableRequirements,
        measuredRequirements: result.measuredRequirements,
        level: result.level,
        accredited: entry.accredited,
        assessed: entry.assessed?.level,
        target: entry.target,
      };
      const id = snapshotId(controlId, date);
      const signature = JSON.stringify(values);
      if (written.get(id) !== signature) pending.push({ id, signature, snapshot: { ...values, recordedAt: run.ctx.now.toISOString(), recordedBy } });
    });
    if (pending.length) {
      await writeSnapshots(client, logger, pending.map(entry => entry.snapshot));
      Array.from(written.keys()).filter(id => !id.endsWith(`|${date}`)).forEach(id => written.delete(id));
      pending.forEach(entry => written.set(entry.id, entry.signature));
    }
    return { written: pending.length, purged: await purge(client, date) };
  };

  const storeOrganisation = (key: string, run: RunOutput, data: ENSMaturityInputs, controls: Map<string, ENSControlMaturity>, query: ENSEvaluationQuery) => {
    if (organisation.size > 500) organisation.clear();
    const complete = !run.meta.pending;
    // A complete view of the same state stays served until a complete pass replaces it.
    const previous = organisation.get(key);
    if (!complete && previous?.complete && previous.state === stateOf(run.ctx)) return;
    organisation.set(key, {
      state: stateOf(run.ctx),
      fingerprint: evaluation.viewFingerprint(run.ctx, query),
      complete,
      inputsAt: data.at,
      view: { controls, complete, pending: false, version: null },
    });
    if (complete) failures.delete(key);
  };

  // A machine view's organisation maturity, computed behind; only a throw is a failed attempt (bounded), missing rows
  // keep the view pending and the next poll runs the pass again, unless they made no progress for 10 min.
  const refreshOrganisation = (clients: ENSEvaluationClients, key: string, query: ENSEvaluationQuery): void => {
    if (refreshing.has(key)) return;
    const failure = failures.get(key);
    if (failure && clock() < failure.nextAt) return;
    const task = track(
      (async () => {
        const run = await evaluation.run(clients, query, { allowStale: true });
        const data = peekInputs(clients, run.ctx) || (await loading.get(inputsKey(run.ctx)));
        if (!data) throw new Error('the maturity inputs could not be read');
        storeOrganisation(key, run, data, compute(run, data), query);
        if (!run.meta.pending) {
          stalled.delete(key);
          return;
        }
        const state = stateOf(run.ctx);
        const last = stalled.get(key);
        if (!last || last.state !== state || run.meta.pending.rows < last.rows) {
          if (stalled.size > 500) stalled.clear();
          stalled.set(key, { state, rows: run.meta.pending.rows, at: clock() });
        } else if (clock() - last.at >= ENS_ORGANISATION_STALL_MS) {
          throw new Error('organisation rows made no progress for 10 minutes');
        }
      })()
        .catch((error: any) => {
          if (stopped.aborted) return;
          const count = (failures.get(key)?.count || 0) + 1;
          failures.set(key, { count, nextAt: clock() + (count >= ENS_ORGANISATION_ATTEMPTS ? RETRY_AFTER_ERROR_MS : RETRY_WAITS_MS[count - 1]) });
          logger.warn(`Power ENS: could not compute the organisation maturity (attempt ${count}): ${error?.message || error}`);
        })
        .then(() => {
          refreshing.delete(key);
        })
    );
    refreshing.set(key, task);
  };

  const forEvaluation = async (clients: ENSEvaluationClients, run: RunOutput, options: { retry?: boolean } = {}): Promise<ENSMaturityOfView | undefined> => {
    if (run.query.include === 'results') return undefined;
    const { ctx } = run;
    const version = ctx.maturityVersion || null;
    const query = normalizeQuery({ include: 'summary', controlId: run.query.controlId, timeZone: run.query.timeZone });
    const key = `${ctx.userKey}|${run.query.controlId || '*'}`;
    if (options.retry) {
      failures.delete(key);
      stalled.delete(key);
      firstFactFailures.delete(ctx.userKey);
    }
    // «Reintentar» reads again inputs whose first-fact lookup failed, behind.
    const data = peekInputs(clients, ctx, Boolean(options.retry && inputs.get(inputsKey(ctx))?.firstFactsRead === false));
    if (!run.query.agentId) {
      if (!data) return noView(version);
      const controls = compute(run, data);
      storeOrganisation(key, run, data, controls, query);
      return { controls, complete: !run.meta.pending, pending: false, version };
    }
    // A machine view: pending only if records, configuration or scope changed, or rows are missing; else from memory.
    const cached = organisation.get(key);
    if (cached && cached.state === stateOf(ctx) && cached.complete) {
      // Still right for its records, configuration and scope: served while refreshes behind run (or fail).
      if (cached.fingerprint !== evaluation.viewFingerprint(ctx, query) || (data && data.at > cached.inputsAt)) refreshOrganisation(clients, key, query);
      return { ...cached.view, pending: false, version };
    }
    const failure = failures.get(key);
    if (failure && failure.count >= ENS_ORGANISATION_ATTEMPTS) {
      if (clock() >= failure.nextAt) refreshOrganisation(clients, key, query);
      return noView(null, { pending: false, error: ENS_MATURITY_FAILED });
    }
    // Its own rows still coming: they are the organisation's too; the pass runs once they are there.
    if (!run.meta.pending) refreshOrganisation(clients, key, query);
    return noView(null, { controls: cached?.view.controls || new Map(), complete: Boolean(cached?.complete) });
  };

  // Assessment rule inputs: the screen's if ≤ 15 min old, else this control's; snapshots always as the internal user.
  const judgeInputs = async (clients: ENSEvaluationClients, run: RunOutput, controlId: string): Promise<ENSMaturityInputs> => {
    const screen = inputs.get(inputsKey(run.ctx));
    if (screen && screen.activity && clock() - screen.at <= ENS_JUSTIFICATION_INPUTS_MAX_AGE_MS) {
      const today = dayIn(run.ctx.now, zoneOf(run.ctx));
      try {
        return { ...screen, snapshots: await read(() => readSnapshots(clients.asInternalUser, { from: addDays(today, -ENS_MATURITY_TREND_WINDOW_DAYS), to: today, controlIds: [controlId] })), snapshotsError: undefined };
      } catch (error: any) {
        return { ...screen, snapshots: [], snapshotsError: statusOf(error) === 403 ? 'sin permiso de lectura de wazuh-ens-snapshots' : 'error del indexador' };
      }
    }
    return loadInputs(clients, run.ctx, { controlIds: [controlId], snapshotsClient: clients.asInternalUser });
  };

  // Concurrent saves of the same control by the same user share the input read; it all gives up after the timeout.
  const accreditedFor = (
    clients: ENSEvaluationClients,
    controlId: string
  ): Promise<{ level: ENSMaturityLevel; gates: Pick<ENSMaturityGate, 'id' | 'level' | 'passed' | 'reason'>[] } | undefined> => {
    const computeLevel = async () => {
      const run = await evaluation.run(clients, normalizeQuery({ include: 'results', controlId }), { allowStale: true });
      const shared = `${run.ctx.userKey}|${controlId}`;
      let pendingInputs = accrediting.get(shared) as Promise<ENSMaturityInputs> | undefined;
      if (!pendingInputs) {
        pendingInputs = judgeInputs(clients, run, controlId);
        accrediting.set(shared, pendingInputs);
        void pendingInputs.then(() => accrediting.delete(shared), () => accrediting.delete(shared));
      }
      const maturity = compute(run, await pendingInputs).get(controlId);
      if (!maturity) return undefined;
      return {
        level: (maturity.measured ? maturity.accredited ?? 0 : 0) as ENSMaturityLevel,
        gates: maturity.gates.map(gate => ({ id: gate.id, level: gate.level, passed: gate.passed, reason: gate.reason })),
      };
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ENSMaturityUnavailableError(ENS_ACCREDITED_TIMEOUT)), justificationTimeoutMs);
    });
    return Promise.race([computeLevel(), timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  };

  // The daily job: a complete organisation evaluation of its own and every input read now; any failure writes nothing.
  // The maturity it wrote is returned too: the annual freeze of the same run uses it.
  const snapshotDay = async (
    clients: ENSEvaluationClients,
    run: RunOutput,
    recordedBy: string
  ): Promise<{ date: string; written: number; purged: boolean; maturity: Map<string, ENSControlMaturity> }> => {
    if (run.meta.pending || run.meta.refreshing) throw new Error('the organisation evaluation is not complete');
    const data = await loadInputs(clients, run.ctx);
    if (data.failures.length) throw new Error(`could not read ${data.failures.join(', ')}`);
    const date = dayIn(run.ctx.now, zoneOf(run.ctx));
    const maturity = compute(run, data);
    return { date, ...(await writeDay(clients.asInternalUser, run, maturity, recordedBy)), maturity };
  };

  // Art. 32: the screen's inputs (or read now); `fresh` reads them now and fails if one is missing (explicit freeze).
  const forReport = async (clients: ENSEvaluationClients, run: RunOutput, options: { fresh?: boolean } = {}): Promise<Map<string, ENSControlMaturity>> => {
    const data = options.fresh
      ? await loadInputs(clients, run.ctx)
      : peekInputs(clients, run.ctx) || (await loading.get(inputsKey(run.ctx))) || (await loadInputs(clients, run.ctx));
    if (options.fresh && data.failures.length) throw new Error(`could not read ${data.failures.join(', ')}`);
    return compute(run, data);
  };

  // Snapshots for the annual report and the trends, read as the user: the index permissions decide who sees them.
  const snapshotsBetween = async (clients: ENSEvaluationClients, query: { controlId?: string; from?: string; to?: string }) => {
    if (query.controlId && !ENSCatalog.some(control => control.id === query.controlId)) {
      throw new ENSBadRequestError(`El control «${query.controlId}» no está en el catálogo de Power ENS.`);
    }
    if (!isDay(query.from) || !isDay(query.to) || query.from > query.to) {
      throw new ENSBadRequestError('«from» y «to» son fechas AAAA-MM-DD, con «from» no posterior a «to».');
    }
    if (Date.parse(query.to) - Date.parse(query.from) > 400 * DAY_MS) {
      throw new ENSBadRequestError('Como mucho 400 días por petición.');
    }
    return readSnapshots(clients.asCurrentUser, { from: query.from, to: query.to, controlIds: query.controlId ? [query.controlId] : undefined });
  };

  return {
    compute,
    forEvaluation,
    accreditedFor,
    snapshotDay,
    forReport,
    purgeOld: (client: any, date: string) => purge(client, date),
    snapshotsBetween,
    // Tests and the plugin stop: wait for what runs behind.
    flush: async () => {
      while (background.size) await Promise.all(Array.from(background));
    },
    dispose: () => stopped.cancel(),
  };
};

export type ENSMaturityService = ReturnType<typeof createMaturityService>;
