import type { CoreSetup, Logger, Plugin, PluginInitializerContext } from '../../../src/core/server';
import { registerConfigurationRoutes } from './routes/configuration';
import { registerEvaluationRoutes } from './routes/evaluation';
import { registerMaturityRoutes } from './routes/maturity';
import { createEvaluationService } from './lib/evaluation/evaluation-service';
import { createMaturityService } from './lib/maturity/maturity-service';

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
    const securityEnabled = Boolean(deps.securityDashboards);
    // One evaluation service for the evaluation and the maturity routes: the maturity reuses its rows.
    const service = createEvaluationService({ logger: this.logger, securityEnabled });
    const maturity = createMaturityService({ logger: this.logger, evaluation: service });
    registerEvaluationRoutes(router, { logger: this.logger, securityEnabled, service, maturity });
    registerMaturityRoutes(router, { logger: this.logger, securityEnabled, maturity });

    this.logger.debug('ENSFácil: server ready');

    return {};
  }

  public start(): {} {
    return {};
  }

  public stop(): void {}
}
