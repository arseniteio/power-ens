/** What cannot be proven does NOT COMPLY, and stays distinct from what was measured and fails. */
import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';
import type { ENSControlDefinition } from '../common/ens/catalog/types';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
  ENSLevel,
} from '../common/ens/configuration/types';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
import type { ENSRequirementEvaluationResult } from '../common/ens/core/evaluation/requirement';
import type {
  ENSComplianceResult,
  ENSComplianceStatus,
  ENSGapCause,
} from '../common/ens/core/evaluation/types';
import {
  consolidateAgentComplianceResultByControl,
  consolidateENSStatuses,
} from '../common/ens/core/compliance-state/consolidation';
import { buildComplianceState } from '../common/ens/core/compliance-state/engine';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { normalizeWazuhAlerts } from '../common/ens/core/data-source/data-source-engine';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';

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
  motive?: string,
  gapCause: ENSGapCause = 'EVIDENCE'
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
    observations: [],
    resolvedAttributes: motive ? { motivo: motive } : undefined,
    gapCause: status === 'NO_EVALUABLE' ? gapCause : undefined,
  };
};

const ALL_OF_THEM = ['EV-01', 'EV-02', 'EV-03', 'EV-04', 'EV-05', 'EV-06', 'EV-07', 'EV-08'];

const evidences = (
  exceptions: Record<string, ENSComplianceStatus> = {},
  motives: Record<string, string> = {},
  causes: Record<string, ENSGapCause> = {}
): ENSEvidenceResolved[] =>
  ALL_OF_THEM.map(id =>
    evidence(id, exceptions[id] || 'CUMPLE', motives[id], causes[id])
  );

const ALL_UNMEASURED = Object.fromEntries(
  ALL_OF_THEM.map(id => [id, 'NO_EVALUABLE' as ENSComplianceStatus])
);

const FULL_CONFIGURATION: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parameter => ({
    ...parameter,
    value: parameter.example,
  })),
};

const EMPTY_CONFIGURATION: ENSControlConfiguration = {
  ...opAcc1Configuration,
  parameters: opAcc1Configuration.parameters.map(parameter => ({
    ...parameter,
    value: undefined,
  })),
};

const evaluate = (
  resolved: ENSEvidenceResolved[],
  level: ENSLevel = 'MEDIO',
  configuration: ENSControlConfiguration | undefined = FULL_CONFIGURATION
): ENSComplianceResult =>
  evaluateENSControl(CONTROL, configuration, level, resolved, undefined, []);

const stateOf = (
  result: ENSComplianceResult,
  requirementId: string
): ENSComplianceStatus | undefined =>
  result.requirements.find(item => item.id === requirementId)?.status;

const proven = (
  result: ENSComplianceResult,
  requirementId: string
): boolean | undefined =>
  result.requirements.find(item => item.id === requirementId)?.evidenced;

const card = (result: ENSComplianceResult, requirementId: string) =>
  result.nonConformities.find(item => item.requirementId === requirementId);

const measurements = (result: ENSComplianceResult) =>
  result.nonConformities.filter(item => item.origin === 'MEDIDA');

const notEvidenced = (result: ENSComplianceResult) =>
  result.nonConformities.filter(item => item.origin === 'NO_EVIDENCIADA');

const requirements = (
  ...states: ENSComplianceStatus[]
): ENSRequirementEvaluationResult[] =>
  states.map((status, position) => ({
    id: `req-${position}`,
    title: `req-${position}`,
    level: ['BAJO', 'MEDIO', 'ALTO'],
    status,
    applicable: status !== 'NO_APLICA',
    evidenced: status !== 'NO_EVALUABLE' && status !== 'NO_APLICA',
    score: 0,
    observations: [],
    evidenceIds: [],
  }));

section('1 · requirement: what is not proven does NOT COMPLY, and it is known it was not measured');

