// Art. 32 routes: read for any user who can read the evaluation; freeze for administrators, written as the internal user.
import type { Logger } from '../../../../src/core/server';
import { resolveCurrentUser } from './current-user';
import { ENSAnnualFreezeConflictError } from './annual-report/annual-freeze-storage';
import type { ENSAnnualReportService } from './annual-report/annual-report-service';

const correct = (response: any, data: unknown) => response.ok({ body: { statusCode: 200, error: 0, data } });
const failure = (response: any, statusCode: number, message: string) => response.customError({ statusCode, body: { message } });
const statusOf = (error: any): number => Number(error?.statusCode || error?.meta?.statusCode) || 500;

export const ENS_ANNUAL_FREEZE_ROLE_MESSAGE = 'Hace falta el rol power_ens_admin o all_access para congelar el informe anual.';

const clientsOf = (context: any) => ({
  asCurrentUser: context.core.opensearch.client.asCurrentUser,
  asInternalUser: context.core.opensearch.client.asInternalUser,
});

// What can be told to the person (bad request, permission, conflict, not found, not ready); the rest is logged.
const answer = (logger: Logger, response: any, error: any, action: string, logLabel: string) => {
  const status = statusOf(error);
  if (status === 400 || status === 404 || status === 409 || status === 503) return failure(response, status, error.message);
  if (status === 401 || status === 403) return failure(response, status, error?.message || 'No autorizado');
  logger.error(`Power ENS: could not ${logLabel}: ${error?.message || error}`);
  return failure(response, 500, `No se pudo ${action}; el detalle está en el log del dashboard.`);
};

export const createAnnualReportHandlers = ({
  logger,
  securityEnabled,
  annualReport,
}: {
  logger: Logger;
  securityEnabled: boolean;
  annualReport: ENSAnnualReportService;
}) => {
  const read = async (context: any, request: any, response: any) => {
    const query = request?.query || {};
    try {
      const revision = query.revision === undefined || query.revision === '' ? undefined : Number(query.revision);
      return correct(response, await annualReport.read(clientsOf(context), { period: query.period || undefined, revision }));
    } catch (error: any) {
      return answer(logger, response, error, 'generar el informe anual', 'build the annual report');
    }
  };

  const freeze = async (context: any, request: any, response: any) => {
    const body = request?.body || {};
    let username: string;
    try {
      const user = await resolveCurrentUser(context.core.opensearch.client.asCurrentUser, securityEnabled);
      if (!user.administrator) {
        logger.warn(`Power ENS: refused the annual freeze of ${body.period} for ${user.username || 'an unnamed user'} (lacks power_ens_admin and all_access)`);
        return failure(response, 403, ENS_ANNUAL_FREEZE_ROLE_MESSAGE);
      }
      if (!user.username) return failure(response, 401, 'No se pudo identificar al usuario.');
      username = user.username;
    } catch (error: any) {
      return answer(logger, response, error, 'comprobar el usuario', 'check the annual freeze user');
    }
    try {
      const result = await annualReport.freezeOnRequest(clientsOf(context), {
        period: String(body.period || ''),
        reason: String(body.reason || ''),
        by: username,
        expectedRevision: body.expectedRevision ?? null,
      });
      return correct(response, result);
    } catch (error: any) {
      if (error instanceof ENSAnnualFreezeConflictError) logger.warn(`Power ENS: refused a stale annual freeze of ${body.period} by ${username}`);
      return answer(logger, response, error, 'congelar el informe anual', 'freeze the annual report');
    }
  };

  return { read, freeze };
};
