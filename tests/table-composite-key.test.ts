/** A matrix row is identified by SUBJECT AND RESOURCE, not by subject alone. */
import type { ENSNormalizedEvent } from '../common/ens/core/data-source/types';
import { resolveEvidenceForControl } from '../common/ens/core/evidence/engine';
import { opAcc4Configuration } from '../common/ens/configuration/data/op-acc-4-parameters';
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

const NOW = new Date('2026-09-23T12:00:00Z');

let counter = 0;

const fact = (
  subject: string,
  resource: string,
  access: string
): ENSNormalizedEvent => ({
  id: `evt-${(counter += 1)}`,
  agentId: '024',
  controlId: 'op.acc.4',
  evidenceId: 'EV-02',
  eventType: 'privilege_grant',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-09-23T11:00:00Z',
  attributes: { sujeto: subject, recurso: resource, acceso: access },
});

const heartbeat = (): ENSNormalizedEvent => ({
  id: `evt-${(counter += 1)}`,
  agentId: '024',
  controlId: 'op.acc.4',
  eventType: 'collector_run',
  sourceType: 'WAZUH_ALERT',
  timestamp: '2026-09-23T11:00:30Z',
  attributes: { resultado: 'completada', evidencias_cubiertas: 'EV-02' },
});

const configuration = (matrix: string[]): ENSControlConfiguration => ({
  ...opAcc4Configuration,
  parameters: opAcc4Configuration.parameters.map(parameter =>
    parameter.id === 'P-01'
      ? ({ ...parameter, value: matrix } as ENSControlParameter)
      : ({ ...parameter } as ENSControlParameter)
  ),
});

const stateEv02 = (matrix: string[], facts: ENSNormalizedEvent[]) =>
  resolveEvidenceForControl(
    'op.acc.4',
    [...facts, heartbeat()],
    '024',
    'MEDIO',
    configuration(matrix),
    NOW
  ).find(evidence => evidence.id === 'EV-02');

section('1. Each privilege is judged against ITS resource\'s row');

{
  const matrix = [
    'root | sudo | ALL=(ALL:ALL) ALL,ALL=(ALL) NOPASSWD:ALL',
    'root | cortafuegos | administracion del cortafuegos del sistema',
  ];

  const result = stateEv02(matrix, [
    fact('root', 'sudo', 'ALL=(ALL:ALL) ALL'),
    fact('root', 'sudo', 'ALL=(ALL) NOPASSWD:ALL'),
    fact('root', 'cortafuegos', 'administracion del cortafuegos del sistema'),
  ]);

  check(
    'the three declared privileges COMPLY',
    result?.status === 'CUMPLE',
    `${result?.status}: ${(result?.observations || []).join(' ¦ ').slice(0, 200)}`
  );
}

section('2. What is not declared is still a finding');

{
  const matrix = [
    'root | sudo | ALL=(ALL:ALL) ALL',
    'root | cortafuegos | administracion del cortafuegos del sistema',
  ];

  const withExtraAccess = stateEv02(matrix, [
    fact('root', 'sudo', 'ALL=(ALL) NOPASSWD:ALL'),
  ]);

  check(
    'an access that the resource\'s row does not declare does NOT comply',
    withExtraAccess?.status === 'NO_CUMPLE',
    String(withExtraAccess?.status)
  );

  const resourceWithoutRow = stateEv02(matrix, [
    fact('root', 'base de datos', 'lectura y escritura'),
  ]);

  check(
    'a resource without a row is not taken as good: there is no policy to measure against',
    resourceWithoutRow?.status !== 'CUMPLE',
    String(resourceWithoutRow?.status)
  );

  const otherSubject = stateEv02(matrix, [
    fact('invitado', 'sudo', 'ALL=(ALL:ALL) ALL'),
  ]);

  check(
    'another subject with the same resource does not inherit root\'s row either',
    otherSubject?.status !== 'CUMPLE',
    String(otherSubject?.status)
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
