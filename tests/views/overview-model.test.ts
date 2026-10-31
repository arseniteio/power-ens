import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMachineSummaries, controlBar, describeAge, fleetFigures, freshnessCell, inFleetFilter, matrixCsv, overviewMachines } from '../../public/ens/overview/overview-model';
import type { MachineSummary } from '../../public/ens/overview/overview-model';

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

test('fleet figures and filters split machines by state', () => {
  const base = { isManager: false, notMet: 0, notEvidenced: 0, worst: [], newest: '2026-10-31T10:00:00Z' };
  const counts = (o: Partial<Record<string, number>>) => ({ CUMPLE: 0, PARCIAL: 0, NO_CUMPLE: 0, NO_EVALUABLE: 0, NO_APLICA: 0, ...o });
  const machines: MachineSummary[] = [
    { ...base, agentId: '001', measured: 2, counts: counts({ CUMPLE: 2 }), stale: false },
    { ...base, agentId: '002', measured: 2, counts: counts({ CUMPLE: 1, NO_CUMPLE: 1 }), stale: false },
    { ...base, agentId: '003', measured: 0, counts: counts({}), stale: true },
  ];
  assert.deepEqual(fleetFigures(machines), { all: 3, ok: 1, failing: 1, stale: 1 });
  assert.deepEqual(machines.filter(m => inFleetFilter(m, 'failing')).map(m => m.agentId), ['002']);
});

test('the control bar lists the machines of each status', () => {
  const bar = controlBar({
    cells: {
      '001': { kind: 'result', status: 'CUMPLE', notMet: 0, notEvidenced: 0 },
      '002': { kind: 'result', status: 'NO_CUMPLE', notMet: 2, notEvidenced: 0 },
      '003': { kind: 'not-measured' },
    },
  });
  assert.deepEqual(bar.CUMPLE, ['001']);
  assert.deepEqual(bar.NO_CUMPLE, ['002']);
  assert.equal(Object.values(bar).flat().length, 2);
});

test('the matrix exports one row per machine', () => {
  const csv = matrixCsv(
    [{ controlId: 'op.acc.1', cells: { '001': { kind: 'result', status: 'PARCIAL', score: 50, notMet: 1, notEvidenced: 0 }, '002': { kind: 'not-measured' } } }],
    [{ agentId: '001', agentName: 'web, 1', isManager: false }, { agentId: '002', isManager: false }]
  );
  assert.equal(csv, 'agente,nombre,op.acc.1\n001,"web, 1",Parcial 50%\n002,,no se mide');
});
