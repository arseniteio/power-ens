/** Organisation data (1.4.0): the items, the views each mapped parameter reads, the migration and verdict parity. */
import { existsSync, readFileSync } from 'fs';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { ENSConfigurationRegistry } from '../common/ens/configuration/registry';
import {
  ENS_ORGANIZATION_DATA_ITEMS,
  ORGANIZATION_SOURCE,
  checkOrganizationDataKeys,
  describeOrganizationData,
  describeOrganizationItem,
  findOrganizationDataLink,
  getOrganizationDataItem,
  normalizeOrganizationData,
  organizationViewValue,
  sameParameterValue,
  setOrganizationValue,
  summarizeOrganizationMigration,
  validateOrganizationDataShape,
} from '../common/ens/configuration/organization';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateENSConfigurationStructure as validate130 } from './fixtures/configuration-structure-validator-1.3.0';
import { resolveControlConfigurationForAgent } from '../common/ens/configuration/agents/configuration-resolver';
import { buildClearedControlConfiguration, summarizeControlConfigurationReset } from '../common/ens/configuration/services/configuration-reset-service';
import { planMigrationToSystems } from '../common/ens/configuration/agents/migration';
import { createConfigurationHandlers } from '../server/lib/configuration-handlers';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const require: (id: string) => any;
declare const __dirname: string;

{
  const Module = require('module');
  const load = Module._load;
  Module._load = function (request: string, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) return {};
    return load.call(this, request, ...rest);
  };
}

const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  if (!ok) failures.push(name);
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
// A document as a 1.3.0 plugin left it: no organisation block.
const base = (): any => {
  const doc = clone(defaultENSConfigurationTemplate) as any;
  delete doc.organizationData;
  return doc;
};
const param = (doc: any, controlId: string, parameterId: string): any =>
  doc.controls.find((control: any) => control.controlId === controlId).parameters.find((parameter: any) => parameter.id === parameterId);
const set = (doc: any, controlId: string, parameterId: string, value: unknown) => {
  const target = param(doc, controlId, parameterId);
  if (value === undefined) delete target.value;
  else target.value = value;
  return doc;
};
const valueOf = (doc: any, controlId: string, parameterId: string) => param(doc, controlId, parameterId).value;
const controlsJson = (doc: any) => JSON.stringify(doc.controls);

