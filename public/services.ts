import type { CoreStart } from '../../../src/core/public';
import type { PowerEnsStartDeps } from './types';
import { setENSConfigurationHttp } from '../common/ens/configuration/services/configuration-http-client';

let core: CoreStart | undefined;
let plugins: PowerEnsStartDeps | undefined;

export const setServices = (coreStart: CoreStart, deps: PowerEnsStartDeps): void => {
  core = coreStart;
  plugins = deps;
  setENSConfigurationHttp(() => getHttp());
};

const available = <T>(value: T | undefined, name: string): T => {
  if (!value) {
    throw new Error(`Power ENS: ${name} todavía no está disponible`);
  }

  return value;
};

export const getCore = (): CoreStart => available(core, 'el núcleo del dashboard');
export const getHttp = () => getCore().http;
export const getData = () => available(plugins, 'los plugins del dashboard').data;
export const getNavigation = () => available(plugins, 'los plugins del dashboard').navigation;
