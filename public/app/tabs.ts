// Las pestañas de la app, con los mismos ids y nombres que la versión
// integrada: los enlaces con `tabView=` siguen valiendo.

export interface ENSTab {
  id: string;
  name: string;
  // Configuración se carga sola; las demás esperan a configuración y alcance.
  withBootstrap: boolean;
}

export const ENS_REQUIREMENTS_TAB_ID = 'controls';
export const ENS_EVENTS_TAB_ID = 'events';
export const ENS_OVERVIEW_TAB_ID = 'overview';
export const ENS_CONTROL_DETAIL_TAB_ID = 'plugins';

export const ENS_TABS: ENSTab[] = [
  { id: 'dashboard', name: 'Panel', withBootstrap: true },
  { id: 'configuration', name: 'Configuración', withBootstrap: false },
  { id: ENS_REQUIREMENTS_TAB_ID, name: 'Controles', withBootstrap: true },
  { id: ENS_CONTROL_DETAIL_TAB_ID, name: 'Detalle del control', withBootstrap: true },
  { id: 'ens-informes', name: 'Informes', withBootstrap: true },
  { id: 'evidences', name: 'Evidencias', withBootstrap: true },
  { id: ENS_EVENTS_TAB_ID, name: 'Eventos', withBootstrap: true },
];

export const resolveTab = (tabView?: string): ENSTab =>
  ENS_TABS.find(tab => tab.id === tabView) || ENS_TABS[0];
