import type {
  ENSAgentParameterValue,
  ENSSystemType,
} from '../../../agent-configuration';

// Only grounded values (seed block, runbook example or lab without installation data): the rest stays unset.
export interface ENSPlatformSource {
  // The 1.2.0 template id: stored in 1.2.0 documents and reused as the built-in template id.
  id: string;
  label: string;
  description: string;
  // `base`: the built-in template of its system type. `addon`: an alternative offered only where it has values.
  kind: 'base' | 'addon';
  systemTypes: ENSSystemType[];
  // Controls that have a collector on this platform; the rest are not measured there.
  onlyControls?: string[];
  sources: string[];
  values: Record<string, Record<string, ENSAgentParameterValue>>;
}
