import { ENSComplianceState } from '../compliance-state/types';
import type { ENSComplianceTimelinePoint } from '../timeline/compliance-timeline';
import {
  buildComplianceCardModel,
  buildCoverageCardModel,
  buildFamilyComplianceModel,
  buildFindingsCardModel,
  buildRequirementFindingsModel,
  buildLevelSummaryModel,
  buildEvolutionModel,
  buildRequirementsSummaryModel,
} from './presenters';

export const buildENSDashboardModel = (
  complianceState: ENSComplianceState,
  timeline: ENSComplianceTimelinePoint[] = []
) => ({

  compliance: buildComplianceCardModel(complianceState),
  coverage: buildCoverageCardModel(complianceState),
  findings: buildFindingsCardModel(complianceState),
  familyCompliance: buildFamilyComplianceModel(complianceState),
  requirementFindings: buildRequirementFindingsModel(complianceState),
  levelSummary: buildLevelSummaryModel(complianceState),
  evolution: buildEvolutionModel(
    complianceState,
    timeline
  ),
  requirementsSummary: buildRequirementsSummaryModel(complianceState),
});
