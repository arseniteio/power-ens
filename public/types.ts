import type { DataPublicPluginStart } from '../../../src/plugins/data/public';
import type { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface EnsfacilSetupDeps {}

export interface EnsfacilStartDeps {
  data: DataPublicPluginStart;
  navigation: NavigationPublicPluginStart;
}
