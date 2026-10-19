/** A control with `status: 'DRAFT'` does not enter the index. */
import { ENSCatalog } from '../common/ens/catalog';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import type {
  ENSControlDefinition,
  ENSRequirementDefinition,
} from '../common/ens/catalog/types';
import type { ENSLevel } from '../common/ens/configuration/types';
import { evaluateRequirements } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;

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

const control = (controlId: string): ENSControlDefinition => {
  const found = ENSCatalog.find(item => item.id === controlId);

  if (!found) {
    throw new Error(`broken fixture: ${controlId} is not in the catalog`);
  }

  return found;
};

const evaluate = (
  requirements: ENSRequirementDefinition[],
  level: ENSLevel,
  estado: ENSControlDefinition['status']
) =>
  evaluateControlStatus(
    evaluateRequirements(requirements, level, [], true, [], estado)
  );

const LEVELS: ENSLevel[] = ['BAJO', 'MEDIO', 'ALTO'];

section('1. Each control\'s state is consistent with what it can measure');

{
  for (const c of ENSCatalog) {
    const controlId = c.id;

    check(
      `${controlId} · declares a valid state`,
      c.status === 'ACTIVE' || c.status === 'DRAFT',
      c.status
    );

    const accreditsRules = c.requirements.some(
      requirement => requirement.evidenceIds.length > 0
    );

    if (c.status === 'DRAFT') {
      check(
        `${controlId} · in DRAFT it does not accredit evidences yet`,
        !accreditsRules,
        'está en DRAFT y sus requisitos ya declaran evidencias'
      );
    } else {
      check(
        `${controlId} · ACTIVE and with evidences to prove itself with`,
        accreditsRules,
        'está ACTIVE y ningún requisito declara evidencia'
      );
    }
  }
}

section('2. In draft: NO_APLICA and no score, at the three levels');

{
  for (const controlId of ['op.acc.3', 'op.acc.4']) {
    for (const level of LEVELS) {
      const result = evaluate(
        control(controlId).requirements,
        level,
        'DRAFT'
      );

      check(
        `${controlId} at ${level} · NO_APLICA`,
        result.status === 'NO_APLICA',
        result.status
      );

      check(
        `${controlId} at ${level} · no score`,
        result.score === undefined,
        String(result.score)
      );

      check(
        `${controlId} at ${level} · no applicable requirement`,
        result.applicableRequirements === 0,
        String(result.applicableRequirements)
      );
    }
  }
}

section('3. THE REVERSAL — the same control in ACTIVE does fail');

{
  const active = evaluate(
    control('op.acc.4').requirements,
    'BAJO',
    'ACTIVE'
  );

  check(
    'op.acc.4 at BAJO and ACTIVE · NO_CUMPLE (what is not proven does not comply)',
    active.status === 'NO_CUMPLE',
    active.status
  );

  check(
    'op.acc.4 at BAJO and ACTIVE · it does have applicable requirements',
    active.applicableRequirements === 5,
    String(active.applicableRequirements)
  );

  check(
    'op.acc.4 at BAJO and ACTIVE · with score 0, which does subtract',
    active.score === 0,
    String(active.score)
  );

  const threeActive = evaluate(
    control('op.acc.3').requirements,
    'MEDIO',
    'ACTIVE'
  );

  check(
    'op.acc.3 at MEDIO and ACTIVE · NO_CUMPLE',
    threeActive.status === 'NO_CUMPLE',
    threeActive.status
  );
}

section('4. op.acc.3 does not apply at BAJO even when active');

{
  const atBajo = evaluate(
    control('op.acc.3').requirements,
    'BAJO',
    'ACTIVE'
  );

  check(
    'op.acc.3 at BAJO · NO_APLICA even though the control is active',
    atBajo.status === 'NO_APLICA',
    atBajo.status
  );

  check(
    'the catalog declares op.acc.3 only at MEDIO and ALTO',
    control('op.acc.3').levels.join(',') === 'MEDIO,ALTO',
    control('op.acc.3').levels.join(',')
  );

  check(
    'and op.acc.4 does apply at the three levels',
    control('op.acc.4').levels.join(',') === 'BAJO,MEDIO,ALTO',
    control('op.acc.4').levels.join(',')
  );
}

section('5. R2 and R3 of op.acc.3 do not enter the denominator');

{
  const withoutLevel = control('op.acc.3').requirements.filter(
    requirement => requirement.applicability.levels.length === 0
  );

  check(
    'there are exactly two, and they are R2 and R3',
    withoutLevel.map(requirement => requirement.id).sort().join(',') ===
      'op.acc.3.r2.1,op.acc.3.r3.1',
    withoutLevel.map(requirement => requirement.id).join(',')
  );

  const r1 = control('op.acc.3').requirements.filter(requirement =>
    requirement.id.startsWith('op.acc.3.r1.')
  );

  check(
    'and the two of R1, which the ENS does require, stay in ALTO',
    r1.length === 2 &&
      r1.every(
        requirement =>
          requirement.applicability.levels.join(',') === 'ALTO'
      ),
    r1.map(r => `${r.id}=${r.applicability.levels.join('|')}`).join(' ')
  );

  const atHigh = evaluate(
    control('op.acc.3').requirements,
    'ALTO',
    'ACTIVE'
  );

  check(
    'in ALTO the denominator is 4 requirements, not 6',
    atHigh.applicableRequirements === 4,
    String(atHigh.applicableRequirements)
  );
}

