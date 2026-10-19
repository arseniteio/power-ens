// From the types file, not the `../../../catalog` barrel: the top-level barrel brings back the transitive TDZ cycle of `Settings`.
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

  // The VERDICT with the audit convention applied: never NO_EVALUABLE on an applicable requirement.
  status: ENSComplianceStatus;

  applicable: boolean;

  // Was it MEASURED? The only thing that separates a proven NO_CUMPLE from an unevidenced one downstream, since the verdict no longer does.
  evidenced: boolean;

  // Accredited by DOCUMENT, not telemetry; travels apart from `status` so the screen and report say "acreditado documentalmente" and never confuse it with measured.
  // Two paths: `P-ATT`, only for requirements the catalog declares WITHOUT ANY technical evidence, and a policy decision with `attested`, only if no measure of the requirement is against.
  attested?: boolean;

  // Judged from a screen DECLARATION (the policy decision carries `documental`), not machine facts. With NO_CUMPLE it is an expired or absent document.
  documental?: boolean;

  score: number;
  observations: string[];
  evidenceIds: string[];
}

// What counts as a measure AGAINST the requirement: does not conform, or conforms halfway (the same for a requirement; see `resolveMeasurement`).
const MEASURED_AGAINST: ENSComplianceStatus[] = ['NO_CUMPLE', 'PARCIAL'];

// Motive of a declaration the policy accredits. ALWAYS says it is documentary, like `describeAttestation`, so it is not read as a measure.
const ATTESTED_PREFIX = 'Acreditado documentalmente';

const describePolicyAttestation = (reason: string): string =>
  reason.startsWith(ATTESTED_PREFIX) ? reason : `${ATTESTED_PREFIX}: ${reason}`;

// Why an evidence is unmeasured, in the vocabulary the auditor reads in the report and the control card (`ETIQUETA_DE_CAUSA` in `reports/index.tsx`): must be literally the same string.
const GAP_CAUSE_LABEL: Record<string, string> = {
  CATALOG: 'catálogo',
  CONFIGURATION: 'sin configurar',
  COLLECTION: 'sin recogida',
  EVIDENCE: 'evidencia insuficiente',
};

const describeUnmeasured = (evidence: ENSEvidenceResolved): string =>
  evidence.gapCause
    ? `${evidence.id} sin medir (${GAP_CAUSE_LABEL[evidence.gapCause] || evidence.gapCause})`
    : `${evidence.id} sin medir`;

// The MEASURE of the requirement, not its verdict: here `NO_EVALUABLE` literally means "could not be measured". The verdict is applied by `applyAuditVerdict` one layer below, in `evaluateRequirement`.
// A proven failure rules over a gap, and a gap does not fabricate a PARCIAL.
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

  // A MEASURED FAILURE FAILS THE WHOLE REQUIREMENT; there is no partial credit. An ENS requirement is a normative statement, not an average, and the agents already return NO_CUMPLE as soon as ONE accrediting evidence fails.
  // A PARCIAL evidence enters here and NOT through the NO_EVALUABLE below: PARCIAL is a MEASURE, so `evidenced` must be true.
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

  // Here no evidence fails or half-conforms and not all conform: what remains could NOT be measured. It stays NO_EVALUABLE because this is the MEASURE; a PARCIAL fabricated from missing data is what produced the four false nonconformities of op.acc.1.
  // That the verdict of this NO_EVALUABLE is NO_CUMPLE is decided by `applyAuditVerdict`.
  return 'NO_EVALUABLE';
};

