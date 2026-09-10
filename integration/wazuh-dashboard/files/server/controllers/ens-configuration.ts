import {
  OpenSearchDashboardsRequest,
  OpenSearchDashboardsResponseFactory,
  RequestHandlerContext,
} from 'src/core/server';

import { ErrorResponse } from '../lib/error-response';
import {
  ENSConfigurationStoredDocument,
  persistENSConfiguration,
  readActiveENSConfiguration,
  readENSConfigurationHistory,
} from '../lib/ens-configuration-storage';
import { routeDecoratorProtectedAdministrator } from './decorators';

interface ENSConfigurationSaveRequest {
  configuration: Record<string, unknown>;
  changeReason?: string;
}

const getNonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined;

const getStoredConfigurationMetadata = (
  document?: ENSConfigurationStoredDocument,
) =>
  document
    ? {
        createdAt: document.createdAt,
        createdBy: document.createdBy,
        updatedAt: document.updatedAt,
        updatedBy: document.updatedBy,
      }
    : null;

export class ENSConfigurationCtrl {
  async getActiveConfiguration(
    context: RequestHandlerContext,
    request: OpenSearchDashboardsRequest,
    response: OpenSearchDashboardsResponseFactory,
  ) {
    try {
      const storedDocument =
        await readActiveENSConfiguration(context);

      return response.ok({
        body: {
          statusCode: 200,
          error: 0,
          data: {
            configuration:
              storedDocument?.configuration ?? null,
            metadata:
              getStoredConfigurationMetadata(storedDocument),
          },
        },
      });
    } catch (error) {
      context.wazuh.logger.error(
        `Could not read active ENS configuration: ${
          error.message || error
        }`,
      );

      return ErrorResponse(
        error.message || error,
        6001,
        500,
        response,
      );
    }
  }

  saveConfiguration =
    routeDecoratorProtectedAdministrator(6002)(
      async (
        context: RequestHandlerContext,
        request: OpenSearchDashboardsRequest,
        response: OpenSearchDashboardsResponseFactory,
      ) => {
        try {
          const body =
            request.body as ENSConfigurationSaveRequest;

          if (
            !body ||
            !body.configuration ||
            typeof body.configuration !== 'object' ||
            Array.isArray(body.configuration)
          ) {
            return ErrorResponse(
              'A valid ENS configuration object is required.',
              6002,
              400,
              response,
            );
          }

          const { username } =
            await context.wazuh.security.getCurrentUser(
              request,
              context,
            );

          if (!username) {
            return ErrorResponse(
              'Could not determine the authenticated user.',
              6002,
              401,
              response,
            );
          }

          const previousDocument =
            await readActiveENSConfiguration(context);

          const previousConfiguration =
            previousDocument?.configuration || {};

          const previousAuditTrail =
            Array.isArray(previousConfiguration.auditTrail)
              ? previousConfiguration.auditTrail
              : [];

          const timestamp = new Date().toISOString();
          const isInitialConfiguration = !previousDocument;

          const changeReason =
            getNonEmptyString(body.changeReason) ||
            getNonEmptyString(
              body.configuration.changeReason,
            ) ||
            (isInitialConfiguration
              ? 'Configuración ENS creada.'
              : 'Configuración ENS actualizada.');

          const persistedConfiguration: Record<
            string,
            unknown
          > = {
            ...body.configuration,

            createdAt: isInitialConfiguration
              ? timestamp
              : getNonEmptyString(
                  previousConfiguration.createdAt,
                ) || timestamp,

            createdBy: isInitialConfiguration
              ? username
              : getNonEmptyString(
                  previousConfiguration.createdBy,
                ) || username,

            updatedAt: timestamp,
            updatedBy: username,
            changeReason,

            auditTrail: [
              ...previousAuditTrail,
              {
                action: isInitialConfiguration
                  ? 'CREATED'
                  : 'UPDATED',
                user: username,
                date: timestamp,
                summary: changeReason,
              },
            ],
          };

          const storedDocument =
            await persistENSConfiguration(
              context,
              persistedConfiguration,
              username,
            );

          context.wazuh.logger.info(
            `ENS configuration saved by ${username}`,
          );

          return response.ok({
            body: {
              statusCode: 200,
              error: 0,
              data: {
                configuration:
                  storedDocument.configuration,
                metadata:
                  getStoredConfigurationMetadata(
                    storedDocument,
                  ),
              },
            },
          });
        } catch (error) {
          context.wazuh.logger.error(
            `Could not save ENS configuration: ${
              error.message || error
            }`,
          );

          return ErrorResponse(
            error.message || error,
            6002,
            500,
            response,
          );
        }
      },
    );

  async getConfigurationHistory(
    context: RequestHandlerContext,
    request: OpenSearchDashboardsRequest,
    response: OpenSearchDashboardsResponseFactory,
  ) {
    try {
      const history =
        await readENSConfigurationHistory(context, 100);

      return response.ok({
        body: {
          statusCode: 200,
          error: 0,
          data: history.map(document => ({
            configuration: document.configuration,
            metadata:
              getStoredConfigurationMetadata(document),
          })),
        },
      });
    } catch (error) {
      context.wazuh.logger.error(
        `Could not read ENS configuration history: ${
          error.message || error
        }`,
      );

      return ErrorResponse(
        error.message || error,
        6004,
        500,
        response,
      );
    }
  }
}
