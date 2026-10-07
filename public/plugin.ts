import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '../../../src/core/public';
import {
  ENSFACIL_APP_CATEGORY,
  ENSFACIL_APP_ORDER,
  ENSFACIL_APP_TITLE,
  ENSFACIL_PLUGIN_ID,
} from '../common/constants';
import ensLogo from './assets/ens-logo.png';
import { setServices } from './services';
import type { EnsfacilSetupDeps, EnsfacilStartDeps } from './types';

export class EnsfacilPlugin implements Plugin<{}, {}, EnsfacilSetupDeps, EnsfacilStartDeps> {
  public setup(core: CoreSetup<EnsfacilStartDeps>): {} {
    core.application.register({
      id: ENSFACIL_PLUGIN_ID,
      title: ENSFACIL_APP_TITLE,
      order: ENSFACIL_APP_ORDER,
      category: ENSFACIL_APP_CATEGORY,
      euiIconType: ensLogo,
      mount: async (params: AppMountParameters) => {
        const { renderApp } = await import('./application');
        const [coreStart, depsStart] = await core.getStartServices();

        return renderApp(coreStart, depsStart, params);
      },
    });

    return {};
  }

  public start(core: CoreStart, deps: EnsfacilStartDeps): {} {
    setServices(core, deps);

    return {};
  }

  public stop(): void {}
}
