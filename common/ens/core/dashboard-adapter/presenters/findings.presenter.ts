import { getENSCatalogControl } from '../../../catalog';
import { ENSComplianceState } from '../../compliance-state/types';
import { FindingsCardModel } from '../models/findings-card.model';

const UNFAVOURABLE = new Set(['NO_CUMPLE', 'PARCIAL', 'NO_EVALUABLE']);

// Unfavourable requirements split by the origin of their non-conformities (ENS-DASH-002, Francisco Caicedo): only MEDIDA, only NO_EVIDENCIADA, both, or none.
export const buildFindingsCardModel = (
  complianceState: ENSComplianceState
): FindingsCardModel => {
  let measuredFindings = 0;
  let unevidencedFindings = 0;
  let mixedFindings = 0;
  let unclassifiedFindings = 0;
  let hasNonCompliant = false;

  complianceState.results.forEach(result => {
    // A control that is not ACTIVE produces no non-conformities: it never counts here.
    if (getENSCatalogControl(result.control.id)?.status !== 'ACTIVE') {
      return;
    }

    result.requirements.forEach(requirement => {
      if (!UNFAVOURABLE.has(requirement.status)) {
        return;
      }

      hasNonCompliant = hasNonCompliant || requirement.status === 'NO_CUMPLE';

      const origins = new Set(
        (result.nonConformities || [])
          .filter(nonConformity => nonConformity.requirementId === requirement.id)
          .map(nonConformity => nonConformity.origin)
      );
      const measured = origins.has('MEDIDA');
      const unevidenced = origins.has('NO_EVIDENCIADA');

      if (measured && unevidenced) {
        mixedFindings += 1;
      } else if (measured) {
        measuredFindings += 1;
      } else if (unevidenced) {
        unevidencedFindings += 1;
      } else {
        unclassifiedFindings += 1;
      }
    });
  });

  const total = measuredFindings + unevidencedFindings + mixedFindings + unclassifiedFindings;

  return {
    title: 'REQUISITOS QUE REQUIEREN ATENCIÓN',
    total,
    severity: total ? (hasNonCompliant ? 'CRITICAL' : 'WARNING') : 'OK',
    lastEvaluation: complianceState.evaluatedAt,
    description: 'Requisitos desfavorables según el origen de sus no conformidades.',
    measuredFindings,
    unevidencedFindings,
    mixedFindings,
    unclassifiedFindings,
  };
};
