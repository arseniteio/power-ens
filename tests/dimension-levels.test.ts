/** Applicability by the five ENS dimensions (C, I, T, A, D): each axis, the maximum rule, absent keys, validation and verdict parity. */
import { existsSync, readFileSync } from 'fs';
import { ENSCatalog, getPlannedMeasurement } from '../common/ens/catalog';
import type { ENSControlDefinition, ENSLevelDimension } from '../common/ens/catalog/types';
import {
  ENS_DIMENSION_LEVEL_KEYS,
  ENS_DIMENSIONS,
  describeControlAxis,
  describeDimensionsAboveENSLevel,
  findDimensionsAboveENSLevel,
  listControlDimensions,
  resolveControlLevel,
} from '../common/ens/core/control-level';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { validateENSConfigurationStructure as validate130 } from './fixtures/configuration-structure-validator-1.3.0';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSConfigurationVersion, ENSLevel } from '../common/ens/configuration/types';

declare const process: { exit(code: number): void; env: Record<string, string | undefined> };
declare const require: (id: string) => any;
declare const __dirname: string;

{
  const Module = require('module');
  const load = Module._load;

  Module._load = function (request: string, ...rest: unknown[]) {
    if (/kibana-services$/.test(request)) {
      return {};
    }

    return load.call(this, request, ...rest);
  };
}

const { getENSComplianceResults } = require('../common/ens/core/ens-engine') as typeof import('../common/ens/core/ens-engine');
const { setServices } = require('../public/services') as typeof import('../public/services');
const { updateActiveGlobalConfiguration } = require('../common/ens/configuration/services/configuration-state-service') as typeof import('../common/ens/configuration/services/configuration-state-service');

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);
    return;
  }
  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const LEVELS: ENSLevel[] = ['BAJO', 'MEDIO', 'ALTO'];
const labPath = process.env.POWER_ENS_LAB_DOC;

section('1. Each axis: a single-dimension control follows its own key and no other');

for (const dimension of ENS_DIMENSIONS) {
  const key = ENS_DIMENSION_LEVEL_KEYS[dimension];
  const others = ENS_DIMENSIONS.filter(d => d !== dimension);

  check(
    `${dimension}: declared, the control uses ${key}`,
    resolveControlLevel({ levelDimension: dimension }, 'ALTO', { ensLevel: 'ALTO', [key]: 'BAJO' }) === 'BAJO'
  );
  check(
    `${dimension}: absent, the control uses the given level`,
    resolveControlLevel({ levelDimension: dimension }, 'MEDIO', { ensLevel: 'MEDIO' }) === 'MEDIO'
  );
  check(
    `${dimension}: the other four keys do not move it`,
    resolveControlLevel(
      { levelDimension: dimension },
      'MEDIO',
      Object.fromEntries([['ensLevel', 'MEDIO'], ...others.map(d => [ENS_DIMENSION_LEVEL_KEYS[d], 'BAJO'])])
    ) === 'MEDIO'
  );
  check(
    `${dimension}: a control by category ignores it`,
    resolveControlLevel({}, 'MEDIO', { ensLevel: 'MEDIO', [key]: 'BAJO' }) === 'MEDIO'
  );
}

check('an invalid stored value falls back to the given level', resolveControlLevel({ levelDimension: 'C' }, 'MEDIO', { confidentialityLevel: 'ALTA' as ENSLevel }) === 'MEDIO');

section('2. The maximum rule');

const CITA: ENSLevelDimension[] = ['C', 'I', 'T', 'A'];

