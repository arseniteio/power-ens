import type { CoreSetup, Logger, Plugin, PluginInitializerContext } from '../../../src/core/server';
import { registerConfigurationRoutes } from './routes/configuration';
import { registerEvaluationRoutes } from './routes/evaluation';
import { registerExclusionRoutes } from './routes/exclusions';
import { registerHostRoutes } from './routes/hosts';
import { registerMaturityRoutes } from './routes/maturity';
import { registerProfileRoutes } from './routes/profiles';

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
    registerExclusionRoutes(router, { logger: this.logger, securityEnabled });
    registerProfileRoutes(router, { logger: this.logger, securityEnabled });
    registerHostRoutes(router, { logger: this.logger });
    registerMaturityRoutes(router, { logger: this.logger });

    return {};
  }

  public start(): {} {
    return {};
  }

  public stop(): void {}
}
