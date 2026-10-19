/** op.acc.3 correlation: incompatible functions in the same account. */
import { opAcc3PolicyDefinition } from '../common/ens/core/policy-runtime/policies/op-acc-3.policy';
import { buildPolicyContext } from '../common/ens/core/policy-runtime/policy-context-builder';
import { opAcc3CatalogDefinition } from '../common/ens/catalog/op-acc-3';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../common/ens/configuration/types';
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';

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

const action = (
  user: string,
  executedAction: string,
  ruta: string = ''
): ENSNormalizedEvent => ({
  id: `act-${(counter += 1)}`,
  controlId: 'op.acc.3',
  eventType: 'account_action',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-08-06T10:00:00Z',
  attributes: { usuario: user, accion: executedAction, ruta },
});

const tarea = (
  name: string,
  user: string
): ENSNormalizedEvent => ({
  id: `task-${(counter += 1)}`,
  controlId: 'op.acc.3',
  eventType: 'critical_task_run',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-08-06T10:00:00Z',
  attributes: { tarea: name, usuario: user },
});

const parameter = (
  id: string,
  value: string[] | number
): ENSControlParameter =>
  ({
    id,
    controlId: 'op.acc.3',
    name: id,
    label: id,
    description: '',
    levels: ['MEDIO', 'ALTO'],
    requirements: [],
    type: Array.isArray(value) ? 'table' : 'number',
    example: '',
    required: true,
    wazuhUsage: '',
    ensfacilUsage: '',
    evidenceIds: [],
    ruleIds: [],
    ifNotConfigured: '',
    value,
  }) as unknown as ENSControlParameter;

const configuration = (
  parameters: ENSControlParameter[]
): ENSControlConfiguration =>
  ({
    controlId: 'op.acc.3',
    controlName: 'Segregación de funciones y tareas',
    family: 'Marco operacional',
    enabled: true,
    applicableLevels: ['MEDIO', 'ALTO'],
    parameters,
  }) as ENSControlConfiguration;

const P03 = parameter('P-03', [
  'desarrollo | git | /srv/repos',
  'operacion | systemctl | /etc/init.d',
  'configuracion | visudo | /etc/sudoers',
  'auditoria | /var/log/audit | ausearch',
]);

const HEARTBEAT: ENSNormalizedEvent = {
  id: 'latido-fixture',
  controlId: 'op.acc.3',
  eventType: 'collector_run',
  sourceType: 'WAZUH_ALERT',
  timestamp: new Date().toISOString(),
};

const P02 = parameter('P-02', [
  'desarrollo | operacion',
  'autorizacion | control',
  'configuracion | mantenimiento',
  'auditoria | *',
]);

const judges = (
  events: ENSNormalizedEvent[],
  parameters: ENSControlParameter[]
) => {
  const evaluator = opAcc3PolicyDefinition.evaluator;

  if (!evaluator) {
    throw new Error('broken fixture: op.acc.3 should have an evaluator');
  }

  return evaluator(
    buildPolicyContext(
      opAcc3CatalogDefinition,
      configuration(parameters),
      'ALTO',
      events,
      []
    )
  );
};

const verdict = (
  result: ReturnType<typeof judges>,
  requirement: string
) =>
  result.decisions.find(
    decision => decision.requirementId === requirement
  );

section('1. Without P-02 or P-03 there is nothing to cross');

{
  const withoutP03 = judges(
    [action('pgarcia', '/usr/bin/git'), action('pgarcia', '/usr/bin/systemctl')],
    [P02]
  );

  const d = verdict(withoutP03, 'op.acc.3.1');

  check(
    'without P-03 the requirement comes out NO_EVALUABLE, not NO_CUMPLE',
    d?.status === 'NO_EVALUABLE',
    d?.status
  );

  check(
    'and the motive NAMES the missing parameter',
    (d?.reason || '').includes('P-03'),
    d?.reason
  );

  const withoutP02 = judges(
    [action('pgarcia', '/usr/bin/git')],
    [P03]
  );

  check(
    'without P-02 neither, and it names P-02',
    verdict(withoutP02, 'op.acc.3.1')?.status === 'NO_EVALUABLE' &&
      (verdict(withoutP02, 'op.acc.3.1')?.reason || '').includes('P-02'),
    verdict(withoutP02, 'op.acc.3.1')?.reason
  );
}

