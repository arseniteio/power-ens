import { randomBytes } from 'crypto';
import type { Logger } from '../../../../src/core/server';
import { ENS_CONFIGURATION_INDEX } from '../../common/constants';
import { assertCompleteResponse } from './evaluation/facts-reader';

export const ENS_CONFIGURATION_ACTIVE_DOCUMENT_ID = 'active';

export type ENSConfigurationDocumentType = 'ACTIVE_CONFIGURATION' | 'CONFIGURATION_HISTORY';

export interface ENSConfigurationStoredDocument {
  documentType: ENSConfigurationDocumentType;
  configuration: Record<string, unknown>;
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  updatedBy?: string;
}

const isIndexAlreadyCreatedError = (error: any): boolean => {
  const errorType = error?.body?.error?.type || error?.meta?.body?.error?.type;

  return (
    errorType === 'resource_already_exists_exception' ||
    String(error?.message || error).includes('resource_already_exists_exception')
  );
};

export async function ensureENSConfigurationIndex(client: any, logger: Logger): Promise<void> {
  const exists = await client.indices.exists({ index: ENS_CONFIGURATION_INDEX });

  if (exists.body) {
    return;
  }

  try {
    await client.indices.create({
      index: ENS_CONFIGURATION_INDEX,
      body: {
        // `auto_expand_replicas` instead of a fixed replica: on a single-node indexer a replica can never be
        // assigned and the index stays yellow; with more nodes, the replica is created.
        settings: { index: { number_of_shards: 1, auto_expand_replicas: '0-1' } },
        mappings: {
          properties: {
            documentType: { type: 'keyword' },
            createdAt: { type: 'date' },
            createdBy: { type: 'keyword' },
            updatedAt: { type: 'date' },
            updatedBy: { type: 'keyword' },
            configuration: { type: 'object', enabled: false },
          },
        },
      },
    });

    logger.info(`Index ${ENS_CONFIGURATION_INDEX} created`);
  } catch (error) {
    if (!isIndexAlreadyCreatedError(error)) {
      throw error;
    }
  }
}

// Version of the active document in the index, for a save that must not overwrite a newer one.
export interface ENSConfigurationDocumentVersion {
  seqNo: number;
  primaryTerm: number;
}

export class ENSConfigurationConflictError extends Error {
  constructor() {
    super('La configuración ha cambiado desde que la abriste. Recarga la página para ver los cambios.');
  }
}

const versionOf = (seqNo: unknown, primaryTerm: unknown): ENSConfigurationDocumentVersion | undefined =>
  Number.isInteger(seqNo) && Number.isInteger(primaryTerm) ? { seqNo: seqNo as number, primaryTerm: primaryTerm as number } : undefined;

export const parseConfigurationVersion = (value: any): ENSConfigurationDocumentVersion | undefined =>
  value && typeof value === 'object' ? versionOf(value.seqNo, value.primaryTerm) : undefined;

export async function readActiveENSConfigurationWithVersion(
  client: any,
  logger: Logger
): Promise<{ document?: ENSConfigurationStoredDocument; version?: ENSConfigurationDocumentVersion }> {
  await ensureENSConfigurationIndex(client, logger);

  const result = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    body: {
      size: 1,
      seq_no_primary_term: true,
      query: { ids: { values: [ENS_CONFIGURATION_ACTIVE_DOCUMENT_ID] } },
    },
  });

  // With a failed shard it does not silently fall back to the default template.
  assertCompleteResponse(result.body, 'la configuración ENS');
  const hit = result.body?.hits?.hits?.[0];

  return { document: hit?._source as ENSConfigurationStoredDocument | undefined, version: hit ? versionOf(hit._seq_no, hit._primary_term) : undefined };
}

export async function readActiveENSConfiguration(
  client: any,
  logger: Logger
): Promise<ENSConfigurationStoredDocument | undefined> {
  return (await readActiveENSConfigurationWithVersion(client, logger)).document;
}

export async function readENSConfigurationHistory(
  client: any,
  logger: Logger,
  size: number = 100
): Promise<ENSConfigurationStoredDocument[]> {
  await ensureENSConfigurationIndex(client, logger);

  const result = await client.search({
    index: ENS_CONFIGURATION_INDEX,
    body: {
      size,
      query: { term: { documentType: 'CONFIGURATION_HISTORY' } },
      sort: [{ createdAt: { order: 'desc' } }],
    },
  });

  assertCompleteResponse(result.body, 'el historial de la configuración ENS');
  return (result.body?.hits?.hits || []).map((hit: any) => hit._source as ENSConfigurationStoredDocument);
}

// `previous`: the replaced document when it is not already the last history version; stored one millisecond earlier.
// `expected`: the version read before saving ('absent': there was none), so a newer document is never overwritten;
// the active document goes first and the history only once it is written.
export async function persistENSConfiguration(
  client: any,
  logger: Logger,
  configuration: Record<string, unknown>,
  username: string,
  previous?: { configuration: Record<string, unknown>; author?: string },
  expected?: ENSConfigurationDocumentVersion | 'absent'
): Promise<ENSConfigurationStoredDocument & { version?: ENSConfigurationDocumentVersion }> {
  await ensureENSConfigurationIndex(client, logger);

  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const historyId = ['history', now, randomBytes(6).toString('hex')].join('-');
  const previousLines = previous
    ? [
        JSON.stringify({ create: { _index: ENS_CONFIGURATION_INDEX, _id: ['history', now - 1, randomBytes(6).toString('hex')].join('-') } }),
        JSON.stringify({
          documentType: 'CONFIGURATION_HISTORY',
          configuration: previous.configuration,
          createdAt: new Date(now - 1).toISOString(),
          createdBy: previous.author || 'desconocido',
        }),
      ]
    : [];

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

  const target = { _index: ENS_CONFIGURATION_INDEX, _id: ENS_CONFIGURATION_ACTIVE_DOCUMENT_ID };
  const action =
    expected === 'absent'
      ? { create: target }
      : expected
        ? { index: { ...target, if_seq_no: expected.seqNo, if_primary_term: expected.primaryTerm } }
        : { index: target };
  const written = await client.bulk({ body: `${JSON.stringify(action)}\n${JSON.stringify(activeDocument)}\n`, refresh: 'wait_for' });
  const item = written.body?.items?.[0]?.create || written.body?.items?.[0]?.index;

  if (written.body?.errors) {
    if (item?.status === 409 || item?.error?.type === 'version_conflict_engine_exception') {
      throw new ENSConfigurationConflictError();
    }
    throw new Error(`Could not persist ENS configuration: ${JSON.stringify(item?.error || written.body.items)}`);
  }

  const historyBody = [
    ...previousLines,
    JSON.stringify({ create: { _index: ENS_CONFIGURATION_INDEX, _id: historyId } }),
    JSON.stringify(historyDocument),
    '',
  ].join('\n');

  const result = await client.bulk({ body: historyBody, refresh: 'wait_for' });

  if (result.body?.errors) {
    const failures = (result.body.items || [])
      .map((entry: any) => entry.create?.error || entry.index?.error)
      .filter(Boolean);

    throw new Error(`Could not persist ENS configuration history: ${JSON.stringify(failures)}`);
  }

  return { ...activeDocument, version: versionOf(item?._seq_no, item?._primary_term) };
}
