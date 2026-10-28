// A machine, named as the auditor names it. Comes from consolidation across agents; one agent's result does not carry it.
export interface ENSAgentRef {
  agentId: string;
  agentName?: string;
}

// A motive and the machines where it occurs. The same motive on seven agents is ONE motive observed seven times. The structure travels raw (not trimmed) so each consumer decides how many groups to show.
export interface ENSObservationGroup {
  // The motive as the engine wrote it, WITHOUT agent prefix.
  text: string;

  // Machines where it was observed, in stable order of appearance. Empty only if the motive comes from no particular machine.
  agents: ENSAgentRef[];
}

// How the noncompliance was reached. The verdict is the same (NO_CUMPLE) but the action and who performs it differ.
//   MEDIDA          looked at and does not conform: something to fix on the machine.
//   NO_EVIDENCIADA  could not be proven: counts against anyway (the burden of proof is the audited party's), but the action is to enable the proof, not fix the machine.
export type ENSNonConformityOrigin = 'MEDIDA' | 'NO_EVIDENCIADA';

// Whose gap it is when the noncompliance is NO_EVIDENCIADA; decides who fixes it.
//   CATALOG       the product does not declare what would accredit the requirement. True for all machines alike, never multiplied or attributed to an agent.
//   CONFIGURATION a required parameter is missing or the declared policy is empty. Fixed by whoever configures Power ENS.
//   COLLECTION    NOTHING arrived from that machine (agent down, collector not run, no heartbeat). A COLLECTION failure, not a finding on the machine; fixed by whoever operates Wazuh and the agents.
//   EVIDENCE      data arrived but is not enough (quality contract, unreadable field, or the agent declares it could not measure). Fixed by whoever maintains the evidence producer.
export type ENSGapCause =
  | 'CATALOG'
  | 'CONFIGURATION'
  | 'COLLECTION'
  | 'EVIDENCE';

// A noncompliance finding. ONE list only, with `origin` + `cause` carrying the diagnosis; two lists with two counters let one be read as "this does not count".
export interface ENSNonConformity {
  id: string;
  evidenceId: string;
  requirementId: string;
  finding: string;
  impact: string;
  requiredAction: string;
  expected?: string;
  actual?: string;

  // Measured and nonconforming, or unevidenced. See `ENSNonConformityOrigin`.
  origin: ENSNonConformityOrigin;

  // Only on `MEDIDA`: what is proven is a screen DECLARATION (an absent or expired contract or certification), not a finding on the machine. The action is to renew or complete the document.
  documental?: boolean;

  // Only on `NO_EVIDENCIADA`.
  cause?: ENSGapCause;

  // Machines where THIS finding with this same text was proven. Filled only by consolidation: an identical card on six machines is one card with six machines.
  // Empty for cause CATALOG (no machine to attribute it to).
  agents?: ENSAgentRef[];

  // All involved evidences, not only the first: `evidenceId` is the card's anchor but whoever fixes it needs the whole list.
  evidenceIds: string[];

  // Configuration screen parameters that would unblock the measure; turns "could not be proven" into an executable action.
  parameterIds: string[];
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

  // Was it actually measured? With `status` NO_CUMPLE this separates "looked and it is wrong" and "could not be proven". `false` on NO_APLICA means nothing.
  // Consolidated across agents it is `true` only if ALL machines measured it.
  evidenced?: boolean;

  // Accredited by DOCUMENT, not telemetry. Travels to the screen and report so an auditor can tell measured from declared at a glance.
  attested?: boolean;

  // Judged from a screen declaration with its validity, not from machine facts (see `documental` in `ENSPolicyDecision`). With NO_CUMPLE: an expired or absent document.
  documental?: boolean;

  observations: string[];

  // The same motives unflattened. As in `ENSEvidenceResult`, filled only by consolidation across agents.
  observationGroups?: ENSObservationGroup[];

  evidenceIds?: string[];
}

export interface ENSEvidenceResult {
  id: string;
  controlId: string;
  status: ENSComplianceStatus;
  description: string;

  // Why the evidence is as it is: which concrete account fails, which parameter is missing, why a grey is justified. Without this field the motives written by the engine were silently lost
  // before reaching the report models.
  // Consolidated across agents, each motive arrives prefixed with the machine(s) where it was observed for plain-text consumers; `observationGroups` has the unflattened form.
  observations: string[];

  // The same motives grouped by text with each one's machines. Filled only by consolidation across agents.
  observationGroups?: ENSObservationGroup[];

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

  // Machines this result summarised. Filled only by consolidation, so "affects 6" and "affects all" are told apart.
  consolidatedAgents?: ENSAgentRef[];

  level: ENSLevel;
  status: ENSComplianceStatus;

  // OPTIONAL, absent only for NO_APLICA: a control that does not apply is not scored (a 0 is painted red like a real failure), but everything that applies always carries a number.
  score?: number;

  coverage: number;

  // The DENOMINATOR of the percentage is `applicableRequirements`, not `measuredRequirements`: what is not proven does NOT comply, so it subtracts.
  // `measuredRequirements` is still published as the DIAGNOSTIC: "60 %, 5 of 8 proven" and "60 %, 8 of 8 proven" are very different machines. Same fields as `requisitos_aplicables` / `requisitos_medidos` of the agents.
  applicableRequirements: number;
  measuredRequirements: number;
  unmeasuredRequirements: string[];

  evaluatedAt: string;
  lastEvidenceAt?: string;
  nextReviewAt?: string;

  requirements: ENSRequirementResult[];
  parameters: ENSParameterResult[];
  evidences: ENSEvidenceResult[];

  missingParameters: string[];
  missingEvidences: string[];
  relatedRules: string[];

  // ALL noncompliances, measured and unevidenced, in one list with one counter; filter by `origin` to split them.
  nonConformities: ENSNonConformity[];

  observations: string[];
  traceability: ENSTraceabilityResult[];
}
