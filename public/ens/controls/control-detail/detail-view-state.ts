// QUÉ ENSEÑA EL DETALLE DEL CONTROL EN CADA MOMENTO. Sin React, para probarlo
// (`tests/control-detail-states.test.ts`).
//
// El detalle «desaparecía» por tres caminos (diagnóstico de 17/10): el control
// no se mide en la máquina elegida y la página se quedaba vacía diciendo «todo
// conforme»; al cambiar de máquina se juzgaba la nueva con los datos de la
// anterior; y un error sustituía la página entera. Las reglas, en orden:
//
//   1. Lo que llega para la petición de AHORA (control y máquina) es lo que se
//      enseña. Si llega sin resultado y hay máquina elegida, el control no se
//      mide en ella: estado propio («no se mide en esta máquina»), nunca un
//      veredicto.
//   2. Mientras llega lo de ahora, o si ha fallado, se sigue enseñando el
//      ÚLTIMO resultado del MISMO control, rotulado con SU máquina y su hora:
//      nunca como si fuera el de la máquina nueva.
//   3. Sin nada que enseñar: carga, o el error como aviso con «Reintentar».
//
// Otro control nunca hereda nada: su cabecera es otra.

export interface ENSDetailRequest {
  controlId: string;
  agentId?: string;
}

export interface ENSRetainedEvaluation<T> extends ENSDetailRequest {
  data: T;
  // Cuándo se calculó (de `meta.computedAt`), para rotularlo.
  computedAt?: string;
}

export interface ENSEvaluationSnapshot<T> {
  data?: T;
  error?: unknown;
  isLoading: boolean;
}

export type ENSDetailView<T> =
  | { kind: 'loading' }
  | { kind: 'error'; error: unknown }
  | {
      kind: 'shown';
      data: T;
      // El resultado es el de la petición de ahora.
      current: boolean;
      // De qué máquina es lo que se enseña (la de la petición si `current`).
      agentId?: string;
      computedAt?: string;
      // Llega otra cosa (otra máquina) o se está reintentando.
      loading: boolean;
      // Lo de ahora falló: se enseña lo último que hubo, con el aviso.
      error?: unknown;
    };

const mismaMaquina = (a?: string, b?: string) => (a || '') === (b || '');

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

// Lo que se guarda para la regla 2: solo un resultado de la petición de ahora.
export const nextRetained = <T>(
  request: ENSDetailRequest,
  evaluation: ENSEvaluationSnapshot<T>,
  previous: ENSRetainedEvaluation<T> | undefined,
  computedAtOf: (data: T) => string | undefined = () => undefined
): ENSRetainedEvaluation<T> | undefined =>
  evaluation.data !== undefined
    ? { controlId: request.controlId, agentId: request.agentId, data: evaluation.data, computedAt: computedAtOf(evaluation.data) }
    : previous;

// ¿Es lo que se enseña de otra máquina que la elegida?
export const isFromAnotherMachine = (request: ENSDetailRequest, view: ENSDetailView<unknown>): boolean =>
  view.kind === 'shown' && !view.current && !mismaMaquina(view.agentId, request.agentId);

// «las 14:05» o «el 17/10 a las 14:05» (si no es de hoy).
export const describeComputedAt = (iso: string | undefined, now: Date = new Date()): string | undefined => {
  if (!iso) return undefined;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return undefined;
  const hora = fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return fecha.toDateString() === now.toDateString()
    ? `las ${hora}`
    : `el ${fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })} a las ${hora}`;
};
