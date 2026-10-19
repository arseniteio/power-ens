import type { ENSConfigurationTemplate } from './types';
import { CAMPOS_REGISTRO_AUDITD, EVENTOS_AUDITABLES_LINUX } from './linux-ubuntu';

// Manager de Wazuh (agente 000). En su fila solo se evalúan los controles de
// plano `manager` (op.exp.7, op.exp.9, op.mon.1, op.mon.2, op.cont.2,
// op.cont.3, op.nub.1, y op.exp.8 y op.mon.3, que se miden en los dos planos).
// Casi todo lo suyo es política de organización; lo que es de la plataforma
// del manager son los registros de op.exp.8: qué fuentes se auditan, con qué
// campos y qué cuentas escriben los registros (las de Wazuh y del indexer).
export const managerWazuhTemplate: ENSConfigurationTemplate = {
  id: 'manager-wazuh',
  label: 'Manager Wazuh',
  description:
    'El manager de Wazuh: fuentes auditables y campos mínimos de auditd, y las cuentas que escriben los registros (root, syslog, wazuh y wazuh-indexer).',
  kind: 'base',
  systemTypes: ['manager'],
  sources: [
    'ejemplos del bloque semilla de op.exp.8',
    'valores reales del manager de un laboratorio con Wazuh 4.14, sin las cuentas de personas',
  ],
  values: {
    'op.exp.8': {
      'P-01': EVENTOS_AUDITABLES_LINUX,
      'P-03': [CAMPOS_REGISTRO_AUDITD],
      'P-08': [
        'root | total | todos',
        'syslog | escritura | registros del sistema',
        'wazuh | escritura | registros de Wazuh',
        'wazuh-indexer | escritura | índices',
      ],
    },
  },
};
