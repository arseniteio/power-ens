import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { controlStatusCounts, donutArcs } from '../../public/wazuh-pages/compliance-status-chart';

describe('compliance status chart', () => {
  test('maps the engine summary to its statuses', () => {
    const summary = { totalControls: 15, compliant: 1, partial: 2, nonCompliant: 3, notEvaluable: 4, notApplicable: 5, scoreAverage: 7, measured: 6 };

    assert.deepEqual(controlStatusCounts(summary), { CUMPLE: 1, PARCIAL: 2, NO_CUMPLE: 3, NO_EVALUABLE: 4, NO_APLICA: 5 });
  });

  test('arcs follow each other and cover the circle, skipping empty statuses', () => {
    const arcs = donutArcs([{ count: 1 }, { count: 0 }, { count: 3 }], 100);

    assert.deepEqual(arcs.map(({ length, offset }) => ({ length, offset })), [{ length: 25, offset: -0 }, { length: 75, offset: -25 }]);
  });

  test('no controls draw no arcs', () => {
    assert.deepEqual(donutArcs([{ count: 0 }], 100), []);
  });
});
