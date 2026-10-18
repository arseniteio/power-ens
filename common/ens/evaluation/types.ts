// La forma de las respuestas de `/api/ensfacil/evaluation` que leen las
// pantallas (la describe también `server/README.md`).
import type { ENSComplianceResult, ENSNonConformity } from '../core/evaluation/types';
import type { ENSComplianceSummary } from '../core/compliance-state/types';

export interface ENSEvaluationMeta {
  // Huella de los datos de la vista (la que compara la sonda).
  fingerprint: string;
  // Se enseña algo guardado mientras se recalcula detrás.
  refreshing: boolean;
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
  // Sin control (lista, panel, vista general): el estado de cada control ese
  // día en la vista (la tendencia por control de la Vista general).
  controls?: Record<string, { status?: string; score?: number }>;
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

// Una máquina del alcance y lo que dice cada control en SU fila. Un control que
// no se mide en ella no aparece (ni como NO_APLICA): no tiene fila.
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
  // Con `timelineDays`.
  timeline?: ENSEvaluationTimelinePoint[];
}

// Frescura de la recogida, de la sonda (sin leer ningún hecho más): el último
// hecho y cuántos hay de cada control en cada máquina, y de cada máquina, el
// primero, el último y su último latido de recolector.
export interface ENSFreshnessAgent {
  agentId: string;
  // Los nombres están una vez, en `meta.scope`.
  count: number;
  earliest?: string;
  newest?: string;
  lastHeartbeat?: string;
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

// Una no conformidad de la vista de conjunto, para la cola de trabajo: lo que
// pinta la cola y nada más. El titular es la primera frase de la evidencia
// culpable (`motive-parser.ts`), calculado en el servidor; el motivo entero está
// a un clic, en el detalle. Las máquinas, por id (los nombres, en `meta.scope`).
export type ENSOverviewNonConformity = Pick<ENSNonConformity, 'id' | 'requirementId' | 'origin' | 'cause' | 'documental' | 'evidenceIds'> & {
  controlId: string;
  agentIds: string[];
  title: string;
  titleEvidenceId?: string;
  titleStatus?: string;
};

// `include=overview`: la Vista general en una sola petición.
export interface ENSOverviewEvaluationResponse extends ENSSummaryEvaluationResponse {
  freshness: ENSFreshness;
  nonConformities: ENSOverviewNonConformity[];
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
