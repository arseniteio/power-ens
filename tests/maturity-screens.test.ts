/** Maturity on screen: the detail header and panel, «Valorar», the overview, the panel and General. */
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
let retries = 0;
const pdfs: any[] = [];
const pdfStub = { createPdf: (definition: any) => { pdfs.push(definition); return { download: () => undefined }; } };
const h = installReactHarness({
  overrides: {
    [require.resolve('pdfmake/build/pdfmake')]: () => pdfStub,
    [require.resolve('pdfmake/build/vfs_fonts')]: () => ({ vfs: {} }),
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (params: any) => ({ ...(evaluations[params.include] || { isLoading: true }), retry: () => { retries += 1; } }),
    }),
  },
});

const { readFileSync, readdirSync } = require('fs');
const { ENSControls } = require('../public/ens/data');
const { ControlDetailENS } = require('../public/ens/controls/control-detail');
const { OverviewENS } = require('../public/ens/overview');
const { EnsDashboardMain } = require('../public/ens/dashboard/ens-dashboard-main');
const { GlobalConfigurationPanel } = require('../public/ens/configuration/components/global-configuration-panel');
const { ReportsENS } = require('../public/ens/reports');
const { buildMaturityPdfContent } = require('../public/ens/maturity/maturity-report');
const view = require('../public/ens/maturity/maturity-view');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { hydrateENSScope } = require('../common/ens/core/scope/runtime');
const http = require('../common/ens/configuration/services/configuration-http-client');
const engine = require('../common/ens/maturity/maturity-engine');
const { buildENSDashboardModel } = require('../common/ens/core/dashboard-adapter/dashboard-adapter');
const { buildComplianceState } = require('../common/ens/core/compliance-state');

const now = new Date();
const day = (offset: number) => new Date(now.getTime() - offset * 86400e3).toISOString().slice(0, 10);
const period = { from: new Date(now.getTime() - 30 * 86400e3).toISOString(), to: now.toISOString() };
const empty = () => ({ attestations: [], reviews: [], assessments: [], indicators: [], feedback: [] });
const result = (status = 'PARCIAL', score = 75) => ({
  control: { id: 'op.acc.1', name: 'Identificación', family: 'op', category: 'acc', description: '' },
  level: 'MEDIO', status, score, coverage: 75, applicableRequirements: 4, measuredRequirements: 3, unmeasuredRequirements: ['op.acc.1.4'],
  evaluatedAt: now.toISOString(), requirements: [{ id: 'op.acc.1.1', title: 'r', status: 'CUMPLE', level: ['BAJO'], observations: [], evidenceIds: [], applicable: true }],
  parameters: [], evidences: [], missingParameters: [], missingEvidences: [], relatedRules: [], nonConformities: [], observations: [], traceability: [],
});
const maturityOf = (over: any = {}) =>
  engine.computeControlMaturity({
    control: { id: 'op.acc.1', status: 'ACTIVE', levelDimension: ['T', 'A'] },
    result: result(),
    configured: true,
    activity: { days: engine.wholePeriodDays(period, now, 'UTC') },
    period,
    timeZone: 'UTC',
    record: empty(),
    targets: { BAJO: 2, MEDIO: 3, ALTO: 4 },
    ensLevel: 'MEDIO',
    global: {},
    snapshots: [],
    now,
    ...over,
  });

const puts: any[] = [];
let putAnswer: (path: string, body: any) => Promise<any> = async () => ({});
http.setENSConfigurationHttp(() => ({
  get: async () => ({ statusCode: 200, error: 0, data: { configuration: null, metadata: null } }),
  put: async (path: string, options: any) => {
    const body = JSON.parse(options.body);
    puts.push({ path, body });
    return putAnswer(path, body);
  },
}));

