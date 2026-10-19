/** Level of the Availability dimension (op.cont.2 and op.cont.3). */
import { ENSCatalog } from '../common/ens/catalog';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import { listControlDimensions, resolveControlLevel } from '../common/ens/core/control-level';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
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
const { setServices } = require('../public/services') as typeof import('../public/services');
const { updateActiveGlobalConfiguration } = require('../common/ens/configuration/services/configuration-state-service') as typeof import('../common/ens/configuration/services/configuration-state-service');

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

const NOW = new Date('2026-10-09T12:00:00Z');

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

const evaluate = (global: Record<string, unknown>, level: ENSLevel) => {
  ensConfigurationRepository.replaceActive(configuration(global));

  return getENSComplianceResults(level, [], undefined, undefined, NOW);
};

const fingerprint = (value: unknown): string =>
  JSON.stringify(value, (clave, v) => (clave === 'evaluatedAt' ? undefined : v));

const byControl = (results: ReturnType<typeof evaluate>) =>
  new Map(results.map(r => [r.control.id, r]));

section('1. Level resolution per control');

check(
  'without a D level, a D control uses the global one',
  resolveControlLevel({ levelDimension: 'D' }, 'ALTO', { ensLevel: 'ALTO' }) === 'ALTO'
);
check(
  'with a D level, a D control uses D',
  resolveControlLevel({ levelDimension: 'D' }, 'ALTO', { ensLevel: 'ALTO', availabilityLevel: 'MEDIO' }) === 'MEDIO'
);
check(
  'a control without a dimension ignores D',
  resolveControlLevel({}, 'MEDIO', { ensLevel: 'MEDIO', availabilityLevel: 'ALTO' }) === 'MEDIO'
);
check(
  'a T control ignores D',
  resolveControlLevel({ levelDimension: 'T' }, 'MEDIO', { ensLevel: 'MEDIO', availabilityLevel: 'ALTO' }) === 'MEDIO'
);
check(
  'and a D control ignores T',
  resolveControlLevel({ levelDimension: 'D' }, 'MEDIO', { ensLevel: 'MEDIO', traceabilityLevel: 'ALTO' }) === 'MEDIO'
);

const declareD = ENSCatalog.filter(c => listControlDimensions(c).includes('D'));

check(
  'only mp.info.6, op.cont.2 and op.cont.3 follow Availability (Annex II index)',
  declareD.map(c => c.id).sort().join(',') === 'mp.info.6,op.cont.2,op.cont.3',
  declareD.map(c => c.id).join(', ')
);

section('2. The engine: without D nothing changes; with D only D controls change');

const FALLBACK = 'op.acc.3';
const fallback = ENSCatalog.find(c => c.id === FALLBACK) as ENSControlDefinition;
const dimensionOriginal = fallback.levelDimension;

check(
  `the fallback ${FALLBACK} applies only in MEDIO and ALTO, as a D control applies only in ALTO`,
  fallback.levels.join(',') === 'MEDIO,ALTO',
  fallback.levels.join(',')
);

