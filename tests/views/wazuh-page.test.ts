import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { powerEnsPathOf, wazuhPageOf } from '../../public/wazuh-pages/wazuh-page';

describe('wazuh pages', () => {
  test('the home and the page of one agent carry the block', () => {
    assert.deepEqual(wazuhPageOf('wz-home', ''), { kind: 'home' });
    assert.deepEqual(wazuhPageOf('endpoints-summary', '#/agents?tab=welcome&agent=001'), { kind: 'agent', agentId: '001' });
  });

  test('every other page does not', () => {
    assert.equal(wazuhPageOf('endpoints-summary', '#/agents-preview/'), undefined);
    assert.equal(wazuhPageOf('endpoints-summary', '#/agents?tab=welcome'), undefined);
    assert.equal(wazuhPageOf('powerEns', '#/agents?agent=001'), undefined);
    assert.equal(wazuhPageOf(undefined, ''), undefined);
  });

  test('the link opens the machine in Power ENS', () => {
    assert.equal(powerEnsPathOf({ kind: 'agent', agentId: '001' }), '?agentId=001');
    assert.equal(powerEnsPathOf({ kind: 'home' }), '');
  });
});