export const evaluateRequirement = (
  requirement: ENSRequirementDefinition,
  level: ENSLevel,
  evidences: ENSEvidenceResolved[],
  hasMissingRequiredParameters: boolean,
  policyDecisions: ENSPolicyDecision[] = [],
  // The control's catalog state. A control that is not `ACTIVE` has no agent side yet: its requirements do not apply, like a reinforcement above the active level. Out of the denominator until there is a collector.
  controlStatus: ENSControlStatus = 'ACTIVE',
  // The documentary attestation of THIS requirement, if the auditor declared one.
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
      // Not that it was not measured: there is nothing to measure. See the `evidenced` comment in `../types`.
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

  // The decision the requirement reads. A policy should emit ONE per requirement; if several, the first rules, unless one is an accreditation (CUMPLE with `attested`), which is read so an earlier decision without a measure does not hide it.
  // Never ahead of a NO_APLICA, which takes the requirement out of play first. Other decisions against still count: see the `attested` branch.
  const requirementDecisions = policyDecisions.filter(
    decision => decision.requirementId === requirement.id
  );

  const attestedDecision = requirementDecisions.find(
    decision => decision.attested && decision.status === 'CUMPLE'
  );

  const policyDecision =
    requirementDecisions[0]?.status === 'NO_APLICA'
      ? requirementDecisions[0]
      : attestedDecision || requirementDecisions[0];

  // THE POLICY TAKES THE REQUIREMENT OUT OF PLAY. This goes BEFORE the attestation, and the order matters: some requirements apply only according to what the organisation declares (the chosen R1/R2/R3/R4 reinforcement),
  // and with the attestation first a document declared for an unchosen reinforcement returned a false CUMPLE and raised the percentage.
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

  // A policy decision that DID pronounce is a measure (it comes from the declared configuration) and no document covers a measure. Attestation can only replace what nobody could prove.
  const policyMeasured =
    policyDecision !== undefined && policyDecision.status !== 'NO_EVALUABLE';

  // DOCUMENTARY ATTESTATION. Only for requirements the catalog declares WITHOUT ANY technical evidence; a hard limit checked against `evidenceIds`: if the machine measured and failed, no document covers it.
  // ENS accredits op.acc.1.5 (eIDAS) and op.acc.1.r1.1 that way, because an agent cannot observe them. `attested` travels apart from `status`.
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
      // It IS proven: with a document, which for this requirement is the proof ENS asks for.
      evidenced: true,
      attested: true,
      score: scoreByStatus('CUMPLE'),
      observations: [describeAttestation(attestation)],
      evidenceIds: [],
    };
  }

  const pendingParametersNote = hasMissingRequiredParameters
    ? ['Existen parámetros obligatorios pendientes de configuración.']
    : [];

  // DECLARATION ACCREDITED BY THE POLICY (`attested`). The policy judged a screen declaration WITH ITS VALIDITY (an unexpired contract, a plan approved within its periodicity); `P-ATT` cannot do that, as an attestation does not expire.
  // The requirement passes MARKED as documentary, with the same hard limit checked against the measures: NO DOCUMENT COVERS A MEASURE AGAINST. If an evidence of the requirement (catalog or named by the decision)
  // is NO_CUMPLE or PARCIAL, or another policy decision for the requirement is, the measure rules: NO_CUMPLE without the mark.
  // An unmeasurable evidence (NO_EVALUABLE) is not a measure against; whether the declaration suffices without it is the policy's decision.
  if (policyDecision?.attested && policyDecision.status === 'CUMPLE') {
    const relatedEvidenceIds = Array.from(
      new Set([
        ...requirement.evidenceIds,
        ...(policyDecision.evidenceIds || []),
      ])
    );

    const evidencesAgainst = evidences.filter(
      evidence =>
        relatedEvidenceIds.includes(evidence.id) &&
        MEASURED_AGAINST.includes(evidence.status)
    );

    const decisionsAgainst = policyDecisions.filter(
      decision =>
        decision !== policyDecision &&
        decision.requirementId === requirement.id &&
        MEASURED_AGAINST.includes(decision.status)
    );

    if (evidencesAgainst.length || decisionsAgainst.length) {
      const culprits = Array.from(
        new Set([
          ...evidencesAgainst.map(evidence => `${evidence.id} ${evidence.status}`),
          ...decisionsAgainst.flatMap(decision =>
            decision.evidenceIds?.length
              ? decision.evidenceIds.map(id => `${id} ${decision.status}`)
              : [`${decision.trace.ruleId} ${decision.status}`]
          ),
        ])
      );

      return {
        id: requirement.id,
        title: requirement.title,
        level: requirement.applicability.levels,
        status: 'NO_CUMPLE',
        applicable: true,
        // Measured and against: that rules.
        evidenced: true,
        score: scoreByStatus('NO_CUMPLE'),
        observations: [
          ...evidencesAgainst.flatMap(evidence => evidence.observations),
          ...decisionsAgainst.map(decision => decision.reason),
          `La medida manda sobre la acreditación documental: ${culprits.join(', ')}, así que la declaración no basta para cumplir (${policyDecision.reason}).`,
          ...pendingParametersNote,
        ],
        evidenceIds: requirement.evidenceIds,
      };
    }

    return {
      id: requirement.id,
      title: requirement.title,
      level: requirement.applicability.levels,
      status: 'CUMPLE',
      applicable: true,
      // Proven with the proof ENS asks for here: the document.
      evidenced: true,
      attested: true,
      ...(policyDecision.documental ? { documental: true } : {}),
      score: scoreByStatus('CUMPLE'),
      // What remains unmeasured is reported: the document suffices for the requirement but the auditor must see which evidences were not measured and why.
      observations: [
        describePolicyAttestation(policyDecision.reason),
        ...evidences
          .filter(
            evidence =>
              relatedEvidenceIds.includes(evidence.id) &&
              evidence.status === 'NO_EVALUABLE'
          )
          .map(describeUnmeasured),
        ...pendingParametersNote,
      ],
      evidenceIds: requirement.evidenceIds,
    };
  }

  const requirementEvidences = evidences.filter(evidence =>
    requirement.evidenceIds.includes(evidence.id)
  );

  // The measure first (the policy's if there is one, else the evidences) and the verdict after. Separating them lets an unprovable requirement come out NO_CUMPLE without confusing it with a measured one: `evidenced` says it.
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
    // A verdict from a declaration, not from a machine measure.
    ...(policyDecision?.documental && isMeasured(measurement) ? { documental: true } : {}),
    score: scoreByStatus(status),
    observations: [
      ...requirementEvidences.flatMap(evidence => evidence.observations),
      ...(policyDecision ? [policyDecision.reason] : []),
      ...pendingParametersNote,
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
