import { normalizeWazuhAlerts } from './data-source-engine';
import {
  ENSDataSourceProvider,
  ENSDataSourceProviderContext,
} from './provider';
import { ENSNormalizedEvent } from './types';

export interface ENSOpenSearchClient {
  search: (params: unknown) => Promise<{
    hits?: {
      hits?: unknown[];
    };
  }>;
}

const buildControlFilter = (controlId: string) => ({
  bool: {
    should: [
      { term: { 'data.control': controlId } },
      { term: { 'data.ensfacil': controlId } },
    ],
    minimum_should_match: 1,
  },
});

export const createOpenSearchDataSourceProvider = (
  client: ENSOpenSearchClient,
  indexPattern = 'wazuh-alerts-*'
): ENSDataSourceProvider => ({
  name: 'opensearch-provider',
  getEvents: async (
    context: ENSDataSourceProviderContext
  ) => {
    const response = await client.search({
      index: indexPattern,
      body: {
        size: context.size || 1000,
        sort: [
          { '@timestamp': { order: 'desc' } },
        ],
        query: {
          bool: {
            must: [
              ...(context.agentId
                ? [{ term: { 'agent.id': context.agentId } }]
                : []),
              ...(context.controlId
                ? [buildControlFilter(context.controlId)]
                : []),
              ...(context.from || context.to
                ? [
                    {
                      range: {
                        '@timestamp': {
                          ...(context.from ? { gte: context.from } : {}),
                          ...(context.to ? { lte: context.to } : {}),
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
        },
      },
    });

    return normalizeWazuhAlerts(response.hits?.hits || []);
  },
});
