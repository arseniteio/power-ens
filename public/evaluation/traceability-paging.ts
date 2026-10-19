// De dónde sale una página de la tabla de trazabilidad de la ficha: de las
// entradas que ya trajo la evaluación o del servidor. Sin React, para probarlo
// (tests/evaluation-refresh.test.ts).
//
// Una página se pide al servidor solo si llega más allá de lo que ya está en
// la respuesta; nunca más allá de lo que el servidor guarda (`available`).
export const traceabilityPageSource = (options: {
  initialCount: number;
  available: number;
  pageFrom: number;
  pageSize: number;
}): 'local' | 'remote' => {
  const hasta = Math.min(options.pageFrom + options.pageSize, options.available);
  return hasta > options.initialCount ? 'remote' : 'local';
};