section('2. Two incompatible functions in the SAME account');

{
  const breaches = judges(
    [
      action('pgarcia', '/usr/bin/git', '/srv/repos/app'),
      action('pgarcia', '/usr/bin/systemctl'),
    ],
    [P02, P03]
  );

  const d = verdict(breaches, 'op.acc.3.1');

  check(
    'an account that develops and operates breaches',
    d?.status === 'NO_CUMPLE',
    d?.status
  );

  check(
    'and the motive names the account and the two functions',
    (d?.reason || '').includes('pgarcia') &&
      (d?.reason || '').includes('desarrollo'),
    d?.reason
  );

  const complies = judges(
    [
      action('jgomez', '/usr/bin/git', '/srv/repos/app'),
      action('mlopez', '/usr/bin/systemctl'),
    ],
    [P02, P03]
  );

  check(
    'the same two actions by TWO different people comply',
    verdict(complies, 'op.acc.3.1')?.status === 'CUMPLE',
    verdict(complies, 'op.acc.3.1')?.status
  );

  const unaSola = judges(
    [action('pgarcia', '/usr/bin/git', '/srv/repos/app')],
    [P02, P03]
  );

  check(
    'an account with ONE function complies',
    verdict(unaSola, 'op.acc.3.1')?.status === 'CUMPLE',
    verdict(unaSola, 'op.acc.3.1')?.status
  );
}

section('3. `auditoria | *` is exhaustive (op.acc.3.r1.2)');

{
  const breaches = judges(
    [
      action('auditor2', '/usr/bin/ausearch'),
      action('auditor2', '/usr/sbin/visudo', '/etc/sudoers'),
    ],
    [P02, P03]
  );

  check(
    'audit + configuration breaches through the wildcard',
    verdict(breaches, 'op.acc.3.r1.2')?.status === 'NO_CUMPLE',
    verdict(breaches, 'op.acc.3.r1.2')?.status
  );

  const complies = judges(
    [action('auditor1', '/usr/bin/ausearch')],
    [P02, P03]
  );

  check(
    'an account that ONLY audits complies',
    verdict(complies, 'op.acc.3.r1.2')?.status === 'CUMPLE',
    verdict(complies, 'op.acc.3.r1.2')?.status
  );
}

section('4. Critical tasks: two people or it does not count');

{
  const P04 = parameter('P-04', [
    'despliegue en produccion | 2',
    'cambio de cortafuegos | 2',
  ]);

  const unaSola = judges(
    [tarea('despliegue en produccion', 'pgarcia')],
    [P02, P03, P04]
  );

  const d = verdict(unaSola, 'op.acc.3.2');

  check(
    'a critical task with ONE person breaches',
    d?.status === 'NO_CUMPLE',
    d?.status
  );

  check(
    'and the motive says how many there were and how many were required',
    (d?.reason || '').includes('pgarcia') &&
      (d?.reason || '').includes('2'),
    d?.reason
  );

  const dos = judges(
    [
      tarea('despliegue en produccion', 'jgomez'),
      tarea('despliegue en produccion', 'mlopez'),
    ],
    [P02, P03, P04]
  );

  check(
    'the same task with TWO people complies',
    verdict(dos, 'op.acc.3.2')?.status === 'CUMPLE',
    verdict(dos, 'op.acc.3.2')?.status
  );

  const duplicate = judges(
    [
      tarea('despliegue en produccion', 'pgarcia'),
      tarea('despliegue en produccion', 'pgarcia'),
    ],
    [P02, P03, P04]
  );

  check(
    'the same person twice are NOT two people',
    verdict(duplicate, 'op.acc.3.2')?.status === 'NO_CUMPLE',
    verdict(duplicate, 'op.acc.3.2')?.status
  );
}

section('5. A task that was not executed does not breach');

