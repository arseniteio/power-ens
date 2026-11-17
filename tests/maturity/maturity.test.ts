import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setAssessment, stampAssessments, validateMaturityShape } from '../../common/ens/maturity/assessments';
import { organizationMaturityOf } from '../../common/ens/maturity/queries';
import { ENS_DECLARED_MEASURES } from '../../common/ens/maturity/declared-measures';
import { ENSCatalog } from '../../common/ens/catalog';
import { maturityReportRows } from '../../public/ens/maturity/maturity-report';

const configuration = (assessments: any[] = []) => ({ maturity: { assessments } }) as any;

describe('maturity assessments', () => {
  test('the shape accepts ENS measures and levels from 0 to 5 only', () => {
    assert.deepEqual(validateMaturityShape(undefined), []);
    assert.deepEqual(validateMaturityShape({ assessments: [{ measureId: 'op.acc.1', level: 3, target: 4 }, { measureId: 'org.2', level: 0 }] }), []);
    assert.equal(validateMaturityShape({ assessments: [{ measureId: 'op.acc.1', level: 6 }] }).length, 1);
    assert.equal(validateMaturityShape({ assessments: [{ measureId: 'cualquier cosa' }] }).length, 1);
    assert.equal(validateMaturityShape({ assessments: [{ measureId: 'org.2' }, { measureId: 'org.2' }] }).length, 1);
    assert.equal(validateMaturityShape([]).length, 1);
  });

  test('setting an assessment replaces the previous one and an empty one removes it', () => {
    const one = setAssessment(configuration([{ measureId: 'op.acc.1', level: 1 }]), { measureId: 'op.acc.1', level: 3 });
    assert.deepEqual(one.maturity?.assessments, [{ measureId: 'op.acc.1', level: 3 }]);
    const none = setAssessment(one, { measureId: 'op.acc.1' });
    assert.deepEqual(none.maturity?.assessments, []);
  });

  test('the server signs only the assessments whose content changed', () => {
    const previous = [{ measureId: 'op.acc.1', level: 3, assessedBy: 'ana', assessedAt: '2026-11-01T00:00:00Z' }];
    const next = [
      { measureId: 'op.acc.1', level: 3, assessedBy: 'forged', assessedAt: 'x' },
      { measureId: 'org.2', level: 2, assessedBy: 'forged' },
    ];
    const stamped = stampAssessments(next, previous, 'dioni', '2026-11-17T12:00:00Z');
    assert.equal(stamped[0].assessedBy, 'ana');
    assert.equal(stamped[0].assessedAt, '2026-11-01T00:00:00Z');
    assert.equal(stamped[1].assessedBy, 'dioni');
    assert.equal(stamped[1].assessedAt, '2026-11-17T12:00:00Z');
  });
});

describe('declared measures', () => {
  test('are valid measure ids that no engine control judges', () => {
    const assessments = ENS_DECLARED_MEASURES.map(m => ({ measureId: m.id, level: 1 }));
    assert.deepEqual(validateMaturityShape({ assessments }), []);
    for (const m of ENS_DECLARED_MEASURES) assert.ok(!ENSCatalog.some(control => control.id === m.id), m.id);
  });
});

describe('organization maturity', () => {
  test('only the newest engine pass counts', () => {
    const hit = (control: string, at: string, maturity: object) => ({ _source: { control, '@timestamp': at, maturity } });
    const view = organizationMaturityOf({
      hits: {
        hits: [
          hit('ENS', '2026-11-17T10:00:00Z', { global_accredited: 1 }),
          hit('op.acc.1', '2026-11-17T10:00:00Z', { accredited: 1 }),
          hit('op.acc.1', '2026-11-17T09:45:00Z', { accredited: 2 }),
          hit('op.exp.8', '2026-11-17T09:45:00Z', { accredited: 2 }),
        ],
      },
    });
    assert.equal(view.at, '2026-11-17T10:00:00Z');
    assert.equal(view.summary?.global_accredited, 1);
    assert.deepEqual(Object.keys(view.measures), ['op.acc.1']);
    assert.equal(view.measures['op.acc.1'].accredited, 1);
  });

  test('no engine pass yet means no summary', () => {
    assert.deepEqual(organizationMaturityOf({ hits: { hits: [] } }), { at: undefined, summary: undefined, measures: {} });
  });

  test('the report shows accredited, declared and incoherence', () => {
    const rows = maturityReportRows({ accredited: 1, machines: 3, period_days: 30, incoherent: true }, { measureId: 'op.acc.1', level: 3, target: 3 });
    assert.match(rows[0].value, /L1 Inicial.*3 máquinas/);
    assert.match(rows[1].value, /L3 Proceso definido/);
    assert.ok(rows.some(row => row.label === 'Coherencia'));
    assert.equal(maturityReportRows(undefined, undefined)[1].value, 'sin valorar');
  });
});

describe('metrics export', () => {
  test('marks each figure as measured or declared and quotes what needs it', async () => {
    const { metricsCsv } = await import('../../common/ens/maturity/metrics-export');
    const csv = metricsCsv(
      [{ id: 'op.acc.1', name: 'Identificación', family: 'Control de acceso' }],
      [{ controlId: 'op.acc.1', status: 'PARCIAL', score: 75, evaluated: true, requirementsNotMet: 1, requirementsNotEvidenced: 0 }],
      { at: 'x', measures: { 'op.acc.1': { accredited: 1 } }, summary: { global_accredited: 1, global_assessed: 0 } },
      [{ measureId: 'op.acc.1', level: 3, references: 'PR-01; v2' }, { measureId: 'org.2', level: 2, references: '=HYPERLINK("x")' }],
      '2026-11-17'
    );
    const lines = csv.trim().split('\r\n');
    assert.match(lines[0], /^"medida";"nombre";"familia";"estado_operativo";"cumplimiento_pct"/);
    assert.equal(lines[1], '"op.acc.1";"Identificación";"Control de acceso";"PARCIAL";"75";"1";"0";"L1";"L3";"";"";"PR-01; v2";"medido y declarado"');
    assert.equal(lines[2], '"org.2";"";"";"";"";"";"";"";"L2";"";"";"\'=HYPERLINK(""x"")";"declarado"');
    assert.match(lines[3], /^"ENS \(global\)";.*;"L1";"L0";/);
    assert.equal(metricsCsv([], [], undefined, [{ measureId: 'org.2', references: ' +SUM(A1)' }], 'x').split('\r\n')[1].split(';')[11], '"\' +SUM(A1)"');
  });
});
