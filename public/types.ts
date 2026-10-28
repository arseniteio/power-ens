import type { DataPublicPluginStart } from '../../../src/plugins/data/public';
import type { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';
import type { HomeSetupLike } from './home-card';

export interface PowerEnsSetupDeps {
  home?: HomeSetupLike;
}

export interface PowerEnsStartDeps {
  data: DataPublicPluginStart;
  navigation: NavigationPublicPluginStart;
}
