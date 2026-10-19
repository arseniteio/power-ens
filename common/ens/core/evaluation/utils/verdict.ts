import { ENSComplianceStatus } from '../types';

// The audit convention, in one function. If something is not configured or cannot be proven, NO CUMPLE: the burden of proof is the audited party's. It lives in one function because the rule is ONE.
// Untouched: `NO_APLICA`. A reinforcement above the active ENS level is a requirement that does not apply, not an unproven failure.
export const applyAuditVerdict = (
  measurement: ENSComplianceStatus
): ENSComplianceStatus =>
  measurement === 'NO_EVALUABLE' ? 'NO_CUMPLE' : measurement;

// Was the measure actually made? The opposite of `NO_EVALUABLE`; named apart because after the verdict a measured `NO_CUMPLE` and an unevidenced one are the same state. This boolean alone separates them downstream and yields `measuredRequirements`.
export const isMeasured = (measurement: ENSComplianceStatus): boolean =>
  measurement !== 'NO_EVALUABLE';

// The published verdict of a requirement. `evidenced === false` rules over the label: an unprovable requirement does not comply. The control evaluator answers the same whether it receives requirements converted by `evaluateRequirement` or the raw measure.
export const requirementVerdict = (requirement: {
  status: ENSComplianceStatus;
  evidenced?: boolean;
}): ENSComplianceStatus =>
  requirement.status === 'NO_APLICA'
    ? 'NO_APLICA'
    : requirement.evidenced === false
    ? 'NO_CUMPLE'
    : applyAuditVerdict(requirement.status);
