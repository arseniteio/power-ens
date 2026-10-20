// Maturity of each control, computed on the server next to the evaluation: from the organisation's result
// (consolidated over the scope, never a single machine's), the days with facts, the persisted snapshots and what
// people recorded in the configuration. After an administrator's complete evaluation of the whole scope, it also
// writes the day's snapshot of each control.
import type { Logger } from '../../../../../src/core/server';
import { ENSCatalog } from '../../../common/ens/catalog';
import {
  addDays,
  computeControlMaturity,
  dayIn,
  ENS_MATURITY_TREND_WINDOW_DAYS,
  maturityTimeZone,
} from '../../../common/ens/maturity/maturity-engine';
import { readControlMaturityRecord, resolveMaturityTargets } from '../../../common/ens/maturity/maturity-records';
import type { ENSControlMaturity, ENSControlSnapshot, ENSMaturityLevel } from '../../../common/ens/maturity/types';
import type { ENSEvaluationClients, ENSEvaluationContext, ENSEvaluationService } from '../evaluation/evaluation-service';
import { ENSBadRequestError, normalizeQuery } from '../evaluation/evaluation-service';
import type { CancelSignal } from '../evaluation/cache';
import { searchComplete } from '../evaluation/facts-reader';
import { catalogControlIds } from '../evaluation/queries';
import { buildActivityRequest, groupActivityControls, readActivityResponse } from './activity';
import type { ENSMaturityActivity } from '../../../common/ens/maturity/maturity-engine';
import { ENS_SNAPSHOT_RETENTION_DAYS, purgeSnapshots, readSnapshots, snapshotId, writeSnapshots } from './snapshot-storage';

type RunOutput = Awaited<ReturnType<ENSEvaluationService['run']>>;

// The maturity of a view, and whether the organisation view it comes from had every control computed.
export interface ENSMaturityOfView {
  controls: Map<string, ENSControlMaturity>;
  complete: boolean;
}

export interface ENSMaturityServiceOptions {
  logger: Logger;
  evaluation: ENSEvaluationService;
  activityTtlMs?: number;
  snapshotsTtlMs?: number;
}

const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));

