import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { describeExclusionNotice } from '../../public/ens/exclusions/exclusion-view';

const excluded = {
  agentId: '001',
  controlId: 'op.acc.1',
  action: 'EXCLUDED' as const,
  reason: 'Máquina de pruebas.',
  user: 'dioni',
  date: '2026-11-15T17:02:00.000Z',
};

describe('the exclusion notice', () => {
  test('is absent while the machine is outside the exclusion group', () => {
    assert.equal(describeExclusionNotice(false, excluded, 'CUMPLE'), undefined);
  });

  test('shows the recorded reason and who recorded it', () => {
    const notice = describeExclusionNotice(true, excluded, 'NO_APLICA');

    assert.equal(notice?.reason, 'Máquina de pruebas.');
    assert.match(notice?.recordedBy || '', /^dioni · 15 nov 2026/);
    assert.equal(notice?.pendingEngine, false);
  });

  test('waits for the engine until the verdict is not applicable', () => {
    assert.equal(describeExclusionNotice(true, excluded, 'CUMPLE')?.pendingEngine, true);
  });

  test('says when the machine was put in the group from Wazuh', () => {
    const notice = describeExclusionNotice(true, null, 'NO_APLICA');

    assert.equal(notice?.reason, 'Excluida desde Wazuh, sin motivo registrado.');
    assert.equal(notice?.recordedBy, undefined);
  });

  test('ignores a reason recorded before the machine was included again', () => {
    const included = { ...excluded, action: 'INCLUDED' as const };

    assert.equal(describeExclusionNotice(true, included, 'NO_APLICA')?.reason, 'Excluida desde Wazuh, sin motivo registrado.');
  });
});
