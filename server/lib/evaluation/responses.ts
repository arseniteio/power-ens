// What each view returns. Compact: the browser receives results, never facts. The shape of each is in
// `server/README.md`.
import { buildENSDashboardModel } from '../../../common/ens/core/dashboard-adapter/dashboard-adapter';
import type { ENSComplianceResult } from '../../../common/ens/core/evaluation/types';
import { ENS_EVALUATION_LIMITS } from '../../../common/ens/evaluation/limits';
import { catalogControlIds } from './queries';
import type { ENSEvaluationService } from './evaluation-service';
import { summarizeControlMaturity, summarizeMaturityDistribution } from '../../../common/ens/maturity/maturity-engine';
import type { ENSControlMaturity } from '../../../common/ens/maturity/types';
import type { ENSMaturityOfView } from '../maturity/maturity-service';
// What the overview views add (Task 2), kept apart so it can be re-hooked without touching the rest.
import { agentControlRows, freshnessOf, nonConformitiesOf, visibleTimeline } from './overview-fields';

type RunOutput = Awaited<ReturnType<ENSEvaluationService['run']>>;

// What the control list draws for each: the state and how many applicable requirements fail (and of those, how
// many for lack of evidence).
export const controlSummaryOf = (controlId: string, result?: ENSComplianceResult) => {
  // `applicable` is set by the requirement evaluator even if the type does not declare it; same filter the list
  // row used.
  const requirements = (result?.requirements || []).filter(requirement => (requirement as { applicable?: boolean }).applicable);
  return {
    controlId,
    status: result?.status || 'NO_EVALUABLE',
    score: result?.score,
    evaluated: Boolean(result),
    requirementsNotMet: requirements.filter(requirement => requirement.status !== 'CUMPLE').length,
    requirementsNotEvidenced: requirements.filter(
      requirement => requirement.status !== 'CUMPLE' && (requirement as { evidenced?: boolean }).evidenced === false
    ).length,
  };
};

const agentRows = (run: RunOutput) =>
  (run.state?.agents || []).map(agent => ({
    agentId: agent.agentId,
    agentName: agent.agentName,
    summary: agent.summary,
    results: agent.results.map(result => ({ controlId: result.control.id, status: result.status, score: result.score })),
  }));

const stateHeader = (run: RunOutput) => {
  const state = run.state!;
  return {
    controlSummary: state.controlSummary,
    requirementSummary: state.requirementSummary,
    agentSummary: state.agentSummary,
    evidenceSummary: state.evidenceSummary,
  };
};

// The maturity of the controls of a list view: each one's levels and, with every control computed, the
// organisation's distribution.
const maturityOfList = (maturity: Map<string, ENSControlMaturity>, pending: boolean) => {
  const controls = Array.from(maturity.values()).map(summarizeControlMaturity);
  return { controls, ...(pending ? {} : { distribution: summarizeMaturityDistribution(controls) }) };
};

export const buildEvaluationResponse = (run: RunOutput, maturity?: ENSMaturityOfView, maturityError?: string) => {
  const { query, state, views } = run;
  // Maturity still being read arrives like the series: marked pending, and the browser asks again.
  const meta = maturity?.pending
    ? { ...run.meta, maturityPending: true, fingerprint: run.meta.fingerprint.startsWith('refreshing:') ? run.meta.fingerprint : `refreshing:${run.meta.fingerprint}` }
    : run.meta;
  const timeline = visibleTimeline(run.timeline, query);
  // While pending, what is in memory still shows (marked), without a version: nothing is recorded over stale data.
  const failed = maturityError || maturity?.error;
  const withMaturity = (list: boolean) => ({
    ...(maturity && maturity.controls.size
      ? list
        ? { maturity: maturityOfList(maturity.controls, maturity.pending || !maturity.complete) }
        : { maturity: query.controlId ? maturity.controls.get(query.controlId) : undefined }
      : {}),
    ...(maturity && !list && !maturity.pending && !maturity.error ? { maturityVersion: maturity.version } : {}),
    ...(failed ? { maturityError: failed } : {}),
  });

  if (query.include === 'control' && query.controlId) {
    const entry = views.get(query.controlId);
    return {
      meta,
      ...withMaturity(false),
      // The first traceability entries (the most recent); the rest are paged in `/evaluation/traceability`.
      result: entry?.result
        ? { ...entry.result, traceability: entry.traceability().slice(0, ENS_EVALUATION_LIMITS.traceabilityInitial) }
        : undefined,
      traceabilityTotal: entry?.traceabilityTotal || 0,
      traceabilityAvailable: entry?.traceabilityStored || 0,
      agents: (entry?.rows || []).map(row => ({
        agentId: row.agentId,
        agentName: run.rowName(row.agentId) || meta.scope.find(agent => agent.id === row.agentId)?.name,
        status: row.result.status,
        score: row.result.score,
      })),
      timeline,
    };
  }

  if (!state) {
    return { meta };
  }

  // Controls still to compute (first load): in place, without state.
  const pendings = meta.pending?.controls || [];
  const withPending = <T extends { controlId: string }>(readyOnes: T[], pending: (controlId: string) => T): T[] => {
    if (!pendings.length) return readyOnes;
    const byIdMap = new Map(readyOnes.map(entry => [entry.controlId, entry]));
    return catalogControlIds()
      .filter(id => byIdMap.has(id) || pendings.includes(id))
      .map(id => byIdMap.get(id) || pending(id));
  };

  if (query.include === 'summary' || query.include === 'overview') {
    const summary = {
      meta,
      ...withMaturity(true),
      ...stateHeader(run),
      controls: withPending(
        state.results.map(result => controlSummaryOf(result.control.id, result)),
        controlId => ({ ...controlSummaryOf(controlId, undefined), pending: true })
      ),
      // Each machine with what each control says on its row; pending ones are not there yet (the screen marks
      // them by `controls[].pending`).
      agents: agentControlRows(run.state, controlSummaryOf),
      ...(timeline ? { timeline } : {}),
    };
    return query.include === 'overview'
      ? { ...summary, freshness: freshnessOf(run.ctx.probe, run.meta), nonConformities: nonConformitiesOf(run.state) }
      : summary;
  }

  if (query.include === 'dashboard') {
    const model = buildENSDashboardModel(state, [], (timeline || []).map(point => ({ ...point, date: new Date(point.date) })));
    return {
      meta,
      ...withMaturity(true),
      ...stateHeader(run),
      dashboard: { ...model, impactEvents: run.impact },
      agents: agentRows(run),
      timeline,
      // With the first load half done, the state of each control (the missing ones, `pending`): the panel shows
      // those, not aggregate figures.
      ...(pendings.length
        ? {
            controls: withPending(
              state.results.map(result => controlSummaryOf(result.control.id, result)),
              controlId => ({ ...controlSummaryOf(controlId, undefined), pending: true })
            ),
          }
        : {}),
    };
  }

  // 'results': everything the engine says of each control, without traceability.
  return {
    meta,
    ...stateHeader(run),
    results: state.results,
    agents: agentRows(run),
    timeline,
  };
};

// The traceability of a control, paged, from what is stored.
export const buildTraceabilityPage = (run: RunOutput, from: number, size: number) => {
  const entry = run.query.controlId ? run.views.get(run.query.controlId) : undefined;
  const list = entry ? entry.traceability() : [];
  return {
    meta: run.meta,
    total: entry?.traceabilityTotal || 0,
    available: list.length,
    from,
    items: list.slice(from, from + size),
  };
};