{
  const P04 = parameter('P-04', ['restauracion de copia | 2']);

  const withoutExecution = judges([HEARTBEAT], [P02, P03, P04]);

  check(
    'without any execution, the general statement complies',
    verdict(withoutExecution, 'op.acc.3.2')?.status === 'CUMPLE',
    verdict(withoutExecution, 'op.acc.3.2')?.status
  );

  const executedBadly = judges(
    [tarea('restauracion de copia', 'pgarcia')],
    [P02, P03, P04]
  );

  check(
    'but as soon as it runs with a single person, it accuses',
    verdict(executedBadly, 'op.acc.3.2')?.status === 'NO_CUMPLE',
    verdict(executedBadly, 'op.acc.3.2')?.status
  );

  const withoutP04 = judges([tarea('lo que sea', 'x')], [P02, P03]);

  check(
    'without P-04 the general statement comes out NO_EVALUABLE naming it',
    verdict(withoutP04, 'op.acc.3.2')?.status === 'NO_EVALUABLE' &&
      (verdict(withoutP04, 'op.acc.3.2')?.reason || '').includes('P-04'),
    verdict(withoutP04, 'op.acc.3.2')?.reason
  );
}

section('6. Without observed actions, nobody combines functions');

{
  const silence = judges([HEARTBEAT], [P02, P03]);

  check(
    'without actions, the three requirements that only measure the crossing comply',
    ['op.acc.3.1', 'op.acc.3.r1.1', 'op.acc.3.r1.2'].every(
      requirement => verdict(silence, requirement)?.status === 'CUMPLE'
    ),
    ['op.acc.3.1', 'op.acc.3.r1.1', 'op.acc.3.r1.2']
      .map(r => `${r}=${verdict(silence, r)?.status}`)
      .join(' ')
  );

  check(
    'and op.acc.3.2 does NOT comply by silence if P-04 is missing',
    verdict(silence, 'op.acc.3.2')?.status === 'NO_EVALUABLE' &&
      (verdict(silence, 'op.acc.3.2')?.reason || '').includes('P-04'),
    verdict(silence, 'op.acc.3.2')?.reason
  );

  const completeSilence = judges(
    [HEARTBEAT],
    [P02, P03, parameter('P-04', ['despliegue en produccion | 2'])]
  );

  check(
    'with P-04 declared, the same silence does comply',
    verdict(completeSilence, 'op.acc.3.2')?.status === 'CUMPLE',
    verdict(completeSilence, 'op.acc.3.2')?.status
  );

  check(
    'and the motive says so, instead of pretending something was measured',
    (verdict(silence, 'op.acc.3.1')?.reason || '')
      .includes('No se ha observado ninguna acción'),
    verdict(silence, 'op.acc.3.1')?.reason
  );
}

section('7. Every decision comes out with its full trace');

{
  const result = judges(
    [
      action('pgarcia', '/usr/bin/git', '/srv/repos/app'),
      action('pgarcia', '/usr/bin/systemctl'),
    ],
    [P02, P03]
  );

  check(
    'no decision comes out without policyId',
    result.decisions.every(decision => Boolean(decision.policyId)),
    result.decisions.filter(d => !d.policyId).length + ' sin policyId'
  );

  check(
    'no decision comes out without a trace',
    result.decisions.every(decision => Boolean(decision.trace)),
    result.decisions.filter(d => !d.trace).length + ' sin traza'
  );

  check(
    'and a breach\'s trace says what was expected and what there is',
    Boolean(verdict(result, 'op.acc.3.1')?.trace?.expected) &&
      Boolean(verdict(result, 'op.acc.3.1')?.trace?.actual),
    JSON.stringify(verdict(result, 'op.acc.3.1')?.trace)
  );
}

section('8. Every decision lands on a catalog requirement');