export const createMaturityService = ({ logger, evaluation, activityTtlMs = 5 * 60e3, snapshotsTtlMs = 10 * 60e3 }: ENSMaturityServiceOptions) => {
  const activity = new Map<string, { at: number; days: Map<string, ENSMaturityActivity> }>();
  let history: { at: number; key: string; list: ENSControlSnapshot[] } | undefined;
  // What each control's snapshot of the day already says: the same values are not written again.
  const written = new Map<string, string>();
  const writes = new Set<Promise<void>>();
  let purgedOn: string | undefined;

  const zoneOf = (ctx: ENSEvaluationContext): string => maturityTimeZone(ctx.configuration.global.timezone);

  const activityOf = async (clients: ENSEvaluationClients, ctx: ENSEvaluationContext): Promise<Map<string, ENSMaturityActivity> | undefined> => {
    const zone = zoneOf(ctx);
    // Days with facts change at most with a new day or a machine that resumes: read again every few minutes, not
    // on every new fact (collectors report all the time).
    const key = [ctx.userKey, ctx.scopeKey, ctx.window.from.slice(0, 13), zone].join('|');
    const cached = activity.get(key);
    if (cached && ctx.now.getTime() - cached.at < activityTtlMs) return cached.days;
    try {
      const windowDays = Math.ceil((Date.parse(ctx.window.to) - Date.parse(ctx.window.from)) / 86400e3);
      const days = new Map<string, ENSMaturityActivity>();
      for (const group of groupActivityControls(catalogControlIds(), ctx.scope.length + 1, windowDays)) {
        const body = await searchComplete(
          clients.asCurrentUser,
          buildActivityRequest(ctx.filters, group, zone, ctx.factsIndex),
          'la actividad diaria de los controles'
        );
        readActivityResponse(body, zone).forEach((value, controlId) => days.set(controlId, value));
      }
      if (activity.size > 200) activity.clear();
      activity.set(key, { at: ctx.now.getTime(), days });
      return days;
    } catch (error: any) {
      logger.warn(`ENSFácil: could not read the daily activity for maturity: ${error?.message || error}`);
      return undefined;
    }
  };

  const snapshotsOf = async (clients: ENSEvaluationClients, now: Date, zone: string): Promise<ENSControlSnapshot[]> => {
    const to = dayIn(now, zone);
    const from = addDays(to, -ENS_MATURITY_TREND_WINDOW_DAYS);
    const key = `${from}|${to}`;
    if (history && history.key === key && now.getTime() - history.at < snapshotsTtlMs) return history.list;
    try {
      const list = await readSnapshots(clients.asInternalUser, { from, to });
      history = { at: now.getTime(), key, list };
      return list;
    } catch (error: any) {
      logger.warn(`ENSFácil: could not read the maturity snapshots: ${error?.message || error}`);
      return history?.list || [];
    }
  };

  // The control's days on the machines that measure it (its rows); a row without facts has no days. Without rows
  // (a control evaluated over all its facts), every machine that sent any.
  const activityOfView = (found: ENSMaturityActivity | undefined, rowAgents: string[], run: RunOutput): ENSMaturityActivity => {
    const name = (agentId: string) => run.rowName(agentId) || run.meta.scope.find(agent => agent.id === agentId)?.name;
    const byAgent = new Map((found?.machines || []).map(machine => [machine.agentId, machine.days]));
    const agents = rowAgents.length ? rowAgents : Array.from(byAgent.keys());
    return {
      days: found?.days || [],
      machines: agents.map(agentId => ({ agentId, agentName: name(agentId), days: byAgent.get(agentId) || [] })),
    };
  };

  // Maturity of every control of an organisation view that has its result (pending ones are left out).
  const compute = async (clients: ENSEvaluationClients, run: RunOutput): Promise<Map<string, ENSControlMaturity>> => {
    const { ctx } = run;
    const zone = zoneOf(ctx);
    const today = dayIn(ctx.now, zone);
    const [days, snapshots] = await Promise.all([activityOf(clients, ctx), snapshotsOf(clients, ctx.now, zone)]);
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
          activity: days ? activityOfView(days.get(controlId), view.rows.map(row => row.agentId), run) : undefined,
          window: ctx.window,
          timeZone: zone,
          record: readControlMaturityRecord(ctx.configuration, controlId),
          targets,
          ensLevel: ctx.configuration.global.ensLevel,
          global: ctx.configuration.global,
          snapshots: snapshots.filter(snapshot => snapshot.controlId === controlId && snapshot.date < today),
          now: ctx.now,
        })
      );
    });
    return maturity;
  };

  // The day's snapshot of each control: only from an administrator's evaluation (it reads every fact) of the
  // whole scope, complete and current.
  const recordSnapshots = (clients: ENSEvaluationClients, run: RunOutput, maturity: Map<string, ENSControlMaturity>): void => {
    const { ctx, meta } = run;
    if (!ctx.administrator || meta.refreshing || meta.pending || meta.agentId) return;
    const zone = zoneOf(ctx);
    const date = dayIn(ctx.now, zone);
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
      if (written.get(id) === signature) return;
      pending.push({ id, signature, snapshot: { ...values, recordedAt: ctx.now.toISOString(), recordedBy: ctx.username || undefined } });
    });
    if (!pending.length) return;
    const write = (async () => {
      try {
        await writeSnapshots(clients.asInternalUser, logger, pending.map(entry => entry.snapshot));
        Array.from(written.keys()).filter(id => !id.endsWith(`|${date}`)).forEach(id => written.delete(id));
        pending.forEach(entry => written.set(entry.id, entry.signature));
        if (history) history = { ...history, list: [...history.list.filter(s => !pending.some(p => p.id === snapshotId(s.controlId, s.date))), ...pending.map(p => p.snapshot)] };
        if (purgedOn !== date) {
          purgedOn = date;
          const deleted = await purgeSnapshots(clients.asInternalUser, addDays(date, -ENS_SNAPSHOT_RETENTION_DAYS));
          if (deleted) logger.info(`ENSFácil: ${deleted} maturity snapshots older than ${ENS_SNAPSHOT_RETENTION_DAYS} days deleted`);
        }
      } catch (error: any) {
        logger.error(`ENSFácil: could not write the maturity snapshots of ${date}: ${error?.message || error}`);
      }
    })();
    writes.add(write);
    void write.finally(() => writes.delete(write));
  };

  // Maturity for an evaluation response. It is the organisation's: a machine view takes it from the whole scope
  // (its rows are already computed, so this only consolidates).
  const forEvaluation = async (
    clients: ENSEvaluationClients,
    run: RunOutput,
    signal?: CancelSignal
  ): Promise<ENSMaturityOfView | undefined> => {
    if (run.query.include === 'results') return undefined;
    const organisation = run.query.agentId
      ? await evaluation.run(
          clients,
          normalizeQuery({ include: 'summary', controlId: run.query.controlId, timeZone: run.query.timeZone }),
          { allowStale: true, signal }
        )
      : run;
    const maturity = await compute(clients, organisation);
    recordSnapshots(clients, organisation, maturity);
    return { controls: maturity, complete: !organisation.meta.pending };
  };

  // The level the evidence accredits now (for the assessment rule); undefined when it cannot be computed.
  const accreditedFor = async (clients: ENSEvaluationClients, controlId: string): Promise<ENSMaturityLevel | undefined> => {
    const run = await evaluation.run(clients, normalizeQuery({ include: 'results', controlId }), { allowStale: true });
    const maturity = (await compute(clients, run)).get(controlId);
    if (!maturity) return undefined;
    return maturity.measured ? maturity.accredited ?? 0 : 0;
  };

  // Snapshots for the annual report and the trends (route `GET /maturity/snapshots`).
  const snapshotsBetween = async (clients: ENSEvaluationClients, query: { controlId?: string; from?: string; to?: string }) => {
    if (query.controlId && !ENSCatalog.some(control => control.id === query.controlId)) {
      throw new ENSBadRequestError(`El control «${query.controlId}» no está en el catálogo de ENSFácil.`);
    }
    if (!isDay(query.from) || !isDay(query.to) || query.from > query.to) {
      throw new ENSBadRequestError('«from» y «to» son fechas AAAA-MM-DD, con «from» no posterior a «to».');
    }
    if (Date.parse(query.to) - Date.parse(query.from) > 400 * 86400e3) {
      throw new ENSBadRequestError('Como mucho 400 días por petición.');
    }
    return readSnapshots(clients.asInternalUser, { from: query.from, to: query.to, controlIds: query.controlId ? [query.controlId] : undefined });
  };

  return {
    compute,
    forEvaluation,
    accreditedFor,
    snapshotsBetween,
    // Tests: wait for the snapshot writes in progress.
    flush: () => Promise.all(Array.from(writes)),
  };
};

export type ENSMaturityService = ReturnType<typeof createMaturityService>;
