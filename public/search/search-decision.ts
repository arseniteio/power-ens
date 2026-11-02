
type ENSSearchDecision = 'start' | 'skip' | 'abort-and-start';

export const decideSearch = (inProgress: string | undefined, newValue: string): ENSSearchDecision => {
  if (inProgress === undefined) return 'start';
  return inProgress === newValue ? 'skip' : 'abort-and-start';
};

export const searchDataKey = (params: Record<string, unknown>): string => {
  const { refreshKey, ...data } = params || {};
  return JSON.stringify(data);
};

export const isOwnCancellation = (signal?: { aborted: boolean }): boolean => Boolean(signal?.aborted);

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
