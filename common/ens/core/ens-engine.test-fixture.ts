import { getENSComplianceResultByControl } from './ens-engine';
import { ENSNormalizedEvent } from './data-source';

// `status` explícito en los tres: una alerta real siempre trae `data.estado`, y
// el motor ya no infiere cumplimiento a partir del nombre del evento. Sin este
// campo la fixture simularía un evento que ningún agente emite y saldría
// NO_EVALUABLE.
const events: ENSNormalizedEvent[] = [
  {
    id: 'test-ev-01',
    agentId: '010',
    agentName: 'agent-010',
    controlId: 'mp.info.6',
    eventType: 'backup_ok',
    sourceType: 'WAZUH_ALERT',
    status: 'CUMPLE',
    timestamp: new Date().toISOString(),
    tool: 'ENSFácil test',
    ruleId: '106650',
  },
  {
    id: 'test-ev-05',
    agentId: '010',
    agentName: 'agent-010',
    controlId: 'mp.info.6',
    // `restore_ok`, que es el nombre que emite la regla 106651. Antes decía
    // `restore_success`, un sinónimo que el catálogo declaraba y que no emite
    // ninguna regla: la fixture simulaba un evento que ninguna máquina produce.
    eventType: 'restore_ok',
    sourceType: 'WAZUH_ALERT',
    status: 'CUMPLE',
    timestamp: new Date().toISOString(),
    tool: 'ENSFácil test',
    ruleId: '106651',
  },
  {
    id: 'test-ev-06',
    agentId: '010',
    agentName: 'agent-010',
    controlId: 'mp.info.6',
    eventType: 'offsite_success',
    sourceType: 'WAZUH_ALERT',
    status: 'CUMPLE',
    timestamp: new Date().toISOString(),
    tool: 'ENSFácil test',
    ruleId: '106662',
  },
];

export const testMpInfo6ComplianceResultMedium = () =>
  getENSComplianceResultByControl('mp.info.6', 'MEDIO', events, '010');

export const testMpInfo6ComplianceResultHigh = () =>
  getENSComplianceResultByControl('mp.info.6', 'ALTO', events, '010');
