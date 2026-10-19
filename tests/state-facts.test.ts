/** STATE facts are judged by the latest observation of each evidence. */
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { ENSEvidenceCatalog } from '../common/ens/core/evidence/catalog';
import {
  getStateFactEventTypes,
  keepLatestRunStateFacts,
} from '../common/ens/core/evidence/state-facts';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import {
  buildPolicyContext,
  runPolicyRuntime,
} from '../common/ens/core/policy-runtime';
import { opExp3CatalogDefinition } from '../common/ens/catalog/op-exp-3';
import { opExp3Configuration } from '../common/ens/configuration/data/op-exp-3-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../common/ens/configuration/types';

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

let counter = 0;

const event = (
  controlId: string,
  eventType: string,
  timestamp: string,
  attributes: Record<string, unknown> = {},
  agentId = '024',
  evidenceId?: string
): ENSNormalizedEvent => ({
  id: `evt-${(counter += 1)}`,
  agentId,
  controlId,
  evidenceId,
  eventType,
  sourceType: 'WAZUH_ALERT',
  timestamp,
  attributes,
});

const heartbeat = (
  controlId: string,
  timestamp: string,
  covered: string,
  agentId = '024'
) =>
  event(
    controlId,
    'collector_run',
    timestamp,
    { resultado: 'completada', evidencias_cubiertas: covered },
    agentId
  );

const NOW = new Date('2026-09-21T18:00:00Z');

section('1. State prior to the last observation is discarded');

{
  const states = getStateFactEventTypes('op.acc.6');

  check(
    'op.acc.6 declares password_policy_checked as state',
    states.has('password_policy_checked')
  );
  check(
    'authentication_success is NOT state: it is an action',
    !states.has('authentication_success')
  );

  const events = [
    event('op.acc.6', 'password_policy_checked', '2026-09-21T11:47:03Z', { longitud_minima: '6' }, '024', 'EV-11'),
    heartbeat('op.acc.6', '2026-09-21T11:47:05Z', 'EV-11,EV-12'),
    event('op.acc.6', 'authentication_success', '2026-09-21T11:30:00Z', { usuario: 'dioni' }),
    event('op.acc.6', 'password_policy_checked', '2026-09-21T12:07:29Z', { longitud_minima: '12' }, '024', 'EV-11'),
    heartbeat('op.acc.6', '2026-09-21T12:07:31Z', 'EV-11,EV-12'),
    event('op.exp.3', 'service_running', '2026-09-21T09:00:00Z', { servicio: 'atd.service' }),
  ];

  const result = keepLatestRunStateFacts('op.acc.6', events, NOW);
  const policies = result.filter(e => e.eventType === 'password_policy_checked');

  check(
    'only the last observation\'s policy remains',
    policies.length === 1 && policies[0].attributes?.longitud_minima === '12',
    policies.map(p => String(p.attributes?.longitud_minima)).join(',')
  );
  check(
    'the earlier action is kept',
    result.some(e => e.eventType === 'authentication_success')
  );
  check(
    'other controls\' events are not touched',
    result.some(e => e.controlId === 'op.exp.3')
  );
  check(
    'heartbeats are kept (needed for coverage)',
    result.filter(e => e.eventType === 'collector_run').length === 2
  );
}

section('2. An evidence observed once in a while keeps its snapshot');

{
  const service = (name: string, ts: string) =>
    event('op.exp.3', 'service_running', ts, { perfil: 'wazuh-real', servicio: name }, '024', 'EV-04');

  const events = [
    service('atd.service', '2026-09-19T23:27:10Z'),
    heartbeat('op.exp.3', '2026-09-19T23:27:30Z', 'EV-02,EV-03,EV-04'),
    heartbeat('op.exp.3', '2026-09-20T22:27:30Z', 'EV-02,EV-03'),
    service('ssh.service', '2026-09-20T23:27:10Z'),
    heartbeat('op.exp.3', '2026-09-20T23:27:30Z', 'EV-02,EV-03,EV-04'),
    heartbeat('op.exp.3', '2026-09-21T16:27:30Z', 'EV-02,EV-03'),
    heartbeat('op.exp.3', '2026-09-21T17:27:30Z', 'EV-02,EV-03'),
  ];

  const services = keepLatestRunStateFacts('op.exp.3', events, NOW)
    .filter(e => e.eventType === 'service_running')
    .map(e => String(e.attributes?.servicio));

  check(
    'the daily inventory snapshot survives passes that do not look at it',
    services.join(',') === 'ssh.service',
    services.join(',') || '(ninguno)'
  );
}

section('3. The cut is per agent and as of the evaluation date');

{
  const policy = (v: string, ts: string, agent: string) =>
    event('op.acc.6', 'password_policy_checked', ts, { v }, agent, 'EV-11');

  const events = [
    heartbeat('op.acc.6', '2026-09-21T10:47:05Z', 'EV-11', '024'),
    policy('a-vieja', '2026-09-21T11:47:03Z', '024'),
    heartbeat('op.acc.6', '2026-09-21T11:47:05Z', 'EV-11', '024'),
    policy('a-nueva', '2026-09-21T12:07:29Z', '024'),
    heartbeat('op.acc.6', '2026-09-21T12:07:31Z', 'EV-11', '024'),
    policy('b-unica', '2026-09-21T11:24:58Z', '028'),
    heartbeat('op.acc.6', '2026-09-21T11:25:00Z', 'EV-11', '028'),
  ];

  const hoy = keepLatestRunStateFacts('op.acc.6', events, NOW)
    .filter(e => e.eventType === 'password_policy_checked')
    .map(e => String(e.attributes?.v))
    .sort();

  check(
    'each agent keeps the snapshot of ITS last observation',
    hoy.join(',') === 'a-nueva,b-unica',
    hoy.join(',')
  );

  const atNoon = keepLatestRunStateFacts(
    'op.acc.6',
    events,
    new Date('2026-09-21T12:00:00Z')
  )
    .filter(e => e.eventType === 'password_policy_checked' && e.agentId === '024')
    .map(e => String(e.attributes?.v));

  check(
    'evaluated at 12:00, a later pass does not count',
    atNoon.includes('a-vieja'),
    atNoon.join(',')
  );
}

