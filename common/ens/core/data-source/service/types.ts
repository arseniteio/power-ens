import {
  ENSDataSourceProvider,
  ENSDataSourceProviderContext,
} from '../provider';
import { ENSNormalizedEvent } from '../types';

export interface ENSDataSourceServiceContext extends ENSDataSourceProviderContext {
  provider: ENSDataSourceProvider;
}

export interface ENSDataSourceServiceResult {
  providerName: string;
  events: ENSNormalizedEvent[];
  totalEvents: number;
}
