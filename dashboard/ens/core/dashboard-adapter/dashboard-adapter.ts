import { ENSComplianceState } from '../compliance-state/types';
import { ENSNormalizedEvent } from '../data-source/types';
import {
  buildComplianceCardModel,
  buildCoverageCardModel,
  buildFamilyComplianceModel,
  buildFindingsCardModel,
  buildRequirementFindingsModel,
  buildLevelSummaryModel,
  buildImpactEventsModel,
  buildEvolutionModel,
  buildRequirementsSummaryModel,
} from './presenters';

export const buildENSDashboardModel = (
  complianceState: ENSComplianceState,
  events: ENSNormalizedEvent[] = [],
  activeLevel?: string
) => ({

  compliance: buildComplianceCardModel(complianceState),
  coverage: buildCoverageCardModel(complianceState),
  findings: buildFindingsCardModel(complianceState),
  familyCompliance: buildFamilyComplianceModel(complianceState),
  requirementFindings: buildRequirementFindingsModel(complianceState),
  levelSummary: buildLevelSummaryModel(complianceState),
  impactEvents: buildImpactEventsModel(events),
  evolution: buildEvolutionModel(
    complianceState,
    events,
    activeLevel
  ),
  requirementsSummary: buildRequirementsSummaryModel(complianceState),
});
