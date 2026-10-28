// Shape of the `/api/powerEns/evaluation` responses the screens read.
import type { ENSComplianceResult, ENSNonConformity } from '../core/evaluation/types';
import type { ENSComplianceSummary } from '../core/compliance-state/types';

export interface ENSEvaluationMeta {
  // Fingerprint of the view data (the one the probe compares).
  fingerprint: string;
  // Something stored is shown while it is recomputed behind, or rows (`pending`) or the daily series (`seriesPending`) are still missing.
  refreshing: boolean;
  // The first load answers with what exists: how many rows are missing, of which controls and how many in total. The browser asks again every 2 s while there are any.
  pending?: { rows: number; controls: string[]; total: number };
  // The daily series is still being computed (in the background): the view goes without `timeline` and the browser asks again.
  seriesPending?: boolean;
  // The last background refresh that failed: what is shown predates it.
  refreshError?: { message: string; at: string };
  // When the shown result was last confirmed current; while refreshing, the time of the oldest stale part.
  computedAt: string;
  evaluatedAt: string;
  configurationUpdatedAt?: string;
  level: string;
  window: { from: string; to: string };
  agentId?: string;
  controlId?: string;
  verdicts: { count: number; newest?: string };
  scope: { id: string; name?: string; status?: string }[];
  inventory: { stale: boolean; newestTimestamp?: string; agents: number };
}

export interface ENSEvaluationTimelinePoint {
  date: string;
  label: string;
  isCurrent: boolean;
  events?: number;
  score?: number;
  status?: string;
  // Without control (list, panel, overview): each control's state that day in the view (the overview's per-control trend).
  controls?: Record<string, { status?: string; score?: number }>;
}

export interface ENSControlSummaryEntry {
  controlId: string;
  status: string;
  score?: number;
  evaluated: boolean;
  // Still being computed (first load): neither state nor number.
  pending?: boolean;
  requirementsNotMet: number;
  requirementsNotEvidenced: number;
}

export interface ENSControlEvaluationResponse {
  meta: ENSEvaluationMeta;
  result?: ENSComplianceResult;
  traceabilityTotal: number;
  // How many entries can be paged through (the first stored ones).
  traceabilityAvailable: number;
  agents: { agentId: string; agentName?: string; status: string; score?: number }[];
  timeline?: ENSEvaluationTimelinePoint[];
}

// A scope machine and what each control says on ITS row. A control not measured there does not appear (not even as NO_APLICA): it has no row.
export interface ENSAgentControlsRow {
  agentId: string;
  agentName?: string;
  summary?: ENSComplianceSummary;
  controls: ENSControlSummaryEntry[];
}

export interface ENSSummaryEvaluationResponse {
  meta: ENSEvaluationMeta;
  controlSummary: ENSComplianceSummary;
  controls: ENSControlSummaryEntry[];
  agents?: ENSAgentControlsRow[];
  // With `timelineDays`.
  timeline?: ENSEvaluationTimelinePoint[];
}

// When the engine last judged each machine, and each control on it.
export interface ENSFreshnessAgent {
  agentId: string;
  // Names appear once, in `meta.scope`.
  count: number;
  earliest?: string;
  newest?: string;
}

export interface ENSFreshnessCell {
  controlId: string;
  agentId: string;
  count: number;
  newest?: string;
}

export interface ENSFreshness {
  checkedAt: string;
  agents: ENSFreshnessAgent[];
  cells: ENSFreshnessCell[];
}

// A set-view nonconformity for the work queue: what the queue paints and nothing else. The headline is the first sentence of the culprit evidence (`motive-parser.ts`), computed on the server; the whole motive is one click away. Machines by id (names in `meta.scope`).
export type ENSOverviewNonConformity = Pick<ENSNonConformity, 'id' | 'requirementId' | 'origin' | 'cause' | 'documental' | 'evidenceIds'> & {
  controlId: string;
  agentIds: string[];
  title: string;
  titleEvidenceId?: string;
  titleStatus?: string;
};

// `include=overview`: the overview in a single request.
export interface ENSOverviewEvaluationResponse extends ENSSummaryEvaluationResponse {
  freshness: ENSFreshness;
  nonConformities: ENSOverviewNonConformity[];
}

export interface ENSTraceabilityPageResponse {
  meta: ENSEvaluationMeta;
  total: number;
  available: number;
  from: number;
  items: ENSComplianceResult['traceability'];
}