{
  const catalogRequirements = new Set(
    opAcc3CatalogDefinition.requirements.map(r => r.id)
  );

  const complete = judges(
    [
      action('jgomez', 'git push', '/srv/app'),
      tarea('despliegue en produccion', 'pgarcia'),
    ],
    [
      P02,
      P03,
      parameter('P-04', ['despliegue en produccion | 2']),
      parameter('P-05', ['auditoria']),
    ]
  );

  const empty = judges([HEARTBEAT], []);

  [complete, empty].forEach((result, i) => {
    const orphans = result.decisions
      .map(d => d.requirementId)
      .filter(id => !catalogRequirements.has(id));

    check(
      `all decisions exist in the catalog (${i === 0 ? 'complete config' : 'unconfigured'})`,
      orphans.length === 0,
      orphans.join(', ')
    );
  });

  const claimedEvidences = new Set(
    opAcc3CatalogDefinition.requirements.flatMap(r => r.evidenceIds)
  );

  check(
    'EV-03 (concurrency) is claimed by some requirement',
    claimedEvidences.has('EV-03'),
    Array.from(claimedEvidences).join(', ')
  );

  const concurrencyOnly = judges(
    [tarea('despliegue en produccion', 'pgarcia')],
    [P02, P03, parameter('P-04', ['despliegue en produccion | 2'])]
  );

  check(
    'concurrency tints op.acc.3.2 even if the crossing is clean',
    verdict(concurrencyOnly, 'op.acc.3.2')?.status === 'NO_CUMPLE',
    verdict(concurrencyOnly, 'op.acc.3.2')?.status
  );

  check(
    'and does not drag op.acc.3.1, which only measures the crossing',
    verdict(concurrencyOnly, 'op.acc.3.1')?.status === 'CUMPLE',
    verdict(concurrencyOnly, 'op.acc.3.1')?.status
  );
}

section('9. Without actions and without a heartbeat: NO_EVALUABLE, not CUMPLE');

{
  const heartbeat = (when: Date): ENSNormalizedEvent => ({
    id: `latido-${when.getTime()}`,
    controlId: 'op.acc.3',
    eventType: 'collector_run',
    sourceType: 'WAZUH_ALERT',
    timestamp: when.toISOString(),
  });

  const NOW = new Date(2026, 7, 7, 12, 0, 0);

  const judgesIn = (
    events: ENSNormalizedEvent[]
  ) => {
    const evaluator = opAcc3PolicyDefinition.evaluator;

    if (!evaluator) {
      throw new Error('fixture rota');
    }

    return evaluator({
      ...buildPolicyContext(
        opAcc3CatalogDefinition,
        configuration([P02, P03]),
        'ALTO',
        events,
        []
      ),
      now: NOW,
    });
  };

  const mute = judgesIn([]);

  check(
    'without actions and without a heartbeat, op.acc.3.1 does NOT comply',
    verdict(mute, 'op.acc.3.1')?.status === 'NO_EVALUABLE',
    verdict(mute, 'op.acc.3.1')?.status
  );

  check(
    'and the motive says there is no record that anybody looked',
    (verdict(mute, 'op.acc.3.1')?.reason || '').includes('latido'),
    verdict(mute, 'op.acc.3.1')?.reason
  );

  const recent = new Date(NOW);
  recent.setHours(recent.getHours() - 2);

  const swept = judgesIn([heartbeat(recent)]);

  check(
    'with a recent heartbeat, the same silence DOES comply',
    verdict(swept, 'op.acc.3.1')?.status === 'CUMPLE',
    verdict(swept, 'op.acc.3.1')?.status
  );

  const stale2 = new Date(NOW);
  stale2.setDate(stale2.getDate() - 3);

  check(
    'a heartbeat from three days ago does NOT accredit',
    verdict(judgesIn([heartbeat(stale2)]), 'op.acc.3.1')?.status === 'NO_EVALUABLE',
    verdict(judgesIn([heartbeat(stale2)]), 'op.acc.3.1')?.status
  );

  const future = new Date(NOW);
  future.setDate(future.getDate() + 5);

  check(
    'a heartbeat dated in the future does NOT accredit',
    verdict(judgesIn([heartbeat(future)]), 'op.acc.3.1')?.status === 'NO_EVALUABLE',
    verdict(judgesIn([heartbeat(future)]), 'op.acc.3.1')?.status
  );

  const withAction = judgesIn([action('jgomez', 'git push', '/srv/app')]);

  check(
    'with observed actions, the heartbeat is not needed',
    verdict(withAction, 'op.acc.3.1')?.status === 'CUMPLE',
    verdict(withAction, 'op.acc.3.1')?.status
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
