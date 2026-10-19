/** Applicability Declaration: exclude a whole control when the system lacks what it regulates. */
import {
  describeDeclaration,
  isDeclarationSufficient,
  parseApplicabilityDeclaration,
} from '../common/ens/configuration/services/applicability-service';
import { applyApplicabilityDeclaration } from '../common/ens/core/evaluation/requirement/applicability';
import {
  evaluateRequirements,
  type ENSRequirementEvaluationResult,
} from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
import { opAcc5CatalogDefinition } from '../common/ens/catalog/op-acc-5';
import { opAcc5Configuration } from '../common/ens/configuration/data/op-acc-5-parameters';
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

const configuration = (rows: string[]): ENSControlConfiguration =>
  ({
    ...opAcc5Configuration,
    parameters: [
      {
        id: 'P-DA',
        controlId: 'op.acc.5',
        name: 'declaracion_aplicabilidad',
        label: 'Declaración de Aplicabilidad',
        description: '',
        levels: ['BAJO', 'MEDIO', 'ALTO'],
        requirements: [],
        type: 'table',
        example: '',
        required: false,
        wazuhUsage: '',
        ensfacilUsage: '',
        evidenceIds: [],
        ruleIds: [],
        ifNotConfigured: '',
        value: rows,
      } as unknown as ENSControlParameter,
    ],
  }) as ENSControlConfiguration;

const GOOD_DECLARATION =
  'El sistema no tiene usuarios externos: solo administración interna | Declaración de Aplicabilidad v2 | https://intranet/da-v2.pdf | 2026-09-01 | Responsable de Seguridad';

const withoutSubject = (): ENSRequirementEvaluationResult[] =>
  evaluateRequirements(
    opAcc5CatalogDefinition.requirements,
    'MEDIO',
    [],
    false,
    [],
    'ACTIVE'
  );

const excludes = (rows: string[], base = withoutSubject()) =>
  applyApplicabilityDeclaration(
    base,
    parseApplicabilityDeclaration(configuration(rows))
  );

section('1. Complete declaration and nothing measured: the control leaves the index');

{
  const base = withoutSubject();

  check(
    'starting point: without a declaration, the control scores (and badly)',
    evaluateControlStatus(base).applicableRequirements > 0,
    String(evaluateControlStatus(base).applicableRequirements)
  );

  const excluded = excludes([GOOD_DECLARATION]);
  const control = evaluateControlStatus(excluded);

  check(
    'all requirements become NO_APLICA',
    excluded.every(r => r.status === 'NO_APLICA' && r.applicable === false),
    excluded.map(r => r.status).join(',')
  );

  check(
    'the control is NO_APLICA and has NO number, not a 0',
    control.status === 'NO_APLICA' && control.score === undefined,
    `${control.status} score=${control.score}`
  );

  check(
    'each requirement says why: the reference and the motive are visible',
    excluded.every(r =>
      r.observations.some(
        o =>
          o.includes('Declaración de Aplicabilidad v2') &&
          o.includes('no tiene usuarios externos')
      )
    )
  );

  check(
    'nothing is marked as measured or as accredited',
    excluded.every(r => r.evidenced === false && r.attested !== true)
  );
}

section('2. An incomplete declaration does NOT exclude');

{
  const cases: Array<[string, string]> = [
    [
      'sin enlace',
      'Sin usuarios externos | Declaración de Aplicabilidad v2 |  | 2026-09-01 | RSI',
    ],
    [
      'con el enlace de ejemplo',
      'Sin usuarios externos | Declaración de Aplicabilidad v2 | https://EJEMPLO.invalido/sustituye-esto.pdf | 2026-09-01 | RSI',
    ],
    [
      'sin motivo',
      ' | Declaración de Aplicabilidad v2 | https://intranet/da-v2.pdf | 2026-09-01 | RSI',
    ],
    [
      'sin referencia',
      'Sin usuarios externos |  | https://intranet/da-v2.pdf | 2026-09-01 | RSI',
    ],
    ['con texto suelto en lugar de enlace', 'Sin usuarios externos | DA v2 | está en el SharePoint | 2026-09-01 | RSI'],
  ];

  for (const [name, row] of cases) {
    const result = excludes([row]);

    check(
      `${name} -> the control still scores`,
      evaluateControlStatus(result).applicableRequirements > 0,
      evaluateControlStatus(result).status
    );
  }

  check(
    'isDeclarationSufficient rejects a declaration without a usable link',
    !isDeclarationSufficient(
      parseApplicabilityDeclaration(configuration([cases[1][1]]))
    )
  );
}

section('3. No declaration covers what has been measured');

{
  const measured = withoutSubject().map((r, i) =>
    i === 3
      ? {
          ...r,
          status: 'NO_CUMPLE' as const,
          evidenced: true,
          observations: ['se midió un servicio de acceso externo'],
        }
      : r
  );

  const result = excludes([GOOD_DECLARATION], measured);

  check(
    'with a measured requirement, the control stays in the index',
    evaluateControlStatus(result).applicableRequirements > 0
  );

  check(
    'the measured requirement keeps its NO_CUMPLE',
    result[3].status === 'NO_CUMPLE',
    result[3].status
  );

  check(
    'and it shows that what was measured contradicts the exclusion',
    result[3].observations.some(o => o.includes('contradice la exclusión'))
  );

  const accredited = withoutSubject().map((r, i) =>
    i === 0
      ? { ...r, status: 'CUMPLE' as const, evidenced: true, attested: true }
      : r
  );

  check(
    'a requirement accredited by document also contradicts the exclusion',
    evaluateControlStatus(excludes([GOOD_DECLARATION], accredited))
      .applicableRequirements > 0
  );
}

section('4. Without a declaration, the engine does not change');

{
  const base = withoutSubject();
  const result = applyApplicabilityDeclaration(base, undefined);

  check(
    'returns the same states',
    result.map(r => r.status).join() === base.map(r => r.status).join()
  );

  check(
    'an empty table does not exclude either',
    evaluateControlStatus(excludes([])).applicableRequirements > 0
  );
}

section('5. op.acc.5 declares P-DA and is not mandatory');

{
  const pda = opAcc5Configuration.parameters.find(p => p.id === 'P-DA');

  check('op.acc.5 has P-DA', Boolean(pda));
  check(
    'not mandatory: without a declaration the control is evaluated normally',
    pda?.required === false
  );
  check(
    'it is a table with motive | reference | link | date | owner',
    pda?.type === 'table' &&
      (pda?.columns || []).map(c => c.name).join('|') ===
        'motivo|referencia|enlace|fecha|responsable',
    (pda?.columns || []).map(c => c.name).join('|')
  );

  const decl = parseApplicabilityDeclaration(configuration([GOOD_DECLARATION]));

  check(
    'the sentence always says it is a declared exclusion',
    Boolean(decl) &&
      describeDeclaration(decl!).startsWith(
        'Excluido por la Declaración de Aplicabilidad'
      )
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
