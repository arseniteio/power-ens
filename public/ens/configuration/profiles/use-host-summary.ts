import { useCallback, useEffect, useState } from 'react';
import { ENSHostSummary, profilesClient } from './profiles-client';

export interface ENSHostSummaryState {
  data?: ENSHostSummary;
  loading: boolean;
  error?: string;
  retry: () => void;
}

export const useHostSummary = (revision: string): ENSHostSummaryState => {
  const [data, setData] = useState<ENSHostSummary | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    profilesClient
      .summary()
      .then(result => {
        if (!current) return;
        setData(result);
        setError(undefined);
      })
      .catch(failure => current && setError(failure?.message || String(failure)))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [revision, attempt]);

  const retry = useCallback(() => setAttempt(value => value + 1), []);
  return { data, loading, error, retry };
};
