/** The eleven controls of the auditor v2.0 package without collector: catalog integrity against the auditor's index. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { ENSCatalog } from '../common/ens/catalog';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import { getPolicyDefinition } from '../common/ens/core/policy-runtime/policies';
import { getENSControlConfiguration } from '../common/ens/configuration/registry';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { validateENSConfigurationStructure } from '../common/ens/configuration/services/configuration-structure-validator';
import { ENSControlsInAnnexOrder } from '../public/ens/controls-in-order';

declare const process: { exit(code: number): void };
declare const __dirname: string;

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const B = 'BAJO';
const M = 'MEDIO';
const A = 'ALTO';

// From «Índice de controles» of ENSFacil_00_Indice_y_Metodologia.xlsx (v2.0, 15/10/2026): section, axis and the
// requirement levels its BAJO/BÁSICA, MEDIO/MEDIA and ALTO/ALTA columns give. A reinforcement «defined but required at
// no level» has no level. Brackets are a choice: every option keeps the levels where it can be chosen.
const INDEX: Record<string, { section: string; axis?: string | string[]; requirements: Record<string, string[]> }> = {
  'mp.eq.2': { section: '5.3.2', axis: 'A', requirements: { 'mp.eq.2.1': [M, A], 'mp.eq.2.r1.1': [A] } },
  'mp.eq.3': {
    section: '5.3.3',
    requirements: {
      'mp.eq.3.1': [B, M, A], 'mp.eq.3.2': [B, M, A], 'mp.eq.3.3': [B, M, A], 'mp.eq.3.4': [B, M, A],
      'mp.eq.3.r1.1': [A], 'mp.eq.3.r2.1': [A],
    },
  },
  'mp.eq.4': {
    section: '5.3.4',
    axis: 'C',
    requirements: { 'mp.eq.4.1': [B, M, A], 'mp.eq.4.2': [B, M, A], 'mp.eq.4.r1.1': [M, A], 'mp.eq.4.r2.1': [] },
  },
  'mp.com.1': { section: '5.4.1', requirements: { 'mp.com.1.1': [B, M, A], 'mp.com.1.2': [B, M, A] } },
  'mp.com.3': {
    section: '5.4.3',
    axis: ['I', 'A'],
    requirements: {
      'mp.com.3.1': [B, M, A], 'mp.com.3.2': [B, M, A], 'mp.com.3.3': [B, M, A],
      'mp.com.3.r1.1': [M, A], 'mp.com.3.r2.1': [M, A], 'mp.com.3.r3.1': [A], 'mp.com.3.r4.1': [A], 'mp.com.3.r5.1': [],
    },
  },
  'mp.com.4': {
    section: '5.4.4',
    requirements: {
      'mp.com.4.1': [M, A], 'mp.com.4.2': [M, A],
      'mp.com.4.r1.1': [M], 'mp.com.4.r1.2': [M], 'mp.com.4.r2.1': [M, A], 'mp.com.4.r3.1': [M, A],
      'mp.com.4.r4.1': [A], 'mp.com.4.r4.2': [A],
    },
  },
  'mp.sw.2': { section: '5.6.2', requirements: { 'mp.sw.2.1': [B, M, A], 'mp.sw.2.r1.1': [M, A], 'mp.sw.2.r2.1': [] } },
  'mp.s.1': {
    section: '5.8.1',
    requirements: {
      'mp.s.1.1': [B, M, A], 'mp.s.1.2': [B, M, A], 'mp.s.1.3': [B, M, A], 'mp.s.1.4': [B, M, A],
      'mp.s.1.5': [B, M, A], 'mp.s.1.6': [B, M, A], 'mp.s.1.7': [B, M, A],
    },
  },
  'mp.s.2': {
    section: '5.8.2',
    requirements: {
      'mp.s.2.1': [B, M, A], 'mp.s.2.2': [B, M, A], 'mp.s.2.3': [B, M, A],
      'mp.s.2.r1.1': [B, M], 'mp.s.2.r1.2': [B, M],
      'mp.s.2.r2.1': [B, M, A], 'mp.s.2.r2.2': [B, M, A], 'mp.s.2.r2.3': [B, M, A], 'mp.s.2.r3.1': [A],
    },
  },
  'mp.s.3': {
    section: '5.8.3',
    requirements: {
      'mp.s.3.1': [B, M, A], 'mp.s.3.2': [B, M, A], 'mp.s.3.3': [B, M, A], 'mp.s.3.4': [B, M, A],
      'mp.s.3.5': [B, M, A], 'mp.s.3.6': [B, M, A], 'mp.s.3.7': [B, M, A],
      'mp.s.3.r1.1': [A], 'mp.s.3.r1.2': [A], 'mp.s.3.r1.3': [A], 'mp.s.3.r2.1': [],
    },
  },
  'mp.s.4': {
    section: '5.8.4',
    axis: 'D',
    requirements: { 'mp.s.4.1': [M, A], 'mp.s.4.2': [M, A], 'mp.s.4.r1.1': [A], 'mp.s.4.r1.2': [A], 'mp.s.4.r2.1': [] },
  },
};

// Template counts (auditor v2.0 analysis §5: 88 parameters and 106 evidences), plus P-ATT where a required
// requirement has no technical evidence.
const COUNTS: Record<string, { parameters: number; evidences: number }> = {
  'mp.eq.2': { parameters: 5, evidences: 6 },
  'mp.eq.3': { parameters: 8, evidences: 8 },
  'mp.eq.4': { parameters: 9, evidences: 8 },
  'mp.com.1': { parameters: 6, evidences: 8 },
  'mp.com.3': { parameters: 9, evidences: 11 },
  'mp.com.4': { parameters: 7, evidences: 10 },
  'mp.sw.2': { parameters: 8, evidences: 10 },
  'mp.s.1': { parameters: 10, evidences: 10 },
  'mp.s.2': { parameters: 10, evidences: 13 },
  'mp.s.3': { parameters: 11, evidences: 12 },
  'mp.s.4': { parameters: 8, evidences: 10 },
};

// The ruleType decided by hand for each requirement (decisions of 19/10/2026; a wrong one compiles and is silent).
const RULE_TYPES: Record<string, string> = {
  'mp.eq.2.1': 'MAX_AGE', 'mp.eq.2.r1.1': 'MAX_AGE',
  'mp.eq.3.1': 'MAX_AGE', 'mp.eq.3.2': 'COVERAGE_REQUIRED', 'mp.eq.3.3': 'WHITELIST', 'mp.eq.3.4': 'PATH_MATCH',
  'mp.eq.3.r1.1': 'CONDITIONAL_REQUIRED', 'mp.eq.3.r2.1': 'COVERAGE_REQUIRED',
  'mp.eq.4.1': 'WHITELIST', 'mp.eq.4.2': 'COVERAGE_REQUIRED', 'mp.eq.4.r1.1': 'COVERAGE_REQUIRED', 'mp.eq.4.r2.1': 'COVERAGE_REQUIRED',
  'mp.com.1.1': 'WHITELIST', 'mp.com.1.2': 'WHITELIST',
  'mp.com.3.1': 'COVERAGE_REQUIRED', 'mp.com.3.2': 'CONDITIONAL_REQUIRED', 'mp.com.3.3': 'WHITELIST',
  'mp.com.3.r1.1': 'CONDITIONAL_REQUIRED', 'mp.com.3.r2.1': 'WHITELIST', 'mp.com.3.r3.1': 'COVERAGE_REQUIRED',
  'mp.com.3.r4.1': 'MAX_AGE', 'mp.com.3.r5.1': 'COVERAGE_REQUIRED',
  'mp.com.4.1': 'WHITELIST', 'mp.com.4.2': 'CONDITIONAL_REQUIRED', 'mp.com.4.r1.1': 'CONDITIONAL_REQUIRED',
  'mp.com.4.r1.2': 'CONDITIONAL_REQUIRED', 'mp.com.4.r2.1': 'CONDITIONAL_REQUIRED', 'mp.com.4.r3.1': 'CONDITIONAL_REQUIRED',
  'mp.com.4.r4.1': 'WHITELIST', 'mp.com.4.r4.2': 'COVERAGE_REQUIRED',
  'mp.sw.2.1': 'CONDITIONAL_REQUIRED', 'mp.sw.2.r1.1': 'CONDITIONAL_REQUIRED', 'mp.sw.2.r2.1': 'COVERAGE_REQUIRED',
  'mp.s.1.1': 'COVERAGE_REQUIRED', 'mp.s.1.2': 'COVERAGE_REQUIRED', 'mp.s.1.3': 'COVERAGE_REQUIRED', 'mp.s.1.4': 'COVERAGE_REQUIRED',
  'mp.s.1.5': 'WHITELIST', 'mp.s.1.6': 'COVERAGE_REQUIRED', 'mp.s.1.7': 'MAX_AGE',
  'mp.s.2.1': 'COVERAGE_REQUIRED', 'mp.s.2.2': 'COVERAGE_REQUIRED', 'mp.s.2.3': 'COVERAGE_REQUIRED',
  'mp.s.2.r1.1': 'CONDITIONAL_REQUIRED', 'mp.s.2.r1.2': 'CONDITIONAL_REQUIRED', 'mp.s.2.r2.1': 'CONDITIONAL_REQUIRED',
  'mp.s.2.r2.2': 'CONDITIONAL_REQUIRED', 'mp.s.2.r2.3': 'CONDITIONAL_REQUIRED', 'mp.s.2.r3.1': 'COVERAGE_REQUIRED',
  'mp.s.3.1': 'COVERAGE_REQUIRED', 'mp.s.3.2': 'MAX_AGE', 'mp.s.3.3': 'MAX_AGE', 'mp.s.3.4': 'WHITELIST',
  'mp.s.3.5': 'WHITELIST', 'mp.s.3.6': 'COVERAGE_REQUIRED', 'mp.s.3.7': 'COVERAGE_REQUIRED',
  'mp.s.3.r1.1': 'MIN_RETENTION', 'mp.s.3.r1.2': 'WHITELIST', 'mp.s.3.r1.3': 'WHITELIST', 'mp.s.3.r2.1': 'WHITELIST',
  'mp.s.4.1': 'COVERAGE_REQUIRED', 'mp.s.4.2': 'TOOL_MATCH', 'mp.s.4.r1.1': 'COVERAGE_REQUIRED',
  'mp.s.4.r1.2': 'CONDITIONAL_REQUIRED', 'mp.s.4.r2.1': 'COVERAGE_REQUIRED',
};

const IDS = Object.keys(INDEX);
const catalogOf = (id: string): ENSControlDefinition => ENSCatalog.find(control => control.id === id)!;

section('1. In the catalog, DRAFT, with section, source and axis from the index');

{
  check('the eleven are in the catalog', IDS.every(id => Boolean(catalogOf(id))), IDS.filter(id => !catalogOf(id)));
  check('all DRAFT (no collector yet)', IDS.every(id => catalogOf(id)?.status === 'DRAFT'));
  check(
    'Annex II section of the index',
    IDS.every(id => catalogOf(id).annexSection === INDEX[id].section),
    IDS.filter(id => catalogOf(id).annexSection !== INDEX[id].section)
  );
  check(
    'source: the template v2.0 of 15/10/2026',
    IDS.every(id => {
      const source = catalogOf(id).source;

      return source?.template === `ENSFacil_Plantilla_${id}` && source.version === '2.0' && source.date === '2026-10-15';
    })
  );
  check(
    'axis: the dimension level where the index says so (mp.eq.2 A, mp.eq.4 C, mp.com.3 I·A, mp.s.4 D), the category otherwise',
    IDS.every(id => JSON.stringify(catalogOf(id).levelDimension) === JSON.stringify(INDEX[id].axis)),
    IDS.map(id => `${id}=${JSON.stringify(catalogOf(id).levelDimension)}`).join(' ')
  );
  check('family «Medidas de protección»', IDS.every(id => catalogOf(id).family === 'Medidas de protección'));
}

section('2. Requirement levels as the index columns, and the control levels their union');

{
  const wrong: string[] = [];

  IDS.forEach(id => {
    const expected = INDEX[id].requirements;
    const actual = Object.fromEntries(catalogOf(id).requirements.map(r => [r.id, r.applicability.levels]));

    if (Object.keys(actual).sort().join() !== Object.keys(expected).sort().join()) {
      wrong.push(`${id}: requirements ${Object.keys(actual).join(',')}`);
    }

    Object.entries(expected).forEach(([requirement, levels]) => {
      if ((actual[requirement] || []).join() !== levels.join()) {
        wrong.push(`${requirement}=${(actual[requirement] || []).join('|')} (index ${levels.join('|') || 'none'})`);
      }
    });

    const union = [B, M, A].filter(level => Object.values(expected).some(levels => levels.includes(level)));

    if (catalogOf(id).levels.join() !== union.join()) {
      wrong.push(`${id} levels ${catalogOf(id).levels.join('|')}`);
    }
  });

  check('every requirement at the index levels', wrong.length === 0, wrong);
  check(
    'the policy declares the same levels',
    IDS.every(id =>
      getPolicyDefinition(id)!.requirements.every(
        r => r.levels.join() === (INDEX[id].requirements[r.requirementId] || ['?']).join()
      )
    )
  );
}

section('3. ruleType checked by hand, requirement by requirement');

{
  const actual = Object.fromEntries(
    IDS.flatMap(id => getPolicyDefinition(id)!.requirements.map(r => [r.requirementId, r.ruleType]))
  );
  const wrong = Object.keys({ ...RULE_TYPES, ...actual }).filter(id => RULE_TYPES[id] !== actual[id]);

  check(`the ${Object.keys(RULE_TYPES).length} requirements carry the decided ruleType`, wrong.length === 0, wrong.map(id => `${id}=${actual[id]}`));
  check('no policy has an evaluator yet (nothing judges without collector)', IDS.every(id => !getPolicyDefinition(id)!.evaluator));
}

section('4. Evidences and parameters of the templates; nothing accredits a rule');

{
  const counts = IDS.map(id => ({
    id,
    parameters: getENSControlConfiguration(id)!.parameters.length,
    evidences: ENSEvidenceCatalog.filter(e => e.controlId === id).length,
  }));

  check(
    'the template counts (P-ATT added where a required requirement has no technical evidence)',
    counts.every(c => c.parameters === COUNTS[c.id].parameters && c.evidences === COUNTS[c.id].evidences),
    counts.filter(c => c.parameters !== COUNTS[c.id].parameters || c.evidences !== COUNTS[c.id].evidences)
  );

  const evidences = ENSEvidenceCatalog.filter(e => IDS.includes(e.controlId));

  check('106 evidences, as the analysis counts', evidences.length === 106, evidences.length);
  check('none accredits a rule', evidences.every(e => e.relatedRules.length === 0));
  check('each listens only to evidence_state', evidences.every(e => e.expectedEventTypes.join() === 'evidence_state'));

  const dangling = IDS.flatMap(id =>
    catalogOf(id).requirements.flatMap(r =>
      r.evidenceIds.filter(e => !evidences.some(ev => ev.controlId === id && ev.id === e)).map(e => `${r.id} ${e}`)
    )
  );

  check('every evidence a requirement names exists', dangling.length === 0, dangling);

  const documentary = IDS.flatMap(id =>
    catalogOf(id)
      .requirements.filter(r => r.applicability.levels.length > 0 && r.evidenceIds.length === 0)
      .map(r => r.id)
  );

  check(
    'the required requirements without technical evidence are mp.eq.4.r1.1, mp.com.3.r3.1 and mp.s.1.6',
    documentary.sort().join() === 'mp.com.3.r3.1,mp.eq.4.r1.1,mp.s.1.6',
    documentary
  );
  check(
    'their controls declare P-ATT, never required',
    ['mp.eq.4', 'mp.com.3', 'mp.s.1'].every(id => {
      const att = getENSControlConfiguration(id)!.parameters.find(p => p.id === 'P-ATT');

      return Boolean(att && !att.required);
    })
  );

  const choice = (id: string, parameter: string) =>
    (getENSControlConfiguration(id)!.parameters.find(p => p.id === parameter) as any)?.options?.join();

  check('the reinforcement choices are selects, as op.acc.5 P-01: mp.com.4 P-03 R1-R3, mp.s.2 P-07 R1-R2', choice('mp.com.4', 'P-03') === 'R1,R2,R3' && choice('mp.s.2', 'P-07') === 'R1,R2');

  const optional = ['mp.eq.4 P-08', 'mp.sw.2 P-08', 'mp.s.3 P-11', 'mp.s.4 P-08', 'mp.eq.2 P-04', 'mp.com.4 P-04'];

  check(
    'optional reinforcements, exception lists and the wireless segment (only if there is wireless) are not required',
    optional.every(entry => {
      const [id, parameter] = entry.split(' ');

      return getENSControlConfiguration(id)!.parameters.find(p => p.id === parameter)?.required === false;
    })
  );
}

section('5. Configuration blocks: the TypeScript parameters, valid for the plugin');

{
  const blocks = IDS.map(id => ({
    id,
    text: readFileSync(join(__dirname, '..', 'config', `${id.replace(/\./g, '-')}-control-block.json`), 'utf8'),
  }));

  check(
    'each block is the configuration of the registry, byte for byte',
    blocks.every(b => b.text === `${JSON.stringify(getENSControlConfiguration(b.id), null, 2)}\n`),
    blocks.filter(b => b.text !== `${JSON.stringify(getENSControlConfiguration(b.id), null, 2)}\n`).map(b => b.id)
  );
  check('no invented rule identifier in any block', blocks.every(b => !/ENS-MP/.test(b.text)));

  const seeded = {
    ...defaultENSConfigurationTemplate,
    controls: defaultENSConfigurationTemplate.controls.map(control =>
      IDS.includes(control.controlId) ? JSON.parse(blocks.find(b => b.id === control.controlId)!.text) : control
    ),
  };
  const validation = validateENSConfigurationStructure(seeded);

  check('the document with the seeded blocks loads', validation.valid, validation.errors.slice(0, 5));
}

section('6. Annex II order: the mp.* land in their place');

{
  const mp = ENSControlsInAnnexOrder.map(control => control.id).filter(id => id.startsWith('mp.'));

  check(
    'Controls view: mp.eq, mp.com, mp.sw, mp.info and mp.s by section',
    mp.join() === 'mp.eq.2,mp.eq.3,mp.eq.4,mp.com.1,mp.com.3,mp.com.4,mp.sw.2,mp.info.6,mp.s.1,mp.s.2,mp.s.3,mp.s.4',
    mp
  );
  check(
    'and the op.* (section 4) before the mp.* (section 5)',
    ENSControlsInAnnexOrder.findIndex(c => c.id.startsWith('mp.')) === ENSControlsInAnnexOrder.filter(c => c.id.startsWith('op.')).length
  );
}

console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
