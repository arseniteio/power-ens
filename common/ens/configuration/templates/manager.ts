import type { ENSPlatformSource } from './types';

// Wazuh manager (agent 000): audited like any other machine, with the controls' common values.
export const managerWazuhTemplate: ENSPlatformSource = {
  id: 'manager-wazuh',
  label: 'Manager Wazuh',
  description: 'El manager de Wazuh.',
  kind: 'base',
  systemTypes: ['manager'],
  sources: [],
  values: {},
};
