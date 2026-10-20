// Art. 32 report on the server: the data set of a period (frozen, or computed now) and its freeze (the daily job at
// the closing, or an administrator's explicit request with a reason, kept as a new revision).
import type { Logger } from '../../../../../src/core/server';
import { ENSFACIL_PLUGIN_VERSION } from '../../../common/constants';
import { annualPeriodBounds, annualPeriodOfDay, isAnnualPeriod, lastClosedAnnualPeriod } from '../../../common/ens/annual-report/annual-period';
import { annualClosingOf, annualClosingOfConfiguration, buildAnnualReport } from '../../../common/ens/annual-report/annual-report';
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
  const build = (run: RunOutput, controls: Map<string, ENSControlMaturity>, period: string, freeze?: ENSAnnualFreezeEntry): ENSAnnualReport =>
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
    });

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
    if (stored) {
      const { freeze } = stored;
      return {
        ...base,
        periods,
        frozen: { revision: freeze.revision, frozenAt: freeze.frozenAt, frozenBy: freeze.frozenBy, ...(freeze.reason ? { reason: freeze.reason } : {}), history: freeze.history || [] },
        report: freeze.report,
      };
    }
    const run = await organisationRun(clients);
    if (run.meta.pending) return { ...base, periods, pending: true, ...(freezeError ? { freezeError } : {}) };
    const controls = await maturity.forReport(clients, run);
    return { ...base, maturityVersion: run.ctx.maturityVersion || null, periods, report: build(run, controls, period), ...(freezeError ? { freezeError } : {}) };
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
    const report = build(run, controls, request.period, entry);
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
    const result = await createAnnualFreeze(client, logger, documentOf(period, entry, build(run, controls, period, entry), []));
    if (result === 'created') logger.info(`ENSFácil: annual report ${period} frozen by the daily job`);
    return { period, result };
  };

  return { read, freezeOnRequest, freezeIfDue };
};

export type ENSAnnualReportService = ReturnType<typeof createAnnualReportService>;
