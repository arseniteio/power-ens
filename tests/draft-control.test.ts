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
import { getENSComplianceState } from '../common/ens/core/ens-engine';
import { nonConformitiesOf } from '../server/lib/evaluation/overview-fields';
import { ensConfigurationRepository } from '../common/ens/configuration/repository';
import { defaultENSConfigurationTemplate } from '../common/ens/configuration/data/default-configuration';
import { buildOpMon2ReportModel } from '../public/ens/reports/op-mon-2-report-model';
import { buildENSDashboardModel } from '../common/ens/core/dashboard-adapter';
import {
  ENS_PLANNED_MEASUREMENTS,
  describePendingMeasurement,
  describeRequiredSource,
  getPlannedMeasurement,
} from '../common/ens/catalog/support/measurement-plan';

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
      // A DRAFT control may declare the template's evidences (they are shown with the source they need), but none
      // can accredit a rule: a rule exists only when agent/rules ships it.
      const rules = ENSEvidenceCatalog.filter(evidence => evidence.controlId === controlId).flatMap(
        evidence => evidence.relatedRules
      );

      check(
        `${controlId} · in DRAFT it accredits no rule yet`,
        rules.length === 0,
        rules.join(', ')
      );
      check(
        `${controlId} · in DRAFT it is in the measurement plan`,
        Boolean(getPlannedMeasurement(controlId)),
        'sin oleada ni fuentes en catalog/support/measurement-plan.ts'
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

  check(
    'op.acc.3 and op.acc.4 accredit no v1 rule: the OSCompliance engine judges them',
    newOnes.every(evidence => evidence.relatedRules.length === 0)
  );

  const deployed = ENSEvidenceCatalog.filter(evidence =>
    ['mp.info.6'].includes(evidence.controlId)
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

section('6b. The controls without collector (owner decision 19/10/2026): documentary, out of the index');

{
  const planned = ENS_PLANNED_MEASUREMENTS.map(plan => plan.controlId);

  check(
    'the plan names the eleven controls of the auditor v2.0 package without collector',
    planned.join(',') === 'mp.eq.2,mp.eq.3,mp.eq.4,mp.com.1,mp.com.3,mp.com.4,mp.sw.2,mp.s.1,mp.s.2,mp.s.3,mp.s.4',
    planned.join(',')
  );

  check(
    'every planned control is in the catalog and DRAFT',
    planned.every(id => ENSCatalog.find(c => c.id === id)?.status === 'DRAFT'),
    planned.filter(id => ENSCatalog.find(c => c.id === id)?.status !== 'DRAFT').join(', ')
  );

  check(
    'the waves are the owner\'s (A: mp.s.1, mp.sw.2, mp.eq.2 · B: mp.com.3, mp.eq.3, mp.s.2 · C: the rest)',
    ['A', 'B', 'C']
      .map(wave => ENS_PLANNED_MEASUREMENTS.filter(plan => plan.wave === wave).map(plan => plan.controlId).sort().join(','))
      .join(' | ') === 'mp.eq.2,mp.s.1,mp.sw.2 | mp.com.3,mp.eq.3,mp.s.2 | mp.com.1,mp.com.4,mp.eq.4,mp.s.3,mp.s.4'
  );

  const withoutSource = ENSEvidenceCatalog.filter(
    evidence => planned.includes(evidence.controlId) && !describeRequiredSource(evidence.controlId, evidence.id)
  );
  const unknownSource = ENS_PLANNED_MEASUREMENTS.flatMap(plan =>
    Object.keys(plan.sources)
      .filter(id => !ENSEvidenceCatalog.some(evidence => evidence.controlId === plan.controlId && evidence.id === id))
      .map(id => `${plan.controlId} ${id}`)
  );

  check(
    'every evidence of a planned control says which source it needs, and no source names a missing evidence',
    withoutSource.length === 0 && unknownSource.length === 0,
    [...withoutSource.map(e => `${e.controlId} ${e.id}`), ...unknownSource].join(', ')
  );

  const bands = ENS_PLANNED_MEASUREMENTS.map(plan => plan.rulesBand);

  check(
    'one band of 100 per control from 111800, consecutive and in Annex II order',
    bands.every((band, index) => band.from === 111800 + index * 100 && band.to === band.from + 99),
    bands.map(band => `${band.from}-${band.to}`).join(' ')
  );

  for (const id of planned) {
    const results = LEVELS.map(level => evaluate(control(id).requirements, level, 'DRAFT'));

    check(
      `${id} · NO_APLICA and no score at the three levels (out of the index average)`,
      results.every(result => result.status === 'NO_APLICA' && result.score === undefined && result.applicableRequirements === 0),
      results.map(result => `${result.status}/${result.score}`).join(' ')
    );
  }

  const state = getENSComplianceState('ALTO', [], undefined, [{ id: '101', name: 'srv-01' }] as any, new Date('2026-10-20T10:00:00Z'));
  const ofPlanned = state.results.filter(result => planned.includes(result.control.id));
  const measuredOthers = state.results.filter(result => !planned.includes(result.control.id) && result.status !== 'NO_APLICA');

  check(
    'in the panel state, the eleven come out NO_APLICA without score and the index averages only the others',
    ofPlanned.length === planned.length &&
      ofPlanned.every(result => result.status === 'NO_APLICA' && result.score === undefined) &&
      state.summary.measured === measuredOthers.length,
    `${ofPlanned.map(r => `${r.control.id}=${r.status}`).join(' ')} · measured ${state.summary.measured} vs ${measuredOthers.length}`
  );

  const observation = evaluateRequirements(control('mp.s.1').requirements, 'MEDIO', [], true, [], 'DRAFT')[0]
    ?.observations?.[0] || '';

  check(
    'the requirement says the control is not active yet, never that it fails',
    /todavía no está activo/.test(observation) && !/incumpl/i.test(observation),
    observation
  );

  check(
    'the screen sentence names the wave and what it needs, and that it is not judged as a failure',
    /no se juzga como incumplimiento/.test(describePendingMeasurement(control('mp.com.1'))) &&
      /oleada C/.test(describePendingMeasurement(control('mp.com.1'))) &&
      /cortafuegos/.test(describePendingMeasurement(control('mp.com.1'))),
    describePendingMeasurement(control('mp.com.1'))
  );
}

section('6c. A control without collector accuses nobody, not even of missing parameters (real engine output)');

{
  // The default document: every parameter empty, as right after seeding with inject-control.py.
  ensConfigurationRepository.replaceActive(JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)));
  const scope = [{ id: '101', name: 'srv-01' }, { id: '102', name: 'srv-02' }] as any;
  const now = new Date('2026-10-20T10:00:00Z');
  const planned = ENS_PLANNED_MEASUREMENTS.map(plan => plan.controlId);

  for (const level of ['MEDIO', 'ALTO'] as ENSLevel[]) {
    const state = getENSComplianceState(level, [], undefined, scope, now);
    const ofPlanned = state.results.filter(result => planned.includes(result.control.id));

    check(
      `${level} · the eleven: no non-conformity and no missing parameter, though their required ones are empty`,
      ofPlanned.length === 11 && ofPlanned.every(result => result.nonConformities.length === 0 && result.missingParameters.length === 0 && result.missingEvidences.length === 0),
      ofPlanned.filter(result => result.nonConformities.length || result.missingParameters.length).map(result => `${result.control.id}: ${result.nonConformities.map(nc => nc.id).join(',')} ${result.missingParameters.join(',')}`)
    );
    check(
      `${level} · what they will need is a neutral hint, never «incumplimiento»`,
      ofPlanned.some(result => result.observations.some(o => /^Para cuando se mida, faltan/.test(o))) &&
        !ofPlanned.some(result => result.observations.some(o => /incumplimiento del control/.test(o)) || result.evidences.some(e => e.status !== 'NO_APLICA')),
      ofPlanned[0]?.observations
    );
    check(
      `${level} · the Overview work queue has no planned control`,
      !nonConformitiesOf(state).some(nc => planned.includes(nc.controlId))
    );

    const active = state.results.find(result => result.control.id === 'op.nub.1');

    check(
      `${level} · REVERSAL: an ACTIVE control with empty required parameters still gets its NC-CFG`,
      Boolean(active && active.missingParameters.length > 0 && active.nonConformities.some(nc => nc.id === 'NC-CFG')),
      active && `${active.missingParameters.join(',')} ${active.nonConformities.map(nc => nc.id).join(',')}`
    );

    const machine = getENSComplianceState(level, [], '101', scope, now);
    const inView = machine.results.filter(result => planned.includes(result.control.id));

    check(
      `${level} · in a machine's view: the eleven with their one result, on no machine row`,
      inView.length === 11 && inView.every(result => result.status === 'NO_APLICA' && result.nonConformities.length === 0) &&
        !machine.agents.some(agent => agent.results.some(result => planned.includes(result.control.id))),
      `${inView.length}`
    );
    check(
      `${level} · the manager's view carries only what is measured on it`,
      !getENSComplianceState(level, [], '000', scope, now).results.some(result => planned.includes(result.control.id))
    );

    // op.mon.2: field 5 and its figures leave them out (I1), even with a result that still carries missing parameters.
    const opMon2 = state.results.find(result => result.control.id === 'op.mon.2')!;
    const legacy = { ...ofPlanned[0], missingParameters: ['P-01', 'P-03'] };
    const field5 = buildOpMon2ReportModel(opMon2, [...state.results.filter(r => r !== ofPlanned[0]), legacy as any]).fields.find(field => field.id === 'op.mon.2.campo5')!;

    check(
      `${level} · op.mon.2 field 5 lists none of the eleven`,
      !field5.details.some(detail => planned.some(id => detail.startsWith(`${id}:`))),
      field5.details.filter(detail => planned.some(id => detail.startsWith(`${id}:`)))
    );

    const dashboard = buildENSDashboardModel(state);

    check(
      `${level} · dashboard: the eleven are «Sin medición todavía», apart from «No aplicables»`,
      dashboard.compliance.notMeasured === 11 &&
        dashboard.compliance.noAplica === state.controlSummary.noAplica - 11 &&
        dashboard.requirementsSummary.notMeasured === ofPlanned.reduce((n, result) => n + result.requirements.length, 0),
      [dashboard.compliance.notMeasured, dashboard.compliance.noAplica, dashboard.requirementsSummary.notMeasured]
    );
  }

  // N1: a control without collector declared on the manager plane (as a wave may do before activating it) is still
  // ONE result in a machine's view, none in the manager's, and the per-control path says the same.
  {
    const draft = control('mp.eq.2');
    const before = draft.measurementPlanes;
    draft.measurementPlanes = ['manager'];
    try {
      const engine = require('../common/ens/core/ens-engine');
      const machine = getENSComplianceState('MEDIO', [], '101', scope, now).results.filter(result => result.control.id === 'mp.eq.2');
      const manager = getENSComplianceState('MEDIO', [], '000', scope, now).results.filter(result => result.control.id === 'mp.eq.2');
      const set = getENSComplianceState('MEDIO', [], undefined, scope, now);

      check('manager-plane DRAFT · one result in a machine\'s view (not two)', machine.length === 1 && machine[0].status === 'NO_APLICA', machine.length);
      check('manager-plane DRAFT · none in the manager\'s view and on no row', manager.length === 0 && !set.agents.some(agent => agent.results.some(result => result.control.id === 'mp.eq.2')));
      check('manager-plane DRAFT · the per-control path agrees (101 one result, 000 none)',
        Boolean(engine.getENSComplianceResultByControl('mp.eq.2', 'MEDIO', [], '101', scope, now)) && engine.getENSComplianceResultByControl('mp.eq.2', 'MEDIO', [], '000', scope, now) === undefined);
      check('manager-plane DRAFT · counted once in the set view', set.results.filter(result => result.control.id === 'mp.eq.2').length === 1);
    } finally {
      if (before === undefined) delete draft.measurementPlanes;
      else draft.measurementPlanes = before;
    }
  }

  ensConfigurationRepository.reset();
}

