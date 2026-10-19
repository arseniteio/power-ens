// Dashboard core services, kept at plugin start. This is what Wazuh's `kibana-services` gave the integrated version.
import type { CoreStart } from '../../../src/core/public';
import type { EnsfacilStartDeps } from './types';
import { setENSConfigurationHttp } from '../common/ens/configuration/services/configuration-http-client';

let core: CoreStart | undefined;
let plugins: EnsfacilStartDeps | undefined;

export const setServices = (coreStart: CoreStart, deps: EnsfacilStartDeps): void => {
  core = coreStart;
  plugins = deps;
  setENSConfigurationHttp(() => getHttp());
};

const available = <T>(value: T | undefined, name: string): T => {
  if (!value) {
    throw new Error(`ENSFácil: ${name} todavía no está disponible`);
  }

  return value;
};

export const getCore = (): CoreStart => available(core, 'el núcleo del dashboard');
export const getHttp = () => getCore().http;
export const getData = () => available(plugins, 'los plugins del dashboard').data;
export const getNavigation = () => available(plugins, 'los plugins del dashboard').navigation;
