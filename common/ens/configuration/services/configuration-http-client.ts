import { withRequestTimeout } from '../../../platform/request-timeout';
import { ENSFACIL_CONFIGURATION_PATH } from '../../../constants';

import { ENSConfigurationVersion } from '../types';
import { normalizeOrganizationData } from '../organization/organization-data-migration';

const ENS_CONFIGURATION_API_PATH = ENSFACIL_CONFIGURATION_PATH;

// HTTP client of the dashboard core. Lives in `common/` (shared with the server), which cannot import from
// `public/`: the browser registers it at startup (`public/services.ts`).
export interface ENSConfigurationHttp {
  get<T>(path: string, options?: { signal?: AbortSignal }): Promise<T>;
  put<T>(path: string, options?: { body?: string }): Promise<T>;
}

let httpProvider: (() => ENSConfigurationHttp) | undefined;

export const setENSConfigurationHttp = (provider: () => ENSConfigurationHttp): void => {
  httpProvider = provider;
};

const getHttp = (): ENSConfigurationHttp => {
  if (!httpProvider) {
    throw new Error('ENSFácil: el cliente HTTP de la configuración todavía no está disponible');
  }

  return httpProvider();
};

export interface ENSConfigurationMetadata {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
  // Index version of the document; sent back on save so a newer one is not overwritten.
  seqNo?: number;
  primaryTerm?: number;
}

export interface ENSConfigurationExpectedVersion {
  seqNo: number;
  primaryTerm: number;
}

export interface ENSConfigurationServerState {
  configuration: ENSConfigurationVersion | null;
  metadata: ENSConfigurationMetadata | null;
}

interface ENSConfigurationApiResponse {
  statusCode: number;
  error: number;
  data: ENSConfigurationServerState;
}

interface ENSConfigurationSaveRequest {
  configuration: ENSConfigurationVersion;
  changeReason?: string;
  expectedVersion?: ENSConfigurationExpectedVersion;
}

const withoutDerivedParameterStatuses = (
  configuration: ENSConfigurationVersion,
): ENSConfigurationVersion => ({
  ...configuration,
  controls: configuration.controls.map(control => ({
    ...control,
    parameters: control.parameters.map(parameter => {
      const persistableParameter = { ...parameter };
      delete persistableParameter.status;
      return persistableParameter;
    }),
  })),
});

const getResponseData = (
  response: ENSConfigurationApiResponse,
): ENSConfigurationServerState => {
  if (
    !response ||
    response.statusCode !== 200 ||
    response.error !== 0 ||
    !response.data
  ) {
    throw new Error(
      'The ENS configuration server returned an invalid response.',
    );
  }

  return response.data;
};

// The server explains in `body.message` why it rejects a request; the core HTTP client only reports the status
// text.
const withServerReason = (error: any): Error => {
  const reason = error?.body?.message;

  return typeof reason === 'string' && reason.trim()
    ? new Error(reason.trim())
    : error;
};

export async function getENSConfiguration(): Promise<
  ENSConfigurationServerState
> {
  const response =
    await withRequestTimeout(
      signal => getHttp().get<ENSConfigurationApiResponse>(
        ENS_CONFIGURATION_API_PATH, { signal },
      ),
      'configuración ENS',
    ).catch(error => {
      throw withServerReason(error);
    });

  return getResponseData(response);
}

export async function saveENSConfiguration(
  configuration: ENSConfigurationVersion,
  changeReason?: string,
  expectedVersion?: ENSConfigurationExpectedVersion,
): Promise<ENSConfigurationServerState> {
  const normalizedChangeReason = changeReason?.trim();

  // Every save writes each organisation item into its mapped parameters (items in conflict stay as they are).
  const requestBody: ENSConfigurationSaveRequest = {
    configuration: withoutDerivedParameterStatuses(normalizeOrganizationData(configuration).configuration),
    ...(normalizedChangeReason
      ? { changeReason: normalizedChangeReason }
      : {}),
    ...(expectedVersion ? { expectedVersion } : {}),
  };

  const response =
    await getHttp().put<ENSConfigurationApiResponse>(
      ENS_CONFIGURATION_API_PATH,
      {
        body: JSON.stringify(requestBody),
      },
    ).catch(error => {
      throw withServerReason(error);
    });

  return getResponseData(response);
}
