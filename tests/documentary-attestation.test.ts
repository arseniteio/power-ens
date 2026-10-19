/** Documentary attestation: accrediting by document what no telemetry can prove. */
import {
  describeAttestation,
  isAttestationSufficient,
  parseRequirementAttestations,
} from '../common/ens/configuration/services/attestation-service';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateControlStatus } from '../common/ens/core/evaluation/control/control-evaluator';
import type { ENSPolicyDecision } from '../common/ens/core/policy-runtime/types';
import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';
import { opAcc1Configuration } from '../common/ens/configuration/data/op-acc-1-parameters';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
  ENSLevel,
} from '../common/ens/configuration/types';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';

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

const configuration = (
  rows: string[]
): ENSControlConfiguration =>
  ({
    controlId: 'op.acc.1',
    controlName: 'Identificación',
    family: 'Marco operacional',
    enabled: true,
    applicableLevels: ['BAJO', 'MEDIO', 'ALTO'],
    parameters: [
      {
        id: 'P-ATT',
        controlId: 'op.acc.1',
        name: 'atestaciones_documentales',
        label: 'Atestaciones',
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

const requirement = (id: string) => {
  const found = opAcc1CatalogDefinition.requirements.find(
    item => item.id === id
  );

  if (!found) {
    throw new Error(`broken fixture: ${id} is not in the catalog`);
  }

  return found;
};

const evidence = (
  evidenceId: string,
  status: ENSEvidenceResolved['status']
): ENSEvidenceResolved => {
  const definition = getEvidenceDefinitions('op.acc.1').find(
    item => item.id === evidenceId
  );

  if (!definition) {
    throw new Error(`fixture rota: ${evidenceId}`);
  }

  return { ...definition, status, observations: [] } as ENSEvidenceResolved;
};

const GOOD_ATTESTATION =
  'op.acc.1.5 | Política de identificación v3 | https://intranet/pol-id-v3.pdf | 2026-05-12 | RSI';

const judges = (
  requirementId: string,
  rows: string[],
  evidences: ENSEvidenceResolved[] = [],
  level: ENSLevel = 'MEDIO'
) =>
  evaluateRequirement(
    requirement(requirementId),
    level,
    evidences,
    false,
    [],
    'ACTIVE',
    parseRequirementAttestations(configuration(rows)).get(requirementId)
  );

section('1. A requirement without technical evidence CAN be accredited');

{
  check(
    'op.acc.1.5 has no technical evidence in the catalog',
    requirement('op.acc.1.5').evidenceIds.length === 0,
    String(requirement('op.acc.1.5').evidenceIds.length)
  );

  const sin = judges('op.acc.1.5', []);

  check(
    'without attestation it does NOT comply, which is the default criterion',
    sin.status === 'NO_CUMPLE',
    sin.status
  );

  const con = judges('op.acc.1.5', [GOOD_ATTESTATION]);

  check(
    'with the document and its link, CUMPLE',
    con.status === 'CUMPLE',
    con.status
  );

  check(
    'but marked as documentarily accredited, not as measured',
    con.attested === true,
    String(con.attested)
  );

  check(
    'and the motive names the document and leaves the link',
    (con.observations[0] || '').includes('Política de identificación v3') &&
      (con.observations[0] || '').includes('https://intranet/pol-id-v3.pdf'),
    con.observations[0]
  );

  const measured = judges(
    'op.acc.1.1',
    [],
    [evidence('EV-03', 'CUMPLE')]
  );

  check(
    'a measured requirement complies WITHOUT the attestation mark',
    measured.status === 'CUMPLE' && !measured.attested,
    `${measured.status} attested=${measured.attested}`
  );
}

section('2. An attestation CANNOT cover a measurement that fails');

{
  const withTrap = judges(
    'op.acc.1.1',
    ['op.acc.1.1 | Un documento cualquiera | https://intranet/lo-que-sea.pdf'],
    [evidence('EV-03', 'NO_CUMPLE')]
  );

  check(
    'the measured, failing requirement stays NO_CUMPLE',
    withTrap.status === 'NO_CUMPLE',
    withTrap.status
  );

  check(
    'and it is not marked as attested',
    !withTrap.attested,
    String(withTrap.attested)
  );

  const withoutData = judges(
    'op.acc.1.1',
    ['op.acc.1.1 | Un documento cualquiera | https://intranet/lo-que-sea.pdf'],
    []
  );

  check(
    'nor covering an evidence that has not arrived',
    withoutData.status === 'NO_CUMPLE' && !withoutData.attested,
    `${withoutData.status} attested=${withoutData.attested}`
  );
}

section('3. An incomplete attestation does NOT accredit');

{
  const cases: [string, string][] = [
    ['sin enlace', 'op.acc.1.5 | Política de identificación v3'],
    ['con un enlace que no lleva a ninguna parte',
     'op.acc.1.5 | Política v3 | está en el SharePoint'],
    ['sin documento', 'op.acc.1.5 |  | https://intranet/algo.pdf'],
  ];

  for (const [name, row] of cases) {
    const result = judges('op.acc.1.5', [row]);

    check(
      `${name}: does not accredit`,
      result.status === 'NO_CUMPLE' && !result.attested,
      `${result.status} attested=${result.attested}`
    );
  }

  check(
    'and with document AND link, it does accredit',
    judges('op.acc.1.5', [GOOD_ATTESTATION]).status === 'CUMPLE'
  );

  check(
    'date and owner are desirable, not blocking',
    judges('op.acc.1.5', [
      'op.acc.1.5 | Política v3 | https://intranet/p.pdf',
    ]).status === 'CUMPLE'
  );
}

section('4. Several links in the same attestation');

{
  const attestations = parseRequirementAttestations(
    configuration([
      'op.acc.1.5 | Política v3 y su anexo | https://a/p.pdf https://a/anexo.pdf | 2026-05-12',
    ])
  );

  const a = attestations.get('op.acc.1.5');

  check(
    'both links are kept',
    a?.links.length === 2,
    String(a?.links.length)
  );

  check(
    'and both appear in the motive',
    describeAttestation(a!).includes('https://a/anexo.pdf'),
    describeAttestation(a!)
  );

  check(
    'a network path counts as a link',
    isAttestationSufficient(
      parseRequirementAttestations(
        configuration(['op.acc.1.5 | Política | \\\\srv\\politicas\\id.pdf'])
      ).get('op.acc.1.5')
    )
  );
}

section('5. With both documentary ones accredited, op.acc.1 reaches 100 %');

{
  const documentales = ['op.acc.1.5', 'op.acc.1.r1.1'];

  for (const id of documentales) {
    check(
      `${id} · no technical evidence in the catalog`,
      requirement(id).evidenceIds.length === 0
    );
  }

  const rows = [
    'op.acc.1.5 | Política de identificación v3 | https://intranet/pol-id.pdf | 2026-05-12 | RSI',
    'op.acc.1.r1.1 | Procedimiento de alta de personal v2 | https://intranet/alta.pdf | 2026-04-01 | RRHH',
  ];

  const accredited = documentales.map(id => judges(id, rows));

  check(
    'both accredit with their document',
    accredited.every(r => r.status === 'CUMPLE' && r.attested),
    accredited.map(r => `${r.id}=${r.status}/${r.attested}`).join(' ')
  );

  const onlyOne = judges('op.acc.1.r1.1', [rows[0]]);

  check(
    'and declaring one does not accredit the other',
    onlyOne.status === 'NO_CUMPLE',
    onlyOne.status
  );
}

section('6. The shipped example accredits nothing');

{
  const example = opAcc1Configuration.parameters.find(
    parameter => parameter.id === 'P-ATT'
  )?.example;

  check(
    'the parameter ships an example, so the shape is visible',
    Boolean(example && example.includes('|')),
    example
  );

  const withExample = judges('op.acc.1.5', [example || '']);

  check(
    'but copying it as is does NOT accredit',
    withExample.status === 'NO_CUMPLE' && !withExample.attested,
    `${withExample.status} attested=${withExample.attested}`
  );

  const conEnlaceReal = judges('op.acc.1.5', [
    (example || '').replace(
      /https:\/\/EJEMPLO\.invalido\/[^ |]+/,
      'https://intranet/politica-real.pdf'
    ),
  ]);

  check(
    'and with a real link, the same row does accredit',
    conEnlaceReal.status === 'CUMPLE' && conEnlaceReal.attested === true,
    `${conEnlaceReal.status} attested=${conEnlaceReal.attested}`
  );
}

section('7. No attestation beats a policy decision');

{
  const decision = (
    requirementId: string,
    status: ENSPolicyDecision['status']
  ): ENSPolicyDecision => ({
    policyId: 'prueba',
    requirementId: requirementId,
    status,
    parameterIds: [],
    evidenceIds: [],
    eventIds: [],
    runtimeVariables: [],
    trace: {
      ruleId: 'prueba',
      ruleType: 'CONDITIONAL_REQUIRED',
      expression: 'prueba',
      expected: 'prueba',
      actual: 'prueba',
      result: status === 'CUMPLE',
    },
    reason: `la policy decide ${status}`,
  });

  const conPolicy = (status: ENSPolicyDecision['status']) =>
    evaluateRequirement(
      requirement('op.acc.1.5'),
      'MEDIO',
      [],
      false,
      [decision('op.acc.1.5', status)],
      'ACTIVE',
      parseRequirementAttestations(configuration([GOOD_ATTESTATION])).get(
        'op.acc.1.5'
      )
    );

  const notApplicable = conPolicy('NO_APLICA');

  check(
    'policy NO_APLICA + complete attestation → NO_APLICA, not CUMPLE',
    notApplicable.status === 'NO_APLICA' && notApplicable.attested !== true,
    `${notApplicable.status} attested=${notApplicable.attested}`
  );

  check(
    'and it leaves the denominator',
    evaluateControlStatus([notApplicable]).applicableRequirements === 0,
    String(evaluateControlStatus([notApplicable]).applicableRequirements)
  );

  const nonCompliant = conPolicy('NO_CUMPLE');

  check(
    'policy NO_CUMPLE + complete attestation → NO_CUMPLE: the document does not cover the measurement',
    nonCompliant.status === 'NO_CUMPLE' && nonCompliant.attested !== true,
    `${nonCompliant.status} attested=${nonCompliant.attested}`
  );

  const noEvaluable = conPolicy('NO_EVALUABLE');

  check(
    'policy NO_EVALUABLE + complete attestation → accredits, because nobody had proven it',
    noEvaluable.status === 'CUMPLE' && noEvaluable.attested === true,
    `${noEvaluable.status} attested=${noEvaluable.attested}`
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(failure => console.log(`  - ${failure}`));
  process.exit(1);
}

console.log('All checks pass.');
