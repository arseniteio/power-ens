/** The overview scales to dozens of agents and stays readable. */
import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../common/ens/configuration/types';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
} from '../common/ens/core/evaluation/types';
import { consolidateAgentComplianceResultByControl } from '../common/ens/core/compliance-state/consolidation';
import type { ENSAgentComplianceState } from '../common/ens/core/compliance-state/types';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
import {
  describeScope,
  machinesLabel,
  summarizeMotives,
} from '../public/ens/controls/control-detail/general-view';

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

const CONTROL: ENSControlDefinition = opAcc1CatalogDefinition;

const evidence = (
  evidenceId: string,
  status: ENSComplianceStatus,
  observations: string[] = [],
  agentMotive?: string
): ENSEvidenceResolved => {
  const definition = getEvidenceDefinitions('op.acc.1').find(
    item => item.id === evidenceId
  );

  if (!definition) {
    throw new Error(`The catalog does not define ${evidenceId} for op.acc.1`);
  }

  return {
    id: definition.id,
    controlId: definition.controlId,
    title: definition.title,
    description: definition.description,
    requirements: definition.requirements,
    levels: definition.levels,
    category: definition.category,
    criticality: definition.criticality,
    sourceTypes: definition.sourceTypes,
    expectedEventTypes: definition.expectedEventTypes,
    relatedRules: definition.relatedRules,
    auditQuestion: definition.auditQuestion,
    status,
    observations,
    resolvedAttributes: agentMotive
      ? { motivo: agentMotive }
      : undefined,
  };
};

const TODAS = [
  'EV-01',
  'EV-02',
  'EV-03',
  'EV-04',
  'EV-05',
  'EV-06',
  'EV-07',
  'EV-08',
];

const evidences = (
  exceptions: Record<string, ENSComplianceStatus> = {},
  motives: Record<string, string[]> = {},
  agentMotives: Record<string, string> = {}
): ENSEvidenceResolved[] =>
  TODAS.map(id =>
    evidence(
      id,
      exceptions[id] || 'CUMPLE',
      motives[id] || [],
      agentMotives[id]
    )
  );

const validValue = (
  parameter: ENSControlParameter
): ENSControlParameter['value'] => {
  if (parameter.options && parameter.options.length) {
    return parameter.options[0];
  }

  switch (parameter.type) {
    case 'number':
    case 'duration_days':
    case 'duration_hours':
      return typeof parameter.minValue === 'number'
        ? Math.max(parameter.minValue, 1)
        : 7;
    case 'boolean':
      return true;
    case 'list':
      return parameter.columns && parameter.columns.length
        ? [parameter.example || '']
        : ['valor-uno', 'valor-dos'];
    case 'table':
      return [parameter.example || ''];
    case 'path':
      return '/var/lib/ensfacil';
    case 'url':
      return 'https://ensfacil.example.org/api';
    default:
      return 'valor';
  }
};

const FULL_CONFIGURATION: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parameter => ({
    ...parameter,
    value: validValue(parameter),
  })),
};

const evaluate = (
  resolved: ENSEvidenceResolved[],
  level: ENSLevel = 'MEDIO'
): ENSComplianceResult =>
  evaluateENSControl(CONTROL, FULL_CONFIGURATION, level, resolved, undefined, []);

const MACHINES = [
  { agentId: '021', agentName: 'CLIENTE-01' },
  { agentId: '022', agentName: 'CLIENTE-02' },
  { agentId: '023', agentName: 'CLIENTE-03' },
  { agentId: '024', agentName: 'CLIENTE-04' },
  { agentId: '025', agentName: 'CLIENTE-05' },
  { agentId: '026', agentName: 'CLIENTE-06' },
  { agentId: '027', agentName: 'CLIENTE-07' },
];

const fleet = (
  howMany: number,
  resultOf: (index: number) => ENSComplianceResult
): ENSAgentComplianceState[] =>
  MACHINES.slice(0, howMany).map((machine, index) => ({
    agentId: machine.agentId,
    agentName: machine.agentName,
    results: [resultOf(index)],
    summary: undefined as never,
  }));

const consolidate = (agentes: ENSAgentComplianceState[]): ENSComplianceResult => {
  const result = consolidateAgentComplianceResultByControl(agentes, 'op.acc.1');

  if (!result) {
    throw new Error('The consolidation returned no result for op.acc.1');
  }

  return result;
};

