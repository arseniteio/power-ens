import {
  ENSDataSourceServiceContext,
  ENSDataSourceServiceResult,
} from './types';

export const getENSNormalizedEventsFromProvider = async (
  context: ENSDataSourceServiceContext
): Promise<ENSDataSourceServiceResult> => {
  const { provider, ...providerContext } = context;

  const events = await provider.getEvents(providerContext);

  return {
    providerName: provider.name,
    events,
    totalEvents: events.length,
  };
};
