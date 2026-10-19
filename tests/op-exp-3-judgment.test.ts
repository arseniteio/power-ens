/** op.exp.3: cumulative applicability and judgment of its evidences. */
import { opExp3CatalogDefinition } from '../common/ens/catalog/op-exp-3';
import { opExp3Configuration } from '../common/ens/configuration/data/op-exp-3-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../common/ens/configuration/types';
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { evaluateRequirements } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
import { opExp3PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-exp-3.policy';
import bloqueSemilla from '../config/op-exp-3-control-block.json';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail: unknown = ''
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const NOW = new Date('2026-09-16T12:00:00Z');

let counter = 0;

const event = (
  eventType: string,
  evidenceId: string | undefined,
  attributes: Record<string, unknown>,
  timestamp = '2026-09-16T11:00:00Z'
): ENSNormalizedEvent => ({
  id: `evt-${(counter += 1)}`,
  controlId: 'op.exp.3',
  evidenceId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp,
  attributes,
});

const heartbeat = (covered: string, result = 'completada') =>
  event('collector_run', undefined, {
    resultado: result,
    evidencias_cubiertas: covered,
  });

const configuration = (
  valores: Record<string, ENSControlParameter['value']>
): ENSControlConfiguration => ({
  ...opExp3Configuration,
  parameters: opExp3Configuration.parameters.map(parameter =>
    parameter.id in valores
      ? { ...parameter, value: valores[parameter.id] }
      : { ...parameter }
  ),
});

const evidence = (
  id: string,
  events: ENSNormalizedEvent[],
  valores: Record<string, ENSControlParameter['value']>,
  level: ENSLevel = 'ALTO'
) =>
  resolveEvidenceForControl(
    'op.exp.3',
    events,
    undefined,
    level,
    configuration(valores),
    NOW
  ).find(item => item.id === id);

const applicable = (level: ENSLevel): string[] =>
  evaluateRequirements(
    opExp3CatalogDefinition.requirements,
    level,
    [],
    false,
    [],
    'ACTIVE'
  )
    .filter(requirement => requirement.applicable)
    .map(requirement => requirement.id);

section('1. Reinforcements accumulate: 6 at BAJO, 9 at MEDIO, 11 at ALTO');

{
  const base = [
    'op.exp.3.1', 'op.exp.3.2', 'op.exp.3.3',
    'op.exp.3.4', 'op.exp.3.5', 'op.exp.3.6',
  ];
  const r1 = ['op.exp.3.r1.1', 'op.exp.3.r1.2', 'op.exp.3.r1.3'];
  const r2r3 = ['op.exp.3.r2.1', 'op.exp.3.r3.1'];

  const equal = (a: string[], b: string[]) =>
    a.length === b.length && a.every(x => b.includes(x));

  check('BAJO · exactly the 6 base ones', equal(applicable('BAJO'), base), applicable('BAJO').join(','));
  check('MEDIO · base + whole R1 (9)', equal(applicable('MEDIO'), [...base, ...r1]), applicable('MEDIO').join(','));
  check('ALTO · base + R1 + R2 + R3 (11)', equal(applicable('ALTO'), [...base, ...r1, ...r2r3]), applicable('ALTO').join(','));

  check('R1 does NOT apply at BAJO', !applicable('BAJO').some(id => r1.includes(id)));

  for (const level of ['BAJO', 'MEDIO', 'ALTO'] as ENSLevel[]) {
    check(
      `${level} · R4 and R5 never in the denominator`,
      !applicable(level).includes('op.exp.3.r4.1') && !applicable(level).includes('op.exp.3.r5.1')
    );
  }

  const divergentes = opExp3CatalogDefinition.requirements.filter(requirement => {
    const decision = opExp3PolicyDefinition.requirements.find(
      item => item.requirementId === requirement.id
    );

    return (
      !decision ||
      decision.levels.join(',') !== requirement.applicability.levels.join(',') ||
      decision.evidenceIds.join(',') !== requirement.evidenceIds.join(',')
    );
  });

  check('the policy declares the same levels and evidences as the catalog', divergentes.length === 0, divergentes.map(r => r.id).join(','));

  const evidences = ENSEvidenceCatalog.filter(e => e.controlId === 'op.exp.3');

  const incoherentes = evidences.filter(e => {
    const declare = opExp3CatalogDefinition.requirements
      .filter(r => r.evidenceIds.includes(e.id))
      .map(r => r.id)
      .sort()
      .join(',');

    return declare !== [...e.requirements].sort().join(',');
  });

  check('evidences and requirements declare each other', incoherentes.length === 0, incoherentes.map(e => e.id).join(','));
}

section('2. EV-02 · the actor against P-03, and silence only with coverage');

{
  const edit = event('config_file_modified', 'EV-02', {
    actor: 'dioni',
    sesion: 'con_sesion',
    recurso: '/etc/ssh/sshd_config',
  });

  const authorized = evidence('EV-02', [edit], { 'P-03': ['dioni', 'jgomez'] });
  check('dioni in P-03 · CUMPLE', authorized?.status === 'CUMPLE', authorized?.status);

  const unauthorized = evidence('EV-02', [edit], { 'P-03': ['jgomez'] });
  check('SAME event, dioni outside P-03 · NO_CUMPLE', unauthorized?.status === 'NO_CUMPLE', unauthorized?.status);
  check('and the motive names the account', (unauthorized?.observations || []).some(o => o.includes("'dioni'")));

  const upperCase = evidence('EV-02', [edit], { 'P-03': ['Dioni'] });
  check("'Dioni' does not authorize 'dioni'", upperCase?.status === 'NO_CUMPLE', upperCase?.status);

  const coveredSilence = evidence('EV-02', [heartbeat('EV-02,EV-03')], { 'P-03': ['jgomez'] });
  check('without edits and with EV-02 covered · CUMPLE', coveredSilence?.status === 'CUMPLE', coveredSilence?.status);

  const uncoveredSilence = evidence('EV-02', [heartbeat('EV-03')], { 'P-03': ['jgomez'] });
  check('without edits and the heartbeat does NOT cover EV-02 · NO_EVALUABLE', uncoveredSilence?.status === 'NO_EVALUABLE', uncoveredSilence?.status);

  const withoutHeartbeat = evidence('EV-02', [], { 'P-03': ['jgomez'] });
  check('without edits and without heartbeat · NO_EVALUABLE (COLLECTION)', withoutHeartbeat?.status === 'NO_EVALUABLE' && withoutHeartbeat?.gapCause === 'COLLECTION', `${withoutHeartbeat?.status}/${withoutHeartbeat?.gapCause}`);

  const withoutParameter = evidence('EV-02', [edit], {});
  check('with an edit and without P-03 · NO_EVALUABLE (CONFIGURATION)', withoutParameter?.status === 'NO_EVALUABLE' && withoutParameter?.gapCause === 'CONFIGURATION', `${withoutParameter?.status}/${withoutParameter?.gapCause}`);

  const degradation = event('evidence_state', 'EV-02', { estado: 'NO_EVALUABLE', causa: 'CONFIGURATION' });
  const withDegradation = evidence('EV-02', [degradation, edit], { 'P-03': ['dioni'] });
  check('an agent degradation does not cover the fact\'s judgment', withDegradation?.status === 'CUMPLE', withDegradation?.status);
}

section('3. EV-03 · what is installed against P-01');

{
  const installation = event('software_installed', 'EV-03', { paquete: 'nmap', version: '7.94' });

  const outside = evidence('EV-03', [installation], { 'P-01': ['jq'] }, 'MEDIO');
  check('nmap outside P-01 · NO_CUMPLE', outside?.status === 'NO_CUMPLE', outside?.status);

  const inside = evidence('EV-03', [installation], { 'P-01': ['jq', 'nmap'] }, 'MEDIO');
  check('SAME event with nmap in P-01 · CUMPLE', inside?.status === 'CUMPLE', inside?.status);

  const silence = evidence('EV-03', [heartbeat('EV-03')], { 'P-01': ['jq'] }, 'MEDIO');
  check('without installations and record read · CUMPLE', silence?.status === 'CUMPLE', silence?.status);

  const atBajo = evidence('EV-03', [installation], { 'P-01': ['jq'] }, 'BAJO');
  check('at BAJO it does not apply', atBajo?.status === 'NO_APLICA', atBajo?.status);
}

section('4. EV-04 · each service in its profile\'s cell');

{
  const services = [
    event('service_running', 'EV-04', { perfil: 'wazuh-real', servicio: 'ssh.service' }),
    event('service_running', 'EV-04', { perfil: 'wazuh-real', servicio: 'cron.service' }),
  ];

  const policy = ['wazuh-real | ssh.service,cron.service'];

  const compliant2 = evidence('EV-04', services, { 'P-02': policy }, 'BAJO');
  check('all in the profile\'s cell · CUMPLE', compliant2?.status === 'CUMPLE', compliant2?.status);

  const listener = event('service_running', 'EV-04', { perfil: 'wazuh-real', servicio: 'proceso:nc' });
  const withListener = evidence('EV-04', [...services, listener], { 'P-02': policy }, 'BAJO');
  check('a process listening outside the list · NO_CUMPLE', withListener?.status === 'NO_CUMPLE', withListener?.status);

  const authorized = evidence('EV-04', [...services, listener], { 'P-02': ['wazuh-real | ssh.service,cron.service,proceso:nc'] }, 'BAJO');
  check('SAME events with process:nc authorized · CUMPLE', authorized?.status === 'CUMPLE', authorized?.status);

  const withoutRow = evidence('EV-04', services, { 'P-02': ['otro-host | ssh.service'] }, 'BAJO');
  check('profile without a row · NO_EVALUABLE (CONFIGURATION), not NO_CUMPLE', withoutRow?.status === 'NO_EVALUABLE' && withoutRow?.gapCause === 'CONFIGURATION', `${withoutRow?.status}/${withoutRow?.gapCause}`);

  const withoutFacts = evidence('EV-04', [heartbeat('EV-02,EV-03,EV-04')], { 'P-02': policy }, 'BAJO');
  check('without observed services it does not comply even with a heartbeat', withoutFacts?.status === 'NO_EVALUABLE', withoutFacts?.status);
}

section('5. EV-08 · the count against P-09, never by absence');

{
  const tally = event('config_admins_observed', 'EV-08', { administradores: 4, cuentas: 'a,b,c,d' });

  const exceeds = evidence('EV-08', [tally], { 'P-09': 3 });
  check('4 administrators with maximum 3 · NO_CUMPLE', exceeds?.status === 'NO_CUMPLE', exceeds?.status);

  const admits = evidence('EV-08', [tally], { 'P-09': 5 });
  check('SAME event with maximum 5 · CUMPLE', admits?.status === 'CUMPLE', admits?.status);

  const silence = evidence('EV-08', [heartbeat('EV-02,EV-03,EV-08')], { 'P-09': 3 });
  check('without a count (incomplete window) · NO_EVALUABLE even with a heartbeat', silence?.status === 'NO_EVALUABLE', silence?.status);

  const enMedio = evidence('EV-08', [tally], { 'P-09': 3 }, 'MEDIO');
  check('at MEDIO it does not apply', enMedio?.status === 'NO_APLICA', enMedio?.status);
}

section('6. EV-09 and EV-11 · age against the clock');

{
  const copy = event('config_backup_observed', 'EV-09', { fecha: '2026-09-16T02:00:00Z' });

  const fresh = evidence('EV-09', [copy], { 'P-10': 24 });
  check('backup from 10 h ago with a 24 h deadline · CUMPLE', fresh?.status === 'CUMPLE', fresh?.status);

  const old2 = evidence('EV-09', [copy], { 'P-10': 6 });
  check('SAME backup with a 6 h deadline · NO_CUMPLE', old2?.status === 'NO_CUMPLE', old2?.status);

  const withoutBackup = evidence('EV-09', [heartbeat('EV-02,EV-03,EV-09')], { 'P-10': 24 });
  check('without a backup it never complies', withoutBackup?.status === 'NO_EVALUABLE', withoutBackup?.status);

  const verification = event('baseline_verification_performed', 'EV-11', { fecha: '2026-08-01', alcance: 'servidores' });

  const onTime = evidence('EV-11', [verification], { 'P-05': 90 }, 'MEDIO');
  check('verification from 46 days ago with periodicity 90 · CUMPLE', onTime?.status === 'CUMPLE', onTime?.status);

  const pastDeadline = evidence('EV-11', [verification], { 'P-05': 30 }, 'MEDIO');
  check('SAME verification with periodicity 30 · NO_CUMPLE', pastDeadline?.status === 'NO_CUMPLE', pastDeadline?.status);
}

section('7. EV-01, EV-05, EV-06, EV-07 and EV-10 do not accredit with what the agent emits');

{
  const withoutSource = ['EV-01', 'EV-05', 'EV-06', 'EV-07', 'EV-10'];

  for (const id of withoutSource) {
    const declared2 = ENSEvidenceCatalog.find(e => e.controlId === 'op.exp.3' && e.id === id);

    check(`${id} · without judgment, no accredited rule`, !declared2?.judgment && (declared2?.relatedRules.length ?? 1) === 0);

    const degraded2 = evidence(id, [
      event('evidence_state', id, { estado: 'NO_EVALUABLE', causa: 'COLLECTION', motivo: 'sin fuente' }, '2026-09-16T11:00:00Z'),
      heartbeat('EV-02,EV-03'),
    ], {});

    check(`${id} · with the agent's degradation it comes out NO_EVALUABLE`, degraded2?.status === 'NO_EVALUABLE', degraded2?.status);
  }

  const resolved = resolveEvidenceForControl('op.exp.3', [], undefined, 'BAJO', configuration({}), NOW);
  const requirements = evaluateRequirements(opExp3CatalogDefinition.requirements, 'BAJO', resolved, false, [], 'ACTIVE');
  const dos = requirements.find(r => r.id === 'op.exp.3.2');

  check('op.exp.3.2 · NO_CUMPLE and marked as not evidenced', dos?.status === 'NO_CUMPLE' && dos?.evidenced === false, `${dos?.status}/${dos?.evidenced}`);

  const control = evaluateControlStatus(requirements);
  check('the control measuring nothing does not comply', control.status === 'NO_CUMPLE', control.status);
}

section('8. op.exp.3.r1.1 is accredited by document, and the example does not accredit');

{
  const r11 = opExp3CatalogDefinition.requirements.find(r => r.id === 'op.exp.3.r1.1')!;

  check('r1.1 declares no technical evidence', r11.evidenceIds.length === 0);

  const judges = (row: string) =>
    evaluateRequirements(
      [r11],
      'MEDIO',
      [],
      false,
      [],
      'ACTIVE',
      parseRequirementAttestations(configuration({ 'P-ATT': [row] }))
    )[0];

  const example = opExp3Configuration.parameters.find(p => p.id === 'P-ATT')!.example || '';

  const withExample2 = judges(example);
  check('copying the example as is does NOT accredit', withExample2.status === 'NO_CUMPLE' && !withExample2.attested, `${withExample2.status}/${withExample2.attested}`);

  const withDocument = judges(example.replace(/https:\/\/EJEMPLO\.invalido\/[^ |]+/, 'https://intranet/linea-base-v3.pdf'));
  check('with a real link it DOES accredit, marked as attestation', withDocument.status === 'CUMPLE' && withDocument.attested === true, `${withDocument.status}/${withDocument.attested}`);
}

section('9. Examples are valid values and the seed block says the same');

{
  for (const parameter of opExp3Configuration.parameters) {
    const example = parameter.example || '';
    const valor = parameter.type === 'list' || parameter.type === 'table' ? [example] : example;
    const verdict = validateParameterValue(parameter, valor);

    check(`${parameter.id} · its example is valid`, verdict.valid, verdict.reason);
  }

  const seed = bloqueSemilla as unknown as { parameters: ENSControlParameter[] };

  const diverge = opExp3Configuration.parameters.filter(parameter => {
    const asBlock = seed.parameters.find(p => p.id === parameter.id);

    return (
      !asBlock ||
      asBlock.type !== parameter.type ||
      asBlock.required !== parameter.required ||
      asBlock.levels.join(',') !== parameter.levels.join(',') ||
      JSON.stringify(asBlock.columns || []) !== JSON.stringify(parameter.columns || [])
    );
  });

  check('the seed block matches the TypeScript', diverge.length === 0 && seed.parameters.length === opExp3Configuration.parameters.length, diverge.map(p => p.id).join(','));

  check(
    'no parameter carries a symbolic rule ID',
    seed.parameters.every(p => (p.ruleIds || []).every(r => /^\d+$/.test(r)))
  );

  const mandatory = opExp3Configuration.parameters.filter(p => p.required).map(p => p.id).sort();
  check('mandatory: P-02, P-03 and P-04', mandatory.join(',') === 'P-02,P-03,P-04', mandatory.join(','));
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
