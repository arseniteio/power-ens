/** Requirements model. */
import { buildRequirementsModel } from '../public/requirements/requirements-model';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const desc = {
  'mp.info.6.1': 'Copias de seguridad - …',
  'mp.info.6.2.a': 'Frecuencia - …',
  'op.acc.1.1': 'Identificador único - …',
  'op.exp.10.1': 'Gestión de claves - …',
};
const accounts = [{ key: 'mp.info.6.1', doc_count: 40 }, { key: 'op.acc.1.1', doc_count: 31 }, { key: 'op.acc.1', doc_count: 93 }];
const m = buildRequirementsModel(desc, accounts, { search: '', hideEmpty: false, selected: undefined });

check('one control per requirement group', m.controls.map(c => c.id).join() === 'mp.info.6,op.acc.1,op.exp.10', m.controls.map(c => c.id));
check('control total = sum of its requirements', m.controls.find(c => c.id === 'mp.info.6')?.count === 40);
check('a control-level count is not added', m.controls.find(c => c.id === 'op.acc.1')?.count === 31);
check('control without facts: 0', m.controls.find(c => c.id === 'op.exp.10')?.count === 0);
check('requirements sorted by count', m.requirements[0].id === 'mp.info.6.1' && m.requirements[0].count === 40);
check('op.exp.10.1 does not fall into op.exp.1', !m.controls.some(c => c.id === 'op.exp.1'));

const filtered = buildRequirementsModel(desc, accounts, { search: 'frecuencia', hideEmpty: false, selected: undefined });
check('search by description', filtered.requirements.map(r => r.id).join() === 'mp.info.6.2.a');
const withoutEmpties = buildRequirementsModel(desc, accounts, { search: '', hideEmpty: true, selected: undefined });
check('hide without facts', withoutEmpties.requirements.every(r => r.count > 0) && withoutEmpties.requirements.length === 2);
const one = buildRequirementsModel(desc, accounts, { search: '', hideEmpty: false, selected: 'op.acc.1' });
check('selected control: only its requirements', one.requirements.map(r => r.id).join() === 'op.acc.1.1');

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
