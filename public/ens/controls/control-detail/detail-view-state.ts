
interface ENSDetailRequest {
  controlId: string;
  agentId?: string;
}

export interface ENSRetainedEvaluation<T> extends ENSDetailRequest {
  data: T;
  computedAt?: string;
}

interface ENSEvaluationSnapshot<T> {
  data?: T;
  error?: unknown;
  isLoading: boolean;
}

type ENSDetailView<T> =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | {
      kind: 'shown';
      data: T;
      current: boolean;
      agentId?: string;
      computedAt?: string;
      loading: boolean;
      error?: unknown;
    };

const sameMachine = (a?: string, b?: string) => (a || '') === (b || '');

export const decideDetailView = <T>(
  request: ENSDetailRequest,
  evaluation: ENSEvaluationSnapshot<T>,
  retained: ENSRetainedEvaluation<T> | undefined,
  computedAtOf: (data: T) => string | undefined = () => undefined
): ENSDetailView<T> => {
  if (evaluation.data !== undefined) {
    return {
      kind: 'shown',
      data: evaluation.data,
      current: true,
      agentId: request.agentId,
      computedAt: computedAtOf(evaluation.data),
      loading: false,
    };
  }

  if (retained && retained.controlId === request.controlId) {
    return {
      kind: 'shown',
      data: retained.data,
      current: false,
      agentId: retained.agentId,
      computedAt: retained.computedAt,
      loading: evaluation.isLoading && !evaluation.error,
      ...(evaluation.error ? { error: evaluation.error } : {}),
    };
  }

  if (evaluation.error) {
    return { kind: 'error', error: evaluation.error };
  }

  return { kind: 'loading' };
};

export const nextRetained = <T>(
  request: ENSDetailRequest,
  evaluation: ENSEvaluationSnapshot<T>,
  previous: ENSRetainedEvaluation<T> | undefined,
  computedAtOf: (data: T) => string | undefined = () => undefined
): ENSRetainedEvaluation<T> | undefined =>
  evaluation.data !== undefined
    ? { controlId: request.controlId, agentId: request.agentId, data: evaluation.data, computedAt: computedAtOf(evaluation.data) }
    : previous;

export const isFromAnotherMachine = (request: ENSDetailRequest, view: ENSDetailView<unknown>): boolean =>
  view.kind === 'shown' && !view.current && !sameMachine(view.agentId, request.agentId);

export const describeComputedAt = (iso: string | undefined, now: Date = new Date()): string | undefined => {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const hour = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === now.toDateString()
    ? `las ${hour}`
    : `el ${date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} a las ${hour}`;
};
