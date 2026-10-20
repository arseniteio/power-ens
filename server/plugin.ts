import type { CoreSetup, CoreStart, Logger, Plugin, PluginInitializerContext } from '../../../src/core/server';
import { registerConfigurationRoutes } from './routes/configuration';
import { registerEvaluationRoutes } from './routes/evaluation';
import { registerMaturityRoutes } from './routes/maturity';
import { registerAnnualReportRoutes } from './routes/annual-report';
import { createAnnualReportService, ENSAnnualReportService } from './lib/annual-report/annual-report-service';
import { createEvaluationService } from './lib/evaluation/evaluation-service';
import { createMaturityService, ENSMaturityService } from './lib/maturity/maturity-service';
import { createDailySnapshotJob } from './lib/maturity/daily-snapshot-job';

export interface EnsfacilServerSetupDeps {
  securityDashboards?: unknown;
}

export class EnsfacilServerPlugin implements Plugin<{}, {}, EnsfacilServerSetupDeps> {
  private readonly logger: Logger;
  private securityEnabled = false;
  private maturity?: ENSMaturityService;
  private annualReport?: ENSAnnualReportService;
  private job?: ReturnType<typeof createDailySnapshotJob>;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup, deps: EnsfacilServerSetupDeps): {} {
    const router = core.http.createRouter();
    this.securityEnabled = Boolean(deps.securityDashboards);
    const securityEnabled = this.securityEnabled;
    registerConfigurationRoutes(router, { logger: this.logger, securityEnabled });
    // One evaluation service for the evaluation and the maturity routes: the maturity reuses its rows.
    const service = createEvaluationService({ logger: this.logger, securityEnabled });
    this.maturity = createMaturityService({ logger: this.logger, evaluation: service });
    registerEvaluationRoutes(router, { logger: this.logger, securityEnabled, service, maturity: this.maturity });
    registerMaturityRoutes(router, { logger: this.logger, securityEnabled, maturity: this.maturity });
    this.annualReport = createAnnualReportService({ logger: this.logger, evaluation: service, maturity: this.maturity });
    registerAnnualReportRoutes(router, { logger: this.logger, securityEnabled, annualReport: this.annualReport });

    this.logger.debug('ENSFácil: server ready');

    return {};
  }

  public start(core: CoreStart): {} {
    // The day's maturity snapshot as the internal user at 02:30 local time, with an evaluation of its own.
    if (this.maturity) {
      this.job = createDailySnapshotJob({
        logger: this.logger,
        client: core.opensearch.client.asInternalUser,
        maturity: this.maturity,
        // The art. 32 freeze of a period that has just closed, after the day's snapshot.
        annualReport: this.annualReport,
        // Its own rows, 2 reads at a time, and no daily series: the job only needs today's result.
        createEvaluation: () => createEvaluationService({ logger: this.logger, securityEnabled: this.securityEnabled, maxConcurrentReads: 2, computeSeries: false }),
      });
      void this.job.start();
    }
    return {};
  }

  public stop(): void {
    this.job?.stop();
    this.maturity?.dispose();
  }
}
