// Link that opens Configuración on a tab, a control, an agent and a parameter:
//
//   ?tabView=configuration&configControl=op.acc.1                    → Controles, the control
//   ?tabView=configuration&configControl=op.acc.1&configParam=P-04   → … and the parameter
//   ?tabView=configuration&configAgent=024                           → Agentes, the agent
//   ?tabView=configuration&configAgent=024&configControl=op.acc.1&configParam=P-07
//                                                                    → … its control and parameter
//   ?tabView=configuration&configView=agentes | general              → the Agentes list or General
//
// `configView=sistemas` (1.2.0 links) still opens Agentes. Without React, to be tested.
import { withRouterSearch } from './router-search';
import { ENS_CONTROL_DETAIL_TAB_ID } from '../app/tabs';

export const CONFIGURATION_TAB_ID = 'configuration';

export type ENSConfigurationView = 'controls' | 'agents' | 'general';

export interface ENSConfigurationTarget {
  view: ENSConfigurationView;
  controlId?: string;
  agentId?: string;
  parameterId?: string;
}

const clean = (value?: string): string | undefined => {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
};

const viewOf = (agentId: string | undefined, configView: string | undefined): ENSConfigurationView => {
  if (agentId || configView === 'agentes' || configView === 'sistemas') return 'agents';
  return configView === 'general' ? 'general' : 'controls';
};

export const parseConfigurationTarget = (params: Record<string, string | undefined>): ENSConfigurationTarget => {
  const agentId = clean(params.configAgent);
  return {
    view: viewOf(agentId, clean(params.configView)),
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
  configView: target.view === 'general' ? 'general' : target.view === 'agents' && !target.agentId ? 'agentes' : undefined,
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
    ...configurationSearchChanges({ ...target, view: target.agentId ? 'agents' : 'controls' }),
  });

// --- desde el Detalle del control, ida y vuelta -----------------------------
//
// «Configurar este control» (y cada parámetro citado en una no conformidad)
// abre Configuración en ese control y deja en la URL el camino de vuelta:
// `control` (el detalle que estaba abierto) se conserva, la máquina elegida
// (`agentId`) también, y `configBack` dice a qué pestaña volver. Configuración
// pinta entonces «Volver al detalle de op.exp.6».
export const CONFIGURATION_BACK_PARAM = 'configBack';
export const CONTROL_DETAIL_TAB_ID = ENS_CONTROL_DETAIL_TAB_ID;

export interface ENSDetailConfigurationTarget {
  controlId: string;
  // La máquina elegida en el detalle, si la hay.
  agentId?: string;
  parameterId?: string;
  // With an agent chosen and per-system or per-platform parameters, the agent page opens; otherwise the control page.
  hasAgentLevelParameters?: boolean;
  // ¿Es `parameterId` de los que se declaran por sistema o plataforma?
  parameterIsAgentLevel?: boolean;
}

export const detailConfigurationTarget = (target: ENSDetailConfigurationTarget): Partial<ENSConfigurationTarget> => {
  const agentId = clean(target.agentId);
  const porMaquina = Boolean(agentId) && (target.parameterId ? Boolean(target.parameterIsAgentLevel) : Boolean(target.hasAgentLevelParameters));
  return porMaquina
    ? { view: 'agents', agentId, controlId: target.controlId, parameterId: clean(target.parameterId) }
    : { view: 'controls', controlId: target.controlId, parameterId: clean(target.parameterId) };
};

export const detailConfigurationChanges = (target: ENSDetailConfigurationTarget): Record<string, string | undefined> => ({
  ...configurationSearchChanges(detailConfigurationTarget(target)),
  control: clean(target.controlId),
  [CONFIGURATION_BACK_PARAM]: CONTROL_DETAIL_TAB_ID,
});

// El camino de vuelta, si Configuración se abrió desde un detalle.
export const parseConfigurationBack = (
  params: Record<string, string | undefined>
): { tabView: string; controlId: string } | undefined => {
  const back = clean(params[CONFIGURATION_BACK_PARAM]);
  const controlId = clean(params.control);
  return back === CONTROL_DETAIL_TAB_ID && controlId ? { tabView: back, controlId } : undefined;
};

// Los cambios de URL que vuelven al detalle: la pestaña, sin nada de
// Configuración; `control` y `agentId` siguen donde estaban.
export const configurationBackChanges = (back: { tabView: string }): Record<string, string | undefined> => ({
  tabView: back.tabView,
  configView: undefined,
  configAgent: undefined,
  configControl: undefined,
  configParam: undefined,
  [CONFIGURATION_BACK_PARAM]: undefined,
});
