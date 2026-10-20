// Evaluation routes. Everything is read as the viewing user (`asCurrentUser`) so the indexer keeps applying
// their permissions; only the active configuration is read as before (`asInternalUser`, like `GET
// /api/ensfacil/configuration`).
// Computations are shared per row (one control on one machine, see `evaluation-service.ts`), not per request:
// what comes from memory never waits behind a cold computation. If the browser closes the request and nobody
// else waits for that computation, it is cancelled.
import type { Logger } from '../../../../src/core/server';
import { ENS_EVALUATION_LIMITS } from '../../common/ens/evaluation/limits';
import { CancelSignal } from './evaluation/cache';
import {
  createEvaluationService,
  ENSBadRequestError,
  ENSEvaluationService,
  normalizeQuery,
} from './evaluation/evaluation-service';
import { buildEvaluationResponse, buildTraceabilityPage } from './evaluation/responses';
import type { ENSMaturityService } from './maturity/maturity-service';

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

const clients = (context: any) => ({
  asCurrentUser: context.core.opensearch.client.asCurrentUser,
  asInternalUser: context.core.opensearch.client.asInternalUser,
});

// Request signal: cancelled if the browser closes it.
const signalOf = (request: any) => {
  const signal = new CancelSignal();
  const subscription = request?.events?.aborted$?.subscribe?.(() => signal.cancel());
  return { signal, suelta: () => subscription?.unsubscribe?.() };
};

const integer = (value: unknown, defaultValue: number, min: number, max: number, name: string): number => {
  if (value === undefined || value === '') return defaultValue;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ENSBadRequestError(`${name} va de ${min} a ${max}.`);
  }
  return n;
};

export const createEvaluationHandlers = (options: {
  logger: Logger;
  securityEnabled: boolean;
  service?: ENSEvaluationService;
  // Without it, responses carry no maturity (tests of the evaluation alone).
  maturity?: ENSMaturityService;
}) => {
  const { logger } = options;
  const service = options.service || createEvaluationService(options);

  const withErrors = async (request: any, response: any, actionName: string, logLabel: string, taskItem: (signal: CancelSignal) => Promise<unknown>) => {
    const { signal, suelta: looseOne } = signalOf(request);
    try {
      return correct(response, await taskItem(signal));
    } catch (error: any) {
      const status = statusOf(error);
      // Errors that have a reason for the viewer (bad request, permissions, incomplete data, too many facts,
      // cancelled) are returned with it.
      if ((status >= 400 && status < 500) || status === 503) {
        if (status === 503) logger.warn(`ENSFácil: could not ${logLabel}: ${error?.message}`);
        return failure(response, status, error?.message || 'No autorizado');
      }
      logger.error(`ENSFácil: could not ${logLabel}: ${error?.message || error}`);
      return failure(response, 500, `No se pudo ${actionName}; el detalle está en el log del dashboard.`);
    } finally {
      looseOne();
    }
  };

  const evaluate = (context: any, request: any, response: any) =>
    withErrors(request, response, 'evaluar los controles', 'evaluate the controls', async signal => {
      const query = normalizeQuery(request?.query || {});
      // "Reintentar" after a failed refresh: tried at once, no waiting.
      const retryRefresh = request?.query?.retryRefresh === '1' || request?.query?.retryRefresh === 'true';
      const output = await service.run(clients(context), query, { allowStale: true, signal, retryRefresh });
      const s = output.meta.stats;
      logger.debug(
        `ENSFácil: evaluation ${query.include} ${query.controlId || '*'}/${query.agentId || '*'} in ${s.totalMs} ms ` +
          `(${s.computed} rows computed, ${s.refreshingInBackground} refreshing, ${s.hits} facts read)`
      );
      // The maturity never fails the evaluation: without it the response says why.
      let maturity: Awaited<ReturnType<ENSMaturityService['forEvaluation']>>;
      let maturityError: string | undefined;
      if (options.maturity) {
        try {
          maturity = await options.maturity.forEvaluation(clients(context), output, { retry: retryRefresh });
        } catch (error: any) {
          if (statusOf(error) === 499) throw error;
          logger.warn(`ENSFácil: could not compute the maturity: ${error?.message || error}`);
          maturityError = 'No se pudo calcular la madurez; el detalle está en el log del dashboard.';
        }
      }
      return buildEvaluationResponse(output, maturity, maturityError);
    });

  // Probe: has anything changed since the last evaluation? A few hundred bytes; the browser requests the
  // evaluation again only if the fingerprint changes.
  const probe = (context: any, request: any, response: any) =>
    withErrors(request, response, 'comprobar si hay hechos nuevos', 'check for new facts', async () => {
      const query = normalizeQuery(request?.query || {});
      const ctx = await service.loadContext(clients(context), query);
      return {
        fingerprint: service.viewFingerprint(ctx, query),
        checkedAt: ctx.now.toISOString(),
        configurationUpdatedAt: ctx.configurationUpdatedAt,
        facts: { count: ctx.probe.count, newest: ctx.probe.newest },
      };
    });

  const traceability = (context: any, request: any, response: any) =>
    withErrors(request, response, 'leer la trazabilidad del control', 'read the control traceability', async signal => {
      const q = request?.query || {};
      const query = normalizeQuery({ ...q, include: 'control', timelineDays: '0' });
      if (!query.controlId) throw new ENSBadRequestError('Falta el control.');
      const from = integer(q.from, 0, 0, ENS_EVALUATION_LIMITS.traceabilityStored, '«from»');
      const size = integer(q.size, 50, 1, ENS_EVALUATION_LIMITS.traceabilityPageMax, '«size»');
      return buildTraceabilityPage(await service.run(clients(context), query, { allowStale: true, signal }), from, size);
    });

  return { evaluate, probe, traceability, service };
};
