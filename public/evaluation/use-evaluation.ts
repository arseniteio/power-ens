import { useEffect, useRef, useState } from 'react';
import { getCore } from '../services';
import { ENSEvaluationParams, fetchEvaluation, fetchEvaluationProbe } from './evaluation-client';
import {
  createEvaluationController,
  evaluationKey,
  EvaluationViewState,
  initialEvaluationState,
  visibleEvaluation,
} from './refresh-policy';

const TICK_MS = 2 * 1000;

const visibleTab = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

const notices = new Map<string, number>();
const warns = (text: string) => {
  const now = Date.now();
  if ((notices.get(text) || 0) > now - 60000) return;
  notices.set(text, now);
  try {
    getCore().notifications.toasts.addDanger({ title: 'Power ENS: no se pudo evaluar', text: text });
  } catch {
  }
};

export const useEnsEvaluation = <T = any>(params: ENSEvaluationParams & { enabled?: boolean }) => {
  const { enabled = true, ...requested } = params;
  const key = evaluationKey(requested as Record<string, unknown>);
  const [status, setStatus] = useState<EvaluationViewState<T>>(initialEvaluationState<T>());
  const currentRequest = useRef(requested);
  currentRequest.current = requested;

  const evalController = useRef<ReturnType<typeof createEvaluationController<any>>>();
  if (!evalController.current) {
    evalController.current = createEvaluationController<any>({
      fetch: (controller, options) => fetchEvaluation(currentRequest.current, controller, options),
      probe: controller => fetchEvaluationProbe(currentRequest.current, controller),
      now: () => Date.now(),
      visible: visibleTab,
      onChange: following => {
        if (following.error && following.key === evaluationKey(currentRequest.current as Record<string, unknown>)) {
          warns(String((following.error as any)?.message || following.error));
        }
        setStatus(following);
      },
    });
  }

  useEffect(() => {
    if (enabled) evalController.current!.setKey(key);
    else evalController.current!.suspend();
  }, [key, enabled]);

  useEffect(() => () => evalController.current!.dispose(), []);

  useEffect(() => {
    if (!enabled) return;
    const returned = () => {
      void evalController.current!.tick();
    };
    const interval = window.setInterval(returned, TICK_MS);
    const onReturn = () => {
      if (visibleTab()) returned();
    };
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [enabled]);

  const visible = visibleEvaluation(status, key);
  return {
    ...visible,
    error: visible.error as Error | undefined,
    retry: () => evalController.current!.retry(),
  };
};
