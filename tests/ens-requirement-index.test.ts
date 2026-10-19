/** The classic compliance view lists ALL catalog controls and filters exactly the facts it counts. */
import { ENSCatalog } from '../common/ens/catalog';
import { ensRequirementsFile } from '../public/ens-requirements';
import {
  buildENSRequirementFilter,
  buildENSRequirementQuery,
  countENSRequirements,
  ENS_REQUIREMENT_COUNT_AGGS,
  splitENSRequirementList,
} from '../common/ens/core/compliance-view/ens-requirement-index';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const count = (list: { key: string; doc_count: number }[], clave: string): number =>
  (list.find(item => item.key === clave) || { doc_count: 0 }).doc_count;

section('the classic view\'s catalog is the engine\'s');
{
  const fromCatalog = new Set(ENSCatalog.flatMap(control => control.requirements.map(r => r.id)));
  const ofFile = new Set(Object.keys(ensRequirementsFile));
  const missing = [...fromCatalog].filter(id => !ofFile.has(id));
  const extra = [...ofFile].filter(id => !fromCatalog.has(id));

  check('no catalog requirement is missing from ens-requirements.ts', missing.length === 0, missing.join(', '));
  check('ens-requirements.ts has no requirements the catalog lacks', extra.length === 0, extra.join(', '));

  const groups = new Set([...ofFile].map(id => id.split('.').slice(0, 3).join('.')));
  const controls = ENSCatalog.map(control => control.id);

  check(
    `the ${controls.length} controls appear in the controls column`,
    controls.every(id => groups.has(id)) && groups.size === controls.length,
    [...groups].join(', ')
  );
  check('no empty description', Object.values(ensRequirementsFile).every(text => String(text).trim().length > 0));
}

section('counts: each fact counts by its list, its evidences or its control');
{
  const aggregations = {
    ens_requisito: {
      buckets: [
        { key: 'op.acc.3.1,op.acc.3.2,op.acc.3.r1.1,op.acc.3.r1.2', doc_count: 878 },
        { key: 'op.exp.10.1', doc_count: 607 },
        { key: 'op.exp.8.1', doc_count: 498 },
        { key: 'op.exp.8.1,op.exp.8.2', doc_count: 288 },
        { key: 'op.exp.7.1,op.exp.7.2,op.exp.7.r1.1,op.exp.7.r2.1,op.exp.7.r2.2,op.exp.7.r2.3,op.exp.7.r2.4', doc_count: 192 },
        { key: 'op.acc.2.r1.2', doc_count: 294 },
        { key: ' op.exp.1.1 , op.exp.1.r4.1 ,op.exp.1.1', doc_count: 5 },
      ],
    },
    ens_evidencia: {
      control: {
        buckets: [
          {
            key: 'mp.info.6',
            evidencia: {
              buckets: [
                { key: 'EV-01', doc_count: 40 },
                { key: 'EV-04', doc_count: 276 },
                { key: 'EV-01,EV-02', doc_count: 3 },
                { key: 'EV-99', doc_count: 7 },
              ],
            },
          },
          { key: 'control-que-no-existe', evidencia: { buckets: [{ key: 'EV-01', doc_count: 9 }] } },
        ],
      },
    },
    ens_control: {
      control: {
        buckets: [
          { key: 'op.acc.1.1', doc_count: 31 },
          { key: 'op.acc.1', doc_count: 93 },
          { key: 'op.acc.2.r1.2', doc_count: 24 },
        ],
      },
    },
  };
  const list = countENSRequirements(aggregations);

  check('op.acc.3.1 by the list of four', count(list, 'op.acc.3.1') === 878);
  check('op.exp.8.1 adds its two combinations (498 + 288)', count(list, 'op.exp.8.1') === 786);
  check('op.exp.8.2 only the combination that cites it', count(list, 'op.exp.8.2') === 288);
  check('op.exp.7.r2.4 at the end of the list', count(list, 'op.exp.7.r2.4') === 192);
  check('op.exp.10.1 is not confused with op.exp.1', count(list, 'op.exp.1.1') === 5 && count(list, 'op.exp.10.1') === 607);
  check('spaces and repeats inside the list do not count twice', count(list, 'op.exp.1.1') === 5 && count(list, 'op.exp.1.r4.1') === 5);
  check('the old fact counts by data.control', count(list, 'op.acc.1.1') === 31);
  check('list and data.control add up on the same requirement', count(list, 'op.acc.2.r1.2') === 294 + 24);
  check('no aggregations, empty list', countENSRequirements(undefined).length === 0 && countENSRequirements({}).length === 0);
  check('EV-01 counts for its two requirements', count(list, 'mp.info.6.2.a') === 43);
  check('EV-01,EV-02 counts once per requirement, not twice', count(list, 'mp.info.6.1') === 43);
  check('EV-04 counts for mp.info.6.2.d', count(list, 'mp.info.6.2.d') === 276);
  check('an evidence the catalog lacks does not count', !list.some(item => item.doc_count === 7));
  check('a control the catalog lacks does not count', !list.some(item => item.doc_count === 9));
  check(
    'evidences count only on facts WITHOUT data.requisito',
    JSON.stringify(ENS_REQUIREMENT_COUNT_AGGS.ens_evidencia.filter) ===
      JSON.stringify({ bool: { must: [{ exists: { field: 'data.evidence_id' } }], must_not: [{ exists: { field: 'data.requisito' } }] } })
  );
  check(
    'data.control only on facts without requirement NOR evidence',
    JSON.stringify(ENS_REQUIREMENT_COUNT_AGGS.ens_control.filter) ===
      JSON.stringify({ bool: { must_not: [{ exists: { field: 'data.requisito' } }, { exists: { field: 'data.evidence_id' } }] } })
  );
  check('splitting the list', JSON.stringify(splitENSRequirementList('a, b,,a ')) === '["a","b"]');
}

