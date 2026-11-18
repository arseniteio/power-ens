import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { osKindOf } from '../../public/ens/configuration/groups/os-kind';

describe('machine icon kind', () => {
  test('the Wazuh manager is recognised by agent 000, by flag and by role', () => {
    assert.equal(osKindOf({ agentId: '000', os: { platform: 'ubuntu' } }), 'wazuh');
    assert.equal(osKindOf({ id: '001', isManager: true }), 'wazuh');
    assert.equal(osKindOf({ agentId: '002', role: 'manager' }), 'wazuh');
  });

  test('each distribution gets its own icon before its family', () => {
    assert.equal(osKindOf({ agentId: '001', distro: 'ubuntu-24.04', family: 'debian' }), 'ubuntu');
    assert.equal(osKindOf({ agentId: '002', distro: 'debian-12', family: 'debian' }), 'debian');
    assert.equal(osKindOf({ agentId: '003', distro: 'rocky-9', family: 'rhel' }), 'rocky');
    assert.equal(osKindOf({ agentId: '004', distro: 'almalinux-9', family: 'rhel' }), 'alma');
    assert.equal(osKindOf({ agentId: '005', distro: 'rhel-9', family: 'rhel' }), 'rhel');
    assert.equal(osKindOf({ agentId: '006', distro: 'amazon-2023', family: 'rhel' }), 'amazon');
    assert.equal(osKindOf({ agentId: '007', os: { name: 'SUSE Linux Enterprise Server' } }), 'suse');
    assert.equal(osKindOf({ agentId: '008', os: { name: 'Microsoft Windows Server 2022' } }), 'windows');
    assert.equal(osKindOf({ agentId: '009', os: { platform: 'darwin', name: 'macOS' } }), 'apple');
  });

  test('an unknown Linux falls back to the penguin and anything else to the generic icon', () => {
    assert.equal(osKindOf({ agentId: '010', os: { platform: 'alpine', name: 'Alpine Linux' } }), 'linux');
    assert.equal(osKindOf({ agentId: '011' }), 'other');
  });
});
