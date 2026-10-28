import type { PluginInitializerContext } from '../../../src/core/server';
import { PowerEnsServerPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new PowerEnsServerPlugin(initializerContext);
}
