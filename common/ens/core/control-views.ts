// A control seen over several machines, and the panel state built from those views. Consolidation is
// presentation: every result it combines comes from the engine verdicts.
import { ENSCatalog } from '../catalog';
import { buildComplianceState, consolidateAgentComplianceResultByControl } from './compliance-state';
import type { ENSComplianceState } from './compliance-state/types';
import type { ENSComplianceResult } from './evaluation/types';
import type { ENSAgentScope } from './scope/types';

export interface ENSControlView {
  agentId: string;
  agentName?: string;
  result: ENSComplianceResult;
}

export interface ENSControlPartition {
  controlId: string;
  result?: ENSComplianceResult;
  rows: { agentId: string; result: ENSComplianceResult }[];
}

export const consolidateRows = (controlId: string, rows: ENSControlView[]): ENSComplianceResult | undefined =>
  rows.length
    ? consolidateAgentComplianceResultByControl(
        rows.map(row => ({
          agentId: row.agentId,
          agentName: row.agentName,
          results: [row.result],
          summary: buildComplianceState([row.result]).controlSummary,
        })),
        controlId
      )
    : undefined;

const catalogOrder = new Map(ENSCatalog.map((control, index) => [control.id, index]));

const byCatalog = (left: { controlId: string }, right: { controlId: string }) =>
  (catalogOrder.get(left.controlId) ?? Number.MAX_SAFE_INTEGER) - (catalogOrder.get(right.controlId) ?? Number.MAX_SAFE_INTEGER);

export const assembleState = (partitions: ENSControlPartition[], agents: ENSAgentScope[]): ENSComplianceState => {
  const ordered = [...partitions].sort(byCatalog);
  const agentStates = agents.map(agent => {
    const results = ordered.flatMap(partition => partition.rows.filter(row => row.agentId === agent.id).map(row => row.result));
    return { agentId: agent.id, agentName: agent.name, results, summary: buildComplianceState(results).controlSummary };
  });
  return buildComplianceState(
    ordered.map(partition => partition.result).filter((result): result is ENSComplianceResult => Boolean(result)),
    agentStates
  );
};

// A result reduced to what consolidation uses for state and number (past days of the series).
export const resultStatusStub = (controlId: string, status: string, score: number | undefined): ENSComplianceResult =>
  ({
    control: { id: controlId, name: controlId, family: '', category: '', description: '' },
    level: 'BAJO',
    status,
    score,
    coverage: 0,
    applicableRequirements: 0,
    measuredRequirements: 0,
    unmeasuredRequirements: [],
    evaluatedAt: '',
    requirements: [],
    parameters: [],
    evidences: [],
    missingParameters: [],
    missingEvidences: [],
    relatedRules: [],
    nonConformities: [],
    observations: [],
    traceability: [],
  } as unknown as ENSComplianceResult);