console.log('1. Model');
{
  const ids = ENS_ORGANIZATION_DATA_ITEMS.map(item => item.id);
  check('item ids are unique', new Set(ids).size === ids.length, ids);
  ['personal_autorizado', 'entorno_preproduccion', 'mecanismo_reversion', 'herramientas_gestion', 'sistemas_alcance', 'algoritmos_autorizados', 'retencion', 'zonas_controladas', 'canales_acceso_remoto', 'productos_certificados', 'registro_pruebas', 'formacion_personal', 'grupos_privilegiados', 'declaracion_aplicabilidad'].forEach(id =>
    check(`item ${id} exists`, ids.includes(id))
  );
  const seen = new Map<string, string>();
  const problems: string[] = [];
  ENS_ORGANIZATION_DATA_ITEMS.forEach(item => {
    const names = (item.columns || []).map(column => column.name);
    item.views.forEach(view => {
      const key = `${view.controlId} ${view.parameterId}`;
      if (seen.has(key)) problems.push(`${key} in ${seen.get(key)} and ${item.id}`);
      seen.set(key, item.id);
      const parameter = ENSConfigurationRegistry.find(control => control.controlId === view.controlId)?.parameters.find(candidate => candidate.id === view.parameterId);
      if (!parameter) {
        problems.push(`${key} is not declared`);
        return;
      }
      [...(view.columns || []), ...Object.keys(view.where || {})].forEach(column => {
        if (item.type === 'table' && !names.includes(column)) problems.push(`${key}: ${column} is not an item column`);
      });
      if (!view.where && !view.columns) {
        if (item.type === 'table' && JSON.stringify((parameter.columns || []).map(column => column.name)) !== JSON.stringify(names)) problems.push(`${key}: columns differ from the item`);
        if (item.type !== 'table' && parameter.type !== item.type) problems.push(`${key}: type ${parameter.type} is not ${item.type}`);
        if (item.type === 'select' && JSON.stringify(parameter.options) !== JSON.stringify(item.options)) problems.push(`${key}: options differ`);
      }
      if (view.columns && parameter.type === 'table' && view.columns.length !== (parameter.columns || []).length) problems.push(`${key}: ${view.columns.length} view columns for ${(parameter.columns || []).length}`);
    });
    item.unmapped.forEach(entry => {
      if (!ENSConfigurationRegistry.find(control => control.controlId === entry.controlId)?.parameters.some(candidate => candidate.id === entry.parameterId)) problems.push(`unmapped ${entry.controlId} ${entry.parameterId} is not declared`);
    });
  });
  check('every view names a declared parameter, once, with columns the item has', problems.length === 0, problems);
  check('the informative item has no view and explains each related parameter', getOrganizationDataItem('sistemas_alcance')!.views.length === 0 && getOrganizationDataItem('sistemas_alcance')!.unmapped.length > 0);
  check('each parameter finds its item', findOrganizationDataLink('op.acc.2', 'P-12')?.item.id === 'grupos_privilegiados' && !findOrganizationDataLink('op.acc.1', 'P-02'));

  const source = readFileSync(`${__dirname}/../common/ens/configuration/organization/organization-data-items.ts`, 'utf8');
  const start = source.indexOf('\n[', source.indexOf('ENS_ORGANIZATION_DATA_ITEMS: ENSOrganizationDataItem[] =')) + 1;
  const end = source.indexOf('\n];', start);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.slice(start, end + 2));
  } catch (error) {
    parsed = String(error);
  }
  check('the items are strict JSON (the scripts parse them)', JSON.stringify(parsed) === JSON.stringify(ENS_ORGANIZATION_DATA_ITEMS), parsed);
}

console.log('2. Shape');
{
  check('an absent block is valid', validateOrganizationDataShape(undefined).length === 0);
  check('a null item value is fatal, naming it', /values\.grupos_privilegiados/.test(validateOrganizationDataShape({ values: { grupos_privilegiados: null } }).join()));
  check('values must be an object', validateOrganizationDataShape({ values: [] }).length === 1 && validateOrganizationDataShape('x').length === 1);
  const doc = base();
  doc.organizationData = { values: { grupos_privilegiados: null } };
  check('the structure validator refuses it (the environment would not load)', !validateENSConfigurationStructure(doc).valid);
  check('an unknown item or key is a warning, kept', checkOrganizationDataKeys({ values: { futuro: 'x' }, otra: 1 }).length === 2);
}

