import { ENSRequirementDefinition } from '../../../catalog';
import { ENSLevel } from '../../../catalog/types';
import { ENSEvidenceResolved } from '../../evidence/types';
import { ENSComplianceStatus } from '../types';
import { ENSPolicyDecision } from '../../policy-runtime';
import { applyAuditVerdict, isMeasured, scoreByStatus } from '../utils';

export interface ENSRequirementEvaluationResult {
  id: string;
  title: string;
  level: ENSLevel[];

  // El VEREDICTO, ya con la convención de auditoría aplicada: nunca
  // NO_EVALUABLE en un requisito que aplica.
  status: ENSComplianceStatus;

  applicable: boolean;

  // ¿Se ha llegado a MEDIR? Es lo único que separa aguas abajo un NO_CUMPLE
  // demostrado de uno no evidenciado, porque el veredicto ya no los distingue.
  evidenced: boolean;

  score: number;
  observations: string[];
  evidenceIds: string[];
}

// La MEDIDA del requisito, no su veredicto: aquí `NO_EVALUABLE` significa
// literalmente «no se ha podido medir», y esa distinción es la que alimenta
// después `evidenced` y la causa del hueco. El veredicto lo aplica
// `applyAuditVerdict` una capa más abajo, en `evaluateRequirement`.
//
// Se mantiene intacta la lógica de 346e56b: un incumplimiento demostrado manda
// sobre un hueco, y un hueco no fabrica un PARCIAL. Lo que cambia es qué se
// publica cuando el resultado es un hueco.
const resolveMeasurement = (
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
  // PODIDO MEDIR. Sigue siendo NO_EVALUABLE porque esto es la MEDIDA — nadie ha
  // demostrado que el requisito conforme a medias, sencillamente falta mirar una
  // parte, y un PARCIAL fabricado con la ausencia de un dato es lo que producía
  // las cuatro «no conformidades» de op.acc.1 sobre evidencias en gris.
  //
  // Que el veredicto de este NO_EVALUABLE sea NO_CUMPLE lo decide
  // `applyAuditVerdict`, no esta función: aquí seguiría siendo un error decir
  // PARCIAL, porque PARCIAL afirma que se ha medido medio cumplimiento.
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
      // No es que no se haya medido: es que no hay nada que medir. Ver el
      // comentario de `evidenced` en `../types`.
      evidenced: false,
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

  // La medida primero —la decide la policy si hay una, y si no las evidencias—
  // y el veredicto después. Separarlas es lo que permite que un requisito que
  // no se ha podido demostrar salga NO_CUMPLE sin que nadie pueda confundirlo
  // con uno medido: `evidenced` lo dice.
  const measurement = policyDecision
    ? policyDecision.status
    : resolveMeasurement(
        requirement.evidenceIds,
        requirementEvidences,
        hasMissingRequiredParameters
      );

  const status = applyAuditVerdict(measurement);

  return {
    id: requirement.id,
    title: requirement.title,
    level: requirement.applicability.levels,
    status,
    applicable: true,
    evidenced: isMeasured(measurement),
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
