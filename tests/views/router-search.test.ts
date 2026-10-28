import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRouterSearch, withRouterSearch } from '../../public/routing/router-search';

describe('the URL search of the app', () => {
  test('reads its parameters', () => {
    assert.deepEqual(parseRouterSearch('?tabView=controls&control=op.acc.1'), { tabView: 'controls', control: 'op.acc.1' });
  });

  test('changes some and removes the empty ones', () => {
    const next = parseRouterSearch(withRouterSearch('?tabView=controls&control=op.acc.1', { control: undefined, agent: '001' }));
    assert.deepEqual(next, { tabView: 'controls', agent: '001' });
  });
});
