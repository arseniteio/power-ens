import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageLabel, dateLabel, dateTimeLabel } from '../../common/ens/core/date-label';

test('dates read as day, short month, year and time', () => {
  const d = new Date(2026, 9, 31, 17, 5);
  assert.equal(dateTimeLabel(d), '31 oct 2026, 17:05');
  assert.equal(dateLabel(d.toISOString()), '31 oct 2026');
});

test('invalid or empty dates give no label', () => {
  assert.equal(dateTimeLabel('nope'), '');
  assert.equal(dateTimeLabel(undefined), '');
});

test('recent dates read as an age', () => {
  const now = new Date(2026, 9, 31, 17, 0).getTime();
  assert.equal(ageLabel(now - 30 * 1000, now), 'ahora');
  assert.equal(ageLabel(now - 5 * 60000, now), 'hace 5 min');
  assert.equal(ageLabel(now - 3 * 3600000, now), 'hace 3 h');
  assert.equal(ageLabel(new Date(2026, 9, 29, 9, 0), now), '29 oct 2026, 09:00');
});
