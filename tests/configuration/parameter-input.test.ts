import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasParameterSeparator, parseParameterInput } from '../../common/ens/configuration/services/parameter-input';

const splitsOnSpaces = { controlId: 'op.acc.1', id: 'P-03' };
const keepsSpaces = { controlId: 'op.acc.2', id: 'P-01' };

describe('list parameter input', () => {
  test('a comma, a semicolon or a line break ends an item', () => {
    for (const text of ['alice,', 'alice;', 'alice\n']) {
      assert.equal(hasParameterSeparator(keepsSpaces, text), true, JSON.stringify(text));
      assert.deepEqual(parseParameterInput(keepsSpaces, text), ['alice']);
    }
  });

  test('text without a separator stays in the field', () => {
    assert.equal(hasParameterSeparator(keepsSpaces, 'alice'), false);
    assert.equal(hasParameterSeparator(splitsOnSpaces, 'alice'), false);
  });

  test('a space ends an item only where the parameter splits on spaces', () => {
    assert.equal(hasParameterSeparator(splitsOnSpaces, 'alice '), true);
    assert.deepEqual(parseParameterInput(splitsOnSpaces, 'alice bob'), ['alice', 'bob']);
    assert.equal(hasParameterSeparator(keepsSpaces, 'two words'), false);
    assert.deepEqual(parseParameterInput(keepsSpaces, 'two words,other'), ['two words', 'other']);
  });

  test('repeated and empty items are dropped', () => {
    assert.deepEqual(parseParameterInput(keepsSpaces, ' a,,a ; b\n'), ['a', 'b']);
  });

  test('the renderer does not pass the searchValue prop that EUI 1.19 ignores', () => {
    const renderer = readFileSync('public/ens/configuration/form-engine/renderers/list-parameter-renderer.tsx', 'utf8');
    assert.doesNotMatch(renderer, /searchValue=/);
  });
});
