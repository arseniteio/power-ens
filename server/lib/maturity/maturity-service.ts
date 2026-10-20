// Maturity next to the evaluation: the organisation's view, inputs refreshed behind, and the day's snapshots.
import type { Logger } from '../../../../../src/core/server';
import { ENSCatalog } from '../../../common/ens/catalog';
import {
  addDays,
  computeControlMaturity,
  dayIn,
  ENS_MATURITY_PERIOD_DAYS,
  ENS_MATURITY_TREND_WINDOW_DAYS,
  configuredTimeZone,
} from '../../../common/ens/maturity/maturity-engine';
import type { ENSMaturityActivity, ENSMaturityPeriod } from '../../../common/ens/maturity/maturity-engine';
import { readControlMaturityRecord, resolveMaturityTargets } from '../../../common/ens/maturity/maturity-records';
import type { ENSControlMaturity, ENSControlSnapshot, ENSMaturityGate, ENSMaturityLevel, ENSMaturityVersion } from '../../../common/ens/maturity/types';
import type { ENSEvaluationClients, ENSEvaluationContext, ENSEvaluationQuery, ENSEvaluationService } from '../evaluation/evaluation-service';
import { ENSBadRequestError, normalizeQuery } from '../evaluation/evaluation-service';
import { CancelSignal } from '../evaluation/cache';
import { searchComplete, throwIfCancelled, yieldToEventLoop } from '../evaluation/facts-reader';
import { buildViewFilters, catalogControlIds } from '../evaluation/queries';
import { buildActivityRequest, buildMachinesRequest, groupActivityControls, readActivityResponse, readMachinesResponse } from './activity';
import { ENS_SNAPSHOT_RETENTION_DAYS, purgeSnapshots, readSnapshots, snapshotId, writeSnapshots } from './snapshot-storage';

type RunOutput = Awaited<ReturnType<ENSEvaluationService['run']>>;

// A view's maturity: `pending` until its inputs are read; `complete` with every control of the organisation computed.
export interface ENSMaturityOfView {
  controls: Map<string, ENSControlMaturity>;
  complete: boolean;
  pending: boolean;
  version: ENSMaturityVersion | null;
}

// What the maturity reads besides the evaluation: days with facts, when each machine entered, and the snapshots.
interface ENSMaturityInputs {
  at: number;
  activity?: Map<string, ENSMaturityActivity>;
  since: Map<string, string>;
  period: ENSMaturityPeriod;
  snapshots: ENSControlSnapshot[];
  snapshotsError?: string;
}

export interface ENSMaturityServiceOptions {
  logger: Logger;
  evaluation: ENSEvaluationService;
  inputsTtlMs?: number;
}

const DAY_MS = 86400e3;
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 0;
const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));

