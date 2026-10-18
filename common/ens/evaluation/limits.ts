// Los límites de la evaluación en el servidor que también usa el navegador
// (para no copiarlos a mano en cada pantalla).
export const ENS_EVALUATION_LIMITS = {
  // Entradas de la trazabilidad de un control que se guardan y se pueden
  // recorrer por páginas (las primeras; el total se dice siempre).
  traceabilityStored: 500,
  // Las que trae la ficha del control con su evaluación.
  traceabilityInitial: 100,
  // Tamaño máximo de una página de trazabilidad.
  traceabilityPageMax: 500,
  // Días máximos de una serie.
  maxTimelineDays: 90,
};
