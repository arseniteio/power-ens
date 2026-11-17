import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { engineCatalogEntry } from '../../common/ens/catalog/engine-catalog';
import { ENS_ORGANIZATION_DATA_ITEMS } from '../../common/ens/configuration/organization/organization-data-items';
import { normalizeOrganizationData } from '../../common/ens/configuration/organization/organization-data-migration';
import { defaultENSConfigurationTemplate } from '../../common/ens/configuration/data/default-configuration';

const parameterOf = (controlId: string, parameterId: string): any => engineCatalogEntry(controlId)?.parameters?.[parameterId];

describe('organisation data', () => {
  test('covers the twelve shared data of the template map except rollback', () => {
    assert.equal(ENS_ORGANIZATION_DATA_ITEMS.length, 12);
  });

  test('every view reads a catalog parameter of the same shape', () => {
    for (const item of ENS_ORGANIZATION_DATA_ITEMS) {
      const names = (item.columns || []).map(column => column.name);
      for (const view of item.views) {
        const where = `${item.id} → ${view.controlId} ${view.parameterId}`;
        const parameter = parameterOf(view.controlId, view.parameterId);
        assert.ok(parameter, `${where}: not in the catalog`);
        const columns = view.columns || (item.type === 'table' ? names : [names[0] || 'valor']);
        columns.forEach(column => assert.ok(item.type !== 'table' || names.includes(column), `${where}: unknown column ${column}`));
        Object.keys(view.where || {}).forEach(column => assert.ok(names.includes(column), `${where}: unknown filter ${column}`));
        if (parameter.type === 'table') assert.equal(columns.length, parameter.columns.length, `${where}: ${columns.length} columns for ${parameter.columns.length}`);
        else if (parameter.type !== 'list') assert.equal(columns.length, 1, `${where}: a ${parameter.type} takes one column`);
      }
    }
  });

  test('a parameter is read by one item at most', () => {
    const seen = new Set<string>();
    for (const item of ENS_ORGANIZATION_DATA_ITEMS) {
      for (const view of item.views) {
        const key = `${view.controlId} ${view.parameterId}`;
        assert.ok(!seen.has(key), key);
        seen.add(key);
      }
    }
  });

  test('a filter value is one of the options of its column', () => {
    for (const item of ENS_ORGANIZATION_DATA_ITEMS) {
      for (const view of item.views) {
        for (const [column, value] of Object.entries(view.where || {})) {
          const options = item.columns?.find(candidate => candidate.name === column)?.options;
          if (column !== 'medida') assert.ok(options?.includes(value), `${item.id} ${view.controlId}: ${value} not in ${column}`);
        }
      }
    }
  });

  test('the default configuration normalises without conflicts', () => {
    const report = normalizeOrganizationData(structuredClone(defaultENSConfigurationTemplate) as any);
    assert.deepEqual(report.conflicts, []);
  });
});
