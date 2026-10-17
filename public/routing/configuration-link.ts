// Enlace que abre Configuración en un control, y opcionalmente en un agente y
// un parámetro:
//
//   ?tabView=configuration&configControl=op.acc.1                    → Organización, el control
//   ?tabView=configuration&configControl=op.acc.1&configParam=P-04   → … y el parámetro
//   ?tabView=configuration&configAgent=024                           → Sistemas, el agente
//   ?tabView=configuration&configAgent=024&configControl=op.acc.1&configParam=P-07
//                                                                    → … su control y su parámetro
//   ?tabView=configuration&configView=sistemas                        → la lista de sistemas
//
// Lo usa el Detalle del control («Configurar este control») y la propia
// pantalla al navegar, así que «atrás» en el navegador vuelve a donde se estaba.
// Sin React, para poder probarlo.
import { withRouterSearch } from './router-search';

export const CONFIGURATION_TAB_ID = 'configuration';

export interface ENSConfigurationTarget {
  view: 'organisation' | 'systems';
  controlId?: string;
  agentId?: string;
  parameterId?: string;
}

const clean = (value?: string): string | undefined => {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
};

export const parseConfigurationTarget = (params: Record<string, string | undefined>): ENSConfigurationTarget => {
  const agentId = clean(params.configAgent);
  return {
    view: agentId || clean(params.configView) === 'sistemas' ? 'systems' : 'organisation',
    controlId: clean(params.configControl),
    agentId,
    parameterId: clean(params.configParam),
  };
};

// Los cambios de URL que llevan a `target` (para `useSetRouterSearch`).
export const configurationSearchChanges = (
  target: Partial<ENSConfigurationTarget>
): Record<string, string | undefined> => ({
  tabView: CONFIGURATION_TAB_ID,
  configView: target.view === 'systems' && !target.agentId ? 'sistemas' : undefined,
  configAgent: clean(target.agentId),
  configControl: clean(target.controlId),
  configParam: clean(target.parameterId),
});

// La URL (solo la consulta) que abre Configuración en `target`, desde cualquier
// pestaña. Conserva lo demás que hubiera en `search` (la máquina elegida).
export const buildConfigurationSearch = (
  target: { controlId?: string; agentId?: string; parameterId?: string },
  search: string = ''
): string =>
  withRouterSearch(search, {
    control: undefined,
    ...configurationSearchChanges({ ...target, view: target.agentId ? 'systems' : 'organisation' }),
  });
