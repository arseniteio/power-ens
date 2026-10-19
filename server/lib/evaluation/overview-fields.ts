// Fields the evaluation route adds for the overview views (1.2.0, Task 2). Pure functions over what the
// evaluation already holds in memory (built state, probe, series points): no extra reads. Kept apart from
// `responses.ts` and `evaluation-service.ts` to hook in with one line each. What the screens consume is in
// `server/README.md`.
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import type { ENSComplianceState } from '../../../common/ens/core/compliance-state/types';
import type { ENSControlSummaryEntry, ENSFreshness, ENSOverviewNonConformity } from '../../../common/ens/evaluation/types';
import type { ENSProbeResult } from './queries';
import { guiltyPart, parseMotive } from '../../../common/ens/evaluation/motive-parser';

// `summary` and `overview`: each machine with what each control says ON ITS ROW (the Vista general matrix and
// the per-control bar of the list). A control not measured there does not appear.
export const agentControlRows = (
  state: Pick<ENSComplianceState, 'agents'> | undefined,
  summaryOf: (controlId: string, result?: ENSComplianceResult) => ENSControlSummaryEntry
) =>
  (state?.agents || []).map(agent => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    summary: agent.summary,
    controls: agent.results.map(result => summaryOf(result.control.id, result)),
  }));

// `overview`: collection freshness, from the probe already done for the fingerprint. The machines are those in
// scope.
export const freshnessOf = (
  probe: Pick<ENSProbeResult, 'presence' | 'heartbeats' | 'controls'>,
  meta: { evaluatedAt: string; scope: { id: string; name?: string }[] }
): ENSFreshness => {
  const inScope = new Set(meta.scope.map(agent => agent.id));
  return {
    checkedAt: meta.evaluatedAt,
    agents: meta.scope.map(agent => {
      const presence = probe.presence.find(p => p.agentId === agent.id);
      const heartbeats = probe.heartbeats[agent.id] || [];
      return {
        agentId: agent.id,
        count: presence?.count || 0,
        earliest: presence?.earliest,
        newest: presence?.newest,
        lastHeartbeat: heartbeats.length ? heartbeats[heartbeats.length - 1] : undefined,
      };
    }),
    cells: Object.entries(probe.controls).flatMap(([controlId, facts]) =>
      Object.entries(facts.agents || {})
        .filter(([agentId]) => inScope.has(agentId))
        .map(([agentId, h]) => ({ controlId, agentId, count: h.count, newest: h.newest }))
    ),
  };
};

// `overview`: the work queue, the non-conformities of the overview with their control. Only what the queue
// draws: the headline (first sentence of the culprit evidence, same parser as the card) and machines by id. No
// action, full finding, impact or traces: the detail is one click away.
export const nonConformitiesOf = (state: Pick<ENSComplianceState, 'results'> | undefined): ENSOverviewNonConformity[] =>
  (state?.results || []).flatMap(result =>
    (result.nonConformities || []).map(nc => {
      const culprit = guiltyPart(parseMotive(nc.finding).parts, nc.evidenceIds || []);
      return {
        controlId: result.control.id,
        id: nc.id,
        requirementId: nc.requirementId,
        origin: nc.origin,
        ...(nc.cause ? { cause: nc.cause } : {}),
        ...(nc.documental ? { documental: true } : {}),
        evidenceIds: nc.evidenceIds || [],
        agentIds: (nc.agents || []).map(agent => agent.agentId),
        title: culprit?.summary || nc.finding,
        ...(culprit?.evidenceId ? { titleEvidenceId: culprit.evidenceId, titleStatus: culprit.status } : {}),
      };
    })
  );

// Per-control figures of each series point go only to whoever asks (`timelineControls=true`, the Vista general
// trend). The service always computes them (stored with the past days); they are stripped here if not requested.
export const overviewQueryFlags = (query: Record<string, unknown>): { timelineControls?: true } =>
  query.timelineControls === true || query.timelineControls === 'true' ? { timelineControls: true } : {};

export const visibleTimeline = (timeline: any[] | undefined, query: { timelineControls?: boolean }): any[] | undefined =>
  timeline && !query.timelineControls ? timeline.map(({ controls, ...point }) => point) : timeline;

// A series point without control: the state of each control that day. `points[i]` is that of `controls[i]` at
// that cut (`null` or nothing: not measured that day in the view).
export const perControlOfPoint = (
  controls: string[],
  points: ({ status?: string; score?: number } | null | undefined)[]
): Record<string, { status?: string; score?: number }> =>
  Object.fromEntries(controls.flatMap((controlId, i) => (points[i] ? [[controlId, { status: points[i]!.status, score: points[i]!.score }]] : [])));

// Today's point: the view's results.
export const perControlOfResults = (results: Pick<ENSComplianceResult, 'control' | 'status' | 'score'>[]) =>
  Object.fromEntries(results.map(r => [r.control.id, { status: r.status, score: r.score }]));