{
  const compliant2 = evaluate(evidences());
  const unproven = evaluate(evidences({ 'EV-05': 'NO_EVALUABLE' }));

  check(
    'all compliant · op.acc.1.2 CUMPLE',
    stateOf(compliant2, 'op.acc.1.2') === 'CUMPLE',
    String(stateOf(compliant2, 'op.acc.1.2'))
  );

  check(
    'EV-05 unproven · op.acc.1.2 NO_CUMPLE, no longer NO_EVALUABLE',
    stateOf(unproven, 'op.acc.1.2') === 'NO_CUMPLE',
    String(stateOf(unproven, 'op.acc.1.2'))
  );

  check(
    'EV-05 unproven · the requirement declares it was NOT measured',
    proven(unproven, 'op.acc.1.2') === false &&
      proven(compliant2, 'op.acc.1.2') === true,
    `${String(proven(unproven, 'op.acc.1.2'))}/${String(
      proven(compliant2, 'op.acc.1.2')
    )}`
  );

  check(
    'EV-05 unproven · DOES open a nonconformity, and names it',
    card(unproven, 'op.acc.1.2')?.evidenceIds.includes('EV-05') === true,
    JSON.stringify(
      unproven.nonConformities.map(nc => `${nc.id}:${nc.requirementId}`)
    )
  );

  check(
    'EV-05 unproven · the card is marked NO_EVIDENCIADA, not MEDIDA',
    card(unproven, 'op.acc.1.2')?.origin === 'NO_EVIDENCIADA',
    String(card(unproven, 'op.acc.1.2')?.origin)
  );
}

{
  const withBreach = evaluate(evidences({ 'EV-05': 'NO_CUMPLE' }));

  check(
    'EV-05 breaches · op.acc.1.2 NO_CUMPLE, without partial credit for EV-06',
    stateOf(withBreach, 'op.acc.1.2') === 'NO_CUMPLE',
    String(stateOf(withBreach, 'op.acc.1.2'))
  );

  check(
    'EV-05 breaches · the requirement scores 0, not 50',
    withBreach.requirements.find(
      item => item.id === 'op.acc.1.2'
    )?.score === 0,
    String(
      withBreach.requirements.find(
        item => item.id === 'op.acc.1.2'
      )?.score
    )
  );

  const allCompliant = evaluate(evidences());

  check(
    'the SAME requirement with EV-05 green scores 100 again',
    allCompliant.requirements.find(item => item.id === 'op.acc.1.2')
      ?.score === 100,
    String(
      allCompliant.requirements.find(item => item.id === 'op.acc.1.2')?.score
    )
  );

  const withPartial = evaluate(evidences({ 'EV-05': 'PARCIAL' }));

  check(
    'a PARTIAL evidence brings the requirement down and is still a MEASUREMENT',
    stateOf(withPartial, 'op.acc.1.2') === 'NO_CUMPLE' &&
      proven(withPartial, 'op.acc.1.2') === true &&
      card(withPartial, 'op.acc.1.2')?.origin === 'MEDIDA',
    `${String(stateOf(withPartial, 'op.acc.1.2'))}/${String(
      proven(withPartial, 'op.acc.1.2')
    )}/${String(card(withPartial, 'op.acc.1.2')?.origin)}`
  );

  check(
    'EV-05 breaches · the card is marked MEDIDA, and cites EV-05',
    card(withBreach, 'op.acc.1.2')?.origin === 'MEDIDA' &&
      card(withBreach, 'op.acc.1.2')?.evidenceId === 'EV-05',
    `${String(card(withBreach, 'op.acc.1.2')?.origin)}/${String(
      card(withBreach, 'op.acc.1.2')?.evidenceId
    )}`
  );

  check(
    'EV-05 breaches · a MEASUREMENT carries no gap cause',
    card(withBreach, 'op.acc.1.2')?.cause === undefined,
    String(card(withBreach, 'op.acc.1.2')?.cause)
  );

  const unproven = evaluate(evidences({ 'EV-05': 'NO_EVALUABLE' }));

  check(
    'measured and not evidenced: same list, but different action',
    card(unproven, 'op.acc.1.2')!.requiredAction !==
      card(withBreach, 'op.acc.1.2')!.requiredAction,
    `${card(unproven, 'op.acc.1.2')!.requiredAction} vs ${
      card(withBreach, 'op.acc.1.2')!.requiredAction
    }`
  );
}

