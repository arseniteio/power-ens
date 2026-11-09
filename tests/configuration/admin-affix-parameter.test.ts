import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTableFieldModel, validateParameterValue } from '../../common/ens/configuration/services/parameter-value-validator';

const catalog = JSON.parse(readFileSync('common/ens/catalog/engine/op.acc.1.json', 'utf8'));
const parameter = { ...catalog.parameters['P-12'], id: 'P-12', controlId: 'op.acc.1' };

describe('op.acc.1 P-12 administrative affix', () => {
  test('a value stored before the position column stays valid', () => {
    assert.equal(validateParameterValue(parameter, '.adm').valid, true);
    assert.equal(validateParameterValue(parameter, ['.adm']).valid, true);
    assert.equal(resolveTableFieldModel(parameter, '.adm').rows[0].cells[0].value, '.adm');
  });

  test('prefix and suffix rows are accepted together', () => {
    assert.equal(validateParameterValue(parameter, ['.adm | sufijo', 'adm_ | prefijo']).valid, true);
  });

  test('a position outside the options is rejected', () => {
    assert.equal(validateParameterValue(parameter, ['.adm | medio']).valid, false);
  });
});
