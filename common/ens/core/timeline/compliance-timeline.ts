// Daily compliance series, computed by THE ENGINE: each point is computed like the panel (same engine, events and screen parameters); between two points only the INSTANT evaluated changes, so the last point is literally the panel's number.
// It replaced a chart that averaged the agent's `score_snapshot` per week, a different number on the same screen. Day split, accumulation and series origin are in `timeline-cuts.ts`.
// The measurement-plane rule is applied by the engine: each point passes `scopeAgents` and `agentId` as they are, so the series cannot contradict the panel.
import { ENSLevel } from '../../configuration/types';
import { ENSNormalizedEvent } from '../data-source/types';
import { getENSComplianceState } from '../ens-engine';
import { ENSAgentScope } from '../scope/types';
import {
  buildENSTimelineCuts,
  ENSTimelineCutsOptions,
} from './timeline-cuts';

export interface ENSComplianceTimelinePoint {
  // The instant this point was evaluated at.
  date: Date;
  label: string;
  score: number;
  // The last point is the present: same events and instant as the panel, so its number is the panel's.
  isCurrent: boolean;
  // How many events the engine knew at that cut: the diagnostic separating a drop because the machine got worse and a drop because it stopped reporting.
  events: number;
}

export interface ENSComplianceTimelineOptions
  extends ENSTimelineCutsOptions {
  agentId?: string;
  scopeAgents?: ENSAgentScope[];
}

export const buildENSComplianceTimeline = (
  level: ENSLevel,
  events: ENSNormalizedEvent[] = [],
  options: ENSComplianceTimelineOptions = {}
): ENSComplianceTimelinePoint[] =>
  buildENSTimelineCuts(events, options).map(cut => {
    const state = getENSComplianceState(
      level,
      cut.events,
      options.agentId,
      options.scopeAgents,
      cut.cutoff
    );

    return {
      date: cut.cutoff,
      label: cut.label,
      score: state.controlSummary.scoreAverage,
      isCurrent: cut.isCurrent,
      events: cut.events.length,
    };
  });
