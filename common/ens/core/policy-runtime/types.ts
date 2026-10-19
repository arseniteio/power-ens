import { ENSLevel } from '../../configuration/types';
import { ENSControlDefinition } from '../../catalog';
import { ENSControlConfiguration } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { ENSEvidenceResolved } from '../evidence/types';
import { ENSComplianceStatus, ENSGapCause } from '../evaluation/types';

export type ENSPolicyRuleType =
  | 'MAX_AGE'
  | 'MIN_RETENTION'
  | 'COVERAGE_REQUIRED'
  | 'WHITELIST'
  | 'CONDITIONAL_REQUIRED'
  | 'PATH_MATCH'
  | 'TOOL_MATCH';

export type ENSRuntimeVariableValue =
  | string
  | number
  | boolean
  | string[]
  | number[]
  | undefined;

export interface ENSPolicyContext {
  control: ENSControlDefinition;
  configuration?: ENSControlConfiguration;
  level: ENSLevel;
  events: ENSNormalizedEvent[];
  evidences: ENSEvidenceResolved[];
  // Instant against which an evidence's age is measured; defaults to now. A parameter because the
  // daily series evaluates the engine at a past date.
  now?: Date;
}

export interface ENSPolicyEvaluatorResult {
  decisions: ENSPolicyDecision[];
  runtimeVariables: ENSRuntimeVariable[];
}

export type ENSPolicyEvaluator = (
  context: ENSPolicyContext
) => ENSPolicyEvaluatorResult;

export interface ENSAppliedParameter {
  id: string;
  name: string;
  value?: ENSRuntimeVariableValue;
  required: boolean;
}

export interface ENSRuntimeVariable {
  name: string;
  value: ENSRuntimeVariableValue;
  parameterIds: string[];
  evidenceIds: string[];
  eventIds: string[];
  description: string;
}

export interface ENSPolicyTrace {
  ruleId: string;
  ruleType: ENSPolicyRuleType;
  expression: string;
  expected: string;
  actual: string;
  result: boolean;
}

// One part of a composite reason: what ONE evidence said. `reason` is the join of the parts (`<ID>
// <STATUS>: <text>` separated by ` | `) and does not change; the parts are for the screen (` | `
// also appears inside values).
export interface ENSReasonPart {
  evidenceId: string;
  status: ENSComplianceStatus;
  // The evidence's reason, without the «Además:» tail.
  text: string;
  cause?: ENSGapCause;
  // What `combineMeasurements` adds after «Además:» (other axes that also fail).
  secondary?: string[];
}

export interface ENSPolicyDecision {
  policyId: string;
  requirementId: string;
  status: ENSComplianceStatus;
  parameterIds: string[];
  evidenceIds: string[];
  eventIds: string[];
  runtimeVariables: string[];
  trace: ENSPolicyTrace;
  reason: string;
  // Optional: `reason` split by evidence (see `ENSReasonPart`).
  reasonParts?: ENSReasonPart[];
  // Only with `status` NO_EVALUABLE: WHY the policy could not measure; same as
  // `ENSEvidenceResolved.gapCause`, carried by the bridge to the evidences the decision fills.
  cause?: ENSGapCause;
  // Documentary accreditation: the policy judged a screen DECLARATION with its validity (unexpired
  // contract, plan within its periodicity), not a machine measurement.
  // Counts only with `status` CUMPLE: the requirement complies marked `attested`, never shown as
  // measured. Any other status ignores it.
  // A measurement against always wins: if any evidence of the requirement or another decision for
  // it is NO_CUMPLE or PARCIAL, the requirement is NO_CUMPLE without the mark (see
  // `requirement-evaluator.ts`).
  // A policy should emit ONE decision per requirement; if several, the evaluator reads the
  // accredited one before the first (unless that is NO_APLICA).
  // An accredited decision does NOT fill evidences in the bridge (`policy-evidence-bridge.ts`): a
  // document measures none.
  attested?: boolean;
  // Decided FROM THE CONFIGURATION, not from facts: a table declared on screen with its validity,
  // judged against the evaluation date. Valid in ANY status.
  // Why: a stopped collector (`markPolicyRuntimeStale`) or a scope without machines
  // (`markPolicyRuntimeUnmatchedScope`) void the decisions that come from FACTS, not those from the
  // configuration; both keep decisions with this mark.
  // The report does not present them as measurements: a documentary NO_CUMPLE is a document to
  // renew (`documental` on the requirement and the nonconformity).
  documental?: boolean;
}

export interface ENSPolicyRuntimeResult {
  controlId: string;
  policyId: string;
  evaluatedAt: string;
  decisions: ENSPolicyDecision[];
  appliedParameters: ENSAppliedParameter[];
  runtimeVariables: ENSRuntimeVariable[];
}

export interface ENSPolicyRequirementDefinition {
  requirementId: string;
  levels: ENSLevel[];
  parameterIds: string[];
  evidenceIds: string[];
  ruleType: ENSPolicyRuleType;
}

export interface ENSPolicyDefinition {
  id: string;
  controlId: string;
  version: string;
  requirements: ENSPolicyRequirementDefinition[];
  evaluator?: ENSPolicyEvaluator;
}