section('7. An ACTIVE control without rules must be declared');

const NO_RULES: Record<string, string> = Object.fromEntries(
  Object.entries(require('./controls-without-rules.json') as Record<string, string>).filter(
    ([clave]) => !clave.startsWith('_')
  )
);

const rulesProblem = (
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
      : 'ACTIVE without rules (accredits none) and not declared in tests/controls-without-rules.json';
  }

  if (!String(declaredItems[c.id]).trim()) {
    return 'declared without rules but without a reason';
  }

  return rules.length
    ? `declared without rules and accredits rules (${rules.join(', ')}): an accredited rule must ship in agent/rules`
    : undefined;
};

const rulesOf = (controlId: string): string[] =>
  ENSEvidenceCatalog.filter(evidence => evidence.controlId === controlId).flatMap(
    evidence => evidence.relatedRules
  );

{
  for (const c of ENSCatalog) {
    const problem = rulesProblem(c, rulesOf(c.id), NO_RULES);

    check(
      `${c.id} · ${Object.prototype.hasOwnProperty.call(NO_RULES, c.id) ? 'declared without rules' : 'matches its rules'}`,
      problem === undefined,
      problem
    );
  }

  check(
    'each control declared without rules carries its motive',
    Object.values(NO_RULES).every(motive => String(motive).trim().length > 0),
    Object.keys(NO_RULES).join(', ')
  );

  check(
    'op.cont.2 is declared without rules (spec §5.4)',
    Object.prototype.hasOwnProperty.call(NO_RULES, 'op.cont.2')
  );

  const invented = { id: 'op.zzz.9', status: 'ACTIVE' as const };

  check(
    'ACTIVE, no rules and undeclared: fails',
    rulesProblem(invented, [], {}) !== undefined
  );
  check(
    'reversal · declared with its motive: matches',
    rulesProblem(invented, [], { 'op.zzz.9': 'control documental' }) === undefined
  );
  check(
    'reversal · with rules (ships rules) and undeclared: matches',
    rulesProblem(invented, ['111999'], {}) === undefined
  );
  check(
    'declared but without a motive: fails',
    rulesProblem(invented, [], { 'op.zzz.9': '  ' }) !== undefined
  );
  check(
    'declared without rules and accrediting rules: fails',
    rulesProblem(invented, ['111999'], { 'op.zzz.9': 'control documental' }) !== undefined
  );
  check(
    'in DRAFT nothing is required',
    rulesProblem({ id: 'op.zzz.9', status: 'DRAFT' }, [], {}) === undefined
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
