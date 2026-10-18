// La forma de las respuestas de `/api/ensfacil/evaluation` que leen las
// pantallas (la describe también `server/README.md`).
import type { ENSComplianceResult } from '../core/evaluation/types';
import type { ENSComplianceSummary } from '../core/compliance-state/types';

export interface ENSEvaluationMeta {
  // Huella de los datos de la vista (la que compara la sonda).
  fingerprint: string;
  // Se enseña algo guardado mientras se recalcula detrás (o la serie diaria
  // aún se está calculando: `timelinePending`).
  refreshing: boolean;
  timelinePending?: boolean;
  // El último refresco en segundo plano que falló: lo que se enseña es lo
  // anterior a él.
  refreshError?: { message: string; at: string };
  // Cuándo se calculó lo que se enseña (lo más antiguo de ello).
  computedAt: string;
  evaluatedAt: string;
  configurationUpdatedAt?: string;
  level: string;
  window: { from: string; to: string };
  agentId?: string;
  controlId?: string;
  facts: { count: number; newest?: string };
  scope: { id: string; name?: string; status?: string }[];
  inventory: { stale: boolean; newestTimestamp?: string; agents: number };
}

export interface ENSEvaluationTimelinePoint {
  date: string;
  label: string;
  isCurrent: boolean;
  // Hechos (documentos) conocidos hasta ese día.
  events: number;
  score?: number;
  status?: string;
}

export interface ENSControlSummaryEntry {
  controlId: string;
  status: string;
  score?: number;
  evaluated: boolean;
  requirementsNotMet: number;
  requirementsNotEvidenced: number;
}

export interface ENSControlEvaluationResponse {
  meta: ENSEvaluationMeta;
  result?: ENSComplianceResult;
  traceabilityTotal: number;
  // Cuántas entradas se pueden recorrer por páginas (las primeras guardadas).
  traceabilityAvailable: number;
  agents: { agentId: string; agentName?: string; status: string; score?: number }[];
  timeline?: ENSEvaluationTimelinePoint[];
}

export interface ENSSummaryEvaluationResponse {
  meta: ENSEvaluationMeta;
  controlSummary: ENSComplianceSummary;
  controls: ENSControlSummaryEntry[];
}

export interface ENSResultsEvaluationResponse {
  meta: ENSEvaluationMeta;
  controlSummary: ENSComplianceSummary;
  results: ENSComplianceResult[];
  timeline?: ENSEvaluationTimelinePoint[];
}

export interface ENSTraceabilityPageResponse {
  meta: ENSEvaluationMeta;
  total: number;
  available: number;
  from: number;
  items: ENSComplianceResult['traceability'];
}
