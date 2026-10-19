import { ENSNormalizedEvent } from '../data-source/types';

// Shared utilities over normalized events, used by `engine.ts` and `judgment.ts` so both paths read and order events EXACTLY alike.

export const hasMeaningfulValue = (value: unknown): boolean => {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
};

// `attributes` first (where the normalizer leaves the agent event's own fields), then the root of the normalized event.
export const getEventFieldValue = (
  event: ENSNormalizedEvent,
  field: string
): unknown => {
  if (
    event.attributes &&
    Object.prototype.hasOwnProperty.call(
      event.attributes,
      field
    )
  ) {
    return event.attributes[field];
  }

  const directEvent = event as unknown as Record<
    string,
    unknown
  >;

  return directEvent[field];
};

export const sortByTimestampDesc = (
  events: ENSNormalizedEvent[]
): ENSNormalizedEvent[] =>
  [...events].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() -
      new Date(a.timestamp).getTime()
  );
