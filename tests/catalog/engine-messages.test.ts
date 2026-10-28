import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEngineMessage } from '../../common/ens/catalog/engine-messages';

describe('engine messages', () => {
  test('render a code with its arguments in Spanish', () => {
    assert.equal(renderEngineMessage('param.not_set', { param: 'P-07' }), 'P-07 sin valor');
  });

  test('render nested messages', () => {
    const text = renderEngineMessage('chain.auditd', { state: { code: 'auditd.absent' }, error: '' });
    assert.equal(text, 'auditd no está instalado');
  });

  test('join a list of messages with semicolons', () => {
    const list = [{ code: 'raw', args: { text: 'a' } }, { code: 'raw', args: { text: 'b' } }];
    assert.equal(renderEngineMessage('findings_semicolon', { list }), 'a; b');
  });

  test('join a list of values with commas', () => {
    assert.equal(renderEngineMessage('raw', { text: ['x', 'y'] }), 'x, y');
  });

  test('leave an unknown code undefined so the caller falls back', () => {
    assert.equal(renderEngineMessage('no.such.code', {}), undefined);
    assert.equal(renderEngineMessage(undefined), undefined);
  });
});