const sumByAgent = (
  agentes: ENSAgentComplianceState[],
  selector: (result: ENSComplianceResult) => number
): number =>
  agentes.reduce((total, agent) => total + selector(agent.results[0]), 0);

const gaps = (result: ENSComplianceResult) =>
  result.nonConformities.filter(item => item.origin === 'NO_EVIDENCIADA');

const measurements = (result: ENSComplianceResult) =>
  result.nonConformities.filter(item => item.origin === 'MEDIDA');

const NO_DATA_MOTIVE =
  'Sin eventos del recolector en la ventana de evaluación.';

section('1 · a motive repeated on N machines is ONE motive');

{
  const sameMotive = consolidate(
    fleet(7, () =>
      evaluate(
        evidences({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [NO_DATA_MOTIVE] })
      )
    )
  );

  const ev04 = sameMotive.evidences.find(item => item.id === 'EV-04');

  check(
    'seven machines with the same motive · a single group',
    ev04?.observationGroups?.length === 1,
    JSON.stringify(ev04?.observationGroups?.map(group => group.text))
  );

  check(
    'seven machines with the same motive · the group says there are seven',
    ev04?.observationGroups?.[0].agents.length === 7,
    String(ev04?.observationGroups?.[0].agents.length)
  );

  check(
    'seven machines with the same motive · a single plain-text line',
    ev04?.observations.length === 1,
    JSON.stringify(ev04?.observations)
  );

  const differentMotive = consolidate(
    fleet(7, index =>
      evaluate(
        evidences(
          { 'EV-04': 'NO_EVALUABLE' },
          { 'EV-04': [`${NO_DATA_MOTIVE} Detalle propio de la máquina ${index}.`] }
        )
      )
    )
  );

  const ev04Different = differentMotive.evidences.find(item => item.id === 'EV-04');

  check(
    'reversal · seven different motives remain seven',
    ev04Different?.observationGroups?.length === 7 &&
      ev04Different?.observationGroups?.every(group => group.agents.length === 1),
    JSON.stringify(
      ev04Different?.observationGroups?.map(group => group.agents.length)
    )
  );

  const sixAndOne = consolidate(
    fleet(7, index =>
      evaluate(
        evidences(
          { 'EV-04': 'NO_EVALUABLE' },
          {
            'EV-04': [
              index === 6 ? 'El recolector no está instalado.' : NO_DATA_MOTIVE,
            ],
          }
        )
      )
    )
  );

  const ev04Mix = sixAndOne.evidences.find(item => item.id === 'EV-04');
  const counts = (ev04Mix?.observationGroups || [])
    .map(group => group.agents.length)
    .sort((left, right) => right - left);

  check(
    'six for one reason and one for another · two groups, of 6 and of 1',
    counts.length === 2 && counts[0] === 6 && counts[1] === 1,
    JSON.stringify(counts)
  );

  check(
    'the odd machine can be named: the group of 1 says which',
    (ev04Mix?.observationGroups || []).some(
      group => group.agents.length === 1 && group.agents[0].agentId === '027'
    ),
    JSON.stringify(
      (ev04Mix?.observationGroups || []).map(group =>
        group.agents.map(agent => agent.agentId)
      )
    )
  );
}

section('2 · cards are not multiplied per machine');

{
  const agentes = fleet(7, () =>
    evaluate(evidences({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [NO_DATA_MOTIVE] }))
  );

  const antes = sumByAgent(agentes, result => gaps(result).length);
  const consolidated = consolidate(agentes);
  const after = gaps(consolidated).length;

  check(
    'each agent brings its own gaps (the "before" is not zero)',
    antes === agentes.length * gaps(agentes[0].results[0]).length &&
      antes > 0,
    String(antes)
  );

  const distinct = new Set(
    agentes.flatMap(agent =>
      gaps(agent.results[0]).map(
        gap => `${gap.requirementId}|${gap.finding}|${gap.requiredAction}`
      )
    )
  ).size;

  check(
    'the overview shows as many cards as there are distinct gaps',
    after === distinct,
    `${after} tarjetas vs ${distinct} huecos distintos`
  );

  check(
    'and they are far fewer than before',
    after < antes,
    `antes ${antes}, después ${after}`
  );

  check(
    'no consolidated card repeats an identifier',
    new Set(gaps(consolidated).map(gap => gap.id)).size === after,
    JSON.stringify(gaps(consolidated).map(gap => gap.id))
  );

  const gapsOfEv04 = gaps(consolidated).filter(gap =>
    gap.evidenceIds.includes('EV-04')
  );

  check(
    'same collector motive · a single card with the seven machines',
    gapsOfEv04.length === 1 && (gapsOfEv04[0].agents || []).length === 7,
    JSON.stringify(gapsOfEv04.map(gap => (gap.agents || []).length))
  );

  const withDistinctMotives = fleet(7, index =>
    evaluate(
      evidences(
        { 'EV-04': 'NO_EVALUABLE' },
        {},
        { 'EV-04': `Motivo propio de la máquina ${index}.` }
      )
    )
  );

  const variedGaps = gaps(consolidate(withDistinctMotives)).filter(gap =>
    gap.evidenceIds.includes('EV-04')
  );

  check(
    'reversal · seven different motives still give seven cards',
    variedGaps.length === 7 &&
      variedGaps.every(gap => (gap.agents || []).length === 1),
    JSON.stringify(variedGaps.map(gap => (gap.agents || []).length))
  );

  check(
    'reversal · and each carries its machine name in the id',
    variedGaps.every(gap =>
      gap.id.startsWith(`${(gap.agents || [])[0]?.agentId}:NC-`)
    ),
    JSON.stringify(variedGaps.map(gap => gap.id))
  );
}

