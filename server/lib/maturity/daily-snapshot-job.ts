// Daily snapshot as the internal user: its own complete organisation evaluation, once per day, checked every hour.
import type { Logger } from '../../../../../src/core/server';
import type { ENSEvaluationService } from '../evaluation/evaluation-service';
import { normalizeQuery } from '../evaluation/evaluation-service';
import type { ENSMaturityService } from './maturity-service';
import { dayIn, maturityTimeZone } from '../../../common/ens/maturity/maturity-engine';

export const ENS_SNAPSHOT_JOB_USER = 'ENSFácil (tarea diaria)';

export interface ENSDailySnapshotJobOptions {
  logger: Logger;
  client: any;
  maturity: ENSMaturityService;
  // A fresh evaluation service per run: its rows never push out the users' ones, and are freed after.
  createEvaluation: () => ENSEvaluationService;
  clock?: () => Date;
  firstDelayMs?: number;
  intervalMs?: number;
}

const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode || error?.body?.status) || 0;
const refused = (error: any): boolean =>
  statusOf(error) === 401 || statusOf(error) === 403 || /security_exception|no permissions|unauthorized/i.test(String(error?.message || error));

export const createDailySnapshotJob = ({
  logger,
  client,
  maturity,
  createEvaluation,
  clock = () => new Date(),
  firstDelayMs = 10 * 60e3,
  intervalMs = 60 * 60e3,
}: ENSDailySnapshotJobOptions) => {
  let doneOn: { day: string; zone: string } | undefined;
  let disabled = false;
  let running: Promise<void> | undefined;
  const timers: ReturnType<typeof setTimeout>[] = [];

  // One pass: nothing if today is done; otherwise a complete evaluation (it waits for every row) and the day written.
  const runOnce = (): Promise<void> => {
    if (disabled) return Promise.resolve();
    if (doneOn && doneOn.day === dayIn(clock(), doneOn.zone)) return Promise.resolve();
    if (running) return running;
    running = (async () => {
      try {
        const evaluation = createEvaluation();
        const clients = { asCurrentUser: client, asInternalUser: client };
        const run = await evaluation.run(clients, normalizeQuery({ include: 'results' }), {});
        const zone = maturityTimeZone(run.ctx.configuration.global.timezone);
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
          logger.warn(`ENSFácil: the daily maturity snapshot failed, retried in the next hour: ${error?.message || error}`);
        }
      } finally {
        running = undefined;
      }
    })();
    return running;
  };

  return {
    runOnce,
    start: () => {
      timers.push(
        setTimeout(() => {
          void runOnce();
          timers.push(setInterval(() => void runOnce(), intervalMs));
        }, firstDelayMs)
      );
    },
    stop: () => {
      timers.forEach(timer => clearTimeout(timer as any));
      timers.length = 0;
    },
    get disabled() {
      return disabled;
    },
  };
};
