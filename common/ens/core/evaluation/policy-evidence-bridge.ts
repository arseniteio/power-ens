// Evidences a policy declares it measured, resolved by it. Without this, op.acc.3 showed a 100 % CUMPLE control with "0 of 7 evidences comply": its REQUIREMENTS are decided by a policy reading raw facts,
// while its EVIDENCES wait for an `evidence_state` its agent never emits and have no `judgment` to derive it from; they could never leave NO_EVALUABLE.
// This module invents no measure: the policy ALREADY measured and its decisions declare `evidenceIds`; the result is only carried to the layer that shows it. An evidence the policy does not name stays as it was.
// It NEVER overwrites a measure: an evidence with its own verdict (from the agent or a primitive) rules. Replacing an observed NO_CUMPLE with a policy CUMPLE would be the false CUMPLE this removes.
import { ENSEvidenceResolved } from '../evidence/types';
import { ENSPolicyDecision } from '../policy-runtime/types';

// Only what the classic model could not resolve is filled. A `NO_APLICA` is a level decision and is not touched.
const FILLABLE = ['NO_EVALUABLE'];

export const applyPolicyDecisionsToEvidences = (
  evidences: ENSEvidenceResolved[],
  decisions: ENSPolicyDecision[] = [],
  // Catalog requirements, to know which evidences prove each.
  requirements: { id: string; evidenceIds: string[] }[] = [],
  // Whether NO fact of the control arrived from this machine. See below.
  nothingReceived = false
): ENSEvidenceResolved[] => {
  if (!decisions.length) {
    return evidences;
  }

  // A DECISION THAT DOES NOT NAME ITS EVIDENCES INHERITS THE REQUIREMENT'S. That a policy decides a requirement means it measured what proves it; this keeps both layers consistent
  // even when the policy author forgot to fill the field (op.acc.3: only the op.acc.3.2 decision declared `evidenceIds`).
  const requirementEvidences = new Map(
    requirements.map(requirement => [requirement.id, requirement.evidenceIds || []])
  );

  const evidencesOf = (decision: ENSPolicyDecision): string[] =>
    decision.evidenceIds?.length
      ? decision.evidenceIds
      : requirementEvidences.get(decision.requirementId) || [];

  // An evidence may appear in several decisions; the WORST wins, as in consolidation across machines. Exception: what is NAMED rules over an INHERITED GAP: a NO_EVALUABLE another decision only inherits from its requirement does not overwrite it.
  // An inherited NO_CUMPLE or PARCIAL DO rule over the named if they are worse.
  const worstByEvidence = new Map<string, ENSPolicyDecision>();
  const worstInheritedByEvidence = new Map<string, ENSPolicyDecision>();

  const severity = (statusValue: string): number =>
    statusValue === 'NO_CUMPLE' ? 3 : statusValue === 'PARCIAL' ? 2 : statusValue === 'NO_EVALUABLE' ? 1 : 0;

  decisions.forEach(decision => {
    // A DOCUMENTARY ACCREDITATION MEASURES NO EVIDENCE. A CUMPLE with `attested` says a DECLARATION suffices for the requirement, not that the policy measured its evidences; filling an unmeasured evidence with it
    // would make another requirement relying on that evidence come out as a "measured" CUMPLE over someone else's document. The evidence stays as it was. An accredited decision in any other state accredits nothing and counts here as any other.
    if (decision.attested && decision.status === 'CUMPLE') {
      return;
    }

    const target = decision.evidenceIds?.length
      ? worstByEvidence
      : worstInheritedByEvidence;

    evidencesOf(decision).forEach(evidenceId => {
      const actual = target.get(evidenceId);

      if (!actual || severity(decision.status) > severity(actual.status)) {
        target.set(evidenceId, decision);
      }
    });
  });

  worstInheritedByEvidence.forEach((decision, evidenceId) => {
    const named = worstByEvidence.get(evidenceId);

    if (
      !named ||
      (severity(decision.status) >= severity('PARCIAL') &&
        severity(decision.status) > severity(named.status))
    ) {
      worstByEvidence.set(evidenceId, decision);
    }
  });

  if (!worstByEvidence.size) {
    return evidences;
  }

  return evidences.map(evidence => {
    const decision = worstByEvidence.get(evidence.id);

    if (!decision) {
      return evidence;
    }

    if (!FILLABLE.includes(evidence.status)) {
      return evidence;
    }

    // If the policy could not measure it either, the cause is the one IT declares (the decision naming only this evidence, else the worst's; without a declared cause the evidence's own stays).
    // Exception, as in `resolveGapCause`: if nothing arrived from this machine for the control, the gap is COLLECTION even if the policy tripped on an empty parameter first.
    const declared =
      decisions.find(
        d =>
          d.status === 'NO_EVALUABLE' &&
          d.cause &&
          d.evidenceIds?.length === 1 &&
          d.evidenceIds[0] === evidence.id
      )?.cause || decision.cause;

    const cause =
      decision.status !== 'NO_EVALUABLE'
        ? undefined
        : declared && nothingReceived
        ? 'COLLECTION'
        : declared || evidence.gapCause;

    return {
      ...evidence,
      status: decision.status,
      gapCause: cause,
      // Says WHO decided: an auditor must tell an evidence the agent declared from one the engine deduced by correlating, because the trace that follows differs.
      observations: [
        `Resuelta por la política del control (${decision.policyId || 'policy'}), que mide esta evidencia junto a ${decision.requirementId}: ${decision.reason}`,
        ...evidence.observations,
      ],
    };
  });
};
