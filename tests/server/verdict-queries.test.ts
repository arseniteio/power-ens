import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { addVerdictsProbePage, buildVerdictsProbeRequest, dailyVerdictsOf, VERDICTS_PROBE_PAGE } from '../../server/lib/evaluation/verdict-queries';
import type { ENSVerdictsProbe } from '../../server/lib/evaluation/verdict-queries';

const bucket = (control: string, agent: string, newest: number) => ({
  key: { control, agent },
  doc_count: 3,
  newest: { value: newest },
  oldest: { value: newest - 3600e3 },
});

describe('the verdicts probe', () => {
  test('pages with the composite key it is given', () => {
    const request: any = buildVerdictsProbeRequest(['op.acc.1'], '2026-10-01T00:00:00Z', { control: 'op.acc.1', agent: '007' });
    assert.deepEqual(request.body.aggs.rows.composite.after, { control: 'op.acc.1', agent: '007' });
    assert.equal(request.ignore_unavailable, true);
  });

  test('keeps the first and newest verdict of each control and machine', () => {
    const probe: ENSVerdictsProbe = {};
    addVerdictsProbePage(probe, { aggregations: { rows: { buckets: [bucket('op.acc.1', '001', Date.parse('2026-10-17T10:00:00Z'))] } } });
    assert.deepEqual(probe['op.acc.1']['001'], { newest: '2026-10-17T10:00:00.000Z', oldest: '2026-10-17T09:00:00.000Z', count: 3 });
  });

  test('asks for another page only when this one is full', () => {
    const full = Array.from({ length: VERDICTS_PROBE_PAGE }, (_, i) => bucket('op.acc.1', String(i), 1e12));
    assert.deepEqual(addVerdictsProbePage({}, { aggregations: { rows: { buckets: full, after_key: { control: 'x', agent: 'y' } } } }), { control: 'x', agent: 'y' });
    assert.equal(addVerdictsProbePage({}, { aggregations: { rows: { buckets: [bucket('op.acc.1', '1', 1e12)], after_key: { control: 'x', agent: 'y' } } } }), undefined);
  });

  test('reads an index that does not exist yet as no verdicts', () => {
    assert.equal(addVerdictsProbePage({}, {}), undefined);
  });
});

describe('the daily series request', () => {
  test('reads the last verdict of each day', () => {
    const daily = dailyVerdictsOf({
      aggregations: { days: { buckets: [{ last: { hits: { hits: [{ _source: { status: 'COMPLIANT' } }] } } }, { last: { hits: { hits: [] } } }] } },
    });
    assert.deepEqual(daily, [{ status: 'COMPLIANT' }]);
  });
});
