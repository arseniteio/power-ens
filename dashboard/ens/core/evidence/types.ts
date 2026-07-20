import { ENSComplianceStatus } from '../evaluation/types';
import { ENSLevel } from '../../configuration/types';
import { ENSDataSourceType } from '../data-source/types';

export type ENSEvidenceCategory =
  | 'CONFIGURATION'
  | 'EXECUTION'
  | 'MONITORING'
  | 'INTEGRITY'
  | 'ACCESS_CONTROL'
  | 'RECOVERY'
  | 'OFFSITE'
  | 'TRACEABILITY';

export type ENSEvidenceCriticality =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export interface ENSEvidenceQualityRequirements {
  requiredFields?: string[];
  requiredFieldsWhenStatus?: string[];
  fieldPatterns?: Record<string, string>;
  rejectSynthetic?: boolean;
}

export interface ENSEvidenceDefinition {
  id: string;
  controlId: string;
  title: string;
  description: string;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;
}

export interface ENSEvidenceResolved {
  id: string;
  controlId: string;
  title: string;
  description: string;
  status: ENSComplianceStatus;
  requirements: string[];
  levels: ENSLevel[];
  category: ENSEvidenceCategory;
  criticality: ENSEvidenceCriticality;
  sourceTypes: ENSDataSourceType[];
  expectedEventTypes: string[];
  relatedRules: string[];
  auditQuestion: string;
  qualityRequirements?: ENSEvidenceQualityRequirements;
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
  observations: string[];
}
