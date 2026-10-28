import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { activityOf, resolveEvaluationWindow } from '../../server/lib/evaluation/window';

const NOW = new Date('2026-10-17T12:00:00Z');

describe('the evaluation window', () => {
  test('goes back the configured period', () => {
    assert.deepEqual(resolveEvaluationWindow('Últimos 7 días', NOW), { from: '2026-10-10T12:00:00.000Z', to: '2026-10-17T12:00:00.000Z' });
  });

  test('is 30 days when the period is not understood', () => {
    assert.equal(resolveEvaluationWindow('whenever', NOW).from, '2026-09-17T12:00:00.000Z');
  });
});

describe('the engine activity', () => {
  const probe = {
    'op.acc.1': {
      '001': { count: 2, oldest: '2026-10-16T00:00:00Z', newest: '2026-10-17T10:00:00Z' },
      '099': { count: 9, oldest: '2026-10-01T00:00:00Z', newest: '2026-10-17T11:00:00Z' },
    },
    'op.acc.2': { '001': { count: 1, oldest: '2026-10-15T00:00:00Z', newest: '2026-10-17T09:00:00Z' } },
  };

  test('counts only the machines in scope', () => {
    const activity = activityOf(probe, [{ id: '001', name: 'a', groups: [] } as any]);
    assert.deepEqual(activity.total, { count: 3, earliest: '2026-10-15T00:00:00Z', newest: '2026-10-17T10:00:00Z' });
    assert.equal(activity.agents['099'], undefined);
    assert.equal(activity.cells.length, 2);
  });
});
