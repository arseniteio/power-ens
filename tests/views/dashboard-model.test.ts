import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAttentionRows, buildControlMap, buildFamilyRows, countControls, trendDelta } from '../../public/ens/dashboard/dashboard-model';
import type { ENSControlSummaryEntry } from '../../common/ens/evaluation/types';

const CATALOG = [
  { id: 'op.acc.1', title: 'Identificación', family: 'Control de acceso' },
  { id: 'op.acc.2', title: 'Requisitos de acceso', family: 'Control de acceso' },
  { id: 'op.acc.3', title: 'Segregación de funciones', family: 'Control de acceso' },
  { id: 'op.cont.2', title: 'Plan de continuidad', family: 'Continuidad del servicio' },
  { id: 'mp.eq.2', title: 'Bloqueo de puesto de trabajo', family: 'Protección de los equipos' },
];

const control = (controlId: string, status: string, score?: number, extra: Partial<ENSControlSummaryEntry> = {}): ENSControlSummaryEntry => ({
  controlId,
  status,
  score,
  evaluated: true,
  requirementsNotMet: 0,
  requirementsNotEvidenced: 0,
  ...extra,
});

describe('the dashboard', () => {
  test('groups controls by family in catalog order with the catalog name', () => {
    const rows = buildFamilyRows(CATALOG, [control('op.acc.1', 'NO_CUMPLE', 0), control('op.acc.2', 'CUMPLE', 100), control('mp.eq.2', 'PARCIAL', 50)]);

    assert.deepEqual(
      rows.map(row => [row.family, row.name, row.total]),
      [
        ['op.acc', 'Control de acceso', 3],
        ['op.cont', 'Continuidad del servicio', 1],
        ['mp.eq', 'Protección de los equipos', 1],
      ]
    );
  });

  test('averages a family index over its applicable measured controls only', () => {
    const [accessControl] = buildFamilyRows(CATALOG, [control('op.acc.1', 'NO_CUMPLE', 0), control('op.acc.2', 'CUMPLE', 100), control('op.acc.3', 'NO_APLICA', 0)]);

    assert.equal(accessControl.score, 50);
    assert.equal(accessControl.counts.NO_APLICA, 1);
    assert.equal(accessControl.unmeasured, 0);
  });

  test('leaves a family without verdicts unmeasured and without index', () => {
    const continuity = buildFamilyRows(CATALOG, [control('op.cont.2', 'NO_EVALUABLE', undefined, { evaluated: false })]).find(row => row.family === 'op.cont')!;

    assert.equal(continuity.unmeasured, 1);
    assert.equal(continuity.score, undefined);
  });

  test('lists controls needing attention, failing ones first and the worst score first', () => {
    const rows = buildAttentionRows(CATALOG, [
      control('mp.eq.2', 'PARCIAL', 50),
      control('op.acc.2', 'NO_CUMPLE', 20),
      control('op.acc.1', 'NO_CUMPLE', 0),
      control('op.acc.3', 'CUMPLE', 100),
      control('op.cont.2', 'NO_EVALUABLE'),
    ]);

    assert.deepEqual(
      rows.map(row => row.controlId),
      ['op.acc.1', 'op.acc.2', 'mp.eq.2', 'op.cont.2']
    );
    assert.equal(rows[0].title, 'Identificación');
  });

  test('ignores controls still being computed', () => {
    const rows = buildAttentionRows(CATALOG, [control('op.acc.1', 'NO_EVALUABLE', undefined, { pending: true })]);
    const counts = countControls([control('op.acc.1', 'NO_EVALUABLE', undefined, { pending: true }), control('op.acc.2', 'CUMPLE', 100)]);

    assert.equal(rows.length, 0);
    assert.equal(counts.NO_EVALUABLE, 0);
    assert.equal(counts.CUMPLE, 1);
  });

  test('measures the change of the index over the period', () => {
    assert.equal(trendDelta([{ label: '28/10', score: 20, isCurrent: false }, { label: '01/11', score: 57, isCurrent: true }]), 37);
    assert.equal(trendDelta([{ label: '28/10', score: 60, isCurrent: false }, { label: '01/11', score: 57, isCurrent: true }]), -3);
    assert.equal(trendDelta([{ label: '01/11', score: 57, isCurrent: true }]), undefined);
  });

  test('maps every catalog control by family, unmeasured ones without status', () => {
    const map = buildControlMap(CATALOG, [control('op.acc.1', 'NO_CUMPLE', 0), control('op.acc.2', 'CUMPLE', 100, { pending: true })]);

    assert.deepEqual(
      map.map(row => [row.family, row.cells.length]),
      [
        ['op.acc', 3],
        ['op.cont', 1],
        ['mp.eq', 1],
      ]
    );
    assert.equal(map[0].cells[0].status, 'NO_CUMPLE');
    assert.equal(map[0].cells[1].status, undefined);
  });
});