{
  const mix = evaluate(
    evidences({ 'EV-05': 'NO_CUMPLE', 'EV-04': 'NO_EVALUABLE' })
  );

  check(
    'breach + gap · EV-05\'s card is still MEDIDA',
    card(mix, 'op.acc.1.2')?.origin === 'MEDIDA',
    String(card(mix, 'op.acc.1.2')?.origin)
  );

  check(
    'breach + gap · op.acc.1.4 (EV-04) comes out NO_EVIDENCIADA',
    card(mix, 'op.acc.1.4')?.origin === 'NO_EVIDENCIADA' &&
      card(mix, 'op.acc.1.4')?.evidenceIds.includes('EV-04') === true,
    JSON.stringify(
      mix.nonConformities.map(nc => `${nc.requirementId}:${nc.origin}`)
    )
  );

  check(
    'breach + gap · no requirement opens TWO cards',
    new Set(mix.nonConformities.map(nc => nc.requirementId)).size ===
      mix.nonConformities.length,
    JSON.stringify(mix.nonConformities.map(nc => nc.requirementId))
  );

  check(
    'breach + gap · the total is the sum of the two classes',
    measurements(mix).length + notEvidenced(mix).length ===
      mix.nonConformities.length,
    `${measurements(mix).length}+${notEvidenced(mix).length}=${
      mix.nonConformities.length
    }`
  );
}

{
  const sameRow = evaluate(
    evidences({ 'EV-03': 'NO_EVALUABLE', 'EV-05': 'NO_CUMPLE' })
  );

  const nc = card(sameRow, 'op.acc.1.3');

  check(
    'offender and gap in the SAME requirement · the card is MEDIDA',
    nc?.origin === 'MEDIDA',
    String(nc?.origin)
  );

  check(
    'offender and gap in the SAME requirement · points to EV-05, not to EV-03',
    nc?.evidenceId === 'EV-05',
    String(nc?.evidenceId)
  );

  check(
    'offender and gap in the SAME requirement · the action does not send to review EV-03',
    Boolean(nc) && !nc!.requiredAction.includes('EV-03'),
    String(nc?.requiredAction)
  );
}

section('2 · the scenario of the first real deployment, with the new criterion');

{
  const servidor = evaluate(
    evidences(
      {
        'EV-03': 'NO_EVALUABLE',
        'EV-04': 'NO_EVALUABLE',
        'EV-05': 'NO_EVALUABLE',
        'EV-07': 'NO_EVALUABLE',
      },
      {
        'EV-04': 'parametro del cliente sin configurar',
        'EV-05': 'parametro del cliente sin configurar',
        'EV-07': 'parametro del cliente sin configurar',
      }
    )
  );

  check(
    'servidor real · el control ya no sale NO_EVALUABLE',
    servidor.status !== 'NO_EVALUABLE',
    servidor.status
  );

  check(
    'real server · a number IS now published',
    typeof servidor.score === 'number',
    String(servidor.score)
  );

  check(
    'real server · the number comes out over the APPLICABLE ones (1 of 8 complying → 13)',
    servidor.score === 13,
    `${String(servidor.score)} con ${servidor.applicableRequirements} aplicables`
  );

  check(
    'real server · the four grey evidences open a nonconformity',
    ['EV-03', 'EV-04', 'EV-05', 'EV-07'].every(evidenceId =>
      servidor.nonConformities.some(nc => nc.evidenceIds.includes(evidenceId))
    ),
    JSON.stringify(
      servidor.nonConformities.map(nc => `${nc.id}:${nc.evidenceIds.join('+')}`)
    )
  );

  check(
    'real server · all marked NO_EVIDENCIADA, none as measured',
    measurements(servidor).length === 0 && notEvidenced(servidor).length > 0,
    `${measurements(servidor).length} medidas / ${
      notEvidenced(servidor).length
    } no evidenciadas`
  );

  check(
    'real server · the agent\'s motive reaches the card',
    servidor.nonConformities.some(nc =>
      nc.finding.includes('parametro del cliente sin configurar')
    ),
    JSON.stringify(servidor.nonConformities.map(nc => nc.finding))
  );

  check(
    'real server · it still says how many requirements have been proven',
    servidor.applicableRequirements === 8 &&
      servidor.measuredRequirements === 1 &&
      servidor.unmeasuredRequirements.length === 7,
    `${servidor.applicableRequirements}/${servidor.measuredRequirements}/${servidor.unmeasuredRequirements.length}`
  );
}

section('3 · control state and denominator');