console.log('3. Views');
{
  const doc = normalizeOrganizationData(base()).configuration;
  const groups = ['sudo', 'wheel'];
  const withGroups = setOrganizationValue(doc, 'grupos_privilegiados', groups);
  check('the organisation value reaches every mapped parameter', ['op.acc.1 P-11', 'op.acc.2 P-12', 'op.acc.4 P-06'].every(key => {
    const [controlId, parameterId] = key.split(' ');
    return JSON.stringify(valueOf(withGroups, controlId, parameterId)) === JSON.stringify(groups);
  }));
  check('the engine reads the same value through every mapped parameter', ['op.acc.1', 'op.acc.2', 'op.acc.4'].every(controlId => {
    const parameterId = controlId === 'op.acc.1' ? 'P-11' : controlId === 'op.acc.2' ? 'P-12' : 'P-06';
    return JSON.stringify(resolveControlConfigurationForAgent(withGroups, controlId, '024')?.parameters.find(parameter => parameter.id === parameterId)?.value) === JSON.stringify(groups);
  }));
  const withAgent = { ...withGroups, agents: { '024': { controls: { 'op.acc.1': { parameters: { 'P-11': ['admins'] } } } }, '028': { name: 'otra' } } };
  check('an agent override still applies on top', JSON.stringify(resolveControlConfigurationForAgent(withAgent, 'op.acc.1', '024')?.parameters.find(parameter => parameter.id === 'P-11')?.value) === '["admins"]');
  check('and the other agents read the organisation value', JSON.stringify(resolveControlConfigurationForAgent(withAgent, 'op.acc.1', '028')?.parameters.find(parameter => parameter.id === 'P-11')?.value) === JSON.stringify(groups));

  const register = setOrganizationValue(doc, 'personal_autorizado', [
    'root | configuracion, copias',
    'ana | mantenimiento, configuracion | servidores Linux | parcheado',
    'syslog | registros | registros del sistema | escritura',
    'rsec | autorizaciones | global',
  ]);
  check('a register view reads only its rows and columns', JSON.stringify(valueOf(register, 'op.exp.3', 'P-03')) === '["root","ana"]', valueOf(register, 'op.exp.3', 'P-03'));
  check('with the column order of the parameter', JSON.stringify(valueOf(register, 'op.exp.8', 'P-08')) === '["syslog | escritura | registros del sistema"]', valueOf(register, 'op.exp.8', 'P-08'));
  check('a multiselect row serves each of its uses', JSON.stringify(valueOf(register, 'mp.info.6', 'P-07')) === '["root"]' && JSON.stringify(valueOf(register, 'op.exp.4', 'P-02')) === '["ana | servidores Linux | parcheado"]');
  check('a use without rows leaves its parameter without value (no key, never null)', !('value' in param(register, 'op.exp.10', 'P-08')));

  const retention = setOrganizationValue(doc, 'retencion', ['cuentas, accesos | | 365', 'copias | | 30', 'registros | autenticación | 365']);
  check('a one-value parameter takes the first row of its use, as a number', valueOf(retention, 'op.acc.1', 'P-06') === 365 && valueOf(retention, 'op.acc.5', 'P-08') === 365 && valueOf(retention, 'mp.info.6', 'P-03') === 30);
  check('a table parameter reads its rows', JSON.stringify(valueOf(retention, 'op.exp.8', 'P-07')) === '["autenticación | 365"]');

  const soa = setOrganizationValue(doc, 'declaracion_aplicabilidad', [
    'op.acc.1 | sí | MEDIO | R1',
    'op.acc.5 | no | | | Sin usuarios externos | DA aprobada | https://intranet/da.pdf | 2026-09-01 | RSEG',
  ]);
  check('the SoA view of op.mon.2 has every measure, without the exclusion columns', JSON.stringify(valueOf(soa, 'op.mon.2', 'P-01')) === '["op.acc.1 | sí | MEDIO | R1","op.acc.5 | no"]', valueOf(soa, 'op.mon.2', 'P-01'));
  check('op.acc.5 P-DA reads its exclusion row', JSON.stringify(valueOf(soa, 'op.acc.5', 'P-DA')) === '["Sin usuarios externos | DA aprobada | https://intranet/da.pdf | 2026-09-01 | RSEG"]', valueOf(soa, 'op.acc.5', 'P-DA'));
  const applies = setOrganizationValue(soa, 'declaracion_aplicabilidad', ['op.acc.5 | sí | | | Sin usuarios externos | DA aprobada | https://intranet/da.pdf']);
  check('when the SoA says op.acc.5 applies, P-DA has no value', !('value' in param(applies, 'op.acc.5', 'P-DA')));

  const cleared = setOrganizationValue(withGroups, 'grupos_privilegiados', undefined);
  check('clearing an item removes the key from the block and from every parameter', !('grupos_privilegiados' in cleared.organizationData!.values) && ['op.acc.1 P-11', 'op.acc.2 P-12', 'op.acc.4 P-06'].every(key => !('value' in param(cleared, key.split(' ')[0], key.split(' ')[1]))));
  let refused = '';
  try {
    setOrganizationValue(doc, 'sistemas_alcance', ['x']);
  } catch (error) {
    refused = String(error);
  }
  check('the informative item cannot be set', /no es un dato de la organización/.test(refused));
}

