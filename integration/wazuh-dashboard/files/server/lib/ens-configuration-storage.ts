import { randomBytes } from 'crypto';
import { RequestHandlerContext } from 'src/core/server';

export const ENS_CONFIGURATION_INDEX = 'wazuh-ens-configuration';
export const ENS_CONFIGURATION_ACTIVE_DOCUMENT_ID = 'active';

export type ENSConfigurationDocumentType =
  | 'ACTIVE_CONFIGURATION'
  | 'CONFIGURATION_HISTORY';

export interface ENSConfigurationStoredDocument {
  documentType: ENSConfigurationDocumentType;
  configuration: Record<string, unknown>;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const getOpenSearchClient = (context: RequestHandlerContext) =>
  context.core.opensearch.client.asInternalUser;

const isIndexAlreadyCreatedError = (error: any): boolean => {
  const errorType =
    error?.body?.error?.type ||
    error?.meta?.body?.error?.type;

  return (
    errorType === 'resource_already_exists_exception' ||
    String(error?.message || error).includes(
      'resource_already_exists_exception',
    )
  );
};

export async function ensureENSConfigurationIndex(
  context: RequestHandlerContext,
): Promise<void> {
  const client = getOpenSearchClient(context);

  const exists = await client.indices.exists({
    index: ENS_CONFIGURATION_INDEX,
  });

  if (exists.body) {
    return;
  }

  try {
    await client.indices.create({
      index: ENS_CONFIGURATION_INDEX,
      body: {
        settings: {
          index: {
            number_of_shards: 1,
          },
        },
        mappings: {
          properties: {
            documentType: {
              type: 'keyword',
            },
            createdAt: {
              type: 'date',
            },
            createdBy: {
              type: 'keyword',
            },
            updatedAt: {
              type: 'date',
            },
            updatedBy: {
              type: 'keyword',
            },
            configuration: {
              type: 'object',
              enabled: false,
            },
          },
        },
      },
    });

    context.wazuh.logger.info(
      `Index ${ENS_CONFIGURATION_INDEX} created`,
    );
  } catch (error) {
    if (!isIndexAlreadyCreatedError(error)) {
      throw error;
    }
  }
}

export async function readActiveENSConfiguration(
  context: RequestHandlerContext,
): Promise<ENSConfigurationStoredDocument | undefined> {
  await ensureENSConfigurationIndex(context);

  const result = await getOpenSearchClient(context).search({
    index: ENS_CONFIGURATION_INDEX,
    body: {
      size: 1,
      query: {
        ids: {
          values: [ENS_CONFIGURATION_ACTIVE_DOCUMENT_ID],
        },
      },
    },
  });

  const hit = result.body?.hits?.hits?.[0];

  return hit?._source as
    | ENSConfigurationStoredDocument
    | undefined;
}

export async function readENSConfigurationHistory(
  context: RequestHandlerContext,
  size: number = 100,
): Promise<ENSConfigurationStoredDocument[]> {
  await ensureENSConfigurationIndex(context);

  const result = await getOpenSearchClient(context).search({
    index: ENS_CONFIGURATION_INDEX,
    body: {
      size,
      query: {
        term: {
          documentType: 'CONFIGURATION_HISTORY',
        },
      },
      sort: [
        {
          createdAt: {
            order: 'desc',
          },
        },
      ],
    },
  });

  return (result.body?.hits?.hits || []).map(
    hit => hit._source as ENSConfigurationStoredDocument,
  );
}

export async function persistENSConfiguration(
  context: RequestHandlerContext,
  configuration: Record<string, unknown>,
  username: string,
): Promise<ENSConfigurationStoredDocument> {
  await ensureENSConfigurationIndex(context);

  const timestamp = new Date().toISOString();
  const historyId = [
    'history',
    Date.now(),
    randomBytes(6).toString('hex'),
  ].join('-');

  const activeDocument: ENSConfigurationStoredDocument = {
    documentType: 'ACTIVE_CONFIGURATION',
    configuration,
    updatedAt: timestamp,
    updatedBy: username,
  };

  const historyDocument: ENSConfigurationStoredDocument = {
    documentType: 'CONFIGURATION_HISTORY',
    configuration,
    createdAt: timestamp,
    createdBy: username,
  };

  const bulkBody = [
    JSON.stringify({
      create: {
        _index: ENS_CONFIGURATION_INDEX,
        _id: historyId,
      },
    }),
    JSON.stringify(historyDocument),
    JSON.stringify({
      index: {
        _index: ENS_CONFIGURATION_INDEX,
        _id: ENS_CONFIGURATION_ACTIVE_DOCUMENT_ID,
      },
    }),
    JSON.stringify(activeDocument),
    '',
  ].join('\n');

  const result = await getOpenSearchClient(context).bulk({
    body: bulkBody,
    refresh: 'wait_for',
  });

  if (result.body?.errors) {
    const failures = (result.body.items || [])
      .map(item => item.create?.error || item.index?.error)
      .filter(Boolean);

    throw new Error(
      `Could not persist ENS configuration: ${JSON.stringify(
        failures,
      )}`,
    );
  }

  return activeDocument;
}
