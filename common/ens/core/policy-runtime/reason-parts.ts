// `reasonParts` describe ONE `reason`: whoever replaces a decision's reason must drop the parts, or
// the screen would show parts of a reason that is no longer the decision's.
import type { ENSPolicyDecision } from './types';

export const withReplacedReason = (
  decision: ENSPolicyDecision,
  changes: Partial<ENSPolicyDecision> & { reason: string }
): ENSPolicyDecision => {
  const { reasonParts, ...rest } = decision;
  void reasonParts;
  return { ...rest, ...changes };
};
