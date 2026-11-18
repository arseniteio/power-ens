import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { osKindOf } from '../../public/ens/configuration/groups/os-kind';

describe('machine icon kind', () => {
  test('the Wazuh manager is recognised by agent 000, by flag and by role', () => {
    assert.equal(osKindOf({ agentId: '000', os: { platform: 'ubuntu' } }), 'wazuh');
    assert.equal(osKindOf({ id: '001', isManager: true }), 'wazuh');
    assert.equal(osKindOf({ agentId: '002', role: 'manager' }), 'wazuh');
  });

  test('other machines get the icon of their system', () => {
    assert.equal(osKindOf({ agentId: '001', os: { platform: 'ubuntu', name: 'Ubuntu' } }), 'linux');
    assert.equal(osKindOf({ agentId: '003', family: 'windows' }), 'windows');
    assert.equal(osKindOf({ agentId: '004' }), 'other');
  });
});
