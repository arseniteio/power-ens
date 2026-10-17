import type { DataPublicPluginStart } from '../../../src/plugins/data/public';
import type { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';
import type { HomeSetupLike } from './home-card';

export interface EnsfacilSetupDeps {
  home?: HomeSetupLike;
}

export interface EnsfacilStartDeps {
  data: DataPublicPluginStart;
  navigation: NavigationPublicPluginStart;
}
