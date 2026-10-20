/** Level of the Traceability dimension (op.exp.8). */
import { ENSCatalog } from '../common/ens/catalog';
import { listControlDimensions, resolveControlLevel } from '../common/ens/core/control-level';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import type {
  ENSConfigurationVersion,
  ENSLevel,
} from '../common/ens/configuration/types';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

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

const NOW = new Date('2026-09-26T12:00:00Z');

const configuration = (
  global: Record<string, unknown>
): ENSConfigurationVersion => ({
  ...defaultENSConfigurationTemplate,
  global: {
    ...defaultENSConfigurationTemplate.global,
    clientName: 'Cliente de prueba',
    organization: 'Organización de prueba',
    scope: 'Laboratorio',
    ...global,
  } as ENSConfigurationVersion['global'],
});

const evaluate = (global: Record<string, unknown>, level: ENSLevel, events: ENSNormalizedEvent[] = []) => {
  ensConfigurationRepository.replaceActive(configuration(global));

  return getENSComplianceResults(level, events, undefined, undefined, NOW);
};

const fingerprint = (value: unknown): string =>
  JSON.stringify(value, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

const byControl = (results: ReturnType<typeof evaluate>) =>
  new Map(results.map(r => [r.control.id, r]));

const requirement = (
  results: ReturnType<typeof evaluate>,
  control: string,
  id: string
) =>
  byControl(results)
    .get(control)
    ?.requirements.find(r => r.id === id);

section('1. Level resolution per control');

const opExp8 = ENSCatalog.find(c => c.id === 'op.exp.8');
const followT = ENSCatalog.filter(c => listControlDimensions(c).includes('T')).map(c => c.id);

check('op.exp.8 declares it is governed by Traceability only', opExp8?.levelDimension === 'T');
check(
  'T is followed by op.exp.8 and op.acc.1 to op.acc.6, as the Annex II index says',
  followT.sort().join(',') === 'op.acc.1,op.acc.2,op.acc.3,op.acc.4,op.acc.5,op.acc.6,op.exp.8',
  followT.join(', ')
);
check(
  'without a T level, op.exp.8 uses the global one',
  resolveControlLevel({ levelDimension: 'T' }, 'ALTO', { ensLevel: 'ALTO' }) === 'ALTO'
);
check(
  'with a T level, op.exp.8 uses T',
  resolveControlLevel({ levelDimension: 'T' }, 'ALTO', { ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }) === 'BAJO'
);
check(
  'a control without a dimension ignores T',
  resolveControlLevel({}, 'MEDIO', { ensLevel: 'MEDIO', traceabilityLevel: 'ALTO' }) === 'MEDIO'
);

section('2. The engine: without T nothing changes; with T only the controls following T change');

for (const global of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
  const base = evaluate({ ensLevel: global }, global);

  const same = evaluate({ ensLevel: global, traceabilityLevel: global }, global);

  check(
    `${global} · T equal to the global gives the same result in all controls`,
    fingerprint(base) === fingerprint(same)
  );

  for (const t of (['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]).filter(l => l !== global)) {
    const withT = evaluate({ ensLevel: global, traceabilityLevel: t }, global);
    const antes = byControl(base);
    const after = byControl(withT);

    check(
      `${global} with T=${t} · op.exp.8 is evaluated with ${t}`,
      after.get('op.exp.8')?.level === t,
      after.get('op.exp.8')?.level
    );

    // With several dimensions the highest rules: the others are still at the global level.
    const expectedMulti = ['BAJO', 'MEDIO', 'ALTO'].indexOf(t) > ['BAJO', 'MEDIO', 'ALTO'].indexOf(global) ? t : global;
    const multi = followT.filter(id => id !== 'op.exp.8');

    check(
      `${global} with T=${t} · op.acc.1-6 are evaluated with the highest of T and the rest (${expectedMulti})`,
      multi.every(id => after.get(id)?.level === expectedMulti),
      multi.map(id => `${id}=${after.get(id)?.level}`).join(' ')
    );

    const changed = Array.from(antes.keys()).filter(
      id => !followT.includes(id) && fingerprint(antes.get(id)) !== fingerprint(after.get(id))
    );

    check(
      `${global} with T=${t} · no other control changes`,
      changed.length === 0,
      changed.join(', ')
    );
  }
}

const evidence = (
  results: ReturnType<typeof evaluate>,
  id: string
) =>
  byControl(results)
    .get('op.exp.8')
    ?.evidences.find(e => e.id === id)?.status;

const MANAGER_HEARTBEAT: ENSNormalizedEvent[] = [
  {
    id: 'latido-000',
    agentId: '000',
    agentName: 'Wazuh-4',
    controlId: 'op.exp.8',
    eventType: 'collector_run',
    sourceType: 'WAZUH_ALERT',
    timestamp: '2026-09-26T11:47:00Z',
    attributes: { resultado: 'completada', tipo_servidor: 'manager', evidencias_cubiertas: '' },
  },
];

const highWithLowT = evaluate({ ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }, 'ALTO', MANAGER_HEARTBEAT);
const lowWithHighT = evaluate({ ensLevel: 'BAJO', traceabilityLevel: 'ALTO' }, 'BAJO', MANAGER_HEARTBEAT);
const lowWithoutT = evaluate({ ensLevel: 'BAJO' }, 'BAJO', MANAGER_HEARTBEAT);

check(
  'category ALTA with T BAJA · EV-11 (R5) NO_APLICA',
  evidence(highWithLowT, 'EV-11') === 'NO_APLICA',
  evidence(highWithLowT, 'EV-11')
);
check(
  'category BÁSICA with T ALTA · EV-11 (R5) is required',
  evidence(lowWithHighT, 'EV-11') !== 'NO_APLICA',
  evidence(lowWithHighT, 'EV-11')
);
check(
  'and without T, at BÁSICA, it is not required (the previous behaviour)',
  evidence(lowWithoutT, 'EV-11') === 'NO_APLICA',
  evidence(lowWithoutT, 'EV-11')
);

if (opExp8?.status === 'ACTIVE') {
  check(
    'ACTIVE · category BÁSICA with T ALTA · op.exp.8.r5.2 is required',
    requirement(lowWithHighT, 'op.exp.8', 'op.exp.8.r5.2')?.status !== 'NO_APLICA'
  );
  check(
    'ACTIVE · category ALTA with T BAJA · op.exp.8.r5.2 NO_APLICA',
    requirement(highWithLowT, 'op.exp.8', 'op.exp.8.r5.2')?.status === 'NO_APLICA'
  );
}

section('3. The global configuration validator');

const valid = (global: Record<string, unknown>) =>
  validateENSConfigurationStructure(configuration(global));

const withoutT = configuration({});
delete (withoutT.global as { traceabilityLevel?: unknown }).traceabilityLevel;

check('the missing key is valid', validateENSConfigurationStructure(withoutT).valid, validateENSConfigurationStructure(withoutT).errors.join('; '));
check('a level is valid', valid({ traceabilityLevel: 'ALTO' }).valid);
check('null is NOT valid', !valid({ traceabilityLevel: null }).valid);
check('an empty string is NOT valid', !valid({ traceabilityLevel: '' }).valid);
check('a value outside BAJO/MEDIO/ALTO is NOT valid', !valid({ traceabilityLevel: 'MEDIA' }).valid);

ensConfigurationRepository.reset();

if (failures.length) {
  console.log(`\n${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('\nALL OK');
