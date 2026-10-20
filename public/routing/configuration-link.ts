// Without React, so the links are tested; `configView=sistemas` keeps 1.2.0 links working.
import { withRouterSearch } from './router-search';
import { ENS_CONTROL_DETAIL_TAB_ID } from '../app/tabs';

export const CONFIGURATION_TAB_ID = 'configuration';

export type ENSConfigurationView = 'controls' | 'agents' | 'general';

export interface ENSConfigurationTarget {
  view: ENSConfigurationView;
  controlId?: string;
  agentId?: string;
  parameterId?: string;
  // An organisation data item (General view).
  itemId?: string;
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
    itemId: clean(params.configItem),
  };
};

export const configurationSearchChanges = (
  target: Partial<ENSConfigurationTarget>
): Record<string, string | undefined> => ({
  tabView: CONFIGURATION_TAB_ID,
  configView: target.view === 'general' ? 'general' : target.view === 'agents' && !target.agentId ? 'agentes' : undefined,
  configAgent: clean(target.agentId),
  configControl: clean(target.controlId),
  configParam: clean(target.parameterId),
  configItem: target.view === 'general' ? clean(target.itemId) : undefined,
});

// Keeps whatever else is in `search` (the chosen machine).
export const buildConfigurationSearch = (
  target: { controlId?: string; agentId?: string; parameterId?: string },
  search: string = ''
): string =>
  withRouterSearch(search, {
    control: undefined,
    ...configurationSearchChanges({ ...target, view: target.agentId ? 'agents' : 'controls' }),
  });

// From the control detail, round trip: 'Configurar este control' opens Configuración with `control` and `agentId` kept in the URL and `configBack` naming the tab to return to.
export const CONFIGURATION_BACK_PARAM = 'configBack';
export const CONTROL_DETAIL_TAB_ID = ENS_CONTROL_DETAIL_TAB_ID;

export interface ENSDetailConfigurationTarget {
  controlId: string;
  agentId?: string;
  parameterId?: string;
  // With an agent chosen and per-system or per-platform parameters, the agent page opens; otherwise the control page.
  hasAgentLevelParameters?: boolean;
  parameterIsAgentLevel?: boolean;
}

export const detailConfigurationTarget = (target: ENSDetailConfigurationTarget): Partial<ENSConfigurationTarget> => {
  const agentId = clean(target.agentId);
  const byMachine = Boolean(agentId) && (target.parameterId ? Boolean(target.parameterIsAgentLevel) : Boolean(target.hasAgentLevelParameters));
  return byMachine
    ? { view: 'agents', agentId, controlId: target.controlId, parameterId: clean(target.parameterId) }
    : { view: 'controls', controlId: target.controlId, parameterId: clean(target.parameterId) };
};

export const detailConfigurationChanges = (target: ENSDetailConfigurationTarget): Record<string, string | undefined> => ({
  ...configurationSearchChanges(detailConfigurationTarget(target)),
  control: clean(target.controlId),
  [CONFIGURATION_BACK_PARAM]: CONTROL_DETAIL_TAB_ID,
});

export const parseConfigurationBack = (
  params: Record<string, string | undefined>
): { tabView: string; controlId: string } | undefined => {
  const back = clean(params[CONFIGURATION_BACK_PARAM]);
  const controlId = clean(params.control);
  return back === CONTROL_DETAIL_TAB_ID && controlId ? { tabView: back, controlId } : undefined;
};

export const configurationBackChanges = (back: { tabView: string }): Record<string, string | undefined> => ({
  tabView: back.tabView,
  configView: undefined,
  configAgent: undefined,
  configControl: undefined,
  configParam: undefined,
  configItem: undefined,
  [CONFIGURATION_BACK_PARAM]: undefined,
});
