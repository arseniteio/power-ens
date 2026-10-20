// Browser client of the maturity routes; `tests/maturity-route-schema.test.ts` runs its bodies through the route schema.
import { ENSFACIL_MATURITY_PATH } from '../../constants';
import { withRequestTimeout } from '../../platform/request-timeout';
import { getENSConfigurationHttp, withServerReason } from '../configuration/services/configuration-http-client';
import type { ENSControlMaturityRecord, ENSControlSnapshot, ENSMaturityRecordKind, ENSMaturityVersion } from './types';

export interface ENSMaturitySaveRequest {
  controlId: string;
  kind: ENSMaturityRecordKind;
  entry: Record<string, unknown>;
  // Required: the version of the maturity document the person saw; null when there was none.
  expectedVersion: ENSMaturityVersion | null;
}

export interface ENSMaturitySaveResponse {
  record: ENSControlMaturityRecord;
  version: ENSMaturityVersion | null;
  updatedAt: string;
  warning?: string;
}

const dataOf = <T>(response: any): T => {
  if (!response || response.statusCode !== 200 || response.error !== 0 || !response.data) {
    throw new Error('El servidor de ENSFácil devolvió una respuesta no válida.');
  }
  return response.data as T;
};

export async function saveMaturityEntry(request: ENSMaturitySaveRequest): Promise<ENSMaturitySaveResponse> {
  const body: ENSMaturitySaveRequest = {
    controlId: request.controlId,
    kind: request.kind,
    entry: request.entry,
    expectedVersion: request.expectedVersion,
  };
  const response = await withRequestTimeout(
    signal => getENSConfigurationHttp().put(ENSFACIL_MATURITY_PATH, { body: JSON.stringify(body), signal }),
    'registro de la madurez'
  ).catch(error => {
    throw withServerReason(error);
  });
  return dataOf<ENSMaturitySaveResponse>(response);
}

export async function fetchMaturitySnapshots(query: { from: string; to: string; controlId?: string }): Promise<ENSControlSnapshot[]> {
  const params: Record<string, string> = { from: query.from, to: query.to, ...(query.controlId ? { controlId: query.controlId } : {}) };
  const response = await withRequestTimeout(
    signal => getENSConfigurationHttp().get(`${ENSFACIL_MATURITY_PATH}/snapshots`, { query: params, signal }),
    'instantáneas de madurez'
  ).catch(error => {
    throw withServerReason(error);
  });
  return dataOf<{ snapshots: ENSControlSnapshot[] }>(response).snapshots;
}
