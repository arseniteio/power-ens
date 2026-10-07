/**
 *   npx --yes tsx tests/requirements-model.test.ts
 */
import { buildRequirementsModel } from '../public/requirements/requirements-model';

declare const process: { exit(code: number): void };
const fallos: string[] = [];
const comprueba = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FALLA'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) fallos.push(n); };

const desc = {
  'mp.info.6.1': 'Copias de seguridad - …',
  'mp.info.6.2.a': 'Frecuencia - …',
  'op.acc.1.1': 'Identificador único - …',
  'op.exp.10.1': 'Gestión de claves - …',
};
const cuentas = [{ key: 'mp.info.6.1', doc_count: 40 }, { key: 'op.acc.1.1', doc_count: 31 }, { key: 'op.acc.1', doc_count: 93 }];
const m = buildRequirementsModel(desc, cuentas, { search: '', hideEmpty: false, selected: undefined });

comprueba('un control por grupo de requisitos', m.controls.map(c => c.id).join() === 'mp.info.6,op.acc.1,op.exp.10', m.controls.map(c => c.id));
comprueba('total del control = suma de sus requisitos', m.controls.find(c => c.id === 'mp.info.6')?.count === 40);
comprueba('un recuento a nivel de control no se suma', m.controls.find(c => c.id === 'op.acc.1')?.count === 31);
comprueba('control sin hechos: 0', m.controls.find(c => c.id === 'op.exp.10')?.count === 0);
comprueba('requisitos ordenados por recuento', m.requirements[0].id === 'mp.info.6.1' && m.requirements[0].count === 40);
comprueba('op.exp.10.1 no cae en op.exp.1', !m.controls.some(c => c.id === 'op.exp.1'));

const filtrado = buildRequirementsModel(desc, cuentas, { search: 'frecuencia', hideEmpty: false, selected: undefined });
comprueba('buscar por descripción', filtrado.requirements.map(r => r.id).join() === 'mp.info.6.2.a');
const sinVacios = buildRequirementsModel(desc, cuentas, { search: '', hideEmpty: true, selected: undefined });
comprueba('ocultar sin hechos', sinVacios.requirements.every(r => r.count > 0) && sinVacios.requirements.length === 2);
const uno = buildRequirementsModel(desc, cuentas, { search: '', hideEmpty: false, selected: 'op.acc.1' });
comprueba('control seleccionado: solo sus requisitos', uno.requirements.map(r => r.id).join() === 'op.acc.1.1');

console.log(fallos.length ? `\n${fallos.length} FALLOS` : '\nTODO OK');
process.exit(fallos.length ? 1 : 0);