section('6. Traceability is not invented: each rule exists on a manager');

{
  const newOnes = ENSEvidenceCatalog.filter(evidence =>
    ['op.acc.3', 'op.acc.4'].includes(evidence.controlId)
  );

  check(
    'the 15 evidences of the two controls are declared',
    newOnes.length === 15,
    String(newOnes.length)
  );

  const three = newOnes.filter(
    evidence => evidence.controlId === 'op.acc.3'
  );

  check(
    'op.acc.3 · all seven accredit a rule in their band',
    three.length === 7 &&
      three.every(
        evidence =>
          evidence.relatedRules.length === 1 &&
          /^1070\d\d$/.test(evidence.relatedRules[0])
      ),
    three.map(e => `${e.id}=${e.relatedRules.join('|')}`).join(' ')
  );

  check(
    'and five of them share the same rule: they share the fact',
    three.filter(
      evidence => evidence.relatedRules[0] === '107001'
    ).length === 5,
    three.map(e => `${e.id}=${e.relatedRules[0]}`).join(' ')
  );

  const four = newOnes.filter(
    evidence => evidence.controlId === 'op.acc.4'
  );

  check(
    'op.acc.4 · all eight accredit exactly one rule in their band',
    four.length === 8 &&
      four.every(
        evidence =>
          evidence.relatedRules.length === 1 &&
          /^1071\d\d$/.test(evidence.relatedRules[0])
      ),
    four.map(e => `${e.id}=${e.relatedRules.join('|')}`).join(' ')
  );

  const deployed = ENSEvidenceCatalog.filter(evidence =>
    ['mp.info.6', 'op.acc.1', 'op.acc.2'].includes(evidence.controlId)
  );

  const withoutRule = deployed.filter(
    evidence => evidence.relatedRules.length === 0
  );

  check(
    'and those of the deployed controls do accredit it',
    deployed.length > 0 && withoutRule.length === 0,
    `${withoutRule.length} sin regla de ${deployed.length}`
  );

  check(
    'with numeric identifiers, which is what exists on a manager',
    deployed.every(evidence =>
      evidence.relatedRules.every(rule => /^\d+$/.test(rule))
    ),
    deployed
      .flatMap(e => e.relatedRules)
      .filter(r => !/^\d+$/.test(r))
      .join(', ')
  );
}

section('7. An ACTIVE control without a runbook must be declared');

const NO_RUNBOOK: Record<string, string> = Object.fromEntries(
  Object.entries(require('./controls-without-runbook.json') as Record<string, string>).filter(
    ([clave]) => !clave.startsWith('_')
  )
);

const runbookProblem = (
  c: Pick<ENSControlDefinition, 'id' | 'status'>,
  rules: string[],
  declaredItems: Record<string, string>
): string | undefined => {
  if (c.status !== 'ACTIVE') {
    return undefined;
  }

  const declared = Object.prototype.hasOwnProperty.call(declaredItems, c.id);

  if (!declared) {
    return rules.length
      ? undefined
      : 'ACTIVE sin runbook (no acredita ninguna regla) y sin declarar en tests/controls-without-runbook.json';
  }

  if (!String(declaredItems[c.id]).trim()) {
    return 'declarado sin runbook pero sin motivo';
  }

  return rules.length
    ? `declarado sin runbook y acredita reglas (${rules.join(', ')}): una regla solo existe si un runbook la despliega`
    : undefined;
};

const rulesOf = (controlId: string): string[] =>
  ENSEvidenceCatalog.filter(evidence => evidence.controlId === controlId).flatMap(
    evidence => evidence.relatedRules
  );

{
  for (const c of ENSCatalog) {
    const problem = runbookProblem(c, rulesOf(c.id), NO_RUNBOOK);

    check(
      `${c.id} · ${Object.prototype.hasOwnProperty.call(NO_RUNBOOK, c.id) ? 'declared without runbook' : 'matches its runbook'}`,
      problem === undefined,
      problem
    );
  }

  check(
    'each control declared without a runbook carries its motive',
    Object.values(NO_RUNBOOK).every(motive => String(motive).trim().length > 0),
    Object.keys(NO_RUNBOOK).join(', ')
  );

  check(
    'op.cont.2 is declared without a runbook (spec §5.4)',
    Object.prototype.hasOwnProperty.call(NO_RUNBOOK, 'op.cont.2')
  );

  const invented = { id: 'op.zzz.9', status: 'ACTIVE' as const };

  check(
    'ACTIVE, no rules and undeclared: fails',
    runbookProblem(invented, [], {}) !== undefined
  );
  check(
    'reversal · declared with its motive: matches',
    runbookProblem(invented, [], { 'op.zzz.9': 'control documental' }) === undefined
  );
  check(
    'reversal · with rules (has a runbook) and undeclared: matches',
    runbookProblem(invented, ['111999'], {}) === undefined
  );
  check(
    'declared but without a motive: fails',
    runbookProblem(invented, [], { 'op.zzz.9': '  ' }) !== undefined
  );
  check(
    'declared without a runbook and accrediting rules: fails',
    runbookProblem(invented, ['111999'], { 'op.zzz.9': 'control documental' }) !== undefined
  );
  check(
    'in DRAFT nothing is required',
    runbookProblem({ id: 'op.zzz.9', status: 'DRAFT' }, [], {}) === undefined
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