console.log('4. Migration');
{
  const equal = base();
  set(equal, 'op.exp.4', 'P-06', ['srv-app01 | pre-app01 | informe 2026-05']);
  set(equal, 'op.exp.5', 'P-05', ['srv-app01 | pre-app01 | informe 2026-05']);
  const before = controlsJson(equal);
  const moved = normalizeOrganizationData(equal);
  check('equal values move to the item', JSON.stringify(moved.configuration.organizationData?.values.entorno_preproduccion) === '["srv-app01 | pre-app01 | informe 2026-05"]' && moved.moved.includes('entorno_preproduccion'));
  check('no parameter changes when moving', controlsJson(moved.configuration) === before);
  check('the input document is not modified', !('organizationData' in equal));
  const again = normalizeOrganizationData(moved.configuration);
  check('a second pass changes nothing (idempotent)', !again.changed && again.configuration === moved.configuration);

  const differ = base();
  set(differ, 'op.acc.1', 'P-11', ['sudo', 'wheel', 'admin']);
  set(differ, 'op.acc.2', 'P-12', ['sudo', 'wheel', 'admin']);
  set(differ, 'op.acc.4', 'P-06', ['root', 'sudo', 'adm', 'Administrators']);
  const conflict = normalizeOrganizationData(differ);
  const state = describeOrganizationItem(conflict.configuration, getOrganizationDataItem('grupos_privilegiados')!);
  check('different values are a conflict, not moved', conflict.conflicts.includes('grupos_privilegiados') && !('grupos_privilegiados' in conflict.configuration.organizationData!.values));
  check('nothing is overwritten while the conflict is open', controlsJson(conflict.configuration) === controlsJson(differ));
  check('one candidate per distinct value, saying which controls keep theirs', state.candidates.length === 2 &&
    JSON.stringify(state.candidates[0].keeps) === '["op.acc.1 P-11","op.acc.2 P-12"]' && JSON.stringify(state.candidates[1].keeps) === '["op.acc.4 P-06"]', state.candidates);
  const chosen = setOrganizationValue(conflict.configuration, 'grupos_privilegiados', state.candidates[0].value);
  check('choosing a value resolves the conflict and every parameter reads it', describeOrganizationItem(chosen, getOrganizationDataItem('grupos_privilegiados')!).status === 'value' &&
    JSON.stringify(valueOf(chosen, 'op.acc.4', 'P-06')) === '["sudo","wheel","admin"]');
  check('the rest of the document stays as it was', JSON.stringify(valueOf(chosen, 'op.acc.1', 'P-11')) === JSON.stringify(valueOf(differ, 'op.acc.1', 'P-11')));

  const half = base();
  set(half, 'op.exp.4', 'P-07', ['* | lvm | snapshot | 24']);
  const halfState = describeOrganizationItem(normalizeOrganizationData(half).configuration, getOrganizationDataItem('mecanismo_reversion')!);
  check('one configured and one empty is a conflict too (op.exp.5 would change)', halfState.status === 'conflict' && halfState.candidates.length === 1 && JSON.stringify(halfState.candidates[0].keeps) === '["op.exp.4 P-07"]', halfState);

  const people = base();
  set(people, 'op.exp.3', 'P-03', ['dioni', 'root']);
  set(people, 'mp.info.6', 'P-07', ['root']);
  set(people, 'op.exp.8', 'P-08', ['root | total | todos', 'syslog | escritura | registros del sistema']);
  set(people, 'op.acc.4', 'P-02', ['root | global']);
  const peopleBefore = controlsJson(people);
  const register = normalizeOrganizationData(people);
  const rows = register.configuration.organizationData!.values.personal_autorizado as string[];
  check('register views never conflict: each control keeps its rows', register.moved.includes('personal_autorizado') && controlsJson(register.configuration) === peopleBefore);
  check('identical rows of two uses become one row', rows.includes('root | configuracion, copias') && rows.includes('root | autorizaciones | global') && rows.includes('root | registros | todos | total'), rows);

  const soa = base();
  set(soa, 'op.mon.2', 'P-01', ['op.acc.1 | sí | MEDIO', 'op.acc.5 | sí | MEDIO']);
  set(soa, 'op.acc.5', 'P-DA', ['Sin usuarios externos | DA | https://intranet/da.pdf']);
  const soaState = describeOrganizationItem(soa, getOrganizationDataItem('declaracion_aplicabilidad')!);
  check('the SoA saying op.acc.5 applies and P-DA excluding it is a conflict', soaState.status === 'conflict' && soaState.candidates.length === 2, soaState);
  const keepMon = soaState.candidates.find(candidate => candidate.from === 'op.mon.2 P-01')!;
  const keepDa = soaState.candidates.find(candidate => candidate.from === 'op.acc.5 P-DA')!;
  check('choosing op.mon.2 keeps its rows and the exclusion text without applying it', JSON.stringify(keepMon.value) === '["op.acc.1 | sí | MEDIO","op.acc.5 | sí | MEDIO |  | Sin usuarios externos | DA | https://intranet/da.pdf"]', keepMon.value);
  check('choosing P-DA marks op.acc.5 as not applicable and keeps the other measures', JSON.stringify(keepDa.value) === '["op.acc.1 | sí | MEDIO","op.acc.5 | no | MEDIO |  | Sin usuarios externos | DA | https://intranet/da.pdf"]', keepDa.value);
  set(soa, 'op.mon.2', 'P-01', ['op.acc.1 | sí | MEDIO', 'op.acc.5 | no']);
  const consistent = normalizeOrganizationData(soa);
  check('a SoA consistent with P-DA moves without changing either', consistent.moved.includes('declaracion_aplicabilidad') && controlsJson(consistent.configuration) === controlsJson(soa));

  const retention = base();
  set(retention, 'op.acc.1', 'P-06', 365);
  set(retention, 'op.acc.5', 'P-08', 365);
  set(retention, 'mp.info.6', 'P-03', 30);
  const retained = normalizeOrganizationData(retention);
  check('equal one-value retentions share a row', JSON.stringify(retained.configuration.organizationData!.values.retencion) === '["cuentas, accesos |  | 365","copias |  | 30"]', retained.configuration.organizationData!.values.retencion);
  check('and stay numbers in their parameters', valueOf(retained.configuration, 'op.acc.1', 'P-06') === 365);

  const outside = clone(moved.configuration);
  set(outside, 'op.exp.5', 'P-05', ['srv-app02 | pre-app02']);
  const outsideState = describeOrganizationItem(outside, getOrganizationDataItem('entorno_preproduccion')!);
  check('a parameter changed outside this version is a conflict with the stored value as a choice', outsideState.status === 'conflict' &&
    outsideState.candidates[0].from === ORGANIZATION_SOURCE && outsideState.candidates.some(candidate => candidate.from === 'op.exp.5 P-05'), outsideState.candidates);
  check('and the save does not overwrite it', JSON.stringify(valueOf(normalizeOrganizationData(outside).configuration, 'op.exp.5', 'P-05')) === '["srv-app02 | pre-app02"]');
  const reseeded = clone(moved.configuration);
  set(reseeded, 'op.exp.5', 'P-05', undefined);
  check('a mapped parameter without value (a new seed) takes the stored value', JSON.stringify(valueOf(normalizeOrganizationData(reseeded).configuration, 'op.exp.5', 'P-05')) === '["srv-app01 | pre-app01 | informe 2026-05"]');

  check('the summary counts moves, writes and conflicts', /2 dato\(s\) unificado\(s\) .* 1 dato\(s\) con valores distintos/.test(summarizeOrganizationMigration({ moved: ['a', 'b'], written: [], conflicts: ['c'] })));
  const rowCells = (value: unknown) => sameParameterValue({ type: 'table' }, value as any, ['a | b']);
  check('«a | b» and «a | b | » are the same row; order does not matter', rowCells(['a | b | ']) && sameParameterValue({ type: 'list' }, ['x', 'y'], ['y', 'x']));
}