export const createMaturityService = ({ logger, evaluation, inputsTtlMs = 5 * 60e3 }: ENSMaturityServiceOptions) => {
  const inputs = new Map<string, ENSMaturityInputs>();
  const loading = new Map<string, Promise<ENSMaturityInputs | undefined>>();
  const organisation = new Map<string, { fingerprint: string; inputsAt: number; view: ENSMaturityOfView }>();
  const refreshing = new Map<string, Promise<void>>();
  const background = new Set<Promise<unknown>>();
  const stopped = new CancelSignal();
  // What each control's snapshot of the day already says: the same values are not written again.
  const written = new Map<string, string>();
  const warned = new Set<string>();
  let purgedOn: string | undefined;

  const zoneOf = (ctx: ENSEvaluationContext): string => configuredTimeZone(ctx.configuration.global.timezone);
  const inputsKey = (ctx: ENSEvaluationContext): string => `${ctx.userKey}|${ctx.scopeKey}`;
  const warnOnce = (key: string, message: string) => {
    if (warned.has(key)) return;
    warned.add(key);
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

  const loadInputs = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext): Promise<ENSMaturityInputs> => {
    const zone = zoneOf(ctx);
    const to = ctx.now.toISOString();
    const from = new Date(ctx.now.getTime() - ENS_MATURITY_PERIOD_DAYS * DAY_MS).toISOString();
    const filters = buildViewFilters({ from, to }, ctx.scope);
    let activity: Map<string, ENSMaturityActivity> | undefined = new Map();
    let machines: { oldest?: string; since: Map<string, string> } = { since: new Map() };
    try {
      machines = readMachinesResponse(await read(() => searchComplete(clients.asCurrentUser, buildMachinesRequest(filters, filters.slice(1)), 'los hechos de cada máquina')), zone);
      for (const group of groupActivityControls(catalogControlIds(), ctx.scope.length + 1, ENS_MATURITY_PERIOD_DAYS)) {
        const body = await read(() => searchComplete(clients.asCurrentUser, buildActivityRequest(filters, group, zone), 'la actividad diaria de los controles'));
        readActivityResponse(body, zone).forEach((value, controlId) => activity!.set(controlId, value));
        await yieldToEventLoop();
      }
    } catch (error: any) {
      if (stopped.aborted) throw error;
      logger.warn(`ENSFácil: could not read the daily activity for maturity: ${error?.message || error}`);
      activity = undefined;
    }
    const limited = Boolean(machines.oldest && machines.oldest > from);
    const today = dayIn(ctx.now, zone);
    let snapshots: ENSControlSnapshot[] = [];
    let snapshotsError: string | undefined;
    try {
      snapshots = await read(() => readSnapshots(clients.asCurrentUser, { from: addDays(today, -ENS_MATURITY_TREND_WINDOW_DAYS), to: today }));
    } catch (error: any) {
      if (stopped.aborted) throw error;
      snapshotsError = statusOf(error) === 403 ? 'sin permiso de lectura de wazuh-ens-snapshots' : 'error del indexador';
      logger.warn(`ENSFácil: could not read the maturity snapshots: ${error?.message || error}`);
    }
    return { at: ctx.now.getTime(), activity, since: machines.since, period: { from: limited ? machines.oldest! : from, to, limited }, snapshots, snapshotsError };
  };

  // Inputs from memory (even old) and a refresh behind when old; undefined until the first read finishes.
  const peekInputs = (clients: ENSEvaluationClients, ctx: ENSEvaluationContext): ENSMaturityInputs | undefined => {
    const key = inputsKey(ctx);
    const cached = inputs.get(key);
    if ((!cached || ctx.now.getTime() - cached.at >= inputsTtlMs) && !loading.has(key)) {
      const task = track(
        loadInputs(clients, ctx).then(
          value => {
            if (inputs.size > 200) inputs.clear();
            inputs.set(key, value);
            return value;
          },
          (error: any) => {
            if (!stopped.aborted) logger.warn(`ENSFácil: could not read the maturity inputs: ${error?.message || error}`);
            return undefined;
          }
        )
      );
      loading.set(key, task);
      void task.then(() => loading.delete(key));
    }
    return cached;
  };

  // The inputs now, waiting for them if needed (the save route and the daily job).
  const awaitInputs = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext): Promise<ENSMaturityInputs | undefined> =>
    peekInputs(clients, ctx) || (await loading.get(inputsKey(ctx)));

  // The control's days on the machines that measure it (its rows), with the day each entered the scope.
  const activityOfView = (data: ENSMaturityInputs, controlId: string, rowAgents: string[], run: RunOutput): ENSMaturityActivity | undefined => {
    if (!data.activity) return undefined;
    const found = data.activity.get(controlId);
    const name = (agentId: string) => run.rowName(agentId) || run.meta.scope.find(agent => agent.id === agentId)?.name;
    const byAgent = new Map((found?.machines || []).map(machine => [machine.agentId, machine.days]));
    const agents = rowAgents.length ? rowAgents : Array.from(byAgent.keys());
    return {
      days: found?.days || [],
      machines: agents.map(agentId => ({ agentId, agentName: name(agentId), days: byAgent.get(agentId) || [], since: data.since.get(agentId) })),
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

  const purge = async (client: any, date: string): Promise<void> => {
    if (purgedOn === date) return;
    try {
      const deleted = await purgeSnapshots(client, addDays(date, -ENS_SNAPSHOT_RETENTION_DAYS));
      purgedOn = date;
      if (deleted) logger.info(`ENSFácil: ${deleted} maturity snapshots older than ${ENS_SNAPSHOT_RETENTION_DAYS} days deleted`);
    } catch (error: any) {
      // Retried with the next write, not a day later.
      logger.warn(`ENSFácil: could not purge the old maturity snapshots: ${error?.message || error}`);
    }
  };

  // Writes the day's snapshot of each control of a complete, current organisation view; returns how many.
  const writeDay = async (client: any, run: RunOutput, maturity: Map<string, ENSControlMaturity>, recordedBy: string): Promise<number> => {
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
    await purge(client, date);
    return pending.length;
  };

  // An administrator's complete, current organisation view also writes the day (the daily job does it anyway).
  const recordSnapshots = (clients: ENSEvaluationClients, run: RunOutput, maturity: Map<string, ENSControlMaturity>): void => {
    const { ctx, meta } = run;
    if (!ctx.administrator || meta.refreshing || meta.pending || meta.agentId) return;
    track(
      writeDay(clients.asInternalUser, run, maturity, ctx.username).catch((error: any) =>
        warnOnce(`write:${statusOf(error)}`, `ENSFácil: could not write the maturity snapshots: ${error?.message || error}`)
      )
    );
  };

  // A machine view shows the organisation's maturity from memory; a new one is computed behind (rows already there).
  const refreshOrganisation = (clients: ENSEvaluationClients, key: string, query: ENSEvaluationQuery): void => {
    if (refreshing.has(key)) return;
    const task = track(
      (async () => {
        const run = await evaluation.run(clients, query, { allowStale: true });
        const data = await awaitInputs(clients, run.ctx);
        if (!data) return;
        const complete = !run.meta.pending && !run.meta.refreshing;
        const fingerprint = evaluation.viewFingerprint(run.ctx, query);
        const controls = compute(run, data);
        if (organisation.size > 500) organisation.clear();
        organisation.set(key, { fingerprint: complete ? fingerprint : `partial:${fingerprint}`, inputsAt: data.at, view: { controls, complete: !run.meta.pending, pending: false, version: null } });
        recordSnapshots(clients, run, controls);
      })()
        .catch((error: any) => {
          if (!stopped.aborted) logger.warn(`ENSFácil: could not compute the organisation maturity: ${error?.message || error}`);
        })
        .then(() => {
          refreshing.delete(key);
        })
    );
    refreshing.set(key, task);
  };

  const forEvaluation = async (clients: ENSEvaluationClients, run: RunOutput): Promise<ENSMaturityOfView | undefined> => {
    if (run.query.include === 'results') return undefined;
    const { ctx } = run;
    const version = ctx.maturityVersion || null;
    const query = normalizeQuery({ include: 'summary', controlId: run.query.controlId, timeZone: run.query.timeZone });
    const key = `${ctx.userKey}|${run.query.controlId || '*'}`;
    const data = peekInputs(clients, ctx);
    if (!run.query.agentId) {
      if (!data) return { controls: new Map(), complete: false, pending: true, version };
      const controls = compute(run, data);
      const complete = !run.meta.pending;
      organisation.set(key, {
        fingerprint: complete && !run.meta.refreshing ? evaluation.viewFingerprint(ctx, query) : 'partial',
        inputsAt: data.at,
        view: { controls, complete, pending: false, version: null },
      });
      recordSnapshots(clients, run, controls);
      return { controls, complete, pending: false, version };
    }
    const cached = organisation.get(key);
    if (!cached || cached.fingerprint !== evaluation.viewFingerprint(ctx, query) || (data && data.at > cached.inputsAt)) {
      refreshOrganisation(clients, key, query);
    }
    return cached ? { ...cached.view, version } : { controls: new Map(), complete: false, pending: true, version };
  };

  // The accredited level and its gates now, for the assessment rule; undefined when they cannot be computed.
  const accreditedFor = async (
    clients: ENSEvaluationClients,
    controlId: string
  ): Promise<{ level: ENSMaturityLevel; gates: Pick<ENSMaturityGate, 'id' | 'level' | 'passed' | 'reason'>[] } | undefined> => {
    const run = await evaluation.run(clients, normalizeQuery({ include: 'results', controlId }), { allowStale: true });
    const data = await awaitInputs(clients, run.ctx);
    if (!data) return undefined;
    const maturity = compute(run, data).get(controlId);
    if (!maturity) return undefined;
    return {
      level: maturity.measured ? maturity.accredited ?? 0 : 0,
      gates: maturity.gates.map(gate => ({ id: gate.id, level: gate.level, passed: gate.passed, reason: gate.reason })),
    };
  };

  // The daily job: a complete organisation evaluation of its own, the inputs read now, the day written.
  const snapshotDay = async (clients: ENSEvaluationClients, run: RunOutput, recordedBy: string): Promise<{ date: string; written: number }> => {
    const data = await awaitInputs(clients, run.ctx);
    if (!data) throw new Error('the maturity inputs could not be read');
    return { date: dayIn(run.ctx.now, zoneOf(run.ctx)), written: await writeDay(clients.asInternalUser, run, compute(run, data), recordedBy) };
  };

  // Snapshots for the annual report and the trends, read as the user: the index permissions decide who sees them.
  const snapshotsBetween = async (clients: ENSEvaluationClients, query: { controlId?: string; from?: string; to?: string }) => {
    if (query.controlId && !ENSCatalog.some(control => control.id === query.controlId)) {
      throw new ENSBadRequestError(`El control «${query.controlId}» no está en el catálogo de ENSFácil.`);
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
    snapshotsBetween,
    // Tests and the plugin stop: wait for what runs behind.
    flush: async () => {
      while (background.size) await Promise.all(Array.from(background));
    },
    dispose: () => stopped.cancel(),
  };
};

export type ENSMaturityService = ReturnType<typeof createMaturityService>;
