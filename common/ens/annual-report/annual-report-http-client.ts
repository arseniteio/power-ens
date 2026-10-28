// Browser client of the art. 32 routes; `tests/annual-report-route-schema.test.ts` runs what it sends through the routes.
import { POWER_ENS_ANNUAL_REPORT_PATH } from '../../constants';
import { withRequestTimeout } from '../../platform/request-timeout';
import { getENSConfigurationHttp, withServerReason } from '../configuration/services/configuration-http-client';
import type { ENSAnnualFreezeEntry, ENSAnnualFreezeRequest, ENSAnnualReport, ENSAnnualReportResponse } from './annual-report-types';

// The organisation evaluation behind a cold report can take longer than a normal request.
const ANNUAL_REPORT_TIMEOUT_MS = 180000;

const dataOf = <T>(response: any): T => {
  if (!response || response.statusCode !== 200 || response.error !== 0 || !response.data) {
    throw new Error('El servidor de Power ENS devolvió una respuesta no válida.');
  }
  return response.data as T;
};

export async function fetchAnnualReport(query: { period?: string; revision?: number } = {}): Promise<ENSAnnualReportResponse> {
  const params: Record<string, string> = {
    ...(query.period ? { period: query.period } : {}),
    ...(query.revision !== undefined ? { revision: String(query.revision) } : {}),
  };
  const response = await withRequestTimeout(
    signal => getENSConfigurationHttp().get(POWER_ENS_ANNUAL_REPORT_PATH, { query: params, signal }),
    'informe anual',
    new AbortController(),
    ANNUAL_REPORT_TIMEOUT_MS
  ).catch(error => {
    throw withServerReason(error);
  });
  return dataOf<ENSAnnualReportResponse>(response);
}

export async function freezeAnnualReport(request: ENSAnnualFreezeRequest): Promise<{ frozen: ENSAnnualFreezeEntry; report: ENSAnnualReport }> {
  const body: ENSAnnualFreezeRequest = { period: request.period, reason: request.reason, expectedRevision: request.expectedRevision };
  const response = await withRequestTimeout(
    signal => getENSConfigurationHttp().post(`${POWER_ENS_ANNUAL_REPORT_PATH}/freeze`, { body: JSON.stringify(body), signal }),
    'congelado del informe anual',
    new AbortController(),
    ANNUAL_REPORT_TIMEOUT_MS
  ).catch(error => {
    throw withServerReason(error);
  });
  return dataOf<{ frozen: ENSAnnualFreezeEntry; report: ENSAnnualReport }>(response);
}
