import { ENSComplianceResult } from '../evaluation/types';
import {
  ENSComplianceState,
  ENSComplianceStatusFilter,
} from './types';

export const getComplianceResults = (
  state: ENSComplianceState
): ENSComplianceResult[] => state.results;

export const getComplianceSummary = (
  state: ENSComplianceState
) => state.controlSummary;

export const getControlSummary = (
  state: ENSComplianceState
) => state.controlSummary;

export const getAgentSummary = (
  state: ENSComplianceState
) => state.agentSummary;

export const getEvidenceSummary = (
  state: ENSComplianceState
) => state.evidenceSummary;

export const getComplianceResultsByStatus = (
  state: ENSComplianceState,
  status: ENSComplianceStatusFilter
): ENSComplianceResult[] =>
  status === 'ALL'
    ? state.results
    : state.results.filter(result => result.status === status);

export const getComplianceResultByControl = (
  state: ENSComplianceState,
  controlId: string
): ENSComplianceResult | undefined =>
  state.results.find(result => result.control.id === controlId);

export const getComplianceResultsByAgent = (
  state: ENSComplianceState,
  agentId: string
): ENSComplianceResult[] =>
  state.agents.find(agent => agent.agentId === agentId)?.results || [];
