import { ENS_CONTROL_DETAIL_TAB_ID } from '../app/tabs';

const CONFIGURATION_TAB_ID = 'configuration';

export type ENSConfigurationView = 'status' | 'machines' | 'profiles' | 'pending' | 'organization' | 'general' | 'controls' | 'agents';

export interface ENSConfigurationTarget {
  view: ENSConfigurationView;
  controlId?: string;
  agentId?: string;
  parameterId?: string;
  itemId?: string;
  profileId?: string;
  hostId?: string;
  machineFilter?: string;
}

const clean = (value?: string): string | undefined => {
  const text = String(value ?? '').trim();
  return text ? text : undefined;
};

const VIEW_PARAMS: Record<string, ENSConfigurationView> = {
  estado: 'status',
  maquinas: 'machines',
  perfiles: 'profiles',
  pendiente: 'pending',
  organizacion: 'organization',
  general: 'general',
  plantillas: 'controls',
  agentes: 'machines',
  sistemas: 'machines',
};

const viewOf = (agentId: string | undefined, controlId: string | undefined, configView: string | undefined): ENSConfigurationView => {
  if (agentId) return 'agents';
  if (configView && VIEW_PARAMS[configView]) return VIEW_PARAMS[configView];
  return controlId ? 'controls' : 'status';
};

export const parseConfigurationTarget = (params: Record<string, string | undefined>): ENSConfigurationTarget => {
  const agentId = clean(params.configAgent);
  const controlId = clean(params.configControl);
  return {
    view: viewOf(agentId, controlId, clean(params.configView)),
    controlId,
    agentId,
    parameterId: clean(params.configParam),
    itemId: clean(params.configItem),
    profileId: clean(params.configProfile),
    hostId: clean(params.configHost),
    machineFilter: clean(params.configFilter),
  };
};

const viewParam = (target: Partial<ENSConfigurationTarget>): string | undefined => {
  switch (target.view) {
    case 'machines':
      return 'maquinas';
    case 'profiles':
      return 'perfiles';
    case 'pending':
      return 'pendiente';
    case 'organization':
      return 'organizacion';
    case 'general':
      return 'general';
    case 'controls':
      return target.controlId ? undefined : 'plantillas';
    case 'agents':
      return target.agentId ? undefined : 'maquinas';
    default:
      return undefined;
  }
};

export const configurationSearchChanges = (
  target: Partial<ENSConfigurationTarget>
): Record<string, string | undefined> => ({
  tabView: CONFIGURATION_TAB_ID,
  configView: viewParam(target),
  configAgent: clean(target.agentId),
  configControl: clean(target.controlId),
  configParam: clean(target.parameterId),
  configItem: target.view === 'organization' ? clean(target.itemId) : undefined,
  configProfile: target.view === 'profiles' ? clean(target.profileId) : undefined,
  configHost: target.view === 'machines' ? clean(target.hostId) : undefined,
  configFilter: target.view === 'machines' ? clean(target.machineFilter) : undefined,
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
  configProfile: undefined,
  configHost: undefined,
  configFilter: undefined,
  [CONFIGURATION_BACK_PARAM]: undefined,
});
