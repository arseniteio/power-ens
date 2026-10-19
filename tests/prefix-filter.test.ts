/** Prefix filter of the Evidences and Reports tabs. */
import {
  compareENSIds,
  ensFamilyOf,
  filterByENSPrefix,
  isENSSectionOpenByDefault,
  listENSFamilies,
  normalizeENSPrefixQuery,
  resolveENSSectionOpenState,
  splitENSId,
} from '../public/ens/control-filter/prefix';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail: string = ''
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

interface ControlFixture {
  controlId: string;
  requirementIds: string[];
}

const CATALOG: ControlFixture[] = [
  {
    controlId: 'mp.info.6',
    requirementIds: [
      'mp.info.6.1',
      'mp.info.6.2.a',
      'mp.info.6.2.b',
      'mp.info.6.2.c',
      'mp.info.6.2.d',
      'mp.info.6.r1.1',
      'mp.info.6.r2.1',
    ],
  },
  {
    controlId: 'op.acc.1',
    requirementIds: [
      'op.acc.1.1',
      'op.acc.1.2',
      'op.acc.1.3',
      'op.acc.1.4',
      'op.acc.1.5',
      'op.acc.1.r1.1',
      'op.acc.1.r1.2',
      'op.acc.1.r1.3',
    ],
  },
  {
    controlId: 'op.acc.2',
    requirementIds: [
      'op.acc.2.1',
      'op.acc.2.2',
      'op.acc.2.3',
      'op.acc.2.r1.1',
      'op.acc.2.r1.2',
    ],
  },
  { controlId: 'op.acc.3', requirementIds: ['op.acc.3.1', 'op.acc.3.2'] },
  { controlId: 'op.acc.4', requirementIds: ['op.acc.4.1'] },
  { controlId: 'op.exp.1', requirementIds: ['op.exp.1.1'] },
  { controlId: 'op.exp.2', requirementIds: ['op.exp.2.1'] },
  { controlId: 'op.exp.10', requirementIds: ['op.exp.10.1'] },
  { controlId: 'op.exp.11', requirementIds: ['op.exp.11.1'] },
];

const CATALOG_TODAY: ControlFixture[] = CATALOG.slice(0, 3);

const identifiersOf = (control: ControlFixture): string[] => [
  control.controlId,
  ...control.requirementIds,
];

const filters = (
  catalog: ControlFixture[],
  query: string
): { pasan: string[]; fuera: string[]; total: number; activo: boolean } => {
  const result = filterByENSPrefix(catalog, query, identifiersOf);

  return {
    pasan: result.matched.map(control => control.controlId),
    fuera: result.hidden.map(control => control.controlId),
    total: result.total,
    activo: result.isActive,
  };
};

const equal = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

section('1. No filter');

{
  const withoutFilter = filters(CATALOG, '');

  check(
    'no filter · the filter is not recorded as active',
    withoutFilter.activo === false
  );

  check(
    'no filter · the nine controls pass',
    withoutFilter.pasan.length === CATALOG.length,
    `pasan ${withoutFilter.pasan.length} de ${CATALOG.length}`
  );

  check(
    'no filter · nothing is hidden',
    withoutFilter.fuera.length === 0,
    `ocultos: ${withoutFilter.fuera.join(', ')}`
  );

  check(
    'no filter · the total is the whole catalog',
    withoutFilter.total === CATALOG.length
  );

  const spacesOnly = filters(CATALOG, '   ');

  check(
    'no filter · a whitespace-only query is no filter',
    spacesOnly.activo === false && spacesOnly.fuera.length === 0
  );
}

section('2. A family prefix leaves the whole family');

