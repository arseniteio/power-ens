import { ENSNormalizedEvent } from './types';

export interface ENSDataSourceProviderContext {
  agentId?: string;
  controlId?: string;
  from?: string;
  to?: string;
  size?: number;
}

export interface ENSDataSourceProvider {
  name: string;
  getEvents: (
    context: ENSDataSourceProviderContext
  ) => Promise<ENSNormalizedEvent[]>;
}

export const createStaticDataSourceProvider = (
  events: ENSNormalizedEvent[]
): ENSDataSourceProvider => ({
  name: 'static-provider',
  getEvents: async context =>
    events.filter(event => {
      const sameAgent = !context.agentId || event.agentId === context.agentId;
      const sameControl = !context.controlId || event.controlId === context.controlId;

      return sameAgent && sameControl;
    }),
});
