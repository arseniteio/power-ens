import { ENSComplianceStatus } from '../evaluation/types';

export interface ENSEvidenceTrace {
  evidenceId: string;
  status: ENSComplianceStatus;
  title: string;
  eventTypes: string[];
  auditAttributes?: Record<string, unknown>;
  observations: string[];
}

export interface ENSRequirementTrace {
  requirementId: string;
  title: string;
  status: ENSComplianceStatus;
  evidenceIds: string[];
  evidences: ENSEvidenceTrace[];
  observations: string[];
}

export interface ENSControlTrace {
  controlId: string;
  controlName: string;
  status: ENSComplianceStatus;
  score: number;
  requirements: ENSRequirementTrace[];
  generatedAt: string;
  policyDecisions?: ENSPolicyDecisionTrace[];
}

export interface ENSPolicyDecisionTrace {
  policyId: string;
  requirementId: string;
  status: string;
  ruleId: string;
  ruleType: string;
  expression: string;
  expected: string;
  actual: string;
  result: boolean;
  reason: string;
}
