import { getPlugins } from '../../../../../kibana-services';
import { normalizeWazuhAlerts } from './data-source-engine';
import {
  ENSDataSourceProvider,
  ENSDataSourceProviderContext,
} from './provider';

export const createWazuhSearchSourceProvider = (
  indexPattern: any
): ENSDataSourceProvider => ({
  name: 'wazuh-search-source-provider',

  getEvents: async (context: ENSDataSourceProviderContext) => {
    const data = getPlugins().data;
    const searchSource = await data.search.searchSource.create();

    const filters = [
      ...(context.agentId
        ? [{ term: { 'agent.id': context.agentId } }]
        : []),
      ...(context.controlId
        ? [
            {
              bool: {
                should: [
                  { term: { 'data.control': context.controlId } },
                  { term: { 'data.ensfacil': context.controlId } },
                ],
                minimum_should_match: 1,
              },
            },
          ]
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
    ];

    const response = await searchSource
      .setParent(undefined)
      .setField('filter', filters)
      .setField('query', { query: '', language: 'kuery' })
      .setField('sort', [{ '@timestamp': { order: 'desc' } }])
      .setField('size', context.size || 1000)
      .setField('index', indexPattern)
      .fetch();

    return normalizeWazuhAlerts(response?.hits?.hits || []);
  },
});
