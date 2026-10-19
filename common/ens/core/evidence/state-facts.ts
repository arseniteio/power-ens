// STATE facts are judged by the latest observation, not the window. For an ACTION the window is right (an unauthorised edit from three weeks ago still counts); for a STATE it is not
// (a password policy fixed at 12:00 and observed at 12:07 kept failing from the 11:47 snapshot for a month).
// The latest observation is NOT "the last pass": a collector does not look at everything each pass (op.exp.3 emits the service inventory once a day), and taking the bare last pass sank those evidences to NO_EVALUABLE.
// The cut is taken PER EVIDENCE with the more recent of the collector's TWO signals: the heartbeat declaring it covered (`evidencias_cubiertas`) and the emission of one of its facts.
// THE CUT IS MEASURED AS OF `now` (the daily series evaluates past days). WITHOUT A CUT NOTHING IS DISCARDED: when in doubt, more facts.
// SEVERAL COLLECTORS OF THE SAME CONTROL ON ONE MACHINE (mp.info.6: PBS and Zimbra, each with its heartbeat): if the evidences declare `stateFactCollectorField` (`origen`),
// heartbeats and facts are grouped by machine and that field, so each collector delimits only its own. Without the field, all is one collector.
import type { ENSNormalizedEvent } from '../data-source/types';
import { parseReferenceList } from './judgment';
import { getEventFieldValue } from './normalized-events';
import { getEvidenceDefinitions } from './registry';

const COLLECTOR_RUN_EVENT_TYPE = 'collector_run';
const COLLECTOR_RUN_COVERAGE_FIELD = 'evidencias_cubiertas';

// Two heartbeats closer than this are the same pass (a retry, a collector that beats at start and end). They delimit nothing.
const SAME_RUN_TOLERANCE_MS = 60 * 1000;

export const getStateFactEventTypes = (controlId: string): Set<string> =>
  new Set(
    getEvidenceDefinitions(controlId).flatMap(
      definition => definition.stateFactEventTypes || []
    )
  );

interface CollectorRun {
  time: number;
  covered: string[];
}

// A event's collector within its machine: the value of the field the control's evidences declare, or '' if none.
type CollectorOf = (event: ENSNormalizedEvent) => string;

const collectorKey = (
  event: ENSNormalizedEvent,
  collectorOf: CollectorOf
): string => `${event.agentId || ''}|${collectorOf(event)}`;

const collectorRunsByCollector = (
  controlId: string,
  events: ENSNormalizedEvent[],
  nowMs: number,
  collectorOf: CollectorOf
): Map<string, CollectorRun[]> => {
  const runs = new Map<string, CollectorRun[]>();

  events.forEach(event => {
    if (
      event.controlId !== controlId ||
      event.eventType !== COLLECTOR_RUN_EVENT_TYPE
    ) {
      return;
    }

    const time = Date.parse(event.timestamp);

    if (Number.isNaN(time) || time > nowMs) {
      return;
    }

    const collector = collectorKey(event, collectorOf);

    runs.set(collector, [
      ...(runs.get(collector) || []),
      {
        time,
        covered: parseReferenceList(
          getEventFieldValue(event, COLLECTOR_RUN_COVERAGE_FIELD)
        ),
      },
    ]);
  });

  runs.forEach(list => list.sort((a, b) => a.time - b.time));

  return runs;
};

// Instant from which an evidence's latest observation counts: the heartbeat before the last pass that looked at it ("looked" = declared in `evidencias_cubiertas` or emitted a fact, whichever is later).
const boundaryFor = (
  runs: CollectorRun[] | undefined,
  evidenceId: string,
  lastFactTime: number | undefined
): number | undefined => {
  if (!runs) {
    return undefined;
  }

  const covering = [...runs]
    .reverse()
    .find(run => run.covered.includes(evidenceId));

  const observed = Math.max(
    covering?.time ?? 0,
    lastFactTime ?? 0
  );

  if (!observed) {
    return undefined;
  }

  const previous = [...runs]
    .reverse()
    .find(run => run.time < observed - SAME_RUN_TOLERANCE_MS);

  return previous?.time;
};

const stateFactDefinitions = (controlId: string) =>
  getEvidenceDefinitions(controlId).filter(
    definition => (definition.stateFactEventTypes || []).length
  );

const collectorFieldOf = (
  definitions: ReturnType<typeof stateFactDefinitions>
): string | undefined =>
  definitions.find(definition => definition.stateFactCollectorField)
    ?.stateFactCollectorField;

const collectorOfField = (collectorField?: string): CollectorOf => event => {
  if (!collectorField) {
    return '';
  }

  const value = getEventFieldValue(event, collectorField);

  return value === undefined || value === null ? '' : String(value).trim();
};

