import { ENSComplianceState } from '../compliance-state/types';
import { ENSNormalizedEvent } from '../data-source/types';
import type { ENSAgentScope } from '../scope/types';
// `import type`, NOT a normal import: importing `ENSComplianceTimelinePoint` as a value loads `compliance-timeline` at runtime, which imports the whole ENGINE, and the `ens-engine` cycle returns (TDZ) that blanks the dashboard.
import type { ENSComplianceTimelinePoint } from '../timeline/compliance-timeline';
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

// The daily series arrives ALREADY COMPUTED: each point is a full engine pass and this adapter is rebuilt on every panel refresh. Whoever computes it memoizes it against the events (`ens-dashboard-main.tsx`).
export const buildENSDashboardModel = (
  complianceState: ENSComplianceState,
  events: ENSNormalizedEvent[] = [],
  timeline: ENSComplianceTimelinePoint[] = [],
  // The view's ENS scope: operational alerts only show its machines. The server builds them from aggregations and replaces them.
  scopeAgents: ENSAgentScope[] = []
) => ({

  compliance: buildComplianceCardModel(complianceState),
  coverage: buildCoverageCardModel(complianceState),
  findings: buildFindingsCardModel(complianceState),
  familyCompliance: buildFamilyComplianceModel(complianceState),
  requirementFindings: buildRequirementFindingsModel(complianceState),
  levelSummary: buildLevelSummaryModel(complianceState),
  impactEvents: buildImpactEventsModel(events, complianceState, { scope: scopeAgents }),
  evolution: buildEvolutionModel(
    complianceState,
    timeline
  ),
  requirementsSummary: buildRequirementsSummaryModel(complianceState),
});
