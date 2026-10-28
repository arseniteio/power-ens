import { ENSCatalog } from '../../../common/ens/catalog';
import type { ENSAgentScope } from '../../../common/ens/core/scope/types';
import type { ENSVerdictsProbe } from './verdict-queries';

export interface ENSEvaluationWindow {
  from: string;
  to: string;
}

const PERIOD_DAYS: Record<string, number> = {
  'Últimas 24 horas': 1,
  'Últimos 7 días': 7,
  'Últimos 30 días': 30,
  'Últimos 90 días': 90,
};

// The configuration's evaluation period as absolute instants; anything not understood is 30 days.
export const resolveEvaluationWindow = (evaluationPeriod: string, now: Date): ENSEvaluationWindow => ({
  from: new Date(now.getTime() - (PERIOD_DAYS[evaluationPeriod] || 30) * 86400e3).toISOString(),
  to: now.toISOString(),
});

export const catalogControlIds = (): string[] => ENSCatalog.map(control => control.id);

export interface ENSVerdictStamp {
  count: number;
  earliest?: string;
  newest?: string;
}

// What the engine has judged in the window: in total, per machine and per control and machine.
export interface ENSVerdictActivity {
  total: ENSVerdictStamp;
  agents: Record<string, ENSVerdictStamp>;
  cells: { controlId: string; agentId: string; count: number; newest: string }[];
}

const widen = (stamp: ENSVerdictStamp, count: number, oldest: string, newest: string): ENSVerdictStamp => ({
  count: stamp.count + count,
  earliest: !stamp.earliest || oldest < stamp.earliest ? oldest : stamp.earliest,
  newest: !stamp.newest || newest > stamp.newest ? newest : stamp.newest,
});

export const activityOf = (probe: ENSVerdictsProbe, scope: ENSAgentScope[]): ENSVerdictActivity => {
  const inScope = new Set(scope.map(agent => agent.id));
  const activity: ENSVerdictActivity = { total: { count: 0 }, agents: {}, cells: [] };
  for (const [controlId, byAgent] of Object.entries(probe)) {
    for (const [agentId, stamp] of Object.entries(byAgent)) {
      if (!inScope.has(agentId)) continue;
      activity.total = widen(activity.total, stamp.count, stamp.oldest, stamp.newest);
      activity.agents[agentId] = widen(activity.agents[agentId] || { count: 0 }, stamp.count, stamp.oldest, stamp.newest);
      activity.cells.push({ controlId, agentId, count: stamp.count, newest: stamp.newest });
    }
  }
  return activity;
};