export const keepLatestRunStateFacts = (
  controlId: string,
  events: ENSNormalizedEvent[],
  now: Date = new Date()
): ENSNormalizedEvent[] => {
  const definitions = stateFactDefinitions(controlId);

  if (!definitions.length) {
    return events;
  }

  const collectorOf = collectorOfField(collectorFieldOf(definitions));

  const runs = collectorRunsByCollector(
    controlId,
    events,
    now.getTime(),
    collectorOf
  );

  if (!runs.size) {
    return events;
  }

  // Last emission of a state fact of each evidence, per collector of each machine.
  const lastFact = new Map<string, number>();

  events.forEach(event => {
    if (event.controlId !== controlId) {
      return;
    }

    const time = Date.parse(event.timestamp);

    if (Number.isNaN(time) || time > now.getTime()) {
      return;
    }

    definitions.forEach(definition => {
      if (
        !(definition.stateFactEventTypes || []).includes(event.eventType) ||
        (event.evidenceId && event.evidenceId !== definition.id)
      ) {
        return;
      }

      const key = `${collectorKey(event, collectorOf)}|${definition.id}`;

      lastFact.set(key, Math.max(lastFact.get(key) ?? 0, time));
    });
  });

  const boundaries = new Map<string, number | undefined>();

  const boundaryOf = (collector: string, evidenceId: string) => {
    const key = `${collector}|${evidenceId}`;

    if (!boundaries.has(key)) {
      boundaries.set(
        key,
        boundaryFor(runs.get(collector), evidenceId, lastFact.get(key))
      );
    }

    return boundaries.get(key);
  };

  return events.filter(event => {
    if (event.controlId !== controlId) {
      return true;
    }

    // The evidences declaring this type as state. If the fact says which one it belongs to, only that one counts.
    const owners = definitions.filter(
      definition =>
        (definition.stateFactEventTypes || []).includes(event.eventType) &&
        (!event.evidenceId || event.evidenceId === definition.id)
    );

    if (!owners.length) {
      return true;
    }

    const collector = collectorKey(event, collectorOf);
    const time = Date.parse(event.timestamp);

    // With several owners the most permissive rules: discarding a fact another evidence still needs would leave it with nothing to look at.
    return owners.some(definition => {
      const boundary = boundaryOf(collector, definition.id);

      return (
        boundary === undefined ||
        Number.isNaN(time) ||
        time > boundary
      );
    });
  });
};

// The evidences that can own a state fact type: a fact declared by ANOTHER evidence is not state for the engine and is not discarded.
export const getStateFactOwnerEvidenceIds = (
  controlId: string,
  eventType: string
): string[] =>
  stateFactDefinitions(controlId)
    .filter(definition =>
      (definition.stateFactEventTypes || []).includes(eventType)
    )
    .map(definition => definition.id);

export const getStateFactCollectorField = (
  controlId: string
): string | undefined => collectorFieldOf(stateFactDefinitions(controlId));

// What the server can skip reading. The server evaluates over the whole window and state facts repeat every pass. It computes this SAME cut before reading (from the heartbeats and each evidence's last fact, taken from an aggregation)
// for now and the end of each series day, and does not read what lies below the cut at ALL those instants (`prunableRanges`, `buildStateFactKeepClause` in the server). The engine sees the same at each instant: `tests/evaluation-queries.test.ts`.
// Exact cut per collector at several instants: same as `keepLatestRunStateFacts`, with the last fact given by `lastFactOf(collector, evidenceId, at)`. Per collector, the minimum of the cuts of its types with facts: one range per collector and day.
// If some type with facts has no cut, that collector is not pruned at that instant (`undefined`). If `lastFactOf` returns LESS than exists, the cut can only be earlier: more is read, never less.
export const computeStateFactCutoffsByCollector = (
  controlId: string,
  runEvents: ENSNormalizedEvent[],
  instants: Date[],
  lastFactOf: (collector: string, evidenceId: string, at: number) => number | undefined,
  collectors: string[]
): Map<string, (number | undefined)[]> => {
  const output = new Map<string, (number | undefined)[]>();
  const definitions = stateFactDefinitions(controlId);

  if (!definitions.length) {
    return output;
  }

  const collectorOf = collectorOfField(collectorFieldOf(definitions));
  const types = Array.from(new Set(definitions.flatMap(definition => definition.stateFactEventTypes || [])));

  collectors.forEach(collectorValue => {
    output.set(
      collectorValue,
      instants.map(instant => {
        const at = instant.getTime();
        const runs = collectorRunsByCollector(controlId, runEvents, at, collectorOf);
        // Heartbeats belong to a single machine: the collector key is `agent|value`.
        const matchedKey = [...runs.keys()].find(key => key.slice(key.indexOf('|') + 1) === collectorValue);
        const own = matchedKey ? runs.get(matchedKey) : undefined;
        let minimum: number | undefined;

        for (const type of types) {
          const owners = definitions.filter(definition => (definition.stateFactEventTypes || []).includes(type));
          const withFacts = owners.filter(definition => lastFactOf(collectorValue, definition.id, at) !== undefined);
          if (!withFacts.length) continue;
          for (const definition of owners) {
            const cut = boundaryFor(own, definition.id, lastFactOf(collectorValue, definition.id, at));
            if (cut === undefined) return undefined;
            minimum = minimum === undefined ? cut : Math.min(minimum, cut);
          }
        }

        return minimum;
      })
    );
  });

  return output;
};
