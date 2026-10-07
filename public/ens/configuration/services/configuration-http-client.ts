import { getHttp } from '../../../services';
import { ENSFACIL_CONFIGURATION_PATH } from '../../../../common/constants';

import { ENSConfigurationVersion } from '../types';

const ENS_CONFIGURATION_API_PATH = ENSFACIL_CONFIGURATION_PATH;

export interface ENSConfigurationMetadata {
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
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

// El servidor explica en `body.message` por qué rechaza una petición (sin el
// rol, un 403 con «Hace falta el rol ensfacil_admin…»). El cliente HTTP del
// núcleo solo pone en el error el texto del estado («Forbidden»), y eso es lo
// que salía en pantalla.
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
    await getHttp().get<ENSConfigurationApiResponse>(
      ENS_CONFIGURATION_API_PATH,
    ).catch(error => {
      throw withServerReason(error);
    });

  return getResponseData(response);
}

export async function saveENSConfiguration(
  configuration: ENSConfigurationVersion,
  changeReason?: string,
): Promise<ENSConfigurationServerState> {
  const normalizedChangeReason = changeReason?.trim();

  const requestBody: ENSConfigurationSaveRequest = {
    configuration: withoutDerivedParameterStatuses(configuration),
    ...(normalizedChangeReason
      ? { changeReason: normalizedChangeReason }
      : {}),
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
