import type { AppMountParameters, CoreSetup, CoreStart, Plugin } from '../../../src/core/public';
import {
  POWER_ENS_APP_CATEGORY,
  POWER_ENS_APP_ORDER,
  POWER_ENS_APP_TITLE,
  POWER_ENS_PLUGIN_ID,
} from '../common/constants';
import logo from './assets/power-ens-logo.png';
import { registerHomeCard } from './home-card';
import { setServices } from './services';
import { mountOnWazuhPages } from './wazuh-pages/mount-on-wazuh-pages';
import type { PowerEnsSetupDeps, PowerEnsStartDeps } from './types';

export class PowerEnsPlugin implements Plugin<{}, {}, PowerEnsSetupDeps, PowerEnsStartDeps> {
  public setup(core: CoreSetup<PowerEnsStartDeps>, deps: PowerEnsSetupDeps): {} {
    core.application.register({
      id: POWER_ENS_PLUGIN_ID,
      title: POWER_ENS_APP_TITLE,
      order: POWER_ENS_APP_ORDER,
      category: POWER_ENS_APP_CATEGORY,
      icon: logo,
      mount: async (params: AppMountParameters) => {
        const { renderApp } = await import('./application');
        const [coreStart, depsStart] = await core.getStartServices();

        return renderApp(coreStart, depsStart, params);
      },
    });

    registerHomeCard(deps?.home, logo);

    return {};
  }

  public start(core: CoreStart, deps: PowerEnsStartDeps): {} {
    setServices(core, deps);
    mountOnWazuhPages(core);

    return {};
  }

  public stop(): void {}
}
