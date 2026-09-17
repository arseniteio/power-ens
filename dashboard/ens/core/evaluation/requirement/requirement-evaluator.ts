// Del fichero de tipos, no del barrel `../../../catalog`: el barrel de alto
// nivel es por donde vuelve el ciclo transitivo del TDZ de `Settings`.
import {
  ENSControlStatus,
  ENSRequirementDefinition,
} from '../../../catalog/types';
import {
  describeAttestation,
  isAttestationSufficient,
} from '../../../configuration/services/attestation-service';
import type { ENSRequirementAttestation } from '../../../configuration/services/attestation-service';
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

  // Acreditado por DOCUMENTO, no por telemetría. Viaja aparte de `status` a
  // propósito: el requisito cumple, pero la pantalla y el informe tienen que
  // poder decir «acreditado documentalmente» y nunca confundirlo con medido.
  // Solo puede ser true en requisitos que el catálogo declara SIN NINGUNA
  // evidencia técnica.
  attested?: boolean;

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

  const hasPartialEvidence = applicableEvidences.some(
    evidence => evidence.status === 'PARCIAL'
  );

  const hasNonCompliantEvidence = applicableEvidences.some(
    evidence => evidence.status === 'NO_CUMPLE'
  );

  // UN INCUMPLIMIENTO MEDIDO TUMBA EL REQUISITO ENTERO. No hay crédito parcial,
  // y esto cambió el 05/08/2026.
  //
  // Antes, un requisito con una evidencia en rojo y otra en verde salía PARCIAL,
  // que `scoreByStatus` puntúa con 50. En una máquina real de op.acc.2 eso
  // publicaba **50 %** con sus TRES requisitos aplicables en la lista de no
  // conformidades medidas: el número decía la mitad de lo que decía su propia
  // lista, y decía de más.
  //
  // Dos razones, y la segunda es la que obliga:
  //
  //   · Un requisito del ENS es una afirmación normativa, no una media. Si un
  //     recurso es world-writable, `op.acc.2.1` NO se cumple; no se cumple a
  //     medias porque otra evidencia del mismo requisito esté bien. Un auditor
  //     escribe «no conforme», no «conforme al 50 %».
  //   · Los tres agentes ya lo hacían así —`medida_requisito` devuelve
  //     NO_CUMPLE en cuanto UNA evidencia acreditante falla— así que el motor y
  //     el agente publicaban números distintos sobre los mismos datos, y el que
  //     lee el auditor era el más generoso de los dos.
  //
  // Una evidencia en PARCIAL entra por aquí y NO por el NO_EVALUABLE de abajo, y
  // la diferencia no es cosmética: PARCIAL es una MEDIDA —el agente miró y
  // declaró que conforma a medias— así que `evidenced` tiene que salir cierto.
  // Cayendo al NO_EVALUABLE, la tarjeta etiquetaría como «no evidenciado, fallo
  // de recogida» un hallazgo real y mandaría al operador a revisar el agente en
  // vez de la máquina.
  if (hasNonCompliantEvidence || hasPartialEvidence) {
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
  policyDecisions: ENSPolicyDecision[] = [],
  // El estado del control en el catálogo. Un control que NO está `ACTIVE` es
  // uno cuyo lado agente todavía no existe: está definido y se puede ver, pero
  // ninguna máquina emite sus hechos. Sus requisitos no aplican, igual que un
  // refuerzo por encima del nivel activo, y por la misma razón: acusar de
  // incumplimiento a quien nadie ha ido a medir no es exigencia, es ruido.
  // Fuera del denominador hasta que haya recolector.
  controlStatus: ENSControlStatus = 'ACTIVE',
  // La atestación documental de ESTE requisito, si el auditor la declaró.
  attestation?: ENSRequirementAttestation
): ENSRequirementEvaluationResult => {
  const controlIsActive = controlStatus === 'ACTIVE';

  const appliesToLevel =
    controlIsActive &&
    requirement.applicability.levels.includes(level);

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
        !controlIsActive
          ? `El control todavía no está activo (${controlStatus}): está definido pero ningún agente emite sus evidencias, así que no entra en el índice.`
          : requirement.applicability.reason ||
            `El requisito ${requirement.id} no aplica para el nivel ENS ${level}.`,
      ],
      evidenceIds: requirement.evidenceIds,
    };
  }

  const policyDecision = policyDecisions.find(
    decision => decision.requirementId === requirement.id
  );

  // --- LA POLICY SACA EL REQUISITO DEL JUEGO ------------------------------
  //
  // Va ANTES que la atestación, y el orden no es cosmético. Hay requisitos que
  // solo aplican según lo que declara la organización —el refuerzo elegido en
  // una elección R1/R2/R3/R4—, y eso lo decide la policy, no el nivel. Con la
  // atestación delante, un documento declarado para un refuerzo NO elegido
  // devolvía CUMPLE, entraba en el denominador y subía el porcentaje por algo
  // que el control no exige: un CUMPLE falso con enlace y todo.
  if (policyDecision?.status === 'NO_APLICA') {
    return {
      id: requirement.id,
      title: requirement.title,
      level: requirement.applicability.levels,
      status: 'NO_APLICA',
      applicable: false,
      evidenced: false,
      score: 0,
      observations: [policyDecision.reason],
      evidenceIds: requirement.evidenceIds,
    };
  }

  // Una decisión de la policy que SÍ se ha pronunciado es una medida —sale de
  // la configuración declarada—, y ningún documento tapa una medida. La
  // atestación solo puede sustituir lo que nadie ha podido demostrar.
  const policyMeasured =
    policyDecision !== undefined && policyDecision.status !== 'NO_EVALUABLE';

  // --- ATESTACIÓN DOCUMENTAL ------------------------------------------------
  //
  // Solo para requisitos que el catálogo declara SIN NINGUNA evidencia técnica.
  // Ese es el límite y es duro: si la máquina midió y falló, ningún documento
  // lo tapa. Se comprueba contra `evidenceIds`, no contra la atestación.
  //
  // El ENS acredita así `op.acc.1.5` (eIDAS) y `op.acc.1.r1.1` (singularizar a
  // la persona): un agente no puede observar ninguno de los dos, y su prueba es
  // un documento aprobado. Rechazarlos por no tener telemetría dejaba el
  // control con un techo permanente del 75 % sobre algo que el cliente puede
  // tener cumplido.
  //
  // `attested` viaja aparte de `status` para que la pantalla y el informe
  // puedan decir «acreditado documentalmente» y nunca confundirlo con medido.
  if (
    !requirement.evidenceIds.length &&
    !policyMeasured &&
    isAttestationSufficient(attestation) &&
    attestation
  ) {
    return {
      id: requirement.id,
      title: requirement.title,
      level: requirement.applicability.levels,
      status: 'CUMPLE',
      applicable: true,
      // SÍ está demostrado: con un documento, que para este requisito es la
      // prueba que el ENS pide.
      evidenced: true,
      attested: true,
      score: scoreByStatus('CUMPLE'),
      observations: [describeAttestation(attestation)],
      evidenceIds: [],
    };
  }

  const requirementEvidences = evidences.filter(evidence =>
    requirement.evidenceIds.includes(evidence.id)
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
  policyDecisions: ENSPolicyDecision[] = [],
  controlStatus: ENSControlStatus = 'ACTIVE',
  attestations: Map<string, ENSRequirementAttestation> = new Map()
): ENSRequirementEvaluationResult[] =>
  requirements.map(requirement =>
    evaluateRequirement(
      requirement,
      level,
      evidences,
      hasMissingRequiredParameters,
      policyDecisions,
      controlStatus,
      attestations.get(requirement.id)
    )
  );
