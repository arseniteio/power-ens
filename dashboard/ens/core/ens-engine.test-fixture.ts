import { getENSComplianceResultByControl } from './ens-engine';
import { ENSNormalizedEvent } from './data-source';

const events: ENSNormalizedEvent[] = [
  {
    id: 'test-ev-01',
    agentId: '010',
    agentName: 'agent-010',
    controlId: 'mp.info.6',
    eventType: 'backup_ok',
    sourceType: 'WAZUH_ALERT',
    timestamp: new Date().toISOString(),
    tool: 'ENSFácil test',
    ruleId: 'ENS-MPINFO6-BACKUP-SUCCESS',
  },
  {
    id: 'test-ev-05',
    agentId: '010',
    agentName: 'agent-010',
    controlId: 'mp.info.6',
    eventType: 'restore_success',
    sourceType: 'WAZUH_ALERT',
    timestamp: new Date().toISOString(),
    tool: 'ENSFácil test',
    ruleId: 'ENS-MPINFO6-RESTORE-MISSING',
  },
  {
    id: 'test-ev-06',
    agentId: '010',
    agentName: 'agent-010',
    controlId: 'mp.info.6',
    eventType: 'offsite_success',
    sourceType: 'WAZUH_ALERT',
    timestamp: new Date().toISOString(),
    tool: 'ENSFácil test',
    ruleId: 'ENS-MPINFO6-OFFSITE',
  },
];

export const testMpInfo6ComplianceResultMedio = () =>
  getENSComplianceResultByControl('mp.info.6', 'MEDIO', events, '010');

export const testMpInfo6ComplianceResultAlto = () =>
  getENSComplianceResultByControl('mp.info.6', 'ALTO', events, '010');