section('3 · what comes from the catalog is not a per-machine finding');

{
  const consolidated = consolidate(
    fleet(7, () =>
      evaluate(evidences({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [NO_DATA_MOTIVE] }))
    )
  );

  const fromCatalog = gaps(consolidated).filter(
    gap => gap.cause === 'CATALOG'
  );

  const ofTheMachine = gaps(consolidated).filter(
    gap => gap.cause === 'EVIDENCE'
  );

  check(
    'the two catalog gaps appear ONCE, not seven times',
    fromCatalog.length === 2,
    JSON.stringify(fromCatalog.map(gap => gap.requirementId))
  );

  check(
    'op.acc.1.5 appears exactly once',
    gaps(consolidated).filter(
      gap => gap.requirementId === 'op.acc.1.5'
    ).length === 1,
    JSON.stringify(
      gaps(consolidated)
        .filter(gap => gap.requirementId === 'op.acc.1.5')
        .map(gap => gap.id)
    )
  );

  check(
    'a catalog gap is not attributed to any machine',
    fromCatalog.every(gap => (gap.agents || []).length === 0),
    JSON.stringify(fromCatalog.map(gap => (gap.agents || []).length))
  );

  check(
    'what does belong to the machine still names all seven',
    ofTheMachine.length > 0 &&
      ofTheMachine.every(gap => (gap.agents || []).length === 7),
    JSON.stringify(ofTheMachine.map(gap => (gap.agents || []).length))
  );

  check(
    'a shared card does not carry a machine name in the id',
    [...fromCatalog, ...ofTheMachine].every(gap => !gap.id.includes(':')),
    JSON.stringify([...fromCatalog, ...ofTheMachine].map(gap => gap.id))
  );

  const unaSola = consolidate(
    fleet(1, () =>
      evaluate(evidences({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [NO_DATA_MOTIVE] }))
    )
  );

  check(
    'reversal · with a single machine, its gap does carry its label',
    gaps(unaSola).some(
      gap => gap.cause === 'EVIDENCE' && gap.id.startsWith('021:NC-')
    ),
    JSON.stringify(gaps(unaSola).map(gap => gap.id))
  );

  check(
    'reversal · but the catalog one still does not carry it even with one machine',
    gaps(unaSola)
      .filter(gap => gap.cause === 'CATALOG')
      .every(gap => !gap.id.includes(':')),
    JSON.stringify(
      gaps(unaSola)
        .filter(gap => gap.cause === 'CATALOG')
        .map(gap => gap.id)
    )
  );
}

section('4 · aggregating does not dilute the measured / not-evidenced distinction');

