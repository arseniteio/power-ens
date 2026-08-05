import { ENSLevel } from '../../configuration/types';
import { ENSControlDefinition } from '../../catalog';
import { ENSControlConfiguration } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { ENSEvidenceResolved } from '../evidence/types';
import { ENSComplianceStatus } from '../evaluation/types';

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
  // El instante contra el que se mide la antigüedad de una evidencia. Por
  // defecto es ahora, que es el caso del panel. Existe como parámetro porque
  // la serie diaria evalúa el mismo motor A UNA FECHA PASADA: con un
  // `Date.now()` suelto, la copia de hace tres días saldría vencida en el
  // punto de hace tres días, y la línea contaría una historia falsa.
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
