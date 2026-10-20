// Art. 32 on the server: a period's data set (frozen, or computed now) and its freeze (daily job, or administrator).
import type { Logger } from '../../../../../src/core/server';
import { ENSFACIL_PLUGIN_VERSION } from '../../../common/constants';
import { annualPeriodBounds, annualPeriodInstants, annualPeriodOfDay, isAnnualPeriod, lastClosedAnnualPeriod } from '../../../common/ens/annual-report/annual-period';
import { annualClosingOf, annualClosingOfConfiguration, buildAnnualReport, liveIncidentsCutInto } from '../../../common/ens/annual-report/annual-report';
import { readPeriodIncidents } from './incident-source';
import type { ENSConfigurationVersion } from '../../../common/ens/configuration/types';
import type { ENSAnnualFreeze, ENSAnnualFreezeEntry, ENSAnnualReport, ENSAnnualReportResponse } from '../../../common/ens/annual-report/annual-report-types';
import { ENS_ANNUAL_REPORT_CONTROL } from '../../../common/ens/annual-report/declared-measures';
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import { addDays, configuredTimeZone, dayIn } from '../../../common/ens/maturity/maturity-engine';
import type { ENSControlMaturity } from '../../../common/ens/maturity/types';
import type { ENSEvaluationClients, ENSEvaluationService } from '../evaluation/evaluation-service';
import { ENSBadRequestError, normalizeQuery } from '../evaluation/evaluation-service';
import type { ENSMaturityService } from '../maturity/maturity-service';
import {
  createAnnualFreeze,
  ENSAnnualFreezeConflictError,
  ENS_ANNUAL_FREEZE_TYPE,
  listAnnualFreezes,
  readAnnualFreeze,
  replaceAnnualFreeze,
} from './annual-freeze-storage';

type RunOutput = Awaited<ReturnType<ENSEvaluationService['run']>>;

// The daily job freezes a closed period only in the month after its closing; later, only on request.
export const ENS_AUTO_FREEZE_DAYS = 31;
// Frozen periods listed: this many years back from the current one.
const LISTED_YEARS = 10;
const MANAGER = '000';
const ROW_CONTROLS = [ENS_ANNUAL_REPORT_CONTROL, 'op.exp.7'];

export class ENSAnnualReportUnavailableError extends Error {
  statusCode = 503;
}

export class ENSAnnualReportNotFoundError extends Error {
  statusCode = 404;
}


const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 0;

const resultsOf = (run: RunOutput): ENSComplianceResult[] =>
  run.state?.results || (Array.from(run.views.values()).map(view => view.result).filter(Boolean) as ENSComplianceResult[]);

// op.mon.2 and op.exp.7 on the manager's row: their report variables are raw there, not consolidated.
const managerRowsOf = (run: RunOutput): Partial<Record<string, ENSComplianceResult>> =>
  Object.fromEntries(ROW_CONTROLS.map(id => [id, run.views.get(id)?.rows.find(row => row.agentId === MANAGER)?.result]));

const calendarFor = (timeZone: string, closing: string, now: Date) => {
  const today = dayIn(now, timeZone);
  return { timeZone, closing, today, current: annualPeriodOfDay(today, closing), lastClosed: lastClosedAnnualPeriod(today, closing) };
};

// The calendar of an evaluation: its op.mon.2 row decides the closing.
const calendarOf = (run: RunOutput) => {
  const opMon2 = managerRowsOf(run)[ENS_ANNUAL_REPORT_CONTROL] || run.views.get(ENS_ANNUAL_REPORT_CONTROL)?.result;
  return calendarFor(configuredTimeZone(run.ctx.configuration.global.timezone), annualClosingOf(opMon2).closing, run.ctx.now);
};

// The same calendar from the configuration alone (reading a frozen report evaluates nothing).
const calendarOfConfiguration = (configuration: ENSConfigurationVersion, now: Date) =>
  calendarFor(configuredTimeZone(configuration.global.timezone), annualClosingOfConfiguration(configuration).closing, now);

