import { useEffect, useState } from 'react';

import type { ENSComplianceSummary } from '../../common/ens/core/compliance-state/types';
import { fetchEvaluation } from '../evaluation/evaluation-client';

export type ControlSummary = ENSComplianceSummary;

export type ControlSummaryState =
  | { kind: 'loading' }
  | { kind: 'ready'; summary: ControlSummary }
  | { kind: 'outOfGroup' }
  | { kind: 'unavailable' };

const OUT_OF_GROUP = 'grupo ENS evaluable';

const stateOfError = (error: unknown): ControlSummaryState =>
  error instanceof Error && error.message.includes(OUT_OF_GROUP) ? { kind: 'outOfGroup' } : { kind: 'unavailable' };

export const useControlSummary = (agentId: string | undefined): ControlSummaryState => {
  const [state, setState] = useState<ControlSummaryState>({ kind: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ kind: 'loading' });
    fetchEvaluation<{ controlSummary: ControlSummary }>({ include: 'summary', agentId })
      .then(data => alive && setState({ kind: 'ready', summary: data.controlSummary }))
      .catch(error => alive && setState(stateOfError(error)));
    return () => {
      alive = false;
    };
  }, [agentId]);

  return state;
};