{
  const onlyCompliant = evaluateControlStatus(requirements('CUMPLE', 'CUMPLE'));

  check(
    'all proven and compliant · CUMPLE at 100',
    onlyCompliant.status === 'CUMPLE' && onlyCompliant.score === 100,
    `${onlyCompliant.status}/${String(onlyCompliant.score)}`
  );

  const unproven = evaluateControlStatus(
    requirements('CUMPLE', 'NO_EVALUABLE')
  );

  check(
    'compliant + unproven · PARCIAL, no longer NO_EVALUABLE',
    unproven.status === 'PARCIAL',
    unproven.status
  );

  check(
    'compliant + unproven · WITH a number, and it is 50',
    unproven.score === 50,
    String(unproven.score)
  );

  check(
    'compliant + unproven · still names the requirement that was not measured',
    unproven.unmeasuredRequirements.length === 1 &&
      unproven.unmeasuredRequirements[0] === 'req-1',
    JSON.stringify(unproven.unmeasuredRequirements)
  );

  const withBreach = evaluateControlStatus(
    requirements('CUMPLE', 'NO_CUMPLE')
  );

  check(
    'compliant + measured offender · PARCIAL at 50',
    withBreach.status === 'PARCIAL' && withBreach.score === 50,
    `${withBreach.status}/${String(withBreach.score)}`
  );

  check(
    'proven and unproven weigh the SAME in the number',
    unproven.score === withBreach.score &&
      unproven.status === withBreach.status,
    `${String(unproven.score)} vs ${String(withBreach.score)}`
  );

  check(
    'and still they are distinguished: 1 proven versus 2',
    unproven.measuredRequirements === 1 &&
      withBreach.measuredRequirements === 2,
    `${unproven.measuredRequirements} vs ${withBreach.measuredRequirements}`
  );

  const allUnproven = evaluateControlStatus(
    requirements('NO_EVALUABLE', 'NO_EVALUABLE')
  );

  check(
    'nothing proven · NO_CUMPLE at 0, not a grey without a number',
    allUnproven.status === 'NO_CUMPLE' && allUnproven.score === 0,
    `${allUnproven.status}/${String(allUnproven.score)}`
  );

  const denominator = evaluateControlStatus(
    requirements('CUMPLE', 'NO_CUMPLE', 'NO_EVALUABLE')
  );

  check(
    'the denominator is the APPLICABLE ones · 33, not 50',
    denominator.score === 33,
    String(denominator.score)
  );

  check(
    'the denominator is the applicable ones · the result says so (3 applicable, 2 proven)',
    denominator.applicableRequirements === 3 &&
      denominator.measuredRequirements === 2,
    `${denominator.applicableRequirements}/${denominator.measuredRequirements}`
  );

  const lyingLabel = evaluateControlStatus([
    {
      id: 'req-0',
      title: 'req-0',
      level: ['BAJO', 'MEDIO', 'ALTO'],
      status: 'CUMPLE',
      applicable: true,
      evidenced: false,
      score: 0,
      observations: [],
      evidenceIds: [],
    },
    ...requirements('CUMPLE'),
  ]);

  check(
    'a «CUMPLE» that declares itself not proven does NOT count as compliant',
    lyingLabel.status === 'PARCIAL' &&
      lyingLabel.score === 50 &&
      lyingLabel.measuredRequirements === 1,
    `${lyingLabel.status}/${String(lyingLabel.score)}/${
      lyingLabel.measuredRequirements
    }`
  );

  const notApplicable = evaluateControlStatus(requirements('NO_APLICA', 'NO_APLICA'));

  check(
    'nothing applicable · NO_APLICA and WITHOUT a number (not a red 0)',
    notApplicable.status === 'NO_APLICA' && notApplicable.score === undefined,
    `${notApplicable.status}/${String(notApplicable.score)}`
  );

  const withReinforcementOut = evaluateControlStatus(
    requirements('CUMPLE', 'CUMPLE', 'NO_APLICA')
  );

  check(
    'a NO_APLICA reinforcement does not prevent 100 %',
    withReinforcementOut.status === 'CUMPLE' &&
      withReinforcementOut.score === 100 &&
      withReinforcementOut.applicableRequirements === 2,
    `${withReinforcementOut.status}/${String(withReinforcementOut.score)}/${
      withReinforcementOut.applicableRequirements
    }`
  );
}

section('4 · consolidation across agents');