try {
  fallback.levelDimension = 'D';

  const ofD = new Set([FALLBACK, ...declareD.map(c => c.id)]);

  for (const global of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
    const base = evaluate({ ensLevel: global }, global);
    const same = evaluate({ ensLevel: global, availabilityLevel: global }, global);

    check(
      `${global} · D equal to the global gives the same result in all controls`,
      fingerprint(base) === fingerprint(same)
    );

    for (const d of (['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]).filter(l => l !== global)) {
      const antes = byControl(base);
      const after = byControl(evaluate({ ensLevel: global, availabilityLevel: d }, global));

      check(
        `${global} with D=${d} · the D control is evaluated with ${d}`,
        Array.from(ofD).every(id => after.get(id)?.level === d),
        Array.from(ofD).map(id => `${id}=${after.get(id)?.level}`).join(' ')
      );

      const changed = Array.from(antes.keys()).filter(
        id => !ofD.has(id) && fingerprint(antes.get(id)) !== fingerprint(after.get(id))
      );

      check(
        `${global} with D=${d} · no other control changes (op.exp.8 included)`,
        changed.length === 0,
        changed.join(', ')
      );
    }
  }

  const estado = (global: Record<string, unknown>, level: ENSLevel) =>
    byControl(evaluate(global, level)).get(FALLBACK)?.status;

  check(
    'category ALTA with D BAJA · the D control NO_APLICA',
    estado({ ensLevel: 'ALTO', availabilityLevel: 'BAJO' }, 'ALTO') === 'NO_APLICA',
    estado({ ensLevel: 'ALTO', availabilityLevel: 'BAJO' }, 'ALTO')
  );
  check(
    'reversal · category ALTA without D is required (the previous behaviour)',
    estado({ ensLevel: 'ALTO' }, 'ALTO') !== 'NO_APLICA',
    estado({ ensLevel: 'ALTO' }, 'ALTO')
  );
  check(
    'category BÁSICA with D ALTA · the D control is required',
    estado({ ensLevel: 'BAJO', availabilityLevel: 'ALTO' }, 'BAJO') !== 'NO_APLICA',
    estado({ ensLevel: 'BAJO', availabilityLevel: 'ALTO' }, 'BAJO')
  );
  check(
    'and declaring T does not move it: category ALTA with T BAJA is still required',
    estado({ ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }, 'ALTO') !== 'NO_APLICA',
    estado({ ensLevel: 'ALTO', traceabilityLevel: 'BAJO' }, 'ALTO')
  );
} finally {
  if (dimensionOriginal === undefined) {
    delete fallback.levelDimension;
  } else {
    fallback.levelDimension = dimensionOriginal;
  }
}

check(
  'the fallback stays as it was',
  fallback.levelDimension === dimensionOriginal,
  String(fallback.levelDimension)
);

section('3. The global configuration validator');

const valid = (global: Record<string, unknown>) =>
  validateENSConfigurationStructure(configuration(global));

const withoutD = configuration({});
delete (withoutD.global as { availabilityLevel?: unknown }).availabilityLevel;

check('the missing key is valid', validateENSConfigurationStructure(withoutD).valid, validateENSConfigurationStructure(withoutD).errors.join('; '));
check('a level is valid', valid({ availabilityLevel: 'ALTO' }).valid);
check('with T and D at once, valid', valid({ traceabilityLevel: 'MEDIO', availabilityLevel: 'ALTO' }).valid);
check('null is NOT valid', !valid({ availabilityLevel: null }).valid);
check('an empty string is NOT valid', !valid({ availabilityLevel: '' }).valid);
check(
  'a value outside BAJO/MEDIO/ALTO is NOT valid, and the error names it',
  valid({ availabilityLevel: 'ALTA' }).errors.includes('configuration.global.availabilityLevel is invalid.'),
  valid({ availabilityLevel: 'ALTA' }).errors.join('; ')
);

(async () => {
  section('4. Saving the global configuration without D removes the key');

  const sent: any[] = [];

  setServices(
    {
      http: {
        put: async (_ruta: string, options: { body: string }) => {
          const body = JSON.parse(options.body);

          sent.push(body.configuration);

          return { statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: null } };
        },
      },
    } as any,
    {} as any
  );

  ensConfigurationRepository.replaceActive(
    configuration({ ensLevel: 'ALTO', traceabilityLevel: 'MEDIO', availabilityLevel: 'MEDIO' })
  );

  const ofPanel = { ...configuration({ ensLevel: 'ALTO', traceabilityLevel: 'MEDIO' }).global };
  delete (ofPanel as { availabilityLevel?: unknown }).availabilityLevel;

  await updateActiveGlobalConfiguration(ofPanel);

  check(
    'the sent configuration does NOT carry availabilityLevel (it is not revived from the active one)',
    sent.length === 1 && !('availabilityLevel' in sent[0].global),
    JSON.stringify(sent[0]?.global)
  );
  check(
    'and keeps the declared Traceability level',
    sent[0]?.global?.traceabilityLevel === 'MEDIO',
    sent[0]?.global?.traceabilityLevel
  );

  await updateActiveGlobalConfiguration({ ...ofPanel, availabilityLevel: 'BAJO' });

  check(
    'reversal · declared, it is saved',
    sent[1]?.global?.availabilityLevel === 'BAJO',
    JSON.stringify(sent[1]?.global)
  );

  ensConfigurationRepository.reset();

  if (failures.length) {
    console.log(`\n${failures.length} check(s) FAIL:`);
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  }

  console.log('\nALL OK');
})().catch(error => {
  console.log(`  FAIL exception: ${error && error.stack ? error.stack : error}`);
  process.exit(1);
});
