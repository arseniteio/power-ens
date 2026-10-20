/** Panel: unfavourable requirements by origin (ENS-DASH-002) and operational SOC alerts (ENS-DASH-004), by Francisco Caicedo. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 400)}` : ''}`);
  if (!c) failures.push(n);
};

let evaluations: Record<string, any> = {};
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (params: any) => ({ ...(evaluations[params.include] || { isLoading: true }), retry: () => undefined }),
    }),
  },
});

const { EnsDashboardMain } = require('../public/ens/dashboard/ens-dashboard-main');
const { buildENSDashboardModel } = require('../common/ens/core/dashboard-adapter/dashboard-adapter');
const { buildFindingsCardModel } = require('../common/ens/core/dashboard-adapter/presenters/findings.presenter');
const { buildComplianceState } = require('../common/ens/core/compliance-state');

const now = new Date('2026-10-20T10:00:00Z');
const requirement = (id: string, status: string) => ({ id, title: id, status, level: ['BAJO'], observations: [], evidenceIds: [] });
const nc = (requirementId: string, origin: 'MEDIDA' | 'NO_EVIDENCIADA') => ({
  id: `${requirementId}-${origin}`, evidenceId: 'EV-01', requirementId, finding: 'f', impact: 'i', requiredAction: 'a', origin,
  ...(origin === 'NO_EVIDENCIADA' ? { cause: 'EVIDENCE' } : {}), evidenceIds: ['EV-01'], parameterIds: [],
});
const result = (controlId: string, requirements: any[], nonConformities: any[] = [], status = 'NO_CUMPLE') => ({
  control: { id: controlId, name: controlId, family: 'op', category: 'acc', description: '' },
  level: 'MEDIO', status, score: 40, coverage: 50, applicableRequirements: requirements.length, measuredRequirements: requirements.length, unmeasuredRequirements: [],
  evaluatedAt: now.toISOString(), requirements, parameters: [], evidences: [], missingParameters: [], missingEvidences: [], relatedRules: [],
  nonConformities, observations: [], traceability: [],
});

(async () => {
  console.log('1. ENS-DASH-002: unfavourable requirements by the origin of their non-conformities');
  const opAcc1 = result(
    'op.acc.1',
    [
      requirement('op.acc.1.1', 'NO_CUMPLE'),
      requirement('op.acc.1.2', 'NO_CUMPLE'),
      requirement('op.acc.1.3', 'PARCIAL'),
      requirement('op.acc.1.4', 'NO_EVALUABLE'),
      requirement('op.acc.1.r1.1', 'CUMPLE'),
      requirement('op.acc.1.r2.1', 'NO_APLICA'),
    ],
    [
      nc('op.acc.1.1', 'MEDIDA'),
      nc('op.acc.1.1', 'MEDIDA'),
      nc('op.acc.1.2', 'NO_EVIDENCIADA'),
      nc('op.acc.1.3', 'MEDIDA'),
      nc('op.acc.1.3', 'NO_EVIDENCIADA'),
      // A favourable requirement never counts, whatever list it appears in.
      nc('op.acc.1.r1.1', 'MEDIDA'),
    ]
  );
  // mp.eq.2 is DRAFT: even a forged unfavourable requirement with its non-conformity stays out.
  const draft = result('mp.eq.2', [requirement('mp.eq.2.1', 'NO_CUMPLE')], [nc('mp.eq.2.1', 'MEDIDA')]);
  const findings = buildFindingsCardModel(buildComplianceState([opAcc1, draft] as any));
  check('one requirement in each origin: measured, unevidenced, mixed, unclassified',
    findings.measuredFindings === 1 && findings.unevidencedFindings === 1 && findings.mixedFindings === 1 && findings.unclassifiedFindings === 1, findings);
  check('exclusive: the four add up to the total (DRAFT control and favourable requirements out)',
    findings.total === 4 && findings.measuredFindings + findings.unevidencedFindings + findings.mixedFindings + findings.unclassifiedFindings === findings.total, findings);
  check('title and red with a NO_CUMPLE', findings.title === 'REQUISITOS QUE REQUIEREN ATENCIÓN' && findings.severity === 'CRITICAL', findings);
  const onlyPartial = buildFindingsCardModel(buildComplianceState([result('op.acc.1', [requirement('op.acc.1.3', 'PARCIAL')], [], 'PARCIAL')] as any));
  check('only PARCIAL: yellow, unclassified without non-conformities', onlyPartial.severity === 'WARNING' && onlyPartial.unclassifiedFindings === 1, onlyPartial);
  const onlyDraft = buildFindingsCardModel(buildComplianceState([draft] as any));
  check('only a DRAFT control: nothing to attend to', onlyDraft.total === 0 && onlyDraft.severity === 'OK', onlyDraft);

  console.log('2. The panel shows the breakdown');
  const meta = { computedAt: now.toISOString(), evaluatedAt: now.toISOString(), fingerprint: 'f', level: 'MEDIO', facts: { count: 1 }, scope: [{ id: '024', name: 'wazuh-real' }] };
  const state = buildComplianceState([opAcc1, draft] as any);
  evaluations.dashboard = { data: { meta, dashboard: buildENSDashboardModel(state) }, isLoading: false };
  const p = await h.render(EnsDashboardMain);
  check('title, total and the four origins on screen',
    /REQUISITOS QUE REQUIEREN ATENCIÓN/.test(p) && /Medidos:\s*1/.test(p) && /No evidenciados:\s*1/.test(p) && /Mixtos:\s*1/.test(p) && /Sin clasificar:\s*1/.test(p),
    p.slice(p.indexOf('REQUISITOS QUE'), p.indexOf('REQUISITOS QUE') + 400));

  if (failures.length) {
    console.log(`\n${failures.length} FAIL`);
    process.exit(1);
  }
  console.log('\nALL OK');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