section('filter: the same facts as the count');
{
  const q = buildENSRequirementQuery('op.exp.1.1') as any;
  const patron = q.bool.should[0].regexp['data.requisito'] as string;
  const re = new RegExp(`^${patron}$`);

  check('matches alone', re.test('op.exp.1.1'));
  check('matches at the start of the list', re.test('op.exp.1.1,op.exp.1.r4.1'));
  check('matches at the end of the list', re.test('op.exp.1.r4.1,op.exp.1.1'));
  check('matches in the middle and with spaces', re.test('op.exp.1.r1.1, op.exp.1.1 ,op.exp.1.r4.1'));
  check('does not match op.exp.1.10', !re.test('op.exp.1.10'));
  check('does not match op.exp.10.1', !re.test('op.exp.10.1'));
  check('does not match op.exp.1.1 with a prefix', !re.test('xop.exp.1.1'));
  check('the dot is escaped (does not match op-exp-1-1)', !re.test('op-exp-1-1'));

  const byEvidence = q.bool.should[1].bool;
  const reEv = new RegExp(`^${byEvidence.must[1].regexp['data.evidence_id']}$`);

  check('by evidence: only the facts of its control', byEvidence.must[0].term['data.ensfacil'] === 'op.exp.1');
  check('by evidence: those of the catalog (EV-01 to EV-07 in op.exp.1.1)', reEv.test('EV-01') && reEv.test('EV-07') && reEv.test('EV-03,EV-07'));
  check('by evidence: does not match EV-010, EV-1 or EV-08', !reEv.test('EV-010') && !reEv.test('EV-1') && !reEv.test('EV-08'));
  check('by evidence: only without data.requisito', byEvidence.must_not[0].exists.field === 'data.requisito');

  const stale = q.bool.should[2].bool;

  check('data.control only without requirement or evidence', stale.must[0].match_phrase['data.control'] === 'op.exp.1.1' && stale.must_not.length === 2);
  check('one of the three is enough', q.bool.minimum_should_match === 1);

  const withoutEvidences = buildENSRequirementQuery('op.acc.1.1') as any;
  const invented = buildENSRequirementQuery('op.zzz.9.9') as any;

  check('a requirement outside the catalog: list and control, no evidences', invented.bool.should.length === 2);
  check('a catalog requirement carries the three routes', withoutEvidences.bool.should.length >= 2);

  const f = buildENSRequirementFilter('op.exp.1.1', { index: 'wazuh-alerts-*', controlledBy: 'x' }) as any;

  check('custom filter with the same query', f.meta.type === 'custom' && JSON.stringify(f.query) === JSON.stringify(q));
  check('the filter carries what the screen asks for', f.meta.index === 'wazuh-alerts-*' && f.meta.controlledBy === 'x');
  check('the filter is read in the bar', f.meta.alias === 'ENS op.exp.1.1');
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
