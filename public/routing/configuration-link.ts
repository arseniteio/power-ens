import { ENS_CONTROL_DETAIL_TAB_ID } from '../app/tabs';

const CONFIGURATION_TAB_ID = 'configuration';

export type ENSConfigurationView = 'controls' | 'agents' | 'general';

export interface ENSConfigurationTarget {
  view: ENSConfigurationView;
  controlId?: string;
  agentId?: string;
  parameterId?: string;
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

const CONFIGURATION_BACK_PARAM = 'configBack';
const CONTROL_DETAIL_TAB_ID = ENS_CONTROL_DETAIL_TAB_ID;

interface ENSDetailConfigurationTarget {
  controlId: string;
  agentId?: string;
  parameterId?: string;
  hasAgentLevelParameters?: boolean;
  parameterIsAgentLevel?: boolean;
}

const detailConfigurationTarget = (target: ENSDetailConfigurationTarget): Partial<ENSConfigurationTarget> => {
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
