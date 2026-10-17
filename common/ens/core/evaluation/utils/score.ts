import { ENSComplianceStatus } from '../types';

export const scoreByStatus = (status: ENSComplianceStatus): number => {
  if (status === 'CUMPLE') {
    return 100;
  }

  if (status === 'PARCIAL') {
    return 50;
  }

  return 0;
};
