// Daily snapshot as the internal user: every day at 02:30 local time, plus a catch-up after start if today is missing.
import type { Logger } from '../../../../../src/core/server';
import { ENS_SNAPSHOTS_INDEX } from '../../../common/constants';
import { zonedCalendar } from '../../../common/ens/core/timeline/timeline-cuts';
import { configuredTimeZone, dayIn } from '../../../common/ens/maturity/maturity-engine';
import { readActiveENSConfiguration } from '../configuration-storage';
import type { ENSEvaluationService } from '../evaluation/evaluation-service';
import { normalizeQuery } from '../evaluation/evaluation-service';
import type { ENSMaturityService } from './maturity-service';

export const ENS_SNAPSHOT_JOB_USER = 'ENSFácil (tarea diaria)';
// Local time of the daily run, in the zone of Configuration > General (Europe/Madrid by default).
export const ENS_SNAPSHOT_JOB_MINUTES = 2 * 60 + 30;

// The next 02:30 of the zone after `now` (local midnight plus 2 h 30 min, so a spring-forward night runs at 03:30).
export const nextDailyRun = (now: Date, timeZone: string): Date => {
  const calendar = zonedCalendar(timeZone);
  const today = calendar.startOfDay(now).getTime() + ENS_SNAPSHOT_JOB_MINUTES * 60e3;
  return new Date(today > now.getTime() ? today : calendar.addDays(now, 1).getTime() + ENS_SNAPSHOT_JOB_MINUTES * 60e3);
};

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
  statusOf(error) === 401 || statusOf(error) === 403 || /security_exception|no permissions|unauthorized/i.test(String(error?.message || error));

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
  let disabled = false;
  let stopped = false;
  let running: Promise<void> | undefined;
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

  // Whether today already has its snapshots (written by this job or by an administrator's view).
  const hasToday = async (): Promise<boolean> => {
    const today = dayIn(clock(), await zoneNow());
    const result = await client.search({ index: ENS_SNAPSHOTS_INDEX, ignore_unavailable: true, body: { size: 1, _source: ['date'], query: { term: { date: today } } } });
    return (result.body?.hits?.hits || []).length > 0;
  };

  // One pass: a complete evaluation of its own (it waits for every row) and the day written.
  const runOnce = (): Promise<void> => {
    if (disabled) return Promise.resolve();
    if (doneOn && doneOn.day === dayIn(clock(), doneOn.zone)) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      try {
        const evaluation = createEvaluation();
        const run = await evaluation.run(clients, normalizeQuery({ include: 'results' }), {});
        const zone = configuredTimeZone(run.ctx.configuration.global.timezone);
        const result = await maturity.snapshotDay(clients, run, ENS_SNAPSHOT_JOB_USER);
        doneOn = { day: result.date, zone };
        logger.info(`ENSFácil: maturity snapshots of ${result.date} written by the daily job (${result.written} new or changed)`);
      } catch (error: any) {
        if (refused(error)) {
          disabled = true;
          logger.warn(
            `ENSFácil: the daily maturity snapshot was refused for the internal user (${error?.message || error}); only administrators' views write snapshots from now on`
          );
        } else {
          logger.warn(`ENSFácil: the daily maturity snapshot failed, retried at the next run: ${error?.message || error}`);
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

  const later = (run: () => Promise<void>, ms: number) => {
    const handle = timers.set(() => {
      handles.delete(handle);
      void run();
    }, Math.max(0, ms));
    handles.add(handle);
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
      handles.forEach(handle => timers.clear(handle));
      handles.clear();
    },
    get disabled() {
      return disabled;
    },
  };
};
