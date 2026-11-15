import { ENS_EXCLUSIONS_INDEX } from '../../common/constants';
import type { ENSExclusionRecord } from '../../common/ens/exclusions';
import { assertCompleteResponse } from './evaluation/search';

const alreadyExists = (error: any): boolean =>
  (error?.body?.error?.type || error?.meta?.body?.error?.type) === 'resource_already_exists_exception' ||
  String(error?.message || error).includes('resource_already_exists_exception');

const ensureExclusionsIndex = async (client: any): Promise<void> => {
  const exists = await client.indices.exists({ index: ENS_EXCLUSIONS_INDEX });
  if (exists.body) return;

  try {
    await client.indices.create({
      index: ENS_EXCLUSIONS_INDEX,
      body: {
        settings: { index: { number_of_shards: 1, auto_expand_replicas: '0-1' } },
        mappings: {
          properties: {
            agentId: { type: 'keyword' },
            controlId: { type: 'keyword' },
            action: { type: 'keyword' },
            reason: { type: 'text' },
            user: { type: 'keyword' },
            date: { type: 'date' },
          },
        },
      },
    });
  } catch (error) {
    if (!alreadyExists(error)) throw error;
  }
};

export const readLatestExclusion = async (client: any, agentId: string, controlId: string): Promise<ENSExclusionRecord | null> => {
  await ensureExclusionsIndex(client);

  const result = await client.search({
    index: ENS_EXCLUSIONS_INDEX,
    body: {
      size: 1,
      query: { bool: { filter: [{ term: { agentId } }, { term: { controlId } }] } },
      sort: [{ date: { order: 'desc' } }],
    },
  });

  assertCompleteResponse(result.body, 'las exclusiones');
  return (result.body?.hits?.hits?.[0]?._source as ENSExclusionRecord | undefined) ?? null;
};

export const appendExclusion = async (client: any, record: ENSExclusionRecord): Promise<void> => {
  await ensureExclusionsIndex(client);
  await client.index({ index: ENS_EXCLUSIONS_INDEX, body: record, refresh: 'wait_for' });
};
