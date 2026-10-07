import type { PluginInitializerContext } from '../../../src/core/server';
import { EnsfacilServerPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new EnsfacilServerPlugin(initializerContext);
}
