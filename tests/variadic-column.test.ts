/** A table whose last column repeats. */
import { validateParameterValue } from '../common/ens/configuration/services/parameter-value-validator';
import type { ENSControlParameter } from '../common/ens/configuration/types';

declare const process: { exit(code: number): void };

const failures: string[] = [];

const check = (
  name: string,
  condition: boolean,
  detail?: unknown
): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  console.log(`  FAIL ${name}${detail !== undefined ? ` — ${String(detail)}` : ''}`);
  failures.push(name);
};

const section = (title: string): void => console.log(`\n${title}`);

const tabla = (
  variadic: boolean,
  value: string[]
): ENSControlParameter =>
  ({
    id: 'P-03',
    controlId: 'op.acc.3',
    name: 'acciones_por_funcion',
    label: 'Acciones por función',
    description: 'd',
    type: 'table',
    required: true,
    levels: ['MEDIO'],
    requirements: [],
    ruleIds: [],
    evidenceIds: [],
    wazuhUsage: '-',
    ensfacilUsage: '-',
    ifNotConfigured: '-',
    value,
    columns: [
      { name: 'funcion', label: 'Función', type: 'identifier', required: true },
      {
        name: 'indicadores',
        label: 'Indicadores',
        type: 'string',
        required: false,
        ...(variadic ? { variadic: true } : {}),
      },
    ],
  } as unknown as ENSControlParameter);

const REAL_ROWS = [
  'desarrollo | /usr/bin/git',
  'operacion | /usr/bin/systemctl',
  'configuracion | /usr/bin/nano | /usr/bin/vim | /usr/bin/tee',
  'mantenimiento | /usr/bin/apt | /usr/bin/dpkg | /usr/bin/apt-get',
  'auditoria | /usr/sbin/ausearch | /usr/sbin/auditctl | /var/log/audit',
];

section('1. The last repeatable column admits the real rows');

{
  const verdict = validateParameterValue(
    tabla(true, REAL_ROWS),
    REAL_ROWS
  );

  check(
    'wazuh-real\'s 5 rows are valid',
    verdict.valid === true,
    verdict.reason
  );

  const twoCells = ['desarrollo | /usr/bin/git'];

  check(
    'a row with only two cells is still valid',
    validateParameterValue(tabla(true, twoCells), twoCells).valid === true
  );
}

section('2. A normal table still rejects extra cells');

{
  const verdict = validateParameterValue(
    tabla(false, REAL_ROWS),
    REAL_ROWS
  );

  check(
    'without `variadic`, the four-cell row is rejected',
    verdict.valid === false,
    verdict.reason
  );

  check(
    'and the motive says which row and how many fields it brings',
    (verdict.reason || '').includes('4 campos'),
    verdict.reason
  );

  const wellWritten = [
    'desarrollo | /usr/bin/git',
    'operacion | /usr/bin/systemctl',
  ];

  check(
    'and with two-cell rows, the fixed-arity table is valid',
    validateParameterValue(tabla(false, wellWritten), wellWritten).valid === true,
    validateParameterValue(tabla(false, wellWritten), wellWritten).reason
  );
}

section('3. A cell can declare several comma-separated values');

{
  const withType = (
    type: string,
    value: string[]
  ): ENSControlParameter =>
    ({
      id: 'P-07',
      controlId: 'op.acc.4',
      name: 'recursos_sensibles',
      label: 'Recursos sensibles',
      description: 'd',
      type: 'table',
      required: true,
      levels: ['MEDIO'],
      requirements: [],
      ruleIds: [],
      evidenceIds: [],
      wazuhUsage: '-',
      ensfacilUsage: '-',
      ifNotConfigured: '-',
      value,
      columns: [
        { name: 'recurso', label: 'Recurso', type: 'path', required: true },
        { name: 'perfiles', label: 'Perfiles', type: type, required: false },
      ],
    } as unknown as ENSControlParameter);

  const TWO_PROFILES = ['/etc/shadow | root,dioni'];

  check(
    'with `multiselect`, two profiles in a cell are valid',
    validateParameterValue(withType('multiselect', TWO_PROFILES), TWO_PROFILES)
      .valid === true,
    validateParameterValue(withType('multiselect', TWO_PROFILES), TWO_PROFILES).reason
  );

  check(
    'with `identifier`, the same row is rejected (that is what broke op.acc.4)',
    validateParameterValue(withType('identifier', TWO_PROFILES), TWO_PROFILES)
      .valid === false,
    'el validador la dio por buena'
  );

  const ONE = ['/root/.ssh/authorized_keys | root'];

  check(
    'a single profile is still valid',
    validateParameterValue(withType('multiselect', ONE), ONE).valid === true,
    validateParameterValue(withType('multiselect', ONE), ONE).reason
  );

  const NO_PROFILE = ['/datos/publico | '];

  check(
    'and an empty cell does not break, because the column is not mandatory',
    validateParameterValue(withType('multiselect', NO_PROFILE), NO_PROFILE)
      .valid === true,
    validateParameterValue(withType('multiselect', NO_PROFILE), NO_PROFILE).reason
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