{
  const agentes = fleet(7, index =>
    index === 0
      ? evaluate(evidences({ 'EV-03': 'NO_CUMPLE' }))
      : evaluate(
          evidences({ 'EV-03': 'NO_EVALUABLE' }, { 'EV-03': [NO_DATA_MOTIVE] })
        )
  );

  const consolidated = consolidate(agentes);

  const ofOpAcc11 = consolidated.nonConformities.filter(
    item => item.requirementId === 'op.acc.1.1'
  );

  const ncOfOpAcc11 = ofOpAcc11.filter(item => item.origin === 'MEDIDA');

  const pmOfOpAcc11 = ofOpAcc11.filter(
    item => item.origin === 'NO_EVIDENCIADA'
  );

  check(
    'the same requirement opens TWO cards in the same list, not a merged one',
    ofOpAcc11.length === 2 &&
      ncOfOpAcc11.length === 1 &&
      pmOfOpAcc11.length === 1,
    `${ofOpAcc11.length} tarjetas: ${ncOfOpAcc11.length} medidas / ${pmOfOpAcc11.length} no evidenciadas`
  );

  check(
    'the nonconformity points only at the machine where it was proven',
    (ncOfOpAcc11[0]?.agents || []).length === 1 &&
      ncOfOpAcc11[0]?.agents?.[0].agentId === '021',
    JSON.stringify((ncOfOpAcc11[0]?.agents || []).map(agent => agent.agentId))
  );

  check(
    'the not-evidenced one points at the other six, and NOT at the one that fails',
    (pmOfOpAcc11[0]?.agents || []).length === 6 &&
      !(pmOfOpAcc11[0]?.agents || []).some(agent => agent.agentId === '021'),
    JSON.stringify((pmOfOpAcc11[0]?.agents || []).map(agent => agent.agentId))
  );

  check(
    'no identifier is repeated within the list',
    new Set(consolidated.nonConformities.map(item => item.id)).size ===
      consolidated.nonConformities.length,
    JSON.stringify(consolidated.nonConformities.map(item => item.id))
  );

  check(
    'no card is presented any more as «no es un incumplimiento»',
    consolidated.nonConformities.every(
      item => !item.impact.includes('No es un incumplimiento')
    ),
    JSON.stringify(consolidated.nonConformities.map(item => item.impact))
  );

  check(
    'the not-evidenced ones invoke the burden of proof; the measured ones do not',
    gaps(consolidated).every(item =>
      item.impact.includes('carga de la prueba')
    ) &&
      measurements(consolidated).every(
        item => !item.impact.includes('carga de la prueba')
      ),
    JSON.stringify(consolidated.nonConformities.map(item => item.origin))
  );

  check(
    'the same requirement gives two different actions depending on how it was reached',
    ncOfOpAcc11[0]?.requiredAction !== pmOfOpAcc11[0]?.requiredAction,
    `${String(ncOfOpAcc11[0]?.requiredAction)} vs ${String(
      pmOfOpAcc11[0]?.requiredAction
    )}`
  );
}

section('5 · what the screen truncates, it says');

{
  const group = (text: string, howMany: number) => ({
    text: text,
    agents: MACHINES.slice(0, howMany),
  });

  const five = [
    group('motivo-a', 1),
    group('motivo-b', 5),
    group('motivo-c', 2),
    group('motivo-d', 1),
    group('motivo-e', 1),
  ];

  const summary = summarizeMotives(five);

  check(
    'with five motives three are shown and the two missing are counted',
    summary.visibles.length === 3 && summary.ocultos === 2,
    `${summary.visibles.length} visibles / ${summary.ocultos} ocultos`
  );

  check(
    'the most widespread motive is never left out',
    summary.visibles[0].text === 'motivo-b' &&
      summary.visibles[1].text === 'motivo-c',
    JSON.stringify(summary.visibles.map(item => item.text))
  );

  const three = summarizeMotives(five.slice(0, 3));

  check(
    'reversal · with three motives none is hidden',
    three.visibles.length === 3 && three.ocultos === 0,
    `${three.visibles.length} visibles / ${three.ocultos} ocultos`
  );

  check(
    'seven out of seven are marked as «todas»',
    (describeScope(MACHINES.slice(0, 7), 7) || '').includes('(todas)'),
    describeScope(MACHINES.slice(0, 7), 7)
  );

  check(
    'reversal · six out of seven are NOT marked as «todas»',
    !(describeScope(MACHINES.slice(0, 6), 7) || '').includes('(todas)'),
    describeScope(MACHINES.slice(0, 6), 7)
  );

  check(
    'from the fifth machine on they are counted instead of named',
    (describeScope(MACHINES.slice(0, 7), 7) || '').includes('y 3 más'),
    describeScope(MACHINES.slice(0, 7), 7)
  );

  check(
    'reversal · four machines are all named, without «y N más»',
    !(describeScope(MACHINES.slice(0, 4), 7) || '').includes('más'),
    describeScope(MACHINES.slice(0, 4), 7)
  );

  check(
    'a single machine is named, not counted',
    machinesLabel(MACHINES.slice(0, 1), 7) === 'CLIENTE-01 (021)',
    machinesLabel(MACHINES.slice(0, 1), 7)
  );

  check(
    'no machines, no scope to describe (the catalog part)',
    describeScope([], 7) === undefined,
    String(describeScope([], 7))
  );
}