{
  check(
    'grey stays grey when consolidating EVIDENCES',
    consolidateENSStatuses(['CUMPLE', 'NO_EVALUABLE']) === 'NO_EVALUABLE',
    consolidateENSStatuses(['CUMPLE', 'NO_EVALUABLE'])
  );

  check(
    'one offending agent and one unmeasured · NO_CUMPLE (the gap does not soften it)',
    consolidateENSStatuses(['NO_CUMPLE', 'NO_EVALUABLE']) === 'NO_CUMPLE',
    consolidateENSStatuses(['NO_CUMPLE', 'NO_EVALUABLE'])
  );

  check(
    'all NO_APLICA · NO_APLICA',
    consolidateENSStatuses(['NO_APLICA', 'NO_APLICA']) === 'NO_APLICA',
    consolidateENSStatuses(['NO_APLICA', 'NO_APLICA'])
  );

  const withNumber = evaluate(evidences({ 'EV-05': 'NO_CUMPLE' }));
  const withoutAnything = evaluate(evidences(ALL_UNMEASURED));

  check(
    'the agent without data already brings a number, and it is 0',
    withoutAnything.score === 0 && withoutAnything.status === 'NO_CUMPLE',
    `${withoutAnything.status}/${String(withoutAnything.score)}`
  );

  const consolidated = consolidateAgentComplianceResultByControl(
    [
      {
        agentId: '001',
        agentName: 'CLIENTE-01',
        results: [withNumber],
        summary: undefined as never,
      },
      {
        agentId: '002',
        agentName: 'CLIENTE-02',
        results: [withoutAnything],
        summary: undefined as never,
      },
    ],
    'op.acc.1'
  );

  check(
    'consolidated · the agent that proves nothing drags the average',
    consolidated?.score ===
      Math.round(((withNumber.score as number) + (withoutAnything.score as number)) / 2),
    `${String(consolidated?.score)} de ${String(withNumber.score)} y ${String(
      withoutAnything.score
    )}`
  );

  check(
    'consolidated · the second agent\'s cards travel with their label',
    (consolidated?.nonConformities || []).some(nc => nc.id.startsWith('002:NC-')),
    JSON.stringify((consolidated?.nonConformities || []).map(nc => nc.id))
  );

  check(
    'consolidated · applicable and proven add up across agents',
    consolidated?.applicableRequirements ===
      withNumber.applicableRequirements + withoutAnything.applicableRequirements &&
      consolidated?.measuredRequirements ===
        withNumber.measuredRequirements + withoutAnything.measuredRequirements,
    `${String(consolidated?.applicableRequirements)}/${String(
      consolidated?.measuredRequirements
    )}`
  );

  const consolidatedRequirement = (consolidated?.requirements || []).find(
    item => item.id === 'op.acc.1.2'
  );

  check(
    'consolidated · one machine without proof is enough for the requirement not to have it',
    consolidatedRequirement?.evidenced === false,
    String(consolidatedRequirement?.evidenced)
  );

  const sameConsolidated = consolidateAgentComplianceResultByControl(
    [
      {
        agentId: '001',
        agentName: 'CLIENTE-01',
        results: [withoutAnything],
        summary: undefined as never,
      },
      {
        agentId: '002',
        agentName: 'CLIENTE-02',
        results: [withoutAnything],
        summary: undefined as never,
      },
    ],
    'op.acc.1'
  );

  check(
    'consolidated · the same finding on two machines is still ONE card',
    (sameConsolidated?.nonConformities || []).length ===
      withoutAnything.nonConformities.length,
    `${(sameConsolidated?.nonConformities || []).length} de ${
      withoutAnything.nonConformities.length * 2
    } sin agregar`
  );

  check(
    'consolidated · and names both machines, except for what belongs to the catalog',
    (sameConsolidated?.nonConformities || [])
      .filter(nc => nc.cause !== 'CATALOG')
      .every(nc => (nc.agents || []).length === 2) &&
      (sameConsolidated?.nonConformities || [])
        .filter(nc => nc.cause === 'CATALOG')
        .every(nc => (nc.agents || []).length === 0),
    JSON.stringify(
      (sameConsolidated?.nonConformities || []).map(
        nc => `${nc.cause}:${(nc.agents || []).length}`
      )
    )
  );
}

section('5 · global index of the main screen');

