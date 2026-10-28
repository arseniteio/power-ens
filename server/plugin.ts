import type { CoreSetup, Logger, Plugin, PluginInitializerContext } from '../../../src/core/server';
import { registerConfigurationRoutes } from './routes/configuration';
import { registerEvaluationRoutes } from './routes/evaluation';

interface PowerEnsServerSetupDeps {
  securityDashboards?: unknown;
}

export class PowerEnsServerPlugin implements Plugin<{}, {}, PowerEnsServerSetupDeps> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup, deps: PowerEnsServerSetupDeps): {} {
    const router = core.http.createRouter();
    const securityEnabled = Boolean(deps.securityDashboards);

    registerConfigurationRoutes(router, { logger: this.logger, securityEnabled });
    registerEvaluationRoutes(router, { logger: this.logger, securityEnabled });

    return {};
  }

  public start(): {} {
    return {};
  }

  public stop(): void {}
}
