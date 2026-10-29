import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getENSReportModelDefinition, listENSControlsWithoutReportModel } from '../../public/ens/reports/registry';
import { ENSCatalog } from '../../common/ens/catalog';

const result: any = {
  status: 'PARCIAL',
  score: 40,
  coverage: 60,
  level: 'MEDIO',
  observations: ['2 de 8 requisitos aplicables cumplen'],
  evidences: [
    { id: 'EV-01', status: 'CUMPLE', observations: ['25 cuentas, todos los UID únicos'] },
    { id: 'EV-03', status: 'NO_CUMPLE', observations: ['admin inició sesión'] },
  ],
  parameters: [{ id: 'P-04', label: 'Cuentas genéricas prohibidas', value: ['admin', 'guest'] }, { id: 'P-01', value: undefined }],
};

describe('a control report', () => {
  test('exists for every control of the catalog', () => {
    assert.deepEqual(listENSControlsWithoutReportModel(ENSCatalog.map(control => control.id)), []);
  });

  test('opens with the control status and score', () => {
    const [status] = getENSReportModelDefinition('op.acc.1')!.build(result).fields;
    assert.equal(status.status, 'PARCIAL');
    assert.equal(status.value, 'Parcial · 40 %');
  });

  test('gives each field the status of its evidence and its reason', () => {
    const fields = getENSReportModelDefinition('op.acc.1')!.build(result).fields;
    const generic = fields.find(field => field.id === 'op.acc.1.genericas')!;
    assert.equal(generic.status, 'NO_CUMPLE');
    assert.ok(generic.details.includes('EV-03: admin inició sesión'));
    assert.ok(generic.details.includes('P-04 Cuentas genéricas prohibidas: admin, guest'));
  });

  test('names the parameters a field still lacks', () => {
    const inventory = getENSReportModelDefinition('op.acc.1')!.build(result).fields.find(field => field.id === 'op.acc.1.inventario')!;
    assert.deepEqual(inventory.producerGaps, ['P-01', 'P-02']);
  });

  test('is never another control\'s', () => {
    assert.equal(getENSReportModelDefinition('op.zzz.9'), undefined);
  });
});