{
  const compliant2 = evaluate(evidences(), 'BAJO');
  const withoutAnything = evaluate(evidences(ALL_UNMEASURED), 'BAJO');

  const compliantControl: ENSComplianceResult = {
    ...compliant2,
    status: 'CUMPLE',
    score: 100,
  };

  const estado = buildComplianceState([compliantControl, withoutAnything]);

  check(
    'global index · the unproven control contributes its 0 (50, not 100)',
    estado.controlSummary.scoreAverage === 50,
    String(estado.controlSummary.scoreAverage)
  );

  check(
    'global index · the base is the two applicable controls',
    estado.controlSummary.measured === 2 &&
      estado.controlSummary.totalControls === 2,
    `${estado.controlSummary.measured}/${estado.controlSummary.totalControls}`
  );

  const notApplicable: ENSComplianceResult = {
    ...compliant2,
    status: 'NO_APLICA',
    score: undefined,
  };

  const withNotApplicable = buildComplianceState([compliantControl, notApplicable]);

  check(
    'global index · a NO_APLICA control does not lower the index',
    withNotApplicable.controlSummary.scoreAverage === 100 &&
      withNotApplicable.controlSummary.measured === 1,
    `${withNotApplicable.controlSummary.scoreAverage}/${withNotApplicable.controlSummary.measured}`
  );

  const stateWithAgents = buildComplianceState(
    [compliantControl, withoutAnything],
    [
      {
        agentId: '001',
        agentName: 'CLIENTE-01',
        results: [compliant2],
        summary: undefined as never,
      },
      {
        agentId: '002',
        agentName: 'CLIENTE-02',
        results: [withoutAnything],
        summary: undefined as never,
      },
    ]
  );

  check(
    'agents · the machine that has proven nothing counts as «sin resultados»',
    stateWithAgents.agentSummary.totalAgents === 2 &&
      stateWithAgents.agentSummary.agentsWithResults === 1 &&
      stateWithAgents.agentSummary.agentsWithoutResults === 1,
    JSON.stringify(stateWithAgents.agentSummary)
  );
}

section('6 · the four causes have different text and action');

{
  const withConfiguration = evaluate(evidences(), 'MEDIO', FULL_CONFIGURATION);

  const byCatalog = notEvidenced(withConfiguration).filter(
    nc => nc.cause === 'CATALOG'
  );

  check(
    'catalog cause · there are two, and the action is to declare them in the catalog',
    byCatalog.length === 2 &&
      byCatalog.every(nc =>
        nc.requiredAction.startsWith('Declarar en el catálogo')
      ),
    JSON.stringify(byCatalog.map(nc => nc.requirementId))
  );

  const unconfigured = evaluate(evidences(), 'MEDIO', EMPTY_CONFIGURATION);

  const byConfiguration = notEvidenced(unconfigured).filter(
    nc => nc.cause === 'CONFIGURATION' && nc.id !== 'NC-CFG'
  );

  check(
    'configuration cause · the anchor is CONFIG, never a green evidence',
    byConfiguration.length > 0 &&
      byConfiguration.every(
        nc => nc.evidenceIds.length === 0 && nc.evidenceId === 'CONFIG'
      ),
    JSON.stringify(byConfiguration.map(nc => nc.evidenceId))
  );

  check(
    'configuration cause · the action names the specific parameter',
    byConfiguration.every(
      nc =>
        nc.parameterIds.length > 0 &&
        nc.requiredAction.includes(nc.parameterIds[0])
    ),
    JSON.stringify(byConfiguration.map(nc => nc.requiredAction))
  );

  const byEvidence = notEvidenced(
    evaluate(evidences({ 'EV-04': 'NO_EVALUABLE' }))
  ).filter(nc => nc.evidenceIds.includes('EV-04'));

  check(
    'evidence cause · the action points to the producer, not to "revisar las evidencias"',
    byEvidence.length > 0 &&
      byEvidence.every(
        nc =>
          nc.cause === 'EVIDENCE' &&
          nc.requiredAction.includes('productor') &&
          !nc.requiredAction.includes('Revisar')
      ),
    JSON.stringify(byEvidence.map(nc => `${nc.cause}:${nc.requiredAction}`))
  );

  check(
    'no card is presented any more as "no es un incumplimiento"',
    [...notEvidenced(withConfiguration), ...notEvidenced(unconfigured)].every(
      nc => !nc.impact.includes('No es un incumplimiento')
    ),
    ''
  );

  check(
    'all say the burden of proof lies with the audited party',
    [...notEvidenced(withConfiguration), ...notEvidenced(unconfigured)].every(
      nc => nc.impact.includes('carga de la prueba')
    ),
    ''
  );
}

section('7 · the downed agent: same verdict, another culprit and another action');

