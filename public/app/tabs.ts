// App tabs, with the same ids and names as the integrated version: links with `tabView=` keep working.

interface ENSTab {
  id: string;
  name: string;
  // Configuración loads on its own; the others wait for configuration and scope.
  withBootstrap: boolean;
}

const ENS_REQUIREMENTS_TAB_ID = 'controls';
const ENS_EVENTS_TAB_ID = 'events';
const ENS_OVERVIEW_TAB_ID = 'overview';
export const ENS_CONTROL_DETAIL_TAB_ID = 'plugins';

export const ENS_TABS: ENSTab[] = [
  { id: 'dashboard', name: 'Panel', withBootstrap: true },
  { id: ENS_OVERVIEW_TAB_ID, name: 'Vista general', withBootstrap: true },
  { id: 'configuration', name: 'Configuración', withBootstrap: false },
  { id: ENS_REQUIREMENTS_TAB_ID, name: 'Controles', withBootstrap: true },
  { id: ENS_CONTROL_DETAIL_TAB_ID, name: 'Detalle del control', withBootstrap: true },
  { id: 'ens-informes', name: 'Informes', withBootstrap: true },
  { id: 'evidences', name: 'Evidencias', withBootstrap: true },
  { id: ENS_EVENTS_TAB_ID, name: 'Eventos', withBootstrap: true },
];

export const resolveTab = (tabView?: string): ENSTab =>
  ENS_TABS.find(tab => tab.id === tabView) || ENS_TABS[0];
