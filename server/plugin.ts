import type { CoreSetup, Logger, Plugin, PluginInitializerContext } from '../../../src/core/server';

export interface EnsfacilServerSetupDeps {
  securityDashboards?: unknown;
}

export class EnsfacilServerPlugin implements Plugin<{}, {}, EnsfacilServerSetupDeps> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(_core: CoreSetup, _deps: EnsfacilServerSetupDeps): {} {
    this.logger.debug('ENSFácil: servidor preparado');

    return {};
  }

  public start(): {} {
    return {};
  }

  public stop(): void {}
}
