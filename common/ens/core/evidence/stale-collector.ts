// Unrenewed data: a control is not judged with what its collector stopped sending days ago. The engine judges state with the collector's last pass (see `state-facts.ts`), right while it keeps passing;
// once it stops, "the last pass" is an old snapshot and the panel would show a CUMPLE nobody proved TODAY.
// THE RULE. On a machine's row, if a control's last `collector_run` heartbeat is older than `STALE_COLLECTOR_MAX_AGE_HOURS` relative to the evaluation instant, that control on that machine is not judged with that data:
// all its evidences come out NO_EVALUABLE with cause COLLECTION and motive "sin datos del recolector desde <fecha UTC>", and its requirements do not comply. It is a collection failure, not a finding on the machine.
// WITHOUT ANY HEARTBEAT BUT WITH FACTS (orphan data) the same holds, with the control's latest fact as reference. WITHOUT HEARTBEAT OR FACTS nothing is done: the engine already resolves it as "nothing arrived".
// MEASURED AS OF `now`, not the clock (the daily series evaluates past days).
// NOT TOUCHED: what comes from configuration (a requirement the policy takes out of play, an evidence not applying to the level). Old facts are not hidden: they stay in the traceability.
import type { ENSNormalizedEvent } from '../data-source/types';
import type { ENSPolicyRuntimeResult } from '../policy-runtime/types';
import { withReplacedReason } from '../policy-runtime/reason-parts';
import type { ENSEvidenceResolved } from './types';

// SINGLE age threshold of the last heartbeat. Collectors beat hourly (op.exp.1 every 6 h and op.exp.2 every 12 h in the reference installation), so 24 h tolerates a day of network failures; same default margin as the evidence heartbeat coverage.
export const STALE_COLLECTOR_MAX_AGE_HOURS = 24;

const STALE_COLLECTOR_MAX_AGE_MS =
  STALE_COLLECTOR_MAX_AGE_HOURS * 60 * 60 * 1000;

const COLLECTOR_RUN_EVENT_TYPE = 'collector_run';

export interface ENSStaleCollector {
  // Instant of the last heartbeat (or last fact, if no heartbeat).
  since: string;
  // Whether the reference is a heartbeat or, lacking one, an orphan fact.
  reference: 'collector_run' | 'fact';
  reason: string;
}

// `2026-09-25 12:33 UTC`. In UTC on purpose: the motive is read by the panel, the report and the auditor in possibly different zones.
const formatUtc = (time: number): string =>
  `${new Date(time).toISOString().slice(0, 16).replace('T', ' ')} UTC`;

// Has the control stopped renewing on this machine? `events` are ONE row's: the engine asks only with the machine fixed.
export const findStaleCollector = (
  controlId: string,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSStaleCollector | undefined => {
  const nowMs = now.getTime();

  let lastRun: number | undefined;
  let lastFact: number | undefined;

  events.forEach(event => {
    if (event.controlId !== controlId) {
      return;
    }

    const time = Date.parse(event.timestamp);

    // What is later than `now` did not exist at the evaluated instant.
    if (Number.isNaN(time) || time > nowMs) {
      return;
    }

    if (event.eventType === COLLECTOR_RUN_EVENT_TYPE) {
      lastRun = Math.max(lastRun ?? time, time);
    } else {
      lastFact = Math.max(lastFact ?? time, time);
    }
  });

  const reference = lastRun ?? lastFact;

  if (reference === undefined || nowMs - reference <= STALE_COLLECTOR_MAX_AGE_MS) {
    return undefined;
  }

  const since = formatUtc(reference);

  return {
    since: new Date(reference).toISOString(),
    reference: lastRun !== undefined ? 'collector_run' : 'fact',
    reason:
      lastRun !== undefined
        ? `Sin datos del recolector desde ${since}: el último latido de ${controlId} en esta máquina tiene más de ${STALE_COLLECTOR_MAX_AGE_HOURS} h y lo que envió entonces no demuestra su estado a fecha de la evaluación.`
        : `Sin datos del recolector desde ${since}: hay hechos de ${controlId} en esta máquina pero ningún latido del recolector, y el más reciente tiene más de ${STALE_COLLECTOR_MAX_AGE_HOURS} h.`,
  };
};

// All applicable evidences to NO_EVALUABLE / COLLECTION with the motive. The event that resolved them is removed and `lastSeen` is kept, which truthfully says when the last data arrived.
export const markEvidencesStale = (
  evidences: ENSEvidenceResolved[],
  stale: ENSStaleCollector
): ENSEvidenceResolved[] =>
  evidences.map(evidence => {
    if (evidence.status === 'NO_APLICA') {
      return evidence;
    }

    const {
      resolvedEventId,
      resolvedEventType,
      resolvedSourceType,
      resolvedSource,
      resolvedRuleId,
      resolvedRuleDescription,
      resolvedAttributes,
      latestSuccessfulEventId,
      latestSuccessfulAttributes,
      ...rest
    } = evidence;

    return {
      ...rest,
      status: 'NO_EVALUABLE',
      gapCause: 'COLLECTION',
      // The `motivo` is what the nonconformity quotes as "Motivo — EV-xx: …".
      resolvedAttributes: { motivo: stale.reason, causa: 'COLLECTION' },
      observations: [
        `${evidence.id} NO_EVALUABLE: ${stale.reason}`,
        `Pregunta de auditoría: ${evidence.auditQuestion}`,
      ],
    };
  });

// Policy decisions come from the same old data, so they cannot decide either. Those from configuration survive: NO_APLICA and `documental` (a declared table with validity), in any state.
// Deleting a documental NO_CUMPLE left it NO_EVALUABLE, which on a requirement without technical evidence opens the door to P-ATT: a false CUMPLE.
export const markPolicyRuntimeStale = (
  policyRuntime: ENSPolicyRuntimeResult | undefined,
  stale: ENSStaleCollector
): ENSPolicyRuntimeResult | undefined =>
  policyRuntime && {
    ...policyRuntime,
    decisions: policyRuntime.decisions.map(decision =>
      decision.status === 'NO_APLICA' || decision.documental
        ? decision
        : withReplacedReason(decision, {
            status: 'NO_EVALUABLE',
            cause: 'COLLECTION',
            reason: stale.reason,
          })
    ),
  };
