import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineSummaries, describeAge, freshnessCell, overviewMachines } from '../../public/ens/overview/overview-model';

const NOW = Date.parse('2026-10-17T12:00:00Z');
const hoursAgo = (hours: number) => new Date(NOW - hours * 3600e3).toISOString();

describe('the overview', () => {
  test('says how long ago something happened', () => {
    assert.equal(describeAge(undefined, NOW), 'nunca');
    assert.equal(describeAge(hoursAgo(0.5), NOW), 'hace 30 min');
    assert.equal(describeAge(hoursAgo(5), NOW), 'hace 5 h');
    assert.equal(describeAge(hoursAgo(72), NOW), 'hace 3 d');
  });

  test('marks a control whose last verdict is over a day old as stale', () => {
    const freshness = { cells: [{ controlId: 'op.acc.1', agentId: '001', count: 3, newest: hoursAgo(30) }] };
    assert.equal(freshnessCell(freshness, 'op.acc.1', '001', true, NOW).kind, 'stale');
    assert.equal(freshnessCell(freshness, 'op.acc.2', '001', true, NOW).kind, 'never');
    assert.equal(freshnessCell(freshness, 'op.acc.1', '001', false, NOW).kind, 'not-expected');
  });

  test('summarises each machine by the status of its controls', () => {
    const machines = overviewMachines([{ id: '001', name: 'web-01' }]);
    const rows = [
      {
        agentId: '001',
        controls: [
          { controlId: 'op.acc.1', status: 'NO_CUMPLE', evaluated: true, requirementsNotMet: 2, requirementsNotEvidenced: 1 },
          { controlId: 'op.acc.2', status: 'CUMPLE', evaluated: true, requirementsNotMet: 0, requirementsNotEvidenced: 0 },
        ],
      },
    ];
    const [summary] = buildMachineSummaries(machines, rows, { agents: [{ agentId: '001', count: 2, newest: hoursAgo(1) }] }, NOW);
    assert.equal(summary.counts.NO_CUMPLE, 1);
    assert.equal(summary.counts.CUMPLE, 1);
    assert.equal(summary.notMet, 2);
    assert.equal(summary.stale, false);
    assert.deepEqual(summary.worst.map(entry => entry.controlId), ['op.acc.1']);
  });
});
