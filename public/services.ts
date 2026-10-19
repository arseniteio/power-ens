// Servicios del núcleo del dashboard, guardados al arrancar el plugin. Es lo
// que en la versión integrada daba `kibana-services` de Wazuh.
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

const disponible = <T>(valor: T | undefined, nombre: string): T => {
  if (!valor) {
    throw new Error(`ENSFácil: ${nombre} todavía no está disponible`);
  }

  return valor;
};

export const getCore = (): CoreStart => disponible(core, 'el núcleo del dashboard');
export const getHttp = () => getCore().http;
export const getData = () => disponible(plugins, 'los plugins del dashboard').data;
export const getNavigation = () => disponible(plugins, 'los plugins del dashboard').navigation;
