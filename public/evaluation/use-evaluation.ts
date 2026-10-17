// El resultado de la evaluación del servidor para una pantalla.
//
// - Mientras no llega el de ESTA clave (máquina, control, vista), `data` es
//   `undefined` y `isLoading` es verdadero: nunca se enseña el de la máquina o
//   el control anterior como si fuera el actual.
// - Cada 5 minutos, con la pestaña a la vista, la sonda; solo si cambió algo
//   (o el resultado tiene más de 10 minutos) se vuelve a pedir. Mientras tanto
//   se sigue viendo el de la misma clave, marcado como `isRefreshing`.
// - Con la pestaña oculta no se pide nada; al volver, se mira enseguida si toca.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getCore } from '../services';
import { ENSEvaluationParams, fetchEvaluation, fetchEvaluationProbe } from './evaluation-client';
import {
  evaluationKey,
  evaluationReducer,
  EvaluationViewState,
  EVALUATION_REFRESH_INTERVAL_MS,
  initialEvaluationState,
  shouldProbe,
  shouldReload,
  visibleEvaluation,
} from './refresh-policy';

const pestanaVisible = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';

// Un aviso por mensaje y minuto, compartido por todas las pantallas.
const avisos = new Map<string, number>();
const avisa = (texto: string) => {
  const ahora = Date.now();
  if ((avisos.get(texto) || 0) > ahora - 60000) return;
  avisos.set(texto, ahora);
  try {
    getCore().notifications.toasts.addDanger({ title: 'ENSFácil: no se pudo evaluar', text: texto });
  } catch {
    // Sin núcleo (pruebas): basta con el error en pantalla.
  }
};

export const useEnsEvaluation = <T = any>(params: ENSEvaluationParams & { enabled?: boolean }) => {
  const { enabled = true, ...pedido } = params;
  const key = evaluationKey(pedido as Record<string, unknown>);
  const [estado, setEstado] = useState<EvaluationViewState<T>>(initialEvaluationState<T>());
  const actual = useRef<{ key: string; controller: AbortController } | undefined>();
  const ultimaComprobacion = useRef<number | undefined>();
  const datos = useRef<T | undefined>();

  const carga = useCallback(
    (modo: 'load' | 'refresh') => {
      actual.current?.controller.abort();
      const peticion = { key, controller: new AbortController() };
      actual.current = peticion;
      setEstado(previo => evaluationReducer(previo, { type: modo, key }));
      fetchEvaluation<T>(pedido, peticion.controller)
        .then(data => {
          if (actual.current !== peticion) return;
          datos.current = data;
          ultimaComprobacion.current = Date.now();
          setEstado(previo => evaluationReducer(previo, { type: 'success', key, data }));
        })
        .catch(error => {
          if (actual.current !== peticion || peticion.controller.signal.aborted) return;
          avisa(String(error?.message || error));
          setEstado(previo => evaluationReducer(previo, { type: 'failure', key, error }));
        });
    },
    // `key` resume `pedido`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );

  // Clave nueva: se carga de cero.
  useEffect(() => {
    if (!enabled) return;
    datos.current = undefined;
    carga('load');
    return () => actual.current?.controller.abort();
  }, [carga, enabled]);

  // La sonda: cada 5 minutos y al volver a la pestaña.
  useEffect(() => {
    if (!enabled) return;
    let viva = true;
    const comprueba = async () => {
      const ahora = Date.now();
      if (!shouldProbe(ultimaComprobacion.current, ahora, pestanaVisible()) || actual.current?.key !== key) return;
      ultimaComprobacion.current = ahora;
      const presente: any = datos.current;
      try {
        const sonda = await fetchEvaluationProbe(pedido);
        if (!viva || actual.current?.key !== key) return;
        if (shouldReload(sonda.fingerprint, presente?.meta?.fingerprint, presente?.meta?.evaluatedAt, Date.now())) {
          carga('refresh');
        }
      } catch {
        // La sonda falla en silencio: lo que se ve sigue siendo de esta clave y
        // la siguiente vuelta lo vuelve a intentar.
      }
    };
    const intervalo = window.setInterval(comprueba, Math.min(EVALUATION_REFRESH_INTERVAL_MS, 60000));
    const alVolver = () => {
      if (pestanaVisible()) void comprueba();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      viva = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, carga]);

  const visible = visibleEvaluation(estado, key);
  return {
    ...visible,
    error: visible.error as Error | undefined,
    reload: () => carga('refresh'),
  };
};
