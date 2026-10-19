// The engine control by control: what the server uses to evaluate the whole window without holding all facts at once. The server reads one control's facts, evaluates it with the usual engine, keeps the result and drops the facts before the next one.
// The panel state is built afterwards exactly as `getENSComplianceState` does over all facts (same rows, consolidation and catalog order); `tests/control-partition.test.ts` proves both paths give the same state.
// WHAT A CONTROL READS FROM OTHER CONTROLS (the server must supply it apart). Three unfiltered `context.events` reads remain across the engine and policies:
// 1. op.mon.3 knows its row from the `agent.id` of the facts it receives, of ANY control. A PRESENCE fact per machine is sent, with the instant of its first fact in the window and a control outside the catalog, so the rest of the engine ignores it.
// 2. op.acc.3 treats a period without actions as "looked at" if a `collector_run` of the machine exists in the last 24 h, of ANY control (`op-acc-3.policy.ts`). Synthetic HEARTBEATS go with the foreign control: the last of each day (see `buildENSHeartbeatEvents`).
// 3. op.acc.3 also reads `account_action`, `critical_task_run` and `security_info_access` of any control: read from the machine with the control's facts (`ENS_CROSS_CONTROL_EVENT_TYPES`).
// Facts naming no control are accepted by evidences and some policies as their own: the server reads them with each machine's.
import { ENSCatalog } from '../catalog';
import type { ENSLevel } from '../configuration/types';
import { buildComplianceState } from './compliance-state';
import type { ENSComplianceState } from './compliance-state/types';
import type { ENSNormalizedEvent } from './data-source/types';
import {
  buildOutOfScopeDeclaredRows,
  getAgentIdentities,
  getENSComplianceResultByControl,
  getENSComplianceResults,
  getENSControlEvaluation,
  isControlEvaluatedOnAgent,
} from './ens-engine';
import { consolidateAgentComplianceResultByControl } from './compliance-state';
import type { ENSComplianceResult } from './evaluation/types';
import { isControlMeasuredOnAgent } from './scope/measurement-planes';
import type { ENSAgentScope } from './scope/types';

export const ENS_PRESENCE_CONTROL_ID = '__ensfacil_presence__';
export const ENS_PRESENCE_EVENT_TYPE = 'agent_presence';

// Reads of other controls the engine does per control (see the header).
export const ENS_CROSS_CONTROL_EVENT_TYPES: Record<string, string[]> = {
  'op.acc.3': ['account_action', 'critical_task_run', 'security_info_access'],
};
export const ENS_CROSS_CONTROL_HEARTBEAT: string[] = ['op.acc.3'];

// A machine's heartbeats, of any control: the last of each day.
export const buildENSHeartbeatEvents = (
  heartbeats: { agentId: string; times: string[] }[]
): ENSNormalizedEvent[] =>
  heartbeats.flatMap(entry =>
    entry.times
      .filter(time => Number.isFinite(Date.parse(time)))
      .map((time, index) => ({
        id: `heartbeat:${entry.agentId}:${index}`,
        agentId: entry.agentId,
        controlId: ENS_PRESENCE_CONTROL_ID,
        status: 'NO_EVALUABLE',
        eventType: 'collector_run',
        sourceType: 'WAZUH_ALERT' as const,
        source: 'ensfacil-heartbeat',
        timestamp: new Date(time).toISOString(),
        attributes: {},
        isSynthetic: false,
      }))
  );

export interface ENSAgentPresence {
  agentId: string;
  agentName?: string;
  // The machine's first fact in the window (any control).
  earliest: string;
}

export const buildENSPresenceEvents = (
  presence: ENSAgentPresence[]
): ENSNormalizedEvent[] =>
  presence
    .filter(entry => entry.agentId && Number.isFinite(Date.parse(entry.earliest)))
    .map(entry => ({
      id: `presence:${entry.agentId}`,
      agentId: entry.agentId,
      agentName: entry.agentName,
      controlId: ENS_PRESENCE_CONTROL_ID,
      status: 'NO_EVALUABLE',
      eventType: ENS_PRESENCE_EVENT_TYPE,
      sourceType: 'WAZUH_ALERT' as const,
      source: 'ensfacil-presence',
      // The exact instant: as of any cut, the machine "exists" if it already had some fact.
      timestamp: new Date(entry.earliest).toISOString(),
      attributes: {},
      isSynthetic: false,
    }));

export interface ENSControlPartitionRow {
  agentId: string;
  result: ENSComplianceResult;
}

export interface ENSControlPartition {
  controlId: string;
  // The view's result: the set's, without machine, or the selected machine's (with the manager's for organisation controls).
  result?: ENSComplianceResult;
  // Rows of the machines that measure the control: the panel's.
  rows: ENSControlPartitionRow[];
}

