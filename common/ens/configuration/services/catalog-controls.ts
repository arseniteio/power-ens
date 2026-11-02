import { getENSCatalogControl } from '../../catalog';

export const withCatalogControls = <T extends { controls?: Array<{ controlId?: string }> }>(configuration: T): T =>
  Array.isArray(configuration.controls)
    ? { ...configuration, controls: configuration.controls.filter(control => !!getENSCatalogControl(String(control?.controlId))) }
    : configuration;
