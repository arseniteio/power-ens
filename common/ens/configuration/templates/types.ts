import type { ENSAgentParameterValue, ENSSystemType } from '../../../agent-configuration';

export interface ENSPlatformSource {
  id: string;
  label: string;
  description: string;
  kind: 'base' | 'addon';
  systemTypes: ENSSystemType[];
  onlyControls: string[];
  values: Record<string, Record<string, ENSAgentParameterValue>>;
}