section('4. Without declared coverage the emission prevails; with nothing, no cut');

{
  const policy = (v: string, ts: string) =>
    event('op.acc.6', 'password_policy_checked', ts, { v }, '024', 'EV-11');

  const withoutCoverage = keepLatestRunStateFacts(
    'op.acc.6',
    [
      policy('vieja', '2026-09-21T11:47:03Z'),
      heartbeat('op.acc.6', '2026-09-21T11:47:05Z', ''),
      policy('nueva', '2026-09-21T12:07:29Z'),
      heartbeat('op.acc.6', '2026-09-21T12:07:31Z', ''),
    ],
    NOW
  ).filter(e => e.eventType === 'password_policy_checked');

  check(
    'heartbeats without coverage: it cuts all the same by the last emission',
    withoutCoverage.length === 1 && withoutCoverage[0].attributes?.v === 'nueva',
    withoutCoverage.map(e => String(e.attributes?.v)).join(',')
  );

  check(
    'without any heartbeat there is nothing to delimit with: everything is kept',
    keepLatestRunStateFacts(
      'op.acc.6',
      [
        policy('vieja', '2026-09-21T11:47:03Z'),
        policy('nueva', '2026-09-21T12:07:29Z'),
      ],
      NOW
    ).filter(e => e.eventType === 'password_policy_checked').length === 2
  );

  check(
    'a single pass: there is no earlier pass to delimit with',
    keepLatestRunStateFacts(
      'op.acc.6',
      [
        policy('unica', '2026-09-21T12:07:29Z'),
        heartbeat('op.acc.6', '2026-09-21T12:07:31Z', 'EV-11'),
      ],
      NOW
    ).filter(e => e.eventType === 'password_policy_checked').length === 1
  );

  check(
    'a control with no declared states returns the same set',
    (() => {
      const events = [policy('x', '2026-09-21T12:07:29Z')];

      return keepLatestRunStateFacts('op.acc.5', events, NOW) === events;
    })()
  );
}

section('5. Everything declared as state is listened to by its evidence');

{
  const incoherent = ENSEvidenceCatalog.flatMap(evidence =>
    (evidence.stateFactEventTypes || [])
      .filter(type => !evidence.expectedEventTypes.includes(type))
      .map(type => `${evidence.controlId}/${evidence.id}:${type}`)
  );

  check(
    'no state type outside expectedEventTypes',
    incoherent.length === 0,
    incoherent.join(', ')
  );

  const forbidden = ENSEvidenceCatalog.flatMap(evidence =>
    (evidence.stateFactEventTypes || [])
      .filter(type => type === 'evidence_state' || type === 'collector_run')
      .map(type => `${evidence.controlId}/${evidence.id}:${type}`)
  );

  check(
    'neither evidence_state nor collector_run are state facts',
    forbidden.length === 0,
    forbidden.join(', ')
  );
}

section('6. op.exp.3.r1.3: a retired service stops breaching');

{
  const configuration: ENSControlConfiguration = {
    ...opExp3Configuration,
    parameters: opExp3Configuration.parameters.map(p =>
      p.id === 'P-02'
        ? { ...p, value: ['wazuh-real | ssh.service,cron.service'] }
        : p.id === 'P-03'
          ? { ...p, value: ['dioni'] }
          : p.id === 'P-04'
            ? { ...p, value: ['/etc/ssh'] }
            : ({ ...p } as ENSControlParameter)
    ),
  };

  const service = (name: string, ts: string) =>
    event('op.exp.3', 'service_running', ts, { perfil: 'wazuh-real', servicio: name }, '024', 'EV-04');

  const events = [
    heartbeat('op.exp.3', '2026-09-21T10:27:30Z', 'EV-02,EV-03,EV-04'),
    service('ssh.service', '2026-09-21T11:27:10Z'),
    service('atd.service', '2026-09-21T11:27:10Z'),
    heartbeat('op.exp.3', '2026-09-21T11:27:30Z', 'EV-02,EV-03,EV-04'),
    service('ssh.service', '2026-09-21T12:27:10Z'),
    heartbeat('op.exp.3', '2026-09-21T12:27:30Z', 'EV-02,EV-03,EV-04'),
  ];

  const verdict = (entry: ENSNormalizedEvent[]) => {
    const evidences = resolveEvidenceForControl('op.exp.3', entry, '024', 'MEDIO', configuration, NOW);
    const result = evaluateENSControl(
      opExp3CatalogDefinition,
      configuration,
      'MEDIO',
      evidences,
      runPolicyRuntime(buildPolicyContext(opExp3CatalogDefinition, configuration, 'MEDIO', entry, evidences, NOW)),
      entry
    );

    return result.requirements.find(r => r.id === 'op.exp.3.r1.3')?.status;
  };

  check(
    'with the whole window, atd from the earlier pass keeps breaching',
    verdict(events) === 'NO_CUMPLE',
    String(verdict(events))
  );

  check(
    'with the last observation, r1.3 CUMPLE',
    verdict(keepLatestRunStateFacts('op.exp.3', events, NOW)) === 'CUMPLE',
    String(verdict(keepLatestRunStateFacts('op.exp.3', events, NOW)))
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
