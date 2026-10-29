import type { ENSAgentParameterValue, ENSSystemType } from '../../../agent-configuration';

// A built-in template of the engine catalog (`catalog/templates`).
export interface ENSPlatformSource {
  id: string;
  label: string;
  description: string;
  // `base`: the built-in template of its system type.
  kind: 'base' | 'addon';
  systemTypes: ENSSystemType[];
  // The controls it has a collector for: those it lists, even with no values of its own.
  onlyControls: string[];
  values: Record<string, Record<string, ENSAgentParameterValue>>;
}