{
  const agentDeclares = evaluate(
    evidences(
      { 'EV-04': 'NO_EVALUABLE' },
      { 'EV-04': 'P-05 no configurado en el agente' },
      { 'EV-04': 'EVIDENCE' }
    )
  );

  const downedAgent = evaluate(
    evidences({ 'EV-04': 'NO_EVALUABLE' }, {}, { 'EV-04': 'COLLECTION' })
  );

  check(
    'downed agent · the control\'s verdict is the SAME as if the agent reports',
    agentDeclares.status === downedAgent.status &&
      agentDeclares.score === downedAgent.score,
    `${agentDeclares.status}/${String(agentDeclares.score)} vs ${
      downedAgent.status
    }/${String(downedAgent.score)}`
  );

  const downedCard = card(downedAgent, 'op.acc.1.4');
  const declaringCard = card(agentDeclares, 'op.acc.1.4');

  check(
    'downed agent · the published cause is COLLECTION, not EVIDENCE',
    downedCard?.cause === 'COLLECTION' && declaringCard?.cause === 'EVIDENCE',
    `${String(downedCard?.cause)} vs ${String(declaringCard?.cause)}`
  );

  check(
    'downed agent · the motive says it is a COLLECTION failure',
    downedCard!.finding.includes('RECOGIDA'),
    downedCard!.finding
  );

  check(
    'downed agent · the motive denies it is a finding about the machine',
    downedCard!.finding.includes('NO un hallazgo sobre la máquina'),
    downedCard!.finding
  );

  check(
    'downed agent · the action is to restore collection, not to fix the system',
    downedCard!.requiredAction.includes('Restablecer la RECOGIDA') &&
      downedCard!.requiredAction.includes(
        'no una corrección en el sistema auditado'
      ),
    downedCard!.requiredAction
  );

  check(
    'downed agent · and the action is NOT the same as when the agent does report',
    downedCard!.requiredAction !== declaringCard!.requiredAction,
    ''
  );

  const trulyBreaches = evaluate(evidences({ 'EV-04': 'NO_CUMPLE' }));

  check(
    'downed agent · a measured breach of the same requirement does send to review',
    card(trulyBreaches, 'op.acc.1.4')?.origin === 'MEDIDA' &&
      !card(trulyBreaches, 'op.acc.1.4')!.requiredAction.includes(
        'RECOGIDA'
      ),
    String(card(trulyBreaches, 'op.acc.1.4')?.requiredAction)
  );

  const mixInSameRequirement = evaluate(
    evidences(
      { 'EV-04': 'NO_EVALUABLE', 'EV-08': 'NO_EVALUABLE' },
      {},
      { 'EV-04': 'COLLECTION', 'EV-08': 'EVIDENCE' }
    )
  );

  check(
    'one that does not arrive and another that arrives wrong · collection is not blamed',
    card(mixInSameRequirement, 'op.acc.1.4')?.cause === 'EVIDENCE',
    String(card(mixInSameRequirement, 'op.acc.1.4')?.cause)
  );
}

section('8 · full pipeline from the agent\'s events');