check('C·I·T·A all BAJO under MEDIO · BAJO', resolveControlLevel({ levelDimension: CITA }, 'MEDIO', { ensLevel: 'MEDIO', confidentialityLevel: 'BAJO', integrityLevel: 'BAJO', traceabilityLevel: 'BAJO', authenticityLevel: 'BAJO' }) === 'BAJO');
check('C·I·T·A with A MEDIO, rest BAJO · MEDIO', resolveControlLevel({ levelDimension: CITA }, 'ALTO', { ensLevel: 'ALTO', confidentialityLevel: 'BAJO', integrityLevel: 'BAJO', traceabilityLevel: 'BAJO', authenticityLevel: 'MEDIO' }) === 'MEDIO');
check('C·I·T·A with only C declared BAJO · the absent ones are the ENS level (ALTO)', resolveControlLevel({ levelDimension: CITA }, 'ALTO', { ensLevel: 'ALTO', confidentialityLevel: 'BAJO' }) === 'ALTO');
check('T·A with T ALTO and A BAJO · ALTO', resolveControlLevel({ levelDimension: ['T', 'A'] }, 'ALTO', { ensLevel: 'ALTO', traceabilityLevel: 'ALTO', authenticityLevel: 'BAJO' }) === 'ALTO');
check('T·A ignores D', resolveControlLevel({ levelDimension: ['T', 'A'] }, 'ALTO', { ensLevel: 'ALTO', traceabilityLevel: 'BAJO', authenticityLevel: 'BAJO', availabilityLevel: 'ALTO' }) === 'BAJO');
check('a one-item list is the same as the single dimension', resolveControlLevel({ levelDimension: ['D'] }, 'ALTO', { availabilityLevel: 'MEDIO' }) === resolveControlLevel({ levelDimension: 'D' }, 'ALTO', { availabilityLevel: 'MEDIO' }));
check('an empty list behaves as by category', resolveControlLevel({ levelDimension: [] }, 'MEDIO', { confidentialityLevel: 'BAJO' }) === 'MEDIO');

section('3. The catalog follows the axis of the auditor\'s index');

const EXPECTED_AXIS: Record<string, string> = {
  'mp.info.6': 'D',
  'op.acc.1': 'T,A',
  'op.acc.2': 'C,I,T,A',
  'op.acc.3': 'C,I,T,A',
  'op.acc.4': 'C,I,T,A',
  'op.acc.5': 'C,I,T,A',
  'op.acc.6': 'C,I,T,A',
  'op.exp.8': 'T',
  'op.cont.2': 'D',
  'op.cont.3': 'D',
  // The controls of the v2.0 package that entered documentary (DRAFT) in 1.4.0.
  'mp.eq.2': 'A',
  'mp.eq.4': 'C',
  'mp.com.3': 'I,A',
  'mp.s.4': 'D',
};

for (const control of ENSCatalog) {
  check(
    `${control.id}: ${EXPECTED_AXIS[control.id] ? `nivel ${EXPECTED_AXIS[control.id]}` : 'categoría'}`,
    listControlDimensions(control).join(',') === (EXPECTED_AXIS[control.id] || ''),
    listControlDimensions(control).join(',')
  );
}

check('the axis text for a category control', describeControlAxis({}) === 'Se aplica por la categoría del sistema');
check('the axis text for one dimension', describeControlAxis({ levelDimension: 'D' }) === 'Se aplica por el nivel de Disponibilidad (D)');
check('the axis text for several', describeControlAxis({ levelDimension: CITA }) === 'Se aplica por el nivel más alto de C·I·T·A');

section('4. With no dimension declared nothing changes: every control at the ENS level');

for (const level of LEVELS) {
  const moved = ENSCatalog.filter(control => resolveControlLevel(control, level, { ensLevel: level }) !== level);
  check(`${level}: all ${ENSCatalog.length} controls at ${level}`, moved.length === 0, moved.map(c => c.id).join(', '));
}

section('5. Validation');

const configuration = (global: Record<string, unknown>): ENSConfigurationVersion => ({
  ...defaultENSConfigurationTemplate,
  global: {
    ...defaultENSConfigurationTemplate.global,
    clientName: 'Cliente de prueba',
    organization: 'Organización de prueba',
    scope: 'Laboratorio',
    ...global,
  } as ENSConfigurationVersion['global'],
});

