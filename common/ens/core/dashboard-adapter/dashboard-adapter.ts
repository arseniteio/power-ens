import { ENSComplianceState } from '../compliance-state/types';
import type { ENSComplianceTimelinePoint } from '../timeline/compliance-timeline';
import { buildComplianceCardModel, buildCoverageCardModel, buildEvolutionModel, buildFindingsCardModel } from './presenters';

export const buildENSDashboardModel = (complianceState: ENSComplianceState, timeline: ENSComplianceTimelinePoint[] = []) => ({
  compliance: buildComplianceCardModel(complianceState),
  coverage: buildCoverageCardModel(complianceState),
  findings: buildFindingsCardModel(complianceState),
  evolution: buildEvolutionModel(complianceState, timeline),
});
