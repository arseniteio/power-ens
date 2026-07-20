import { ENSRequirementDefinition } from '../../../catalog';
import { ENSLevel } from '../../../catalog/types';
import { ENSEvidenceResolved } from '../../evidence/types';
import { ENSComplianceStatus } from '../types';
import { ENSPolicyDecision } from '../../policy-runtime';
import { scoreByStatus } from '../utils';

export interface ENSRequirementEvaluationResult {
  id: string;
  title: string;
  level: ENSLevel[];
  status: ENSComplianceStatus;
  applicable: boolean;
  score: number;
  observations: string[];
  evidenceIds: string[];
}

const resolveFunctionalStatus = (
  requiredEvidenceIds: string[],
  evidences: ENSEvidenceResolved[],
  hasMissingRequiredParameters: boolean
): ENSComplianceStatus => {
  const requiredEvidences = evidences.filter(evidence =>
    requiredEvidenceIds.includes(evidence.id)
  );

  const applicableEvidences = requiredEvidences.filter(
    evidence => evidence.status !== 'NO_APLICA'
  );

  if (!applicableEvidences.length) {
    return 'NO_EVALUABLE';
  }

  const hasCompliantEvidence = applicableEvidences.some(
    evidence => evidence.status === 'CUMPLE'
  );

  const hasPartialEvidence = applicableEvidences.some(
    evidence => evidence.status === 'PARCIAL'
  );

  const hasNonCompliantEvidence = applicableEvidences.some(
    evidence => evidence.status === 'NO_CUMPLE'
  );

  if (hasNonCompliantEvidence && (hasCompliantEvidence || hasPartialEvidence)) {
    return 'PARCIAL';
  }

  if (hasNonCompliantEvidence) {
    return 'NO_CUMPLE';
  }

  if (
    applicableEvidences.every(evidence => evidence.status === 'CUMPLE') &&
    !hasMissingRequiredParameters
  ) {
    return 'CUMPLE';
  }

  if (hasMissingRequiredParameters) {
    return 'NO_EVALUABLE';
  }

  if (
    applicableEvidences.some(evidence => evidence.status === 'CUMPLE') ||
    applicableEvidences.some(evidence => evidence.status === 'PARCIAL')
  ) {
    return 'PARCIAL';
  }

  if (applicableEvidences.every(evidence => evidence.status === 'NO_EVALUABLE')) {
    return 'NO_EVALUABLE';
  }

  return 'NO_EVALUABLE';
};

export const evaluateRequirement = (
  requirement: ENSRequirementDefinition,
  level: ENSLevel,
  evidences: ENSEvidenceResolved[],
  hasMissingRequiredParameters: boolean,
  policyDecisions: ENSPolicyDecision[] = []
): ENSRequirementEvaluationResult => {
  const appliesToLevel = requirement.applicability.levels.includes(level);

  if (!appliesToLevel) {
    return {
      id: requirement.id,
      title: requirement.title,
      level: requirement.applicability.levels,
      status: 'NO_APLICA',
      applicable: false,
      score: 0,
      observations: [
        requirement.applicability.reason ||
          `El requisito ${requirement.id} no aplica para el nivel ENS ${level}.`,
      ],
      evidenceIds: requirement.evidenceIds,
    };
  }

  const requirementEvidences = evidences.filter(evidence =>
    requirement.evidenceIds.includes(evidence.id)
  );

  const policyDecision = policyDecisions.find(
    decision => decision.requirementId === requirement.id
  );

  const status = policyDecision
    ? policyDecision.status
    : resolveFunctionalStatus(
        requirement.evidenceIds,
        requirementEvidences,
        hasMissingRequiredParameters
      );

  return {
    id: requirement.id,
    title: requirement.title,
    level: requirement.applicability.levels,
    status,
    applicable: true,
    score: scoreByStatus(status),
    observations: [
      ...requirementEvidences.flatMap(evidence => evidence.observations),
      ...(policyDecision ? [policyDecision.reason] : []),
      ...(hasMissingRequiredParameters
        ? ['Existen parámetros obligatorios pendientes de configuración.']
        : []),
    ],
    evidenceIds: requirement.evidenceIds,
  };
};

export const evaluateRequirements = (
  requirements: ENSRequirementDefinition[],
  level: ENSLevel,
  evidences: ENSEvidenceResolved[],
  hasMissingRequiredParameters: boolean,
  policyDecisions: ENSPolicyDecision[] = []
): ENSRequirementEvaluationResult[] =>
  requirements.map(requirement =>
    evaluateRequirement(
      requirement,
      level,
      evidences,
      hasMissingRequiredParameters,
      policyDecisions
    )
  );