console.log('5. Compatibility');
{
  const doc = base();
  set(doc, 'op.acc.1', 'P-11', ['sudo']);
  set(doc, 'op.acc.2', 'P-12', ['sudo']);
  set(doc, 'op.acc.4', 'P-06', ['sudo']);
  const migrated = normalizeOrganizationData(doc).configuration;
  check('a 1.3.0 plugin loads the migrated document', validate130(clone(migrated)).valid, validate130(clone(migrated)).errors);
  check('and reads the value in each parameter', JSON.stringify(valueOf(migrated, 'op.acc.4', 'P-06')) === '["sudo"]');
  check('the default document is born migrated', JSON.stringify(defaultENSConfigurationTemplate.organizationData) === '{"values":{}}');

  const reset = buildClearedControlConfiguration(param(migrated, 'op.acc.1', 'P-11') && migrated.controls.find((control: any) => control.controlId === 'op.acc.1'), 'op.acc.1');
  check('resetting a control keeps its organisation data', JSON.stringify(reset.parameters.find(parameter => parameter.id === 'P-11')?.value) === '["sudo"]' &&
    !summarizeControlConfigurationReset(migrated.controls.find((control: any) => control.controlId === 'op.acc.1')!).parameterIds.includes('P-11'));

  const distribute = clone(migrated);
  set(distribute, 'op.exp.4', 'P-06', ['web01 | pre-web01']);
  set(distribute, 'op.exp.5', 'P-05', ['web01 | pre-web01']);
  const plan = planMigrationToSystems(normalizeOrganizationData(distribute).configuration, [{ id: '024', name: 'web01' }] as any);
  check('distributing rows to agents skips organisation data', !plan.moves.some(move => ['op.exp.4 P-06', 'op.exp.5 P-05'].includes(`${move.controlId} ${move.parameterId}`)), plan.moves);
}

