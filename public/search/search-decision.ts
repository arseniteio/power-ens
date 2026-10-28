// What `useEsSearch` decides on each parameter change, without React. Two keys: the data key (filters, aggregations, cap, order) and `refreshKey`, which only asks to look again.

type ENSSearchDecision = 'start' | 'skip' | 'abort-and-start';

export const decideSearch = (inProgress: string | undefined, newValue: string): ENSSearchDecision => {
  if (inProgress === undefined) return 'start';
  return inProgress === newValue ? 'skip' : 'abort-and-start';
};

export const searchDataKey = (params: Record<string, unknown>): string => {
  const { refreshKey, ...data } = params || {};
  return JSON.stringify(data);
};

// A cancellation requested by the screen is not a failure. It is ours only if the aborted signal is OURS: an error named AbortError with our signal intact was cut by someone else (the search service, a timeout).
export const isOwnCancellation = (signal?: { aborted: boolean }): boolean => Boolean(signal?.aborted);

// Repeated notices: 17 rows failing the same way at once give a single notice. The registry belongs to the module (shared by all searches) and remembers when each message was given.
const ENS_SEARCH_TOAST_WINDOW_MS = 60 * 1000;

export const shouldToast = (
  log: Map<string, number>,
  message: string,
  now: number,
  timeWindow: number = ENS_SEARCH_TOAST_WINDOW_MS
): boolean => {
  const previous = log.get(message);
  if (previous !== undefined && now - previous < timeWindow) return false;
  log.set(message, now);
  return true;
};