for (const dimension of ['C', 'I', 'A'] as ENSLevelDimension[]) {
  const key = ENS_DIMENSION_LEVEL_KEYS[dimension];

  check(`${key}: absent is valid`, validateENSConfigurationStructure(configuration({})).valid);
  check(`${key}: a level is valid`, validateENSConfigurationStructure(configuration({ ensLevel: 'ALTO', [key]: 'MEDIO' })).valid);
  check(`${key}: null is NOT valid`, !validateENSConfigurationStructure(configuration({ [key]: null })).valid);
  check(`${key}: an empty string is NOT valid`, !validateENSConfigurationStructure(configuration({ [key]: '' })).valid);
  check(
    `${key}: a wrong value is named in the error`,
    validateENSConfigurationStructure(configuration({ [key]: 'MEDIA' })).errors.includes(`configuration.global.${key} is invalid.`)
  );
}

const allFive = configuration({ ensLevel: 'ALTO', confidentialityLevel: 'MEDIO', integrityLevel: 'BAJO', traceabilityLevel: 'ALTO', authenticityLevel: 'MEDIO', availabilityLevel: 'BAJO' });

check('the five keys at once are valid', validateENSConfigurationStructure(allFive).valid, validateENSConfigurationStructure(allFive).errors);
check('a 1.3.0 plugin still loads a document with the five keys', validate130(allFive).valid, validate130(allFive).errors);
check('coherent levels: no dimension above the ENS level', findDimensionsAboveENSLevel(allFive.global).length === 0);
check(
  'a dimension above the ENS level is found',
  findDimensionsAboveENSLevel({ ensLevel: 'MEDIO', authenticityLevel: 'ALTO', availabilityLevel: 'MEDIO' }).join(',') === 'A'
);
check(
  'and described in Spanish for the screen',
  /no puede ser inferior.*Autenticidad \(A\) ALTO/.test(describeDimensionsAboveENSLevel({ ensLevel: 'MEDIO', authenticityLevel: 'ALTO' }) || ''),
  describeDimensionsAboveENSLevel({ ensLevel: 'MEDIO', authenticityLevel: 'ALTO' })
);
check('an incoherent level does NOT stop the environment loading (it is not structural)', validateENSConfigurationStructure(configuration({ ensLevel: 'BAJO', availabilityLevel: 'ALTO' })).valid);

section('6. Verdict parity: the new axes change nothing while no dimension is declared');

const LAB_AGENT = { id: '024', name: 'srv-pbs01' };
const RULE: Record<string, string> = { backup_run: '106601', backup_schedule: '106602', backup_retention: '106603', backup_access: '106604', backup_storage: '106605', restore_test: '106606', collector_run: '106797' };

