/** DOCUMENTARY policy decisions: `documental` in `ENSPolicyDecision`. */
import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateRequirement } from '../common/ens/core/evaluation/requirement/requirement-evaluator';
import { evaluateENSControl } from '../common/ens/core/evaluation/evaluation-engine';
import { markPolicyRuntimeStale } from '../common/ens/core/evidence/stale-collector';
import type { ENSStaleCollector } from '../common/ens/core/evidence/stale-collector';
import { markPolicyRuntimeUnmatchedScope } from '../common/ens/core/scope/measurement-planes';
import { parseRequirementAttestations } from '../common/ens/configuration/services/attestation-service';
import { ensRequirementProofLabel } from '../public/ens/reports/report-rows';
import { opAcc1CatalogDefinition } from '../common/ens/catalog/op-acc-1';
import { getEvidenceDefinitions } from '../common/ens/core/evidence/registry';
import type {
  ENSPolicyDecision,
  ENSPolicyRuntimeResult,
} from '../common/ens/core/policy-runtime/types';
import type {
  ENSControlConfiguration,
  ENSControlParameter,
} from '../common/ens/configuration/types';
import type { ENSComplianceStatus } from '../common/ens/core/evaluation/types';
import type { ENSEvidenceResolved } from '../common/ens/core/evidence/types';

declare const process: { exit(code: number): void };
declare const __dirname: string;

const failures: string[] = [];

const check = (name: string, condition: boolean, detail: unknown = ''): void => {
  if (condition) {
    console.log(`  ok   ${name}`);

    return;
  }

  failures.push(name);
  console.log(`  FAIL ${name}${detail !== '' ? ` — ${String(detail)}` : ''}`);
};

const section = (title: string): void => console.log(`\n${title}`);

const REQ = 'op.acc.1.5';
const TECHNICAL = 'op.acc.1.2';

const requirement = (id: string) => opAcc1CatalogDefinition.requirements.find(r => r.id === id)!;

const decision = (
  requirementId: string,
  status: ENSComplianceStatus,
  extra: Partial<ENSPolicyDecision> = {}
): ENSPolicyDecision => ({
  policyId: 'prueba',
  requirementId: requirementId,
  status,
  parameterIds: [],
  evidenceIds: [],
  eventIds: [],
  runtimeVariables: [],
  trace: {
    ruleId: requirementId,
    ruleType: 'MAX_AGE',
    expression: 'prueba',
    expected: 'certificación en vigor',
    actual: status,
    result: status === 'CUMPLE',
  },
  reason: 'La certificación nº CCN-2026-004 venció el 2026-03-01',
  ...extra,
});

const runtime = (decisions: ENSPolicyDecision[]): ENSPolicyRuntimeResult => ({
  controlId: 'op.acc.1',
  policyId: 'prueba',
  evaluatedAt: '2026-10-09T12:00:00Z',
  decisions: decisions,
  appliedParameters: [],
  runtimeVariables: [],
});

const PARADO: ENSStaleCollector = {
  since: '2026-10-07T10:00:00Z',
  reference: 'collector_run',
  reason: 'Sin datos del recolector desde el 2026-10-07 10:00 UTC.',
};

const configuration = (rows: string[]): ENSControlConfiguration =>
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

const ATTESTATION = parseRequirementAttestations(
  configuration([`${REQ} | Política de identificación v3 | https://intranet/pol-id-v3.pdf | 2026-05-12 | RSI`])
).get(REQ);

const judges = (decisions: ENSPolicyDecision[], id = REQ, evidences: ENSEvidenceResolved[] = []) =>
  evaluateRequirement(requirement(id), 'ALTO', evidences, false, decisions, 'ACTIVE', id === REQ ? ATTESTATION : undefined);

section('1. Collector stopped: documentary is kept in any state; technical is not');

{
  const documentary = (['NO_CUMPLE', 'CUMPLE', 'NO_EVALUABLE'] as ENSComplianceStatus[]).map(status =>
    decision(REQ, status, { documental: true, cause: status === 'NO_EVALUABLE' ? 'CONFIGURATION' : undefined, attested: status === 'CUMPLE' || undefined })
  );
  const technical = decision(TECHNICAL, 'CUMPLE');
  const outside = decision('op.acc.1.r1.1', 'NO_APLICA');
  const marked = markPolicyRuntimeStale(runtime([...documentary, technical, outside]), PARADO)!.decisions;

  check(
    'the three documentary ones come out intact (state, motive, cause)',
    marked.slice(0, 3).every((d, i) => d.status === documentary[i].status && d.reason === documentary[i].reason && d.cause === documentary[i].cause),
    marked.slice(0, 3).map(d => `${d.status}/${d.cause}`).join(', ')
  );
  check(
    'the technical one becomes NO_EVALUABLE by RECOGIDA with the collector\'s motive',
    marked[3].status === 'NO_EVALUABLE' && marked[3].cause === 'COLLECTION' && /Sin datos del recolector/.test(marked[3].reason),
    `${marked[3].status} ${marked[3].cause}`
  );
  check('NO_APLICA is kept', marked[4].status === 'NO_APLICA');
  check(
    'and a technical requirement with the collector stopped does not comply: not proven',
    judges([marked[3]], TECHNICAL).status === 'NO_CUMPLE' && judges([marked[3]], TECHNICAL).evidenced === false
  );
}