// Evaluates ONE control with its facts (and presence facts) for a machine or set view.
export const evaluateENSControlPartition = (
  controlId: string,
  level: ENSLevel,
  events: ENSNormalizedEvent[],
  agentId: string | undefined,
  scopeAgents: ENSAgentScope[] | undefined,
  now: Date
): ENSControlPartition => {
  if (agentId === undefined) {
    // With no known machine, the panel evaluates the catalog over all facts without a row (final branch of `getENSComplianceState`).
    if (!getAgentIdentities(events, undefined, scopeAgents).length) {
      return {
        controlId,
        result: getENSComplianceResults(level, events, undefined, scopeAgents, now).find(
          result => result.control.id === controlId
        ),
        rows: [],
      };
    }

    const { result, agents } = getENSControlEvaluation(controlId, level, events, scopeAgents, now);

    return {
      controlId,
      result,
      rows: agents.flatMap(agent =>
        agent.results.map(agentResult => ({ agentId: agent.agentId, result: agentResult }))
      ),
    };
  }

  const control = ENSCatalog.find(entry => entry.id === controlId);
  const result = getENSComplianceResultByControl(controlId, level, events, agentId, scopeAgents, now);
  // The machine row carries only the controls measured on it; organisation controls show in the view with the manager's result but are not on its row (`withOrganizationControls`).
  const measured = Boolean(result && control && isControlMeasuredOnAgent(control, agentId));

  return { controlId, result, rows: measured && result ? [{ agentId, result }] : [] };
};

const catalogOrder = new Map(ENSCatalog.map((control, index) => [control.id, index]));
const byCatalog = (left: { controlId: string }, right: { controlId: string }) =>
  (catalogOrder.get(left.controlId) ?? Number.MAX_SAFE_INTEGER) -
  (catalogOrder.get(right.controlId) ?? Number.MAX_SAFE_INTEGER);

// Panel state from the separately evaluated controls; same as `getENSComplianceState` over all facts: machines are the scope's (named by the latest fact if the inventory lacks it: `nameEvents`), each with its row's controls, results in catalog order.
export const assembleENSComplianceState = (
  partitions: ENSControlPartition[],
  agentId: string | undefined,
  scopeAgents: ENSAgentScope[] | undefined,
  nameEvents: ENSNormalizedEvent[] = []
): ENSComplianceState => {
  const ordered = [...partitions].sort(byCatalog);
  const agents = getAgentIdentities(nameEvents, agentId, scopeAgents).map(identity => {
    const results = ordered.flatMap(partition =>
      partition.rows
        .filter(row => row.agentId === identity.agentId)
        .map(row => row.result)
    );

    return {
      agentId: identity.agentId,
      agentName: identity.agentName,
      results,
      summary: buildComplianceState(results).controlSummary,
    };
  });

  return buildComplianceState(
    ordered
      .map(partition => partition.result)
      .filter((result): result is ENSComplianceResult => Boolean(result)),
    agents
  );
};

// Control by control AND machine by machine. What the server uses to never hold all machines' facts: the rows a control measures (`listENSControlRowAgents`), each evaluated with ITS machine's facts (`evaluateENSControlRow`),
// and the set view consolidated with the engine's consolidation (`consolidateENSControlRows`). Proven by `tests/control-partition.test.ts` and `tests/evaluation-server.test.ts`.

// Scope machines on whose row the control is evaluated (its plane and, if declared, its scope), in engine order.
export const listENSControlRowAgents = (
  controlId: string,
  scopeAgents: ENSAgentScope[] | undefined,
  identityEvents: ENSNormalizedEvent[] = []
): { agentId: string; agentName?: string }[] => {
  const control = ENSCatalog.find(entry => entry.id === controlId);
  return getAgentIdentities(identityEvents, undefined, scopeAgents).filter(
    identity => !control || isControlEvaluatedOnAgent(control, identity.agentId, identity.agentName)
  );
};

// The row of ONE machine with that machine's facts.
export const evaluateENSControlRow = (
  controlId: string,
  level: ENSLevel,
  agentEvents: ENSNormalizedEvent[],
  agentId: string,
  scopeAgents: ENSAgentScope[] | undefined,
  now: Date
): ENSComplianceResult | undefined =>
  getENSComplianceResultByControl(controlId, level, agentEvents, agentId, scopeAgents, now);

// The set view from the rows: the machines that measure it and the declared ones outside the scope (no facts). `undefined` if there is no row: the engine then evaluates the control without row over all its facts, and so does the server.
export const consolidateENSControlRows = (
  controlId: string,
  level: ENSLevel,
  rows: { agentId: string; agentName?: string; result: ENSComplianceResult }[],
  identityEvents: ENSNormalizedEvent[],
  scopeAgents: ENSAgentScope[] | undefined,
  now: Date
): ENSComplianceResult | undefined => {
  const agents = [
    ...rows.map(row => ({
      agentId: row.agentId,
      agentName: row.agentName,
      results: [row.result],
      summary: buildComplianceState([row.result]).controlSummary,
    })),
    ...buildOutOfScopeDeclaredRows(
      ENSCatalog.filter(control => control.id === controlId),
      level,
      identityEvents,
      scopeAgents,
      now
    ),
  ];
  return agents.length ? consolidateAgentComplianceResultByControl(agents, controlId) : undefined;
};

// A result reduced to what consolidation uses for state and number (for past days of the series, where detail is not needed).
export const resultStatusStub = (
  controlId: string,
  status: string,
  score: number | undefined
): ENSComplianceResult =>
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
