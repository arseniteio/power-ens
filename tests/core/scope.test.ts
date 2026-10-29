import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryFromMonitoring } from '../../common/agents/agent-inventory';
import { resolveENSScopeAgents } from '../../common/ens/core/scope/runtime';
import { detectAgentSystem, withInventoryTypes } from '../../common/ens/configuration/agents/system-detection';

const NOW = Date.parse('2026-10-17T12:00:00Z');

const bucket = (source: Record<string, unknown>) => ({ key: source.id, ultimo: { hits: { hits: [{ _source: source }] } } });

describe('the agent inventory', () => {
  const inventory = inventoryFromMonitoring(
    {
      agentes: {
        buckets: [
          bucket({ id: '1', name: 'web-01', group: ['ens'], status: 'active', timestamp: '2026-10-17T11:55:00Z', manager: 'wazuh.manager', os: { platform: 'ubuntu' } }),
          bucket({ id: '2', name: 'db-01', group: ['other'], status: 'disconnected', timestamp: '2026-10-17T11:55:00Z' }),
        ],
      },
    },
    NOW
  );

  test('pads the agent ids and adds the manager', () => {
    assert.deepEqual(inventory.agents.map(agent => agent.id).sort(), ['000', '001', '002']);
    assert.equal(inventory.agents.find(agent => agent.id === '000')?.name, 'wazuh.manager');
  });

  test('scopes by group, with the manager always audited', () => {
    const scope = resolveENSScopeAgents(inventory.agents, { mode: 'group', agentIds: [], groupIds: ['ens'] });
    assert.deepEqual(scope.map(agent => agent.id).sort(), ['000', '001']);
  });
});

describe('the system type of a machine', () => {
  test('is the manager for agent 000', () => {
    assert.equal(detectAgentSystem({ id: '000' }).type, 'manager');
  });

  test('comes from the inventory platform', () => {
    assert.equal(detectAgentSystem({ id: '001', os: { platform: 'ubuntu' } }).type, 'linux');
    assert.equal(detectAgentSystem({ id: '002', os: { platform: 'windows' } }).type, 'windows');
  });

  test('is chosen by hand when the inventory does not know it', () => {
    assert.equal(detectAgentSystem({ id: '003' }).type, undefined);
    assert.equal(detectAgentSystem({ id: '004', os: { platform: 'darwin' } }).type, undefined);
  });

  test('replaces the stored type for the engine, never a type corrected by hand', () => {
    const configuration = withInventoryTypes(
      { agents: { '001': { detectedType: 'windows' as const }, '002': { typeOverride: 'windows' as const } } },
      [{ id: '001', os: { platform: 'ubuntu' } }, { id: '002', os: { platform: 'ubuntu' } }, { id: '003', os: { platform: 'debian' } }]
    );
    assert.equal(configuration.agents['001'].detectedType, 'linux');
    assert.equal(configuration.agents['002'].typeOverride, 'windows');
    assert.equal((configuration.agents as any)['003'].detectedType, 'linux');
  });
});
