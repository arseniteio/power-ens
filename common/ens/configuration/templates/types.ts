import type {
  ENSAgentParameterValue,
  ENSSystemType,
} from '../../../agent-configuration';

// Grounded values of one platform across controls: the source of the built-in templates of each control.
// Every value comes from a seed block example, a runbook `.env.example` or configuration template, or a lab
// value without what belongs to another platform or installation; what cannot be grounded stays unset.
// `tests/agent-configuration-model.test.ts` checks classes and validity.
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
