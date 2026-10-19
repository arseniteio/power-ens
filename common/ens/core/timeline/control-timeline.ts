// Daily series of ONE control for the detail screen. Sister of `compliance-timeline.ts` (the panel's); the denominator differs: this measures ONE control, so its last point is exactly the big percentage at the top of the detail. Mixing them would repeat the two-numbers defect.
// The measurement-plane rule is applied by the engine: in a machine's view a manager-only control (op.exp.7, op.exp.9) comes out at each point with the manager's result.
// This file is only the shell (it imports the engine, so it is out of tests); everything that can break lives in `control-timeline-points.ts`.
import { ENSLevel } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { getENSComplianceResultByControl } from '../ens-engine';
import { ENSAgentScope } from '../scope/types';
import {
  ENSControlTimelinePoint,
  mapCutsToControlPoints,
} from './control-timeline-points';
import {
  buildENSTimelineCuts,
  ENSTimelineCutsOptions,
} from './timeline-cuts';

export interface ENSControlTimelineOptions
  extends ENSTimelineCutsOptions {
  agentId?: string;
  scopeAgents?: ENSAgentScope[];
}

export const buildENSControlComplianceTimeline = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  options: ENSControlTimelineOptions = {}
): ENSControlTimelinePoint[] =>
  mapCutsToControlPoints(
    buildENSTimelineCuts(events, options),
    (cutEvents, cutoff) =>
      getENSComplianceResultByControl(
        controlId,
        level,
        cutEvents,
        options.agentId,
        options.scopeAgents,
        cutoff
      )
  );