{
  const familia = filters(CATALOG, 'op.acc');

  check(
    'family · «op.acc» leaves the four op.acc and no other',
    equal(familia.pasan, ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4']),
    `pasan: ${familia.pasan.join(', ')}`
  );

  check(
    'family · the filter is recorded as active',
    familia.activo === true
  );

  check(
    'family · mp.info.6 stays OUT, not vanished',
    familia.fuera.includes('mp.info.6'),
    `ocultos: ${familia.fuera.join(', ')}`
  );

  check(
    'family · what passes plus what is hidden is the total',
    familia.pasan.length + familia.fuera.length === familia.total &&
      familia.total === CATALOG.length
  );

  const familiaHoy = filters(CATALOG_TODAY, 'op.acc');

  check(
    'family · with today\'s three controls it leaves op.acc.1 and op.acc.2',
    equal(familiaHoy.pasan, ['op.acc.1', 'op.acc.2']),
    `pasan: ${familiaHoy.pasan.join(', ')}`
  );
}

section('3. A control prefix leaves ONLY that control');

{
  const unControl = filters(CATALOG, 'op.acc.1');

  check(
    'control · «op.acc.1» leaves only op.acc.1',
    equal(unControl.pasan, ['op.acc.1']),
    `pasan: ${unControl.pasan.join(', ')}`
  );

  const twoDigits = filters(CATALOG, 'op.exp.1');

  check(
    'control · «op.exp.1» NO arrastra a op.exp.10 ni a op.exp.11',
    equal(twoDigits.pasan, ['op.exp.1']),
    `pasan: ${twoDigits.pasan.join(', ')}`
  );

  check(
    'control · and op.exp.10 and op.exp.11 are recorded as hidden',
    twoDigits.fuera.includes('op.exp.10') &&
      twoDigits.fuera.includes('op.exp.11')
  );

  const exactEleven = filters(CATALOG, 'op.exp.11');

  check(
    'control · «op.exp.11» leaves only op.exp.11',
    equal(exactEleven.pasan, ['op.exp.11']),
    `pasan: ${exactEleven.pasan.join(', ')}`
  );

  const bare = filterByENSPrefix(
    CATALOG.map(control => control.controlId),
    'op.exp.1',
    id => [id]
  );

  check(
    'control · over loose identifiers, «op.exp.1» is still just one',
    equal(bare.matched, ['op.exp.1']),
    `pasan: ${bare.matched.join(', ')}`
  );

  check(
    'control · and the other eight are recorded as hidden',
    bare.hidden.length === CATALOG.length - 1,
    `ocultos: ${bare.hidden.length}`
  );
}

section('4. A half segment still finds');

{
  const typing = filters(CATALOG, 'op.a');

  check(
    'typing · «op.a» finds the op.acc family',
    equal(typing.pasan, ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4']),
    `pasan: ${typing.pasan.join(', ')}`
  );

  const puntoFinal = filters(CATALOG, 'op.acc.');

  check(
    'typing · «op.acc.» (loose trailing dot) is the whole family',
    equal(puntoFinal.pasan, ['op.acc.1', 'op.acc.2', 'op.acc.3', 'op.acc.4']),
    `pasan: ${puntoFinal.pasan.join(', ')}`
  );

  const shortPartial = filters(CATALOG, 'mp.i');

  check(
    'typing · «mp.i» finds mp.info.6 through the partial fallback',
    equal(shortPartial.pasan, ['mp.info.6']),
    `pasan: ${shortPartial.pasan.join(', ')}`
  );
}

section('5. A requirement prefix finds its control');

{
  const requirement = filters(CATALOG, 'op.acc.1.2');

  check(
    'requirement · «op.acc.1.2» finds the control that declares it',
    equal(requirement.pasan, ['op.acc.1']),
    `pasan: ${requirement.pasan.join(', ')}`
  );

  const requirementBlock = filters(CATALOG, 'mp.info.6.2');

  check(
    'requirement · «mp.info.6.2» finds mp.info.6 through mp.info.6.2.a…d',
    equal(requirementBlock.pasan, ['mp.info.6']),
    `pasan: ${requirementBlock.pasan.join(', ')}`
  );

  const reinforcement = filters(CATALOG, 'op.acc.1.r1.3');

  check(
    'requirement · a reinforcement (op.acc.1.r1.3) also finds its control',
    equal(reinforcement.pasan, ['op.acc.1']),
    `pasan: ${reinforcement.pasan.join(', ')}`
  );

  const tooDeep = filters(CATALOG, 'op.acc.1.2.3.4.5');

  check(
    'requirement · a prefix longer than any identifier does not match',
    tooDeep.pasan.length === 0,
    `pasan: ${tooDeep.pasan.join(', ')}`
  );

  let breaksTheFilter = false;
  let passWithExtraSegment: string[] = [];

  try {
    passWithExtraSegment = filters(CATALOG, 'op.acc.1.2.3').pasan;
  } catch {
    breaksTheFilter = true;
  }

  check(
    'requirement · an extra segment over a real requirement neither matches nor blows up',
    !breaksTheFilter && passWithExtraSegment.length === 0,
    breaksTheFilter
      ? 'el filtro ha lanzado una excepción'
      : `pasan: ${passWithExtraSegment.join(', ')}`
  );
}

section('6. Case and spaces');

{
  const raw = filters(CATALOG, '  OP.ACC.1  ');

  check(
    'normalization · «  OP.ACC.1  » is «op.acc.1»',
    equal(raw.pasan, ['op.acc.1']),
    `pasan: ${raw.pasan.join(', ')}`
  );

  check(
    'normalization · the query is published already normalized',
    normalizeENSPrefixQuery('  OP.ACC  ') === 'op.acc'
  );

  check(
    'normalization · an identifier is split in lower case',
    equal(splitENSId('OP.ACC.1'), ['op', 'acc', '1'])
  );
}

section('7. When nothing matches');

{
  const nothing = filters(CATALOG, 'zz.yy');

  check(
    'zero · no control passes',
    nothing.pasan.length === 0,
    `pasan: ${nothing.pasan.join(', ')}`
  );

  check(
    'zero · ALL controls are recorded as hidden by the filter',
    nothing.fuera.length === CATALOG.length,
    `ocultos: ${nothing.fuera.length} de ${CATALOG.length}`
  );

  check(
    'zero · the total is still the catalog\'s, to be able to say «0 de 9»',
    nothing.total === CATALOG.length
  );

  const puntosDeMas = filters(CATALOG, 'op..acc');

  check(
    'zero · an extra dot is not corrected by itself nor invents matches',
    puntosDeMas.pasan.length === 0,
    `pasan: ${puntosDeMas.pasan.join(', ')}`
  );
}

section('8. Families and order');

{
  const familias = listENSFamilies(
    CATALOG.map(control => control.controlId)
  );

  check(
    'families · three families, without repeats and in order',
    equal(familias, ['mp.info', 'op.acc', 'op.exp']),
    `familias: ${familias.join(', ')}`
  );

  check(
    'families · nine controls give three families: the buttons do not overflow',
    familias.length < CATALOG.length
  );

  check(
    'familias · la familia de op.acc.1 es op.acc',
    ensFamilyOf('op.acc.1') === 'op.acc'
  );

  check(
    'families · a single-segment identifier is already its family',
    ensFamilyOf('org') === 'org'
  );

  const sorted = [
    'op.exp.10',
    'op.acc.2',
    'op.exp.2',
    'mp.info.6',
    'op.exp.11',
    'op.acc.1',
  ].sort(compareENSIds);

  check(
    'order · op.exp.2 goes before op.exp.10 (numbers as numbers)',
    equal(sorted, [
      'mp.info.6',
      'op.acc.1',
      'op.acc.2',
      'op.exp.2',
      'op.exp.10',
      'op.exp.11',
    ]),
    `orden: ${sorted.join(', ')}`
  );

  const withReinforcement = ['mp.info.6.r1.1', 'mp.info.6.2.a', 'mp.info.6.1'].sort(
    compareENSIds
  );

  check(
    'order · the numeric requirement goes before the r1 reinforcement',
    equal(withReinforcement, [
      'mp.info.6.1',
      'mp.info.6.2.a',
      'mp.info.6.r1.1',
    ]),
    `orden: ${withReinforcement.join(', ')}`
  );

  check(
    'order · the shorter goes before the one that extends it',
    compareENSIds('op.acc.1', 'op.acc.1.2') < 0
  );
}

section('9. What is hidden is countable');

{
  interface WithFindings extends ControlFixture {
    incumplen: number;
    sinMedir: number;
  }

  const withFindings: WithFindings[] = [
    { ...CATALOG[0], incumplen: 2, sinMedir: 1 },
    { ...CATALOG[1], incumplen: 0, sinMedir: 4 },
    { ...CATALOG[2], incumplen: 1, sinMedir: 0 },
  ];

  const result = filterByENSPrefix(
    withFindings,
    'op.acc.1',
    identifiersOf
  );

  const hiddenBreaches = result.hidden.reduce(
    (total, control) => total + control.incumplen,
    0
  );

  const hiddenUnmeasured = result.hidden.reduce(
    (total, control) => total + control.sinMedir,
    0
  );

  check(
    'hidden · the filter leaves out 3 proven breaches',
    hiddenBreaches === 3,
    `incumplimientos ocultos: ${hiddenBreaches}`
  );

  check(
    'hidden · and 1 pending measurement, counted APART',
    hiddenUnmeasured === 1,
    `sin medir ocultos: ${hiddenUnmeasured}`
  );

  check(
    'hidden · the two counts are not added into one',
    hiddenBreaches !== hiddenUnmeasured
  );
}

section('10. Section expansion');

{
  const untouched: Record<string, boolean | undefined> = {};

  check(
    'expansion · a single result opens by itself',
    isENSSectionOpenByDefault(1) === true
  );

  check(
    'expansion · with two results the sections stay closed',
    isENSSectionOpenByDefault(2) === false
  );

  check(
    'expansion · without filter and with the nine controls, all closed',
    isENSSectionOpenByDefault(CATALOG.length) === false
  );

  check(
    'expansion · without results there is nothing to open',
    isENSSectionOpenByDefault(0) === false
  );

  const single = filters(CATALOG, 'op.acc.1');

  check(
    'expansion · filtering down to one control leaves it open without touching anything',
    resolveENSSectionOpenState(untouched, 'op.acc.1', single.pasan.length) ===
      true
  );

  const familia = filters(CATALOG, 'op.acc');

  check(
    'expansion · filtering by family leaves the four closed',
    resolveENSSectionOpenState(untouched, 'op.acc.1', familia.pasan.length) ===
      false
  );

  check(
    'expansion · closing by hand wins over the single result\'s auto-open',
    resolveENSSectionOpenState(
      { 'op.acc.1': false },
      'op.acc.1',
      single.pasan.length
    ) === false
  );

  check(
    'expansion · opening by hand wins over the closed default',
    resolveENSSectionOpenState(
      { 'op.acc.1': true },
      'op.acc.1',
      familia.pasan.length
    ) === true
  );

  check(
    'expansion · touching a section does not change the others\' state',
    resolveENSSectionOpenState(
      { 'op.acc.1': true },
      'op.acc.2',
      familia.pasan.length
    ) === false
  );
}

console.log('');

if (failures.length > 0) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  · ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
