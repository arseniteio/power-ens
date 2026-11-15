import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';

const catalogDefault = JSON.parse(readFileSync(join(__dirname, '../../common/ens/catalog/default-configuration.json'), 'utf8'));

test('the default configuration takes the level and the scope of the engine catalog', () => {
  assert.equal(defaultENSConfigurationTemplate.global.ensLevel, catalogDefault.ensLevel);
  assert.equal(defaultENSConfigurationTemplate.scope.mode, catalogDefault.scope.mode);
  assert.deepEqual(defaultENSConfigurationTemplate.scope.groupIds, catalogDefault.scope.groupIds);
});
