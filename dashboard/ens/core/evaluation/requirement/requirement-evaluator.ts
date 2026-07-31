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

  // Una evidencia en PARCIAL es una MEDIDA: el agente ha mirado y ha declarado
  // que conforma a medias. Eso sí degrada el requisito.
  if (hasPartialEvidence) {
    return 'PARCIAL';
  }

  // Llegados aquí no hay ninguna evidencia que incumpla ni que conforme a
  // medias, y no todas conforman: lo que queda son evidencias que NO SE HAN
  // PODIDO MEDIR. Antes esta rama devolvía PARCIAL en cuanto hubiera una sola
  // evidencia en CUMPLE, y ese PARCIAL era una afirmación fabricada con la
  // ausencia de un dato: nadie ha demostrado que el requisito conforme a
  // medias, sencillamente falta mirar una parte. De ahí salían las cuatro «no
  // conformidades» de op.acc.1 sobre evidencias en gris.
  //
  // Un hueco de medida no puede fabricar un incumplimiento igual que no puede
  // fabricar un cumplimiento: sin la medida completa, el requisito es
  // NO_EVALUABLE. La rama de arriba (`hasNonCompliantEvidence`) se comprueba
  // ANTES a propósito: un incumplimiento demostrado siempre manda sobre un
  // hueco, nunca al revés.
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