const labLines = ['mp-info-6-pbs-pass.ndjson', 'mp-info-6-zimbra-pass.ndjson'].flatMap(file =>
  String(readFileSync(`${__dirname}/fixtures/${file}`, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as Record<string, unknown>)
);
const labEvents = normalizeWazuhAlerts(
  labLines.map((line, index) => ({
    _id: `lab-${index}`,
    _source: {
      '@timestamp': line.ts,
      agent: LAB_AGENT,
      rule: { id: RULE[String(line.event)] || '106600', description: 'mp.info.6' },
      location: '/var/log/power-ens/mp_info_6.json',
      data: Object.fromEntries(Object.entries(line).map(([k, v]) => [k, String(v)])),
    },
  }))
);
const labNow = new Date(Math.max(...labLines.map(line => Date.parse(String(line.ts)))) + 10 * 60 * 1000);

const fingerprint = (value: unknown): string =>
  JSON.stringify(value, (key, v) => (key === 'evaluatedAt' ? undefined : v));

const withoutAxes = (run: () => unknown): unknown => {
  const saved = ENSCatalog.map(control => [control, control.levelDimension] as [ENSControlDefinition, ENSControlDefinition['levelDimension']]);
  try {
    ENSCatalog.forEach(control => delete control.levelDimension);
    return run();
  } finally {
    saved.forEach(([control, axis]) => {
      if (axis !== undefined) control.levelDimension = axis;
    });
  }
};

const parity = (name: string, document: ENSConfigurationVersion) => {
  for (const level of LEVELS) {
    const doc = { ...document, global: { ...document.global, ensLevel: level } };
    ENS_DIMENSIONS.forEach(d => delete (doc.global as Record<string, unknown>)[ENS_DIMENSION_LEVEL_KEYS[d]]);
    ensConfigurationRepository.replaceActive(doc);
    const evaluate = () => [
      getENSComplianceResults(level, labEvents, undefined, undefined, labNow),
      getENSComplianceResults(level, labEvents, LAB_AGENT.id, [{ id: LAB_AGENT.id, name: LAB_AGENT.name }] as any, labNow),
    ];
    const withAxes = fingerprint(evaluate());
    const byCategory = fingerprint(withoutAxes(evaluate));

    check(`${name} · ${level}: identical results with and without the catalog axes`, withAxes === byCategory);

    const equalKeys = { ...doc, global: { ...doc.global, ...Object.fromEntries(ENS_DIMENSIONS.map(d => [ENS_DIMENSION_LEVEL_KEYS[d], level])) } };
    ensConfigurationRepository.replaceActive(equalKeys as ENSConfigurationVersion);
    check(`${name} · ${level}: the five keys equal to the ENS level give the same results`, fingerprint(evaluate()) === withAxes);
  }
};

parity('default document with the lab passes', configuration({}));

if (labPath && existsSync(labPath)) {
  const raw = JSON.parse(readFileSync(labPath, 'utf8'));
  const lab = raw._source ? raw._source.configuration : raw.configuration || raw;
  parity(`lab copy (${lab.controls.length} controls)`, lab);
} else {
  console.log('    (lab copy skipped: POWER_ENS_LAB_DOC not set)');
}

section('6b. Upgrade from 1.3.0: a document keeping its own dimension keys changes exactly the controls the index ties to them');

// 1.3.0 axes: only op.exp.8 followed T and only op.cont.2/3 followed D.
const AXES_130: Record<string, ENSControlDefinition['levelDimension']> = { 'op.exp.8': 'T', 'op.cont.2': 'D', 'op.cont.3': 'D' };

const withAxes130 = (run: () => any): any => {
  const saved = ENSCatalog.map(control => [control, control.levelDimension] as [ENSControlDefinition, ENSControlDefinition['levelDimension']]);
  try {
    ENSCatalog.forEach(control => {
      if (AXES_130[control.id]) control.levelDimension = AXES_130[control.id];
      else delete control.levelDimension;
    });
    return run();
  } finally {
    saved.forEach(([control, axis]) => {
      if (axis === undefined) delete control.levelDimension;
      else control.levelDimension = axis;
    });
  }
};

const upgradeChanges = (document: ENSConfigurationVersion) => {
  ensConfigurationRepository.replaceActive(document);
  const level = document.global.ensLevel;
  const run = () => new Map(getENSComplianceResults(level, labEvents, undefined, undefined, labNow).map(r => [r.control.id, r]));
  const now = run();
  const before = withAxes130(run);
  // Only the controls 1.3.0 had: the ones that entered in 1.4.0 have no 1.3.0 axis to compare with.
  return ENSCatalog.map(control => control.id)
    .filter(id => !getPlannedMeasurement(id))
    .filter(id => fingerprint(now.get(id)) !== fingerprint(before.get(id)))
    .map(id => `${id}: ${before.get(id)?.level} → ${now.get(id)?.level} (${listControlDimensions(getCatalog(id)).join('·')})`);
};

const getCatalog = (id: string) => ENSCatalog.find(control => control.id === id) as ENSControlDefinition;

const UPGRADE_CASES: [string, Record<string, unknown>, string[]][] = [
  ['MEDIO with D ALTO (1.3.0 guides allowed it): D now also governs mp.info.6', { ensLevel: 'MEDIO', availabilityLevel: 'ALTO' }, ['mp.info.6: MEDIO → ALTO (D)']],
  ['MEDIO with T ALTO: T now also governs op.acc.1-6 (the highest of their dimensions)', { ensLevel: 'MEDIO', traceabilityLevel: 'ALTO' },
    ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4', 'op.acc.5', 'op.acc.6'].map(id => `${id}: MEDIO → ALTO (${id === 'op.acc.1' ? 'T·A' : 'C·I·T·A'})`)],
  ['ALTO with D MEDIO (coherent): mp.info.6 drops to MEDIO', { ensLevel: 'ALTO', availabilityLevel: 'MEDIO' }, ['mp.info.6: ALTO → MEDIO (D)']],
  ['ALTO with T BAJO: op.acc.* stay ALTO (A and the rest are still the ENS level); op.exp.8 already followed T', { ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }, []],
  ['no dimension declared: nothing changes', { ensLevel: 'MEDIO' }, []],
];

for (const [name, global, expected] of UPGRADE_CASES) {
  const changes = upgradeChanges(configuration(global));
  console.log(`    ${name}: ${changes.length ? changes.join('; ') : 'no change'}`);
  check(name, JSON.stringify(changes) === JSON.stringify(expected), changes);
}

if (labPath && existsSync(labPath)) {
  const raw = JSON.parse(readFileSync(labPath, 'utf8'));
  const lab = raw._source ? raw._source.configuration : raw.configuration || raw;
  const declared = ENS_DIMENSIONS.filter(d => ENS_DIMENSION_LEVEL_KEYS[d] in lab.global);
  const changes = upgradeChanges(lab);
  console.log(`    lab copy keeps its keys (${declared.join(', ') || 'none declared'}): ${changes.length ? changes.join('; ') : 'no change'}`);
  check('lab copy with its own keys: only controls whose new axis includes a declared key change', changes.every(line => declared.some(d => line.includes(`(${d}`) || line.includes(`·${d}`))), changes);
}

section('7. The axes do move the level once a dimension is declared');
{
  ensConfigurationRepository.replaceActive(configuration({ ensLevel: 'ALTO', confidentialityLevel: 'BAJO', integrityLevel: 'BAJO', traceabilityLevel: 'BAJO', authenticityLevel: 'BAJO', availabilityLevel: 'BAJO' }));
  const results = new Map(getENSComplianceResults('ALTO', labEvents, undefined, undefined, labNow).map(r => [r.control.id, r]));
  check('ALTO with every dimension BAJO · op.acc.3 (MEDIO and ALTO only) NO_APLICA', results.get('op.acc.3')?.status === 'NO_APLICA', results.get('op.acc.3')?.status);
  check('ALTO with D BAJO · mp.info.6 evaluated at BAJO (R1 and R2 out)', results.get('mp.info.6')?.level === 'BAJO', results.get('mp.info.6')?.level);
  check('ALTO with every dimension BAJO · op.exp.1 (by category) stays ALTO', results.get('op.exp.1')?.level === 'ALTO', results.get('op.exp.1')?.level);
}

(async () => {
  section('8. Saving: empty keys removed, incoherent levels refused');

  const sent: any[] = [];

  setServices(
    {
      http: {
        put: async (_path: string, options: { body: string }) => {
          const body = JSON.parse(options.body);
          sent.push(body.configuration);
          return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
        },
      },
    } as any,
    {} as any
  );

  ensConfigurationRepository.replaceActive(configuration({ ensLevel: 'ALTO', confidentialityLevel: 'MEDIO', integrityLevel: 'MEDIO', authenticityLevel: 'MEDIO' }));

  const ofPanel = { ...configuration({ ensLevel: 'ALTO', integrityLevel: 'BAJO' }).global };
  await updateActiveGlobalConfiguration(ofPanel);

  check('C and A removed in the panel are not revived from the active document', sent.length === 1 && !('confidentialityLevel' in sent[0].global) && !('authenticityLevel' in sent[0].global), JSON.stringify(sent[0]?.global));
  check('I declared is saved', sent[0]?.global?.integrityLevel === 'BAJO');

  let refused = '';
  try {
    await updateActiveGlobalConfiguration({ ...ofPanel, ensLevel: 'MEDIO', confidentialityLevel: 'ALTO' });
  } catch (error) {
    refused = String((error as Error).message);
  }
  check('a dimension above the ENS level is refused before sending', sent.length === 1 && /Confidencialidad \(C\) ALTO/.test(refused), refused);

  ensConfigurationRepository.reset();

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.log(`  FAIL exception: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
