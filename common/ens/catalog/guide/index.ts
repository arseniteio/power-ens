import criteria from './template-criteria.json';
import relations from './control-relations.json';
import { engineCatalogEntry } from '../engine-catalog';

export interface ENSControlRelation {
  summary: string;
  regulates: string;
  wazuh: string;
  powerEns: string;
  outside?: string;
}

export interface ENSNonComplianceCondition {
  text: string;
  severity: string;
  evidences: string[];
}

export interface ENSLinkedItem {
  id: string;
  title: string;
}

export interface ENSRequirementGuide {
  id: string;
  title: string;
  normText: string;
  interpretation?: string;
  conditions: ENSNonComplianceCondition[];
  controlConditions: ENSNonComplianceCondition[];
  evidences: ENSLinkedItem[];
  parameters: ENSLinkedItem[];
}

export interface ENSEvidenceGuide {
  id: string;
  title: string;
  measurement: string;
  module?: string;
  proof?: string;
  setup?: string;
  requirements: ENSLinkedItem[];
}

interface ENSControlCriteria {
  evidences: Record<string, { module: string; proof: string; setup: string }>;
  requirements: Record<string, ENSNonComplianceCondition[]>;
  general: ENSNonComplianceCondition[];
}

const criteriaOf = (controlId: string): ENSControlCriteria | undefined =>
  (criteria as Record<string, ENSControlCriteria>)[controlId];

export const getControlRelation = (controlId: string): ENSControlRelation | undefined =>
  (relations as Record<string, ENSControlRelation>)[controlId];

export const describeRequirementGuide = (controlId: string, requirementId: string): ENSRequirementGuide | undefined => {
  const entry = engineCatalogEntry(controlId);
  const requirement = entry?.requirements.find((item: any) => item.id === requirementId);
  if (!requirement) return undefined;

  const control = criteriaOf(controlId);

  return {
    id: requirement.id,
    title: requirement.title,
    normText: requirement.description,
    interpretation: requirement.interpretation,
    conditions: control?.requirements[requirementId] || [],
    controlConditions: control?.general || [],
    evidences: (requirement.evidence_ids || []).map((id: string) => ({
      id,
      title: entry.evidences.find((evidence: any) => evidence.id === id)?.title || '',
    })),
    parameters: (requirement.parameter_ids || []).map((id: string) => ({
      id,
      title: entry.parameters[id]?.label || '',
    })),
  };
};

export const describeEvidenceGuide = (controlId: string, evidenceId: string): ENSEvidenceGuide | undefined => {
  const entry = engineCatalogEntry(controlId);
  const evidence = entry?.evidences.find((item: any) => item.id === evidenceId);
  if (!evidence) return undefined;

  const proposal = criteriaOf(controlId)?.evidences[evidenceId];

  return {
    id: evidence.id,
    title: evidence.title,
    measurement: evidence.description,
    module: proposal?.module,
    proof: proposal?.proof,
    setup: proposal?.setup,
    requirements: (evidence.requirements || []).map((id: string) => ({
      id,
      title: entry.requirements.find((requirement: any) => requirement.id === id)?.title || '',
    })),
  };
};
