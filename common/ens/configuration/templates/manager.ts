import type { ENSPlatformSource } from './types';
import { AUDITD_RECORD_FIELDS, LINUX_AUDITABLE_EVENTS } from './linux-ubuntu';

// Wazuh manager (agent 000). Its row evaluates only `manager`-plane controls (op.exp.7, op.exp.9, op.mon.1, op.mon.2, op.cont.2, op.cont.3, op.nub.1, plus op.exp.8 and op.mon.3, measured on both planes). Mostly organization policy; the platform-specific part is op.exp.8: audited sources, fields and the accounts writing the logs (Wazuh and indexer).
export const managerWazuhTemplate: ENSPlatformSource = {
  id: 'manager-wazuh',
  label: 'Manager Wazuh',
  description: 'El manager de Wazuh.',
  kind: 'base',
  systemTypes: ['manager'],
  sources: [
    'ejemplos del bloque semilla de op.exp.8',
    'valores reales del manager de un laboratorio con Wazuh 4.14, sin las cuentas de personas',
  ],
  values: {
    'op.exp.8': {
      'P-01': LINUX_AUDITABLE_EVENTS,
      'P-03': [AUDITD_RECORD_FIELDS],
      'P-08': [
        'root | total | todos',
        'syslog | escritura | registros del sistema',
        'wazuh | escritura | registros de Wazuh',
        'wazuh-indexer | escritura | índices',
      ],
    },
  },
};
