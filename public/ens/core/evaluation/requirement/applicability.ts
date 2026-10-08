// Aplica la Declaración de Aplicabilidad de un control a sus requisitos ya
// evaluados. Ver `configuration/services/applicability-service.ts`.
//
// Va DESPUÉS de evaluar, a propósito: el límite que protege al auditor —una
// declaración nunca tapa lo medido— solo se puede comprobar mirando lo que la
// máquina ha demostrado, no lo que dice el documento.
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

  // Medido o acreditado en ESTA máquina: el sujeto existe. Un NO_APLICA por
  // nivel no cuenta —no dice nada del sujeto—, y un requisito sin demostrar
  // tampoco: es exactamente lo que sale cuando no hay nada que medir.
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
