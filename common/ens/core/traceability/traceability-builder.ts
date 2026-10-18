import { ENSComplianceResult } from '../evaluation/types';
import { ENSControlTrace } from './types';

export const buildControlTrace = (
  result: ENSComplianceResult
): ENSControlTrace => ({
  controlId: result.control.id,
  controlName: result.control.name,
  status: result.status,
  score: result.score,
  generatedAt: result.evaluatedAt,

  policyDecisions:
    result.policyRuntime?.decisions.map(decision => ({
      policyId: decision.policyId,
      requirementId: decision.requirementId,
      status: decision.status,
      ruleId: decision.trace.ruleId,
      ruleType: decision.trace.ruleType,
      expression: decision.trace.expression,
      expected: decision.trace.expected,
      actual: decision.trace.actual,
      result: decision.trace.result,
      reason: decision.reason,
    })) || [],

  requirements: result.requirements.map(requirement => ({
    requirementId: requirement.id,
    title: requirement.title,
    status: requirement.status,
    evidenceIds: requirement.evidenceIds || [],
    evidences: result.evidences
      .filter(evidence => evidence.requirements.includes(requirement.id))
      .map(evidence => ({
        evidenceId: evidence.id,
        title: evidence.description,
        status: evidence.status,
        eventTypes: evidence.expectedEventTypes,
        auditAttributes:
          result.traceability.find(
            trace =>
              trace.source === 'EVIDENCE' &&
              trace.evidenceId === evidence.id
          )?.auditAttributes,
        observations: [],
      })),
    observations: requirement.observations || [],
  })),
});
