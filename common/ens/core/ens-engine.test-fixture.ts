import { getENSComplianceResultByControl } from './ens-engine';
import { ENSNormalizedEvent } from './data-source';

// Explicit `status` on all three: a real alert always carries `data.estado`, and the engine no longer infers compliance from the event name.
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
    tool: 'Power ENS test',
    ruleId: '106650',
  },
  {
    id: 'test-ev-05',
    agentId: '010',
    agentName: 'agent-010',
    controlId: 'mp.info.6',
    // `restore_ok`, the name rule 106651 emits (the old `restore_success` was declared by the catalog but emitted by no rule).
    eventType: 'restore_ok',
    sourceType: 'WAZUH_ALERT',
    status: 'CUMPLE',
    timestamp: new Date().toISOString(),
    tool: 'Power ENS test',
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
    tool: 'Power ENS test',
    ruleId: '106662',
  },
];

export const testMpInfo6ComplianceResultMedium = () =>
  getENSComplianceResultByControl('mp.info.6', 'MEDIO', events, '010');

export const testMpInfo6ComplianceResultHigh = () =>
  getENSComplianceResultByControl('mp.info.6', 'ALTO', events, '010');