section('2. Scope without machines: the same rule, with cause CONFIGURATION for the technical one');

{
  const marked = markPolicyRuntimeUnmatchedScope(
    runtime([decision(REQ, 'NO_CUMPLE', { documental: true }), decision(TECHNICAL, 'CUMPLE')]),
    'P-04 no declara ninguna máquina'
  )!.decisions;

  check('the documentary one comes out intact', marked[0].status === 'NO_CUMPLE' && marked[0].documental === true);
  check('the technical one, NO_EVALUABLE by CONFIGURATION', marked[1].status === 'NO_EVALUABLE' && marked[1].cause === 'CONFIGURATION');
}

section('3. Collector stopped + documentary NO_CUMPLE + P-ATT: never CUMPLE');

{
  const expired = decision(REQ, 'NO_CUMPLE', { documental: true });
  const withMark = judges(markPolicyRuntimeStale(runtime([expired]), PARADO)!.decisions);

  check(
    'with the mark: measured NO_CUMPLE from the declaration, not accredited',
    withMark.status === 'NO_CUMPLE' && withMark.evidenced === true && !withMark.attested && withMark.documental === true,
    `${withMark.status} evidenced=${withMark.evidenced} attested=${withMark.attested}`
  );

  const { documental: _without, ...withoutMark } = expired;
  const hole = judges(markPolicyRuntimeStale(runtime([withoutMark]), PARADO)!.decisions);
  check(
    'REVERSAL (the hole it closes): without the mark, the stopped collector leaves it NO_EVALUABLE and P-ATT took it as CUMPLE',
    hole.status === 'CUMPLE' && hole.attested === true,
    `${hole.status} attested=${hole.attested}`
  );
  check('and without a stopped collector, the documentary NO_CUMPLE still prevails over P-ATT', judges([expired]).status === 'NO_CUMPLE');
}

section('4. A documentary NO_CUMPLE is neither «Medido» nor «corregir la máquina»');

{
  const expired = judges([decision(REQ, 'NO_CUMPLE', { documental: true })]);
  const measure = judges([decision(REQ, 'NO_CUMPLE')]);

  check('the report label says «Declarado (documental)»', ensRequirementProofLabel(expired) === 'Declarado (documental)', ensRequirementProofLabel(expired));
  check('REVERSAL: without the mark, «Medido»', ensRequirementProofLabel(measure) === 'Medido');
  check('an accredited CUMPLE still says «Acreditado documentalmente»', ensRequirementProofLabel(judges([decision(REQ, 'CUMPLE', { documental: true, attested: true })])) === 'Acreditado documentalmente');

  const evidences = getEvidenceDefinitions('op.acc.1').map(e => ({ ...e, status: 'CUMPLE', observations: [] }) as ENSEvidenceResolved);
  const control = (mark: boolean) =>
    evaluateENSControl(
      opAcc1CatalogDefinition,
      configuration([]),
      'ALTO',
      evidences,
      runtime([decision(REQ, 'NO_CUMPLE', mark ? { documental: true } : {})]),
      []
    ).nonConformities.find(nc => nc.requirementId === REQ);

  const documental = control(true);
  check(
    'the nonconformity is proven (counts the same) but documentary, and sends to renew the documentation',
    documental?.origin === 'MEDIDA' && documental?.documental === true && /^Renovar o completar la documentación/.test(documental?.requiredAction || ''),
    `${documental?.origin} ${documental?.documental} ${documental?.requiredAction}`
  );
  const technical = control(false);
  check('REVERSAL: without the mark, «Corregir para alcanzar»', technical?.documental !== true && /^Corregir para alcanzar/.test(technical?.requiredAction || ''), technical?.requiredAction);
}

section('5. The control sheet does not count documentary items under «Corregir el sistema»');

{
  const source = readFileSync(join(__dirname, '..', 'public/ens/controls/control-detail/index.tsx'), 'utf8');

  check(
    'separates the documentary ones from the technical measures',
    /const documentary = measures\.filter\(item => item\.documental\)/.test(source) &&
      /const technicalMeasures = measures\.filter\(item => !item\.documental\)/.test(source)
  );
  check(
    '«Corregir N» and «medidas · corregir el sistema» count only the technical ones',
    /`Corregir \$\{technicalMeasures\.length\}`/.test(source) &&
      /etiqueta: 'medidas · corregir el sistema',\s*valor: technicalMeasures\.length/.test(source) &&
      !/`Corregir \$\{medidas\.length\}`/.test(source)
  );
  check(
    'the «Corregir el sistema auditado» block lists only the technical ones, and the documentary ones have their own',
    /pie: 'Corregir el sistema auditado\.',\s*items: technicalMeasures,/.test(source) &&
      /pie: 'Cuentan igual\. La acción es renovar o completar la documentación\.',\s*items: documentary,/.test(source)
  );
}

console.log('');

if (failures.length) {
  console.log(`${failures.length} check(s) FAIL:`);
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}

console.log('All checks pass.');
