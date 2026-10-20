// Browser client of the maturity routes (`server/routes/maturity.ts`). The keys it sends are the ones the route
// schema declares: `tests/maturity-route-schema.test.ts` runs these bodies through it.
import { ENSFACIL_MATURITY_PATH } from '../../constants';
import { withRequestTimeout } from '../../platform/request-timeout';
import type { ENSConfigurationExpectedVersion, ENSConfigurationMetadata } from '../configuration/services/configuration-http-client';
import { getENSConfigurationHttp, withServerReason } from '../configuration/services/configuration-http-client';
import type { ENSConfigurationVersion } from '../configuration/types';
import type { ENSControlMaturityRecord, ENSControlSnapshot, ENSMaturityRecordKind } from './types';

export interface ENSMaturitySaveRequest {
  controlId: string;
  kind: ENSMaturityRecordKind;
  entry: Record<string, unknown>;
  // The version of the configuration the person saw; null when there was none.
  expectedVersion?: ENSConfigurationExpectedVersion | null;
}

export interface ENSMaturitySaveResponse {
  configuration: ENSConfigurationVersion;
  metadata: ENSConfigurationMetadata;
  record: ENSControlMaturityRecord;
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
    ...(request.expectedVersion !== undefined ? { expectedVersion: request.expectedVersion } : {}),
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
