export interface ENSNonConformity {
  id: string;
  evidenceId: string;
  requirementId: string;
  finding: string;
  impact: string;
  requiredAction: string;
  expected?: string;
  actual?: string;
}

import { ENSPolicyRuntimeResult } from '../policy-runtime';
import { ENSLevel } from '../../configuration/types';
import {
  ENSEvidenceCategory,
  ENSEvidenceCriticality,
} from '../evidence/types';
import { ENSDataSourceType } from '../data-source/types';

export type ENSComplianceStatus =
  | 'CUMPLE'
  | 'NO_CUMPLE'
  | 'PARCIAL'
  | 'NO_EVALUABLE'
  | 'NO_APLICA';

export interface ENSRequirementResult {
  id: string;
  title: string;
  status: ENSComplianceStatus;
  level: ENSLevel[];
  observations: string[];
  evidenceIds?: string[];
}

export interface ENSEvidenceResult {
  id: string;
  controlId: string;
  status: ENSComplianceStatus;
  description: string;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  lastSeen?: string;
  agentId?: string;
  agentName?: string;
  resolvedEventId?: string;
  resolvedEventType?: string;
  resolvedSourceType?: ENSDataSourceType;
  resolvedSource?: string;
  resolvedRuleId?: string;
  resolvedRuleDescription?: string;
  resolvedAttributes?: Record<string, unknown>;
  latestSuccessfulEventId?: string;
  latestSuccessfulAttributes?: Record<string, unknown>;
}

export interface ENSParameterResult {
  id: string;
  name: string;
  label: string;
  status: 'CONFIGURED' | 'NOT_CONFIGURED' | 'NOT_APPLICABLE' | 'INVALID';
  value?: string | number | boolean | string[];
  required: boolean;
  requirements: string[];
  ifNotConfigured: string;
}

export interface ENSTraceabilityResult {
  source: 'CATALOG' | 'CONFIGURATION' | 'WAZUH' | 'EVIDENCE' | 'REPORT';
  reference: string;
  description: string;
  controlId?: string;
  requirementId?: string;
  requirementIds?: string[];
  evidenceId?: string;
  status?: ENSComplianceStatus;
  eventId?: string;
  eventType?: string;
  eventSourceType?: ENSDataSourceType;
  eventSource?: string;
  ruleId?: string;
  ruleDescription?: string;
  agentId?: string;
  agentName?: string;
  auditAttributes?: Record<string, unknown>;
  timestamp?: string;
}

export interface ENSComplianceResult {
  control: {
    id: string;
    name: string;
    family: string;
    category: string;
    description: string;
  };

  policyRuntime?: ENSPolicyRuntimeResult;  

  level: ENSLevel;
  status: ENSComplianceStatus;
  score: number;
  coverage: number;

  evaluatedAt: string;
  lastEvidenceAt?: string;
  nextReviewAt?: string;

  requirements: ENSRequirementResult[];
  parameters: ENSParameterResult[];
  evidences: ENSEvidenceResult[];

  missingParameters: string[];
  missingEvidences: string[];
  relatedRules: string[];

  nonConformities: ENSNonConformity[];
  observations: string[];
  traceability: ENSTraceabilityResult[];
}