(async () => {
  const blocks: Record<string, any> = {};
  readdirSync(`${__dirname}/../config`).filter((f: string) => f.endsWith('-control-block.json')).forEach((f: string) => {
    const b = JSON.parse(readFileSync(`${__dirname}/../config/${f}`, 'utf8'));
    blocks[b.controlId] = b;
  });
  const doc = { ...JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)), controls: ['op.acc.1'].map(id => JSON.parse(JSON.stringify(blocks[id]))) };
  doc.global.ensLevel = 'MEDIO';
  doc.organizationData = { values: { formacion_personal: ['Luis Pérez | ENS | 2026-01-10 | 2027-01-10'] } };
  ensConfigurationRepository.completeHydration(doc);
  await hydrateENSScope({ mode: 'group', agentIds: [], groupIds: ['ens'] }, async () => [{ id: '101', name: 'srv-web01', groups: ['ens'], status: 'active' }] as any, true);
  const ctl = (id: string) => ENSControls.find((c: any) => c.id === id);
  const meta = { computedAt: now.toISOString(), evaluatedAt: now.toISOString(), fingerprint: 'f', level: 'MEDIO', facts: { count: 1 }, scope: [{ id: '101', name: 'srv-web01' }] };

  console.log('1. Control detail: the headline next to the traffic light, and the panel');
  const maturity = maturityOf();
  evaluations.control = { data: { meta, result: result(), maturity, maturityVersion: { seqNo: 3, primaryTerm: 1 }, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  h.setSearch('?tabView=plugins&control=op.acc.1');
  let p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), onBack: () => undefined });
  check('accredited L2 here (no procedure)', maturity.accredited === 2, maturity.gates.filter((g: any) => !g.passed));
  check('header: the traffic light and «Madurez: sin valorar (acreditado L2, objetivo L3)», side by side', /\[ PARCIAL · 75% \] \[ [^\]]*Madurez: sin valorar \(acreditado L2, objetivo L3\) \]/.test(p), p.slice(0, 900));
  check('the «Madurez» panel with the one-line note and the guide', /Madurez · op\.acc\.1/.test(p) && /Semáforo y porcentaje: operativos/.test(p) && h.findAll('EuiLink').some(link => /10-maturity-assessment/.test(link.props.href)));
  check('the gates with origin, state and reason', /Hechos recurrentes sin huecos/.test(p) && /Documental/.test(p) && /Sin procedimiento registrado/.test(p) && /No se cumple/.test(p) && /Se cumple/.test(p));
  check('what is recorded: none yet', /Procedimiento:\s*sin registrar/.test(p) && /Última revisión:\s*ninguna registrada/.test(p));

  console.log('2. «Valorar»');
  putAnswer = async () => ({ statusCode: 200, error: 0, data: { record: {}, version: { seqNo: 4, primaryTerm: 1 }, updatedAt: now.toISOString() } });
  await h.click(/^Valorar$/);
  p = await h.rerender();
  check('the form opens with the accredited level said', /Valorar la madurez · op\.acc\.1/.test(p) && /La evidencia acredita L2/.test(p));
  const select = () => h.findAll('EuiSelect')[0];
  select().props.onChange({ target: { value: '4' } });
  const reviewer = h.findAll('EuiFieldText').find(f => f.props.list);
  check('reviewer suggestions from the personnel register', Boolean(reviewer) && /Luis Pérez/.test(JSON.stringify(h.findAll('option').map(o => o.props.value))));
  reviewer!.props.onChange({ target: { value: 'Luis Pérez' } });
  p = await h.rerender();
  await h.click(/^Guardar$/);
  p = await h.rerender();
  check('above the accredited level without justification: refused on screen, nothing sent', /supera al acreditado \(L2\)/.test(p) && puts.length === 0, p.slice(p.indexOf('Valorar la madurez'), p.indexOf('Valorar la madurez') + 800));
  h.findAll('EuiTextArea')[0].props.onChange({ target: { value: 'Auditoría externa con procedimiento en papel.' } });
  await h.rerender();
  await h.click(/^Guardar$/);
  p = await h.rerender();
  const sent = puts[0]?.body;
  check('with it: sent to the maturity route with the level as a number and the version the screen showed', puts[0]?.path === '/api/ensfacil/maturity' && sent.kind === 'assessment' && sent.entry.level === 4 && sent.entry.reviewer === 'Luis Pérez' && /Auditoría/.test(sent.entry.justification) && JSON.stringify(sent.expectedVersion) === '{"seqNo":3,"primaryTerm":1}', sent);
  check('...and the view refreshed, the form closed', retries === 1 && !/Valorar la madurez · op\.acc\.1/.test(p));
  check('the configuration in the browser is untouched (its own document)', !('maturity' in ensConfigurationRepository.getActive()));

  putAnswer = async () => Promise.reject({ body: { message: 'Hace falta el rol ensfacil_admin o all_access para registrar la madurez.' } });
  await h.click(/Registrar una revisión/);
  h.findAll('EuiFieldText').find(f => f.props.list)!.props.onChange({ target: { value: 'Ana' } });
  await h.rerender();
  await h.click(/^Guardar$/);
  p = await h.rerender();
  check('without the role the server refuses and the form says why', /Hace falta el rol ensfacil_admin/.test(p) && puts[1]?.body.kind === 'review', { puts: puts.map(x => x.body.kind), p: p.slice(p.indexOf('Registrar una revisión ·'), p.indexOf('Registrar una revisión ·') + 900) });
  check('the review offers «Desviación en tratamiento»', h.findAll('EuiSelect').some(select => (select.props.options || []).some((o: any) => o.text === 'Desviación en tratamiento')));
  check('the form\'s day is the local one (Madrid after midnight)', view.initialMaturityDraft('review', undefined, new Date('2026-10-19T23:30:00Z'), 'Europe/Madrid').date === '2026-10-20' && view.initialMaturityDraft('review', undefined, new Date('2026-10-19T23:30:00Z')).date === '2026-10-20');

  console.log('3. Above the accredited level, and DRAFT');
  h.reset();
  const above = maturityOf({ record: { ...empty(), assessments: [{ level: 4, reviewer: 'Luis', date: day(1), justification: 'Auditado en papel', accredited: 2, recordedAt: now.toISOString(), recordedBy: 'rsis' }] } });
  evaluations.control = { data: { meta, result: result(), maturity: above, maturityVersion: null, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), onBack: () => undefined });
  check('headline with the assessed level', /Madurez: L4 \(acreditado L2, objetivo L3\)/.test(p));
  check('marked above the level stored when recording, with who, when and the justification', /Valorado por encima de lo acreditado al registrarlo \(L4 frente a L2\)/.test(p) && new RegExp(`Valorado L4 por Luis el ${day(1)}\\. Justificación: Auditado en papel`).test(p), p.slice(p.indexOf('Madurez · op'), p.indexOf('Madurez · op') + 700));
  h.reset();
  const dropped = maturityOf({ activity: { days: engine.wholePeriodDays(period, now, 'UTC').slice(0, 3) }, record: { ...empty(), assessments: [{ level: 2, reviewer: 'Ana', date: day(5), accredited: 2, recordedAt: now.toISOString(), recordedBy: 'rsis' }] } });
  evaluations.control = { data: { meta, result: result(), maturity: dropped, maturityVersion: null, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), onBack: () => undefined });
  check('valid when recorded, evidence lower today: «revisar la valoración», not «por encima»', /acreditaba L2 al valorarlo .*; hoy acredita L1: revisar la valoración/.test(p) && !/por encima de lo acreditado/.test(p));
  h.reset();
  const draft = maturityOf({ control: { id: 'op.acc.1', status: 'DRAFT' } });
  evaluations.control = { data: { meta, result: { ...result('NO_APLICA'), score: undefined }, maturity: draft, maturityVersion: null, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  p = await h.render(ControlDetailENS, { control: ctl('op.acc.1'), onBack: () => undefined });
  check('DRAFT: «Sin medición todavía», and «Valorar» still there', /sin medición todavía/.test(p) && /Sin medición todavía/.test(p) && Boolean(h.find('EuiButton', /^Valorar$/)));

  console.log('4. Overview and panel: per control and the distribution');
  h.reset();
  const list = { controls: [engine.summarizeControlMaturity(maturity), engine.summarizeControlMaturity(above)].map((entry: any, i: number) => ({ ...entry, controlId: i ? 'op.acc.2' : 'op.acc.1' })) };
  const withDistribution = { ...list, distribution: engine.summarizeMaturityDistribution(list.controls) };
  const overview = { meta, controls: [], agents: [], freshness: { checkedAt: now.toISOString(), agents: [], cells: [] }, nonConformities: [], maturity: withDistribution, controlSummary: {} };
  evaluations.overview = { data: overview, isLoading: false };
  evaluations.summary = { data: { meta, controls: [], timeline: [] }, isLoading: false };
  h.setSearch('?tabView=overview');
  p = await h.render(OverviewENS);
  check('each control row says its level, whether accredited or assessed, and the target', /L2 acreditado · objetivo L3/.test(p) && /L4 valorado · objetivo L3/.test(p));
  check('the organisation distribution, accredited and assessed', /Madurez de la organización/.test(p) && /L2 · Reproducible 2 0/.test(p) && /L4 · Gestionado y medible 0 1/.test(p) && /por debajo del objetivo:\s*1/.test(p) && h.findAll('EuiBasicTable').some(t => t.props.columns.map((c: any) => c.name).join() === 'Nivel,Acreditado por la evidencia,Valorado'), p.slice(p.indexOf('Madurez de la organización'), p.indexOf('Madurez de la organización') + 700));
  evaluations.overview = { data: { ...overview, maturity: list }, isLoading: false };
  p = await h.rerender();
  check('with controls still computing: no distribution yet', /Calculando la madurez de todos los controles/.test(p));

  h.reset();
  const state = buildComplianceState([result() as any]);
  evaluations.dashboard = { data: { meta, dashboard: { ...buildENSDashboardModel(state), impactEvents: { title: 'Eventos', rows: [] } }, maturity: withDistribution }, isLoading: false };
  p = await h.render(EnsDashboardMain);
  check('the panel shows the organisation maturity apart from the index', /ÍNDICE GLOBAL DE CUMPLIMIENTO ENS/.test(p) && /Madurez de la organización/.test(p) && /L2 · Reproducible/.test(p), p.slice(-1500));

  console.log('5. General: the targets per category');
  h.reset();
  puts.length = 0;
  putAnswer = async (_path, body) => ({ statusCode: 200, error: 0, data: { configuration: body.configuration, metadata: { seqNo: 10, primaryTerm: 1 } } });
  p = await h.render(GlobalConfigurationPanel, { configuration: ensConfigurationRepository.getActive().global, onConfigurationSaved: () => undefined });
  const defaults = h.findAll('EuiSelect').map(select => select.props.options?.[0]?.text).filter((text: string) => /^Por defecto/.test(text || ''));
  check('three targets, each with its default', /Objetivo de madurez BÁSICA/.test(p) && /Objetivo de madurez ALTA/.test(p) && JSON.stringify(defaults) === '["Por defecto (L2)","Por defecto (L3)","Por defecto (L4)"]', defaults);
  const target = (category: string) => h.findAll('EuiFormRow').find(row => new RegExp(`Objetivo de madurez ${category}`).test(String(row.props.label)))!;
  const selectIn = (row: any) => h.findAll('EuiSelect').find(s => s.ruta.startsWith(row.ruta))!;
  selectIn(target('MEDIA')).props.onChange({ target: { value: '4' } });
  await h.rerender();
  await h.click(/Guardar configuración global/);
  check('saving sends the category target as a number', JSON.stringify(puts[0]?.body.configuration.global.maturityTargets) === '{"MEDIO":4}', puts[0]?.body.configuration.global);
  ensConfigurationRepository.completeHydration({ ...doc, global: { ...doc.global, maturityTargets: { MEDIO: 4 } } });
  h.reset();
  p = await h.render(GlobalConfigurationPanel, { configuration: ensConfigurationRepository.getActive().global, onConfigurationSaved: () => undefined });
  selectIn(target('MEDIA')).props.onChange({ target: { value: '' } });
  await h.rerender();
  await h.click(/Guardar configuración global/);
  check('back to the default: the key leaves the document (absent, never null)', puts[1] && !('maturityTargets' in puts[1].body.configuration.global), puts[1]?.body.configuration.global);

  console.log('6. The report: a generic maturity block, on screen and in the PDF');
  h.reset();
  ensConfigurationRepository.completeHydration(doc);
  evaluations.control = { data: { meta, result: result(), maturity: above, maturityVersion: null, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };
  evaluations.results = { data: { meta, results: [result()] }, isLoading: false };
  h.setSearch('?tabView=reports');
  p = await h.render(ReportsENS);
  h.find('EuiFieldSearch')!.props.onChange({ target: { value: 'op.acc.1' } });
  p = await h.rerender();
  check('the report shows the maturity block with the note', /Madurez del proceso \(CMM\)/.test(p) && /Nota metodológica/.test(p) && /Madurez: L4 \(acreditado L2, objetivo L3\)/.test(p), p.slice(0, 300));
  check('...with who and when, marked above the level stored then', /Valorado L4 por Luis el .*Justificación: Auditado en papel/.test(p) && /Valorado por encima de lo acreditado al registrarlo \(L4 frente a L2\)/.test(p));
  await h.click(/Exportar PDF/);
  const content = JSON.stringify(pdfs[0]?.content || []);
  check('the PDF carries it after the result: headline, who and when, mark, gates and the note', /Madurez del proceso \(CMM\)/.test(content) && /Madurez: L4 \(acreditado L2, objetivo L3\)/.test(content) && /Valorado L4 por Luis/.test(content) && /Valorado por encima de lo acreditado al registrarlo/.test(content) && /Hechos recurrentes sin huecos/.test(content) && /Nota metodológica/.test(content) && content.indexOf('Madurez del proceso') < content.indexOf('Campos del informe'), content.slice(0, 300));
  const generic = ['mp.info.6', 'op.exp.3', 'op.cont.2'].every(id => JSON.stringify(buildMaturityPdfContent({ ...maturity, controlId: id })).includes('Puerta'));
  check('the block does not depend on the control (any catalog control, also a new one)', generic);
  check('DRAFT in the PDF: «Sin medición todavía»', /Sin medición todavía/.test(JSON.stringify(buildMaturityPdfContent(draft))));
  check('without maturity the PDF says why instead of a level', /No se pudo calcular/.test(JSON.stringify(buildMaturityPdfContent(undefined, 'No se pudo calcular la madurez.'))));

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