console.log('6. Verdict parity');
{
  const engine = require('../common/ens/core/ens-engine');
  const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
  const { normalizeWazuhAlerts } = require('../common/ens/core/data-source/data-source-engine');
  const clock = new Date('2026-10-17T12:00:00Z');
  const alerts = readFileSync(`${__dirname}/fixtures/mp-info-6-pbs-pass.ndjson`, 'utf8').split('\n').filter(Boolean).map((line, index) => ({
    _id: `a${index}`,
    _source: { '@timestamp': '2026-10-17T09:00:00.000Z', timestamp: '2026-10-17T09:00:00.000Z', id: `${index}`, agent: { id: '024', name: 'wazuh-real' }, rule: { id: '100', groups: ['ENS'] }, data: JSON.parse(line) },
  }));
  const events = normalizeWazuhAlerts(alerts);
  const scope = [{ id: '000', name: 'manager' }, { id: '024', name: 'wazuh-real' }, { id: '028', name: 'zimbraHldap' }];
  const verdicts = (doc: any) => {
    ensConfigurationRepository.replaceActive(doc);
    const state = engine.getENSComplianceState(doc.global.ensLevel, events, undefined, scope, clock);
    const summary = (result: any) => [
      result.control.id,
      result.status,
      result.score,
      (result.requirements || []).map((requirement: any) => [requirement.requirementId || requirement.id, requirement.status]),
      (result.missingParameters || []).map((parameter: any) => parameter.id || parameter),
      (result.nonConformities || []).length,
    ];
    return JSON.stringify([state.results.map(summary), state.agents.map((agent: any) => [agent.agentId, agent.results.map(summary)])]);
  };
  const parity = (name: string, source: any) => {
    const original = verdicts(clone(source));
    const migrated = normalizeOrganizationData(clone(source));
    check(`${name}: no parameter changes`, controlsJson(migrated.configuration) === controlsJson(source));
    check(`${name}: same verdicts before and after the migration is saved`, verdicts(clone(migrated.configuration)) === original);
    return migrated;
  };
  const synthetic = base();
  set(synthetic, 'op.acc.1', 'P-11', ['sudo']);
  set(synthetic, 'op.acc.4', 'P-06', ['root']);
  set(synthetic, 'op.acc.1', 'P-06', 365);
  set(synthetic, 'mp.info.6', 'P-07', ['root']);
  set(synthetic, 'mp.info.6', 'P-03', 30);
  parity('synthetic document', synthetic);
  check('the comparison sees a configuration change (not vacuous)', verdicts(set(clone(synthetic), 'op.acc.1', 'P-06', undefined)) !== verdicts(clone(synthetic)));

  const path = process.env.ENSFACIL_LAB_DOC;
  if (path && existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const lab = raw._source ? raw._source.configuration : raw.configuration || raw;
    const migrated = parity('lab copy', lab);
    const states = describeOrganizationData(migrated.configuration);
    console.log(`    lab copy: moved ${migrated.moved.join(', ') || 'none'}; conflicts ${migrated.conflicts.join(', ') || 'none'}`);
    check('lab copy: the migrated document is valid', validateENSConfigurationStructure(clone(migrated.configuration)).valid);
    check('lab copy: every view of a moved item reproduces its parameter', states.filter(state => state.status === 'value').every(state =>
      state.views.filter(view => view.parameter).every(view => sameParameterValue(view.parameter!, organizationViewValue(state.item, view.view, view.parameter!, state.value), view.value))));
  } else {
    console.log('    (lab copy skipped: ENSFACIL_LAB_DOC not set)');
  }
}

