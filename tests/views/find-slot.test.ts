import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { findSecurityOperationsGrid } from '../../public/wazuh-pages/find-slot';

const grid = { name: 'grid' };
const badgeOf = (text: string) => ({ textContent: text, closest: () => ({ querySelector: () => grid }) });
const rootWith = (...badges: unknown[]) => ({ querySelectorAll: () => badges }) as unknown as ParentNode;

describe('security operations slot', () => {
  test('is the grid of the card with that badge', () => {
    assert.equal(findSecurityOperationsGrid(rootWith(badgeOf('Endpoint security'), badgeOf('Security operations'))), grid);
  });

  test('is absent when Wazuh renames or drops the section', () => {
    assert.equal(findSecurityOperationsGrid(rootWith(badgeOf('Endpoint security'))), undefined);
  });
});
