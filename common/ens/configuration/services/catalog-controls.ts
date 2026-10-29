import { getENSCatalogControl } from '../../catalog';

// Controls outside the catalog (left by older versions) are dropped: the engine would ignore them anyway.
export const withCatalogControls = <T extends { controls?: Array<{ controlId?: string }> }>(configuration: T): T =>
  Array.isArray(configuration.controls)
    ? { ...configuration, controls: configuration.controls.filter(control => !!getENSCatalogControl(String(control?.controlId))) }
    : configuration;
