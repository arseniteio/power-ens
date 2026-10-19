// Applies a control's Statement of Applicability to its already evaluated requirements. See `configuration/services/applicability-service.ts`.
// It runs AFTER evaluation on purpose: the limit that protects the auditor (a declaration never covers what was measured) can only be checked against what the machine proved.
import {
  describeDeclaration,
  isDeclarationSufficient,
  type ENSApplicabilityDeclaration,
} from '../../../configuration/services/applicability-service';
import type { ENSRequirementEvaluationResult } from './requirement-evaluator';

export const applyApplicabilityDeclaration = (
  requirements: ENSRequirementEvaluationResult[],
  declaration?: ENSApplicabilityDeclaration
): ENSRequirementEvaluationResult[] => {
  if (!declaration || !isDeclarationSufficient(declaration)) {
    return requirements;
  }

  // Measured or accredited on THIS machine: the subject exists. A level NO_APLICA does not count, nor does an unproven requirement (what comes out when there is nothing to measure).
  const contradicted = requirements.some(
    requirement =>
      requirement.status !== 'NO_APLICA' && requirement.evidenced === true
  );

  if (contradicted) {
    const warning =
      `La Declaración de Aplicabilidad (${declaration.reference}) excluye este control, ` +
      'pero en esta máquina se ha medido o acreditado algo de él: lo medido contradice la exclusión, así que no se aplica.';

    return requirements.map(requirement =>
      requirement.status === 'NO_APLICA'
        ? requirement
        : {
            ...requirement,
            observations: [...requirement.observations, warning],
          }
    );
  }

  const description = describeDeclaration(declaration);

  return requirements.map(requirement => ({
    id: requirement.id,
    title: requirement.title,
    level: requirement.level,
    status: 'NO_APLICA',
    applicable: false,
    evidenced: false,
    score: 0,
    observations: [description],
    evidenceIds: requirement.evidenceIds,
  }));
};
