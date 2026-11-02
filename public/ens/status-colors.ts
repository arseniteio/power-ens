export const ENS_STATUS_COLORS: Record<string, string> = {
  CUMPLE: '#00A65A',
  PARCIAL: '#F5A700',
  NO_CUMPLE: '#BD271E',
  NO_EVALUABLE: '#98A2B3',
  NO_APLICA: '#D3DAE6',
};

export const ENS_STATUS_ORDER = ['CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA'];

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