section('6 · the screen figures with the 7 agents of the real deployment');

{
  const nothingMeasured = () =>
    evaluate(
      evidences(
        Object.fromEntries(
          TODAS.map(id => [id, 'NO_EVALUABLE' as ENSComplianceStatus])
        ),
        Object.fromEntries(TODAS.map(id => [id, [NO_DATA_MOTIVE]]))
      )
    );

  const agentes = fleet(7, nothingMeasured);
  const consolidated = consolidate(agentes);

  const cardsBefore = sumByAgent(
    agentes,
    result => result.nonConformities.length
  );

  const cardsAfter = consolidated.nonConformities.length;

  const lineasAntes = sumByAgent(agentes, result =>
    result.evidences.reduce(
      (total, evidence) => total + evidence.observations.length,
      0
    )
  );

  const linesAfter = consolidated.evidences.reduce(
    (total, evidence) => total + evidence.observations.length,
    0
  );

  console.log(
    `       tarjetas: ${cardsBefore} -> ${cardsAfter} · ` +
      `líneas de motivo: ${lineasAntes} -> ${linesAfter}`
  );

  check(
    'cards stop being multiplied by seven',
    cardsAfter * 7 === cardsBefore,
    `antes ${cardsBefore}, después ${cardsAfter}`
  );

  check(
    'motive lines stop being multiplied by seven',
    linesAfter * 7 === lineasAntes,
    `antes ${lineasAntes}, después ${linesAfter}`
  );

  check(
    'and no evidence was lost on the way',
    consolidated.evidences.length === agentes[0].results[0].evidences.length,
    `${consolidated.evidences.length} vs ${agentes[0].results[0].evidences.length}`
  );

  check(
    'the overview says how many machines it summarized',
    consolidated.consolidatedAgents?.length === 7,
    String(consolidated.consolidatedAgents?.length)
  );
}

section('7 · the consolidated score does not keep the first machine\'s');

{
  const healthy = () => evaluate(evidences({}));
  const rota = () =>
    evaluate(evidences({ 'EV-04': 'NO_EVALUABLE' }, { 'EV-04': [NO_DATA_MOTIVE] }));

  const withOrder = (healthyFirst: boolean) =>
    consolidate(
      fleet(2, index =>
        (healthyFirst ? index === 0 : index === 1) ? healthy() : rota()
      )
    );

  const healthyAhead = withOrder(true);
  const healthyLast = withOrder(false);

  const scoreDe = (r: ENSComplianceResult, id: string) =>
    (r.requirements.find(x => x.id === id) as { score?: number } | undefined)?.score;

  const estadoDe = (r: ENSComplianceResult, id: string) =>
    r.requirements.find(x => x.id === id)?.status;

  const REQ = 'op.acc.1.4';

  check(
    'baseline: the requirement differs on the healthy machine and on the broken one',
    estadoDe(healthy(), REQ) !== estadoDe(rota(), REQ),
    `${estadoDe(healthy(), REQ)} / ${estadoDe(rota(), REQ)}`
  );

  check(
    'the consolidated state is the same in both orders',
    estadoDe(healthyAhead, REQ) === estadoDe(healthyLast, REQ),
    `${estadoDe(healthyAhead, REQ)} / ${estadoDe(healthyLast, REQ)}`
  );

  check(
    'and the score too, whichever machine goes first',
    scoreDe(healthyAhead, REQ) === scoreDe(healthyLast, REQ),
    `${scoreDe(healthyAhead, REQ)} / ${scoreDe(healthyLast, REQ)}`
  );

  check(
    'and the score does not contradict the consolidated state',
    (estadoDe(healthyAhead, REQ) === 'CUMPLE') ===
      (scoreDe(healthyAhead, REQ) === 100),
    `${estadoDe(healthyAhead, REQ)} con score ${scoreDe(healthyAhead, REQ)}`
  );

  const bothHealthy = consolidate(fleet(2, () => healthy()));

  check(
    'with both machines compliant, the consolidated one scores 100',
    scoreDe(bothHealthy, REQ) === 100,
    `${estadoDe(bothHealthy, REQ)} con score ${scoreDe(bothHealthy, REQ)}`
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
