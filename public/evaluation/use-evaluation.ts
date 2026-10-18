// El resultado de la evaluación del servidor para una pantalla. Es la envoltura
// React del ciclo de `refresh-policy.ts` (`createEvaluationController`), que
// es donde están las reglas y sus pruebas:
//
// - Mientras no llega el de ESTA clave (máquina, control, vista), `data` es
//   `undefined` e `isLoading` verdadero: nunca se enseña el de la máquina o el
//   control anterior como si fuera el actual.
// - Cada 5 minutos, con la pestaña a la vista, la sonda; solo si cambió algo
//   (o el resultado tiene más de 60 minutos) se vuelve a pedir. Si el servidor
//   respondió con algo guardado mientras recalcula, a los 10 segundos.
// - Un tiempo agotado o un fallo se dicen (`error`) y `retry` lo reintenta.
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

const TICK_MS = 10 * 1000;

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
  const pedidoActual = useRef(pedido);
  pedidoActual.current = pedido;

  const controlador = useRef<ReturnType<typeof createEvaluationController<any>>>();
  if (!controlador.current) {
    controlador.current = createEvaluationController<any>({
      fetch: controller => fetchEvaluation(pedidoActual.current, controller),
      probe: controller => fetchEvaluationProbe(pedidoActual.current, controller),
      now: () => Date.now(),
      visible: pestanaVisible,
      onChange: siguiente => {
        if (siguiente.error && siguiente.key === evaluationKey(pedidoActual.current as Record<string, unknown>)) {
          avisa(String((siguiente.error as any)?.message || siguiente.error));
        }
        setEstado(siguiente);
      },
    });
  }

  // La clave que pide la pantalla (una pantalla oculta no pide nada, pero
  // conserva lo que tenía: al volver, se refresca encima).
  useEffect(() => {
    if (enabled) controlador.current!.setKey(key);
  }, [key, enabled]);

  useEffect(() => () => controlador.current!.dispose(), []);

  // La sonda y los reintentos de lo que se está recalculando.
  useEffect(() => {
    if (!enabled) return;
    const vuelta = () => {
      void controlador.current!.tick();
    };
    const intervalo = window.setInterval(vuelta, TICK_MS);
    const alVolver = () => {
      if (pestanaVisible()) vuelta();
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [enabled]);

  const visible = visibleEvaluation(estado, key);
  return {
    ...visible,
    error: visible.error as Error | undefined,
    retry: () => controlador.current!.retry(),
  };
};
