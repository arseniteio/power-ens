const LABELS: Record<string, string> = {
  CUMPLE: 'Cumple',
  NO_CUMPLE: 'No cumple',
  PARCIAL: 'Parcial',
  NO_EVALUABLE: 'No evaluable',
  NO_APLICA: 'No aplica',
  CONFIGURED: 'Configurado',
  NOT_CONFIGURED: 'Sin configurar',
  NOT_APPLICABLE: 'No aplica',
  INVALID: 'Valor no válido',
};

export const statusLabel = (status?: string): string => (status && LABELS[status]) || status || '';