console.log('7. Server');
(async () => {
  const docs = new Map<string, any>();
  const index = {
    indices: { exists: async () => ({ body: true }), create: async () => ({ body: {} }) },
    search: async (request: any) => {
      const ids = request.body?.query?.ids?.values;
      const type = request.body?.query?.term?.documentType;
      const hits = [...docs.entries()]
        .filter(([id, doc]) => (ids ? ids.includes(id) : doc.documentType === type))
        .map(([, doc]) => ({ _source: doc }))
        .sort((a, b) => String(b._source.createdAt || '').localeCompare(String(a._source.createdAt || '')))
        .slice(0, request.body?.size || 10);
      return { body: { hits: { hits } } };
    },
    bulk: async (request: any) => {
      const lines = String(request.body).split('\n').filter(Boolean).map(line => JSON.parse(line));
      for (let i = 0; i < lines.length; i += 2) docs.set((lines[i].create || lines[i].index)._id, lines[i + 1]);
      return { body: { errors: false } };
    },
  };
  const differ = base();
  set(differ, 'op.acc.1', 'P-11', ['sudo']);
  set(differ, 'op.acc.4', 'P-06', ['root']);
  docs.set('active', { documentType: 'ACTIVE_CONFIGURATION', configuration: differ, updatedAt: '2026-10-18T09:00:00.000Z', updatedBy: 'admin' });
  const user = { transport: { request: async () => ({ body: { user_name: 'rsis', roles: ['ensfacil_admin'] } }) } };
  const context = { core: { opensearch: { client: { asInternalUser: index, asCurrentUser: user } } } };
  const responses = { ok: (r: any) => ({ status: 200, body: r.body }), customError: (r: any) => ({ status: r.statusCode, body: r.body }) };
  const logger = { info: () => undefined, error: () => undefined, warn: () => undefined, debug: () => undefined };
  const handlers = createConfigurationHandlers({ logger: logger as any, securityEnabled: true });
  const chosen = setOrganizationValue(normalizeOrganizationData(differ).configuration, 'grupos_privilegiados', ['sudo']);
  const result: any = await handlers.save(context as any, { body: { configuration: chosen, changeReason: 'Datos de la organización: elegido.' } } as any, responses as any);
  const history = [...docs.values()].filter(doc => doc.documentType === 'CONFIGURATION_HISTORY');
  check('the server saves the chosen value', result.status === 200 && JSON.stringify(docs.get('active').configuration.organizationData.values.grupos_privilegiados) === '["sudo"]', result);
  check('and keeps the previous document, with each control value, in the history', history.some(doc => JSON.stringify(doc.configuration?.controls?.find((control: any) => control.controlId === 'op.acc.4')?.parameters.find((parameter: any) => parameter.id === 'P-06')?.value) === '["root"]'), history.length);
  const withoutKey: any = { ...chosen };
  delete withoutKey.organizationData;
  await handlers.save(context as any, { body: { configuration: withoutKey } } as any, responses as any);
  check('a body without the block keeps the stored one', JSON.stringify(docs.get('active').configuration.organizationData) === JSON.stringify(chosen.organizationData));
  const bad: any = await handlers.save(context as any, { body: { configuration: { ...chosen, organizationData: { values: { retencion: null } } } } } as any, responses as any);
  check('the server refuses a null item value, saying where', bad.status === 400 && /organizationData\.values\.retencion/.test(bad.body.message), bad);

  console.log('8. Browser');
  const stored = base();
  set(stored, 'op.exp.4', 'P-06', ['srv-app01 | pre-app01']);
  set(stored, 'op.exp.5', 'P-05', ['srv-app01 | pre-app01']);
  set(stored, 'op.acc.1', 'P-11', ['sudo']);
  set(stored, 'op.acc.4', 'P-06', ['root']);
  const saved: any[] = [];
  const http = {
    get: async () => ({ statusCode: 200, error: 0, data: { configuration: clone(stored), metadata: null } }),
    put: async (_path: string, options: any) => {
      const body = JSON.parse(options.body);
      saved.push(body);
      return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
    },
  };
  const client = require('../common/ens/configuration/services/configuration-http-client');
  client.setENSConfigurationHttp(() => http);
  const service = require('../common/ens/configuration/services/configuration-state-service');
  await service.hydrateENSConfiguration(true);
  const active = service.getActiveENSConfiguration();
  check('on load the equal values are already organisation data', JSON.stringify(active.organizationData?.values.entorno_preproduccion) === '["srv-app01 | pre-app01"]');
  check('nothing is written on load', saved.length === 0);
  check('the migration waits for the next save, with its conflicts', service.getPendingOrganizationMigration()?.moved.includes('entorno_preproduccion') && service.getPendingOrganizationMigration()?.conflicts.includes('grupos_privilegiados'));
  await service.updateActiveGlobalConfiguration({ ...active.global, ensLevel: 'ALTO' });
  check('the first save writes the block and says so in its reason', saved.length === 1 && 'organizationData' in saved[0].configuration &&
    /Configuración global ENS actualizada\. Datos de la organización: 1 dato\(s\) unificado\(s\)/.test(saved[0].changeReason || ''), saved[0]?.changeReason);
  check('the conflict stays open after saving: each control keeps its value', JSON.stringify(valueOf(saved[0].configuration, 'op.acc.4', 'P-06')) === '["root"]' && service.getPendingOrganizationMigration() === undefined);
  await service.saveActiveENSConfiguration(setOrganizationValue(service.getActiveENSConfiguration(), 'grupos_privilegiados', ['sudo']), 'Datos de la organización: elegido.');
  check('choosing writes the value into every mapped parameter', JSON.stringify(valueOf(saved[1].configuration, 'op.acc.4', 'P-06')) === '["sudo"]' &&
    JSON.stringify(valueOf(saved[1].configuration, 'op.acc.2', 'P-12')) === '["sudo"]');

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})();
