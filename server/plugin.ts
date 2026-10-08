import type { CoreSetup, Logger, Plugin, PluginInitializerContext } from '../../../src/core/server';
import { registerConfigurationRoutes } from './routes/configuration';

export interface EnsfacilServerSetupDeps {
  securityDashboards?: unknown;
}

export class EnsfacilServerPlugin implements Plugin<{}, {}, EnsfacilServerSetupDeps> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup, deps: EnsfacilServerSetupDeps): {} {
    const router = core.http.createRouter();
    registerConfigurationRoutes(router, {
      logger: this.logger,
      securityEnabled: Boolean(deps.securityDashboards),
    });

    this.logger.debug('ENSFácil: servidor preparado');

    return {};
  }

  public start(): {} {
    return {};
  }

  public stop(): void {}
}