// First and last day of a frozen period, from its own header (or the copy kept beside it for the list).
export const frozenSpan = (freeze: { report?: ENSAnnualReport; periodStart?: string; periodEnd?: string }): { from: string; to: string } => {
  const header = (id: string) => String(freeze.report?.header?.find(datum => datum.id === id)?.value ?? '');
  return { from: freeze.periodStart || header('header.period_start'), to: freeze.periodEnd || header('header.period_end') };
};

export const createAnnualReportService = ({
  logger,
  evaluation,
  maturity,
  clock = () => new Date(),
}: {
  logger: Logger;
  evaluation: ENSEvaluationService;
  maturity: ENSMaturityService;
  clock?: () => Date;
}) => {
  const build = (
    run: RunOutput,
    controls: Map<string, ENSControlMaturity>,
    period: string,
    freeze?: ENSAnnualFreezeEntry,
    periodIncidents?: Record<string, unknown>
  ): ENSAnnualReport =>
    buildAnnualReport({
      configuration: run.ctx.configuration,
      results: resultsOf(run),
      managerRows: managerRowsOf(run),
      maturity: controls,
      records: run.ctx.maturityRecords,
      now: run.ctx.now,
      timeZone: configuredTimeZone(run.ctx.configuration.global.timezone),
      period,
      pluginVersion: ENSFACIL_PLUGIN_VERSION,
      freeze,
      periodIncidents,
    });

  // A closed period (or one the live 500 cap cuts into) takes its incidents from the server, all of them up to the limit.
  const periodIncidentsFor = async (client: any, run: RunOutput, period: string): Promise<Record<string, unknown> | undefined> => {
    const calendar = calendarOf(run);
    const { fromMs, toMs } = annualPeriodInstants(period, calendar.closing, calendar.timeZone);
    const opMon2 = managerRowsOf(run)[ENS_ANNUAL_REPORT_CONTROL] || run.views.get(ENS_ANNUAL_REPORT_CONTROL)?.result;
    if (period > calendar.lastClosed && !liveIncidentsCutInto(opMon2, fromMs)) return undefined;
    try {
      return await readPeriodIncidents(client, run.ctx.configuration, run.ctx.now, { fromMs, toMs: Math.min(toMs, run.ctx.now.getTime()) });
    } catch (error: any) {
      logger.warn(`ENSFácil: could not read the incidents of period ${period}: ${error?.message || error}`);
      return { motivo: 'no se han podido leer en el indexador los incidentes del periodo; el detalle está en el log del dashboard', incidentes: [] };
    }
  };

  const organisationRun = (clients: ENSEvaluationClients) => evaluation.run(clients, normalizeQuery({ include: 'results' }), { allowStale: true });

  // A period's data set: the frozen one as stored (no evaluation at all), else computed now.
  const read = async (clients: ENSEvaluationClients, query: { period?: string; revision?: number }): Promise<ENSAnnualReportResponse> => {
    if (query.period !== undefined && !isAnnualPeriod(query.period)) throw new ENSBadRequestError('«period» es un año (AAAA).');
    if (query.revision !== undefined && !(Number.isInteger(query.revision) && query.revision >= 1)) throw new ENSBadRequestError('«revision» es un número de 1 en adelante.');
    const settings = await evaluation.settings(clients);
    const calendar = calendarOfConfiguration(settings.configuration, clock());
    const period = query.period || calendar.current;
    if (period > calendar.current) throw new ENSBadRequestError(`El periodo ${period} todavía no ha empezado.`);
    const bounds = annualPeriodBounds(period, calendar.closing);
    const base = {
      period,
      currentPeriod: calendar.current,
      lastClosedPeriod: calendar.lastClosed,
      closing: calendar.closing,
      periodFrom: bounds.from,
      periodTo: bounds.to,
      maturityVersion: settings.maturityVersion || null,
    };
    let periods: ENSAnnualReportResponse['periods'] = [];
    let freezeError: string | undefined;
    let stored: Awaited<ReturnType<typeof readAnnualFreeze>>;
    try {
      const years = Array.from({ length: LISTED_YEARS + 1 }, (_, i) => String(Number(calendar.current) - i));
      periods = await listAnnualFreezes(clients.asCurrentUser, years);
      stored = await readAnnualFreeze(clients.asCurrentUser, period, query.revision);
    } catch (error: any) {
      const status = statusOf(error);
      freezeError =
        status === 401 || status === 403
          ? 'Sin permiso de lectura de wazuh-ens-snapshots: no se ven los informes congelados.'
          : 'No se han podido leer los informes congelados; el detalle está en el log del dashboard.';
      if (status !== 401 && status !== 403) logger.warn(`ENSFácil: could not read the annual freezes: ${error?.message || error}`);
    }
    if (query.revision !== undefined && !stored) {
      if (freezeError) throw new ENSAnnualReportUnavailableError(freezeError);
      throw new ENSAnnualReportNotFoundError(`El periodo ${period} no tiene la revisión ${query.revision} congelada.`);
    }
    // With the current closing this period is still open: a freeze under its key is of another closing, never served by default.
    const open = period > calendar.lastClosed;
    let notice: string | undefined;
    if (stored && open && query.revision === undefined) {
      const span = frozenSpan(stored.freeze);
      notice = `Hay un congelado «${period}» de otro cierre (del ${span.from} al ${span.to}): con el cierre actual (${calendar.closing}) el periodo ${period} está en curso. Se lee por la API con ?period=${period}&revision=${stored.freeze.revision}.`;
      stored = undefined;
    }
    if (stored) {
      const { freeze } = stored;
      // The stored header is the truth of a frozen period: its dates, even if the closing moved since.
      const span = frozenSpan(freeze);
      const moved = span.from !== bounds.from || span.to !== bounds.to;
      return {
        ...base,
        periodFrom: span.from,
        periodTo: span.to,
        closing: span.to.slice(5),
        periods,
        frozen: { revision: freeze.revision, frozenAt: freeze.frozenAt, frozenBy: freeze.frozenBy, ...(freeze.reason ? { reason: freeze.reason } : {}), history: freeze.history || [] },
        report: freeze.report,
        ...(moved ? { notice: `Congelado con otro cierre (${span.to.slice(5)}): con el cierre actual (${calendar.closing}) el periodo ${period} iría del ${bounds.from} al ${bounds.to}.` } : {}),
      };
    }
    const extra = { ...(freezeError ? { freezeError } : {}), ...(notice ? { notice } : {}) };
    const run = await organisationRun(clients);
    if (run.meta.pending) return { ...base, periods, pending: true, ...extra };
    const controls = await maturity.forReport(clients, run);
    const incidents = await periodIncidentsFor(clients.asCurrentUser, run, period);
    return { ...base, maturityVersion: run.ctx.maturityVersion || null, periods, report: build(run, controls, period, undefined, incidents), ...extra };
  };

  const entryFor = (by: string, revision: number, reason?: string): ENSAnnualFreezeEntry => ({
    revision,
    frozenAt: clock().toISOString(),
    frozenBy: by,
    ...(reason ? { reason } : {}),
  });

  const documentOf = (period: string, entry: ENSAnnualFreezeEntry, report: ENSAnnualReport, history: ENSAnnualFreezeEntry[]): ENSAnnualFreeze => ({
    documentType: ENS_ANNUAL_FREEZE_TYPE,
    period,
    periodStart: frozenSpan({ report }).from,
    periodEnd: frozenSpan({ report }).to,
    ...entry,
    report,
    history,
  });

  // An administrator's explicit freeze (first, late, or a new revision): written as the internal user, with a reason.
  const freezeOnRequest = async (
    clients: ENSEvaluationClients,
    request: { period: string; reason: string; by: string; expectedRevision: number | null }
  ): Promise<{ frozen: ENSAnnualFreezeEntry; report: ENSAnnualReport }> => {
    if (!isAnnualPeriod(request.period)) throw new ENSBadRequestError('«period» es un año (AAAA).');
    const reason = String(request.reason || '').trim();
    if (!reason) throw new ENSBadRequestError('Motivo: obligatorio; queda en el historial del informe.');
    if (reason.length > 1000) throw new ENSBadRequestError('Motivo: como mucho 1000 caracteres.');
    const run = await organisationRun(clients);
    const calendar = calendarOf(run);
    if (request.period > calendar.lastClosed) {
      throw new ENSBadRequestError(`El periodo ${request.period} no ha cerrado (cierre anual ${calendar.closing}): solo se congela un periodo cerrado.`);
    }
    if (run.meta.pending || run.meta.refreshing) {
      throw new ENSAnnualReportUnavailableError('La evaluación de todos los controles no ha terminado; vuelve a intentarlo en unos minutos.');
    }
    let controls: Map<string, ENSControlMaturity>;
    try {
      controls = await maturity.forReport(clients, run, { fresh: true });
    } catch (error: any) {
      throw new ENSAnnualReportUnavailableError(`No se ha podido calcular la madurez de todos los controles (${error?.message || error}); vuelve a intentarlo.`);
    }
    const current = await readAnnualFreeze(clients.asInternalUser, request.period);
    const currentRevision = current ? current.freeze.revision : null;
    if (currentRevision !== request.expectedRevision) {
      throw new ENSAnnualFreezeConflictError(
        current
          ? `El periodo ${request.period} ya está congelado (revisión ${currentRevision}). Recarga la página.`
          : `El periodo ${request.period} no tenía congelado. Recarga la página.`
      );
    }
    const entry = entryFor(request.by, (currentRevision || 0) + 1, reason);
    const report = build(run, controls, request.period, entry, await periodIncidentsFor(clients.asCurrentUser, run, request.period));
    // A regeneration never replaces real incident figures with none: the current freeze stays.
    const totalOf = (data: ENSAnnualReport) => data.incidents.find(datum => datum.id === 'incidents.total');
    if (current && totalOf(current.freeze.report)?.value !== null && totalOf(current.freeze.report) && totalOf(report)?.value === null) {
      throw new ENSBadRequestError(
        `No se regenera el periodo ${request.period}: los incidentes ya no se pueden recalcular (${totalOf(report)?.trace}). El congelado vigente (revisión ${currentRevision}) se conserva.`
      );
    }
    if (current) {
      const { freeze } = current;
      const previous = { revision: freeze.revision, frozenAt: freeze.frozenAt, frozenBy: freeze.frozenBy, ...(freeze.reason ? { reason: freeze.reason } : {}) };
      await replaceAnnualFreeze(clients.asInternalUser, logger, current, documentOf(request.period, entry, report, [...(freeze.history || []), previous]));
    } else if ((await createAnnualFreeze(clients.asInternalUser, logger, documentOf(request.period, entry, report, []))) === 'exists') {
      throw new ENSAnnualFreezeConflictError(`El periodo ${request.period} se acaba de congelar. Recarga la página.`);
    }
    logger.info(`ENSFácil: annual report ${request.period} frozen by ${request.by} (revision ${entry.revision})`);
    return { frozen: entry, report };
  };

  // The daily job, after its snapshot: the period that has just closed, once (`create`), with the same run.
  const freezeIfDue = async (
    client: any,
    run: RunOutput,
    controls: Map<string, ENSControlMaturity>,
    by: string
  ): Promise<{ period: string; result: 'created' | 'exists' | 'late' }> => {
    const calendar = calendarOf(run);
    const period = calendar.lastClosed;
    const { to } = annualPeriodBounds(period, calendar.closing);
    if (addDays(to, ENS_AUTO_FREEZE_DAYS) < calendar.today) return { period, result: 'late' };
    if (await readAnnualFreeze(client, period)) return { period, result: 'exists' };
    const entry = entryFor(by, 1);
    const incidents = await periodIncidentsFor(client, run, period);
    const result = await createAnnualFreeze(client, logger, documentOf(period, entry, build(run, controls, period, entry, incidents), []));
    if (result === 'created') logger.info(`ENSFácil: annual report ${period} frozen by the daily job`);
    return { period, result };
  };

  return { read, freezeOnRequest, freezeIfDue };
};

export type ENSAnnualReportService = ReturnType<typeof createAnnualReportService>;
