// Daily snapshot as the internal user: every day at 02:30 local time, plus a catch-up after start if today is missing.
import type { Logger } from '../../../../../src/core/server';
import { ENS_SNAPSHOTS_INDEX } from '../../../common/constants';
import { zonedCalendar } from '../../../common/ens/core/timeline/timeline-cuts';
import { configuredTimeZone, dayIn } from '../../../common/ens/maturity/maturity-engine';
import { readActiveENSConfiguration } from '../configuration-storage';
import type { ENSEvaluationService } from '../evaluation/evaluation-service';
import { normalizeQuery } from '../evaluation/evaluation-service';
import type { ENSMaturityService } from './maturity-service';
import { retryBackoffMs } from './maturity-service';

export const ENS_SNAPSHOT_JOB_USER = 'ENSFácil (tarea diaria)';
const PURGE_RETRY_MS = 60 * 60e3;
// A failed run writes nothing and is tried again after 30 min, 1 h, 2 h, 4 h, then every 8 h (consecutive failures of
// the day), as long as the retry falls by 23:00 local time; otherwise tomorrow at 02:30.
export const ENS_SNAPSHOT_LAST_RETRY_MINUTES = 23 * 60;
// Local time of the daily run, in the zone of Configuration > General (Europe/Madrid by default).
export const ENS_SNAPSHOT_JOB_MINUTES = 2 * 60 + 30;

// The next 02:30 of the zone after `now` (local midnight plus 2 h 30 min, so a spring-forward night runs at 03:30).
export const nextDailyRun = (now: Date, timeZone: string): Date => {
  const calendar = zonedCalendar(timeZone);
  const today = calendar.startOfDay(now).getTime() + ENS_SNAPSHOT_JOB_MINUTES * 60e3;
  return new Date(today > now.getTime() ? today : calendar.addDays(now, 1).getTime() + ENS_SNAPSHOT_JOB_MINUTES * 60e3);
};

// «30 minutes», «1 hour», «2 hours».
const spell = (ms: number): string => (ms < 3600e3 ? `${Math.round(ms / 60e3)} minutes` : ms === 3600e3 ? '1 hour' : `${Math.round(ms / 3600e3)} hours`);

// Minutes since local midnight in the zone.
const localMinutes = (now: Date, timeZone: string): number => Math.floor((now.getTime() - zonedCalendar(timeZone).startOfDay(now).getTime()) / 60e3);

export interface ENSJobTimers {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

export interface ENSDailySnapshotJobOptions {
  logger: Logger;
  client: any;
  maturity: ENSMaturityService;
  // A fresh evaluation service per run: its rows never push out the users' ones, and are freed after.
  createEvaluation: () => ENSEvaluationService;
  clock?: () => Date;
  catchUpDelayMs?: number;
  timers?: ENSJobTimers;
}

const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode || error?.body?.status) || 0;
const refused = (error: any): boolean =>
  statusOf(error) === 401 || statusOf(error) === 403 || /security_exception|cluster_block_exception|no permissions|unauthorized/i.test(String(error?.message || error));

const NODE_TIMERS: ENSJobTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const createDailySnapshotJob = ({
  logger,
  client,
  maturity,
  createEvaluation,
  clock = () => new Date(),
  catchUpDelayMs = 10 * 60e3,
  timers = NODE_TIMERS,
}: ENSDailySnapshotJobOptions) => {
  let doneOn: { day: string; zone: string } | undefined;
  let stopped = false;
  let running: Promise<void> | undefined;
  let retryScheduled = false;
  // Consecutive failed runs of the local day: they set the backoff of the next retry.
  let failed: { day: string; count: number } | undefined;
  const handles = new Set<unknown>();
  const clients = { asCurrentUser: client, asInternalUser: client };

  const zoneNow = async (): Promise<string> => {
    try {
      const stored: any = await readActiveENSConfiguration(client, logger);
      return configuredTimeZone(stored?.configuration?.global?.timezone);
    } catch {
      return configuredTimeZone();
    }
  };

  // Whether today already has its snapshots.
  const hasToday = async (): Promise<boolean> => {
    const today = dayIn(clock(), await zoneNow());
    const result = await client.search({ index: ENS_SNAPSHOTS_INDEX, ignore_unavailable: true, body: { size: 1, _source: ['date'], query: { term: { date: today } } } });
    return (result.body?.hits?.hits || []).length > 0;
  };

  const later = (run: () => Promise<void>, ms: number) => {
    if (stopped) return;
    const handle = timers.set(() => {
      handles.delete(handle);
      if (!stopped) void run();
    }, Math.max(0, ms));
    handles.add(handle);
  };

  // One pass: a complete evaluation of its own (it waits for every row) and the day written; a failure writes nothing.
  const runOnce = (): Promise<void> => {
    if (doneOn && doneOn.day === dayIn(clock(), doneOn.zone)) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      let zone = configuredTimeZone();
      try {
        const evaluation = createEvaluation();
        const run = await evaluation.run(clients, normalizeQuery({ include: 'results' }), {});
        zone = configuredTimeZone(run.ctx.configuration.global.timezone);
        const result = await maturity.snapshotDay(clients, run, ENS_SNAPSHOT_JOB_USER);
        doneOn = { day: result.date, zone };
        failed = undefined;
        logger.info(`ENSFácil: maturity snapshots of ${result.date} written by the daily job (${result.written} new or changed)`);
        // A failed purge is retried within the hour, not with tomorrow's run.
        if (!result.purged) later(() => maturity.purgeOld(client, result.date).then(() => undefined), PURGE_RETRY_MS);
      } catch (error: any) {
        const now = clock();
        const day = dayIn(now, zone);
        failed = { day, count: failed?.day === day ? failed.count + 1 : 1 };
        const wait = retryBackoffMs(failed.count);
        const retry = localMinutes(now, zone) + wait / 60e3 <= ENS_SNAPSHOT_LAST_RETRY_MINUTES;
        const what = refused(error) ? 'the indexer refused the daily maturity snapshot' : 'the daily maturity snapshot failed';
        const next = stopped ? 'not retried: stopping' : retryScheduled ? 'a retry is already scheduled' : retry ? `retried in ${spell(wait)}` : 'retried tomorrow at 02:30';
        logger.warn(`ENSFácil: ${what} (${error?.message || error}); nothing written for ${day}, ${next}`);
        if (retry && !retryScheduled && !stopped) {
          retryScheduled = true;
          later(async () => {
            retryScheduled = false;
            await runOnce();
          }, wait);
        }
      } finally {
        running = undefined;
      }
    })();
    return running;
  };

  // The catch-up after start: only if today has no snapshot yet.
  const catchUp = async (): Promise<void> => {
    try {
      if (await hasToday()) return;
    } catch (error: any) {
      logger.warn(`ENSFácil: could not check today's maturity snapshots, running the daily job: ${error?.message || error}`);
    }
    await runOnce();
  };

  // The next 02:30 of the configured zone, then again each day.
  const scheduleDaily = async (): Promise<void> => {
    if (stopped) return;
    const now = clock();
    later(async () => {
      await runOnce();
      await scheduleDaily();
    }, nextDailyRun(now, await zoneNow()).getTime() - now.getTime());
  };

  return {
    runOnce,
    catchUp,
    start: async () => {
      stopped = false;
      later(catchUp, catchUpDelayMs);
      await scheduleDaily();
    },
    stop: () => {
      stopped = true;
      // The pending retry is cancelled with its timer: a later start() can schedule a new one.
      retryScheduled = false;
      handles.forEach(handle => timers.clear(handle));
      handles.clear();
    },
  };
};