{
  const alert = (data: Record<string, unknown>, index: number) => ({
    _id: `alerta-${index}`,
    _source: {
      '@timestamp': '2026-07-28T23:30:00Z',
      agent: { id: '001', name: 'CLIENTE-01' },
      rule: { id: '106801', description: 'ENSFacil op.acc.1' },
      location: 'ensfacil',
      data,
    },
  });

  const evidenceState = (
    evidenceId: string,
    estado: string,
    motive?: string
  ) => ({
    ensfacil: 'op.acc.1',
    event: 'evidence_state',
    ts: '2026-07-28T23:30:00Z',
    host: 'CLIENTE-01',
    emisor: 'score',
    evidence_id: evidenceId,
    requisito: 'op.acc.1.2',
    estado,
    nivel: 'BAJO',
    ...(motive ? { motivo: motive } : {}),
  });

  const events = normalizeWazuhAlerts(
    [
      evidenceState('EV-01', 'CUMPLE'),
      evidenceState('EV-02', 'CUMPLE'),
      evidenceState('EV-04', 'NO_EVALUABLE', 'P-05 no configurado'),
      evidenceState('EV-05', 'NO_EVALUABLE', 'P-03 no configurado'),
      evidenceState('EV-06', 'CUMPLE'),
      evidenceState('EV-07', 'NO_EVALUABLE', 'P-07 no configurado'),
      evidenceState('EV-08', 'CUMPLE'),
    ].map(alert)
  );

  const resolved = resolveEvidenceForControl(
    'op.acc.1',
    events,
    '001',
    'MEDIO',
    FULL_CONFIGURATION,
    new Date('2026-07-29T00:00:00Z')
  );

  const result = evaluateENSControl(
    CONTROL,
    FULL_CONFIGURATION,
    'MEDIO',
    resolved,
    undefined,
    events
  );

  check(
    'pipeline · the three unmeasured evidences arrive as NO_EVALUABLE',
    ['EV-04', 'EV-05', 'EV-07'].every(
      id => resolved.find(item => item.id === id)?.status === 'NO_EVALUABLE'
    ),
    JSON.stringify(resolved.map(item => `${item.id}:${item.status}`))
  );

  check(
    'pipeline · the classic evidence reported: the cause is the producer\'s',
    resolved.find(item => item.id === 'EV-04')?.gapCause === 'EVIDENCE',
    JSON.stringify(resolved.map(item => `${item.id}:${String(item.gapCause)}`))
  );

  check(
    'pipeline · the migrated ones ignore the agent\'s evidence_state: the cause is COLLECTION',
    ['EV-03', 'EV-05', 'EV-07'].every(
      id => resolved.find(item => item.id === id)?.gapCause === 'COLLECTION'
    ),
    JSON.stringify(resolved.map(item => `${item.id}:${String(item.gapCause)}`))
  );

  check(
    'pipeline · the control comes out with a verdict and a number',
    result.status !== 'NO_EVALUABLE' && typeof result.score === 'number',
    `${result.status}/${String(result.score)}`
  );

  check(
    'pipeline · there are nonconformities, and all are not-evidenced',
    result.nonConformities.length > 0 && measurements(result).length === 0,
    JSON.stringify(
      result.nonConformities.map(nc => `${nc.id}:${nc.origin}:${nc.cause}`)
    )
  );

  check(
    'pipeline · the classic evidence\'s motive («P-05 no configurado») reaches the card',
    result.nonConformities.some(nc =>
      nc.finding.includes('P-05 no configurado')
    ),
    JSON.stringify(result.nonConformities.map(nc => nc.finding))
  );

  check(
    'pipeline · the old motive of a migrated evidence does NOT leak into the card',
    !result.nonConformities.some(nc =>
      nc.finding.includes('P-07 no configurado') ||
      nc.finding.includes('P-03 no configurado')
    ),
    JSON.stringify(result.nonConformities.map(nc => nc.finding))
  );
}

section('9 · the agent that stops reporting, end to end');

{
  const resolved = resolveEvidenceForControl(
    'op.acc.1',
    [],
    '001',
    'MEDIO',
    FULL_CONFIGURATION,
    new Date('2026-07-29T00:00:00Z')
  );

  const result = evaluateENSControl(
    CONTROL,
    FULL_CONFIGURATION,
    'MEDIO',
    resolved,
    undefined,
    []
  );

  check(
    'without a single event · ALL evidences declare a collection failure',
    resolved.every(item => item.gapCause === 'COLLECTION'),
    JSON.stringify(resolved.map(item => `${item.id}:${String(item.gapCause)}`))
  );

  check(
    'without a single event · the control is NO_CUMPLE at 0, not a grey without a number',
    result.status === 'NO_CUMPLE' && result.score === 0,
    `${result.status}/${String(result.score)}`
  );

  check(
    'without a single event · requirements with evidence blame COLLECTION',
    notEvidenced(result).filter(nc => nc.cause === 'COLLECTION').length ===
      6,
    JSON.stringify(
      notEvidenced(result).map(nc => `${nc.requirementId}:${nc.cause}`)
    )
  );

  check(
    'without a single event · those that declare no evidence remain the catalog\'s',
    notEvidenced(result).filter(nc => nc.cause === 'CATALOG').length === 2,
    JSON.stringify(
      notEvidenced(result).map(nc => `${nc.requirementId}:${nc.cause}`)
    )
  );

  check(
    'without a single event · not one card accuses the machine of something measured',
    measurements(result).length === 0,
    JSON.stringify(measurements(result).map(nc => nc.requirementId))
  );
}

console.log(
  failures.length
    ? `\n${failures.length} check(s) FAIL:\n  ${failures.join('\n  ')}`
    : '\nAll checks pass.'
);

process.exit(failures.length ? 1 : 0);
