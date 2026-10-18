// Un estado, un color, en todas las pantallas (la franja de la lista, la barra
// de máquinas, la matriz, la tendencia y las insignias). Antes los dos grises
// estaban cambiados entre la lista y la tendencia, y NO_APLICA era `default` en
// el detalle y `hollow` en las tarjetas. Sin React.
export const ENS_STATUS_COLORS: Record<string, string> = {
  CUMPLE: '#00A65A',
  PARCIAL: '#F5A700',
  NO_CUMPLE: '#BD271E',
  // Sin demostrar: gris oscuro (importa).
  NO_EVALUABLE: '#98A2B3',
  // Fuera del nivel: gris claro (no cuenta).
  NO_APLICA: '#D3DAE6',
};

export const ENS_STATUS_ORDER = ['CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA'];

// Sin resultado (no se mide aquí): rayado, nunca un gris de estado.
export const ENS_NO_RESULT_PATTERN = 'repeating-linear-gradient(45deg, #F5F7FA, #F5F7FA 4px, #E9EDF3 4px, #E9EDF3 8px)';

export const statusColor = (status?: string): string => ENS_STATUS_COLORS[status || ''] || ENS_STATUS_COLORS.NO_EVALUABLE;

export const statusBadgeColor = (status?: string): 'success' | 'warning' | 'danger' | 'default' | 'hollow' =>
  status === 'CUMPLE'
    ? 'success'
    : status === 'PARCIAL'
    ? 'warning'
    : status === 'NO_CUMPLE'
    ? 'danger'
    : status === 'NO_APLICA'
    ? 'hollow'
    : 'default';
