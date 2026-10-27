/** «Informe anual (art. 32)» and «Medidas sin motor» on screen (op.mon.2 detail), and field 8 of the report. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) failures.push(n);
};

const evaluations: Record<string, any> = {};
const h = installReactHarness({
  overrides: {
    [require.resolve('pdfmake/build/pdfmake')]: () => ({ createPdf: () => ({ download: () => undefined }) }),
    [require.resolve('pdfmake/build/vfs_fonts')]: () => ({ vfs: {} }),
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (params: any) => ({ ...(evaluations[params.include] || { isLoading: true }), retry: () => undefined }),
    }),
  },
});

const { ENSControls } = require('../public/ens/data');
const { ControlDetailENS } = require('../public/ens/controls/control-detail');
const { buildOpMon2ReportModel } = require('../public/ens/reports/op-mon-2-report-model');
const { buildAnnualReport } = require('../common/ens/annual-report/annual-report');
const { describeAnnualReport } = require('../common/ens/annual-report/annual-report-export');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const http = require('../common/ens/configuration/services/configuration-http-client');
const fixture = require('./fixtures/annual-report-fixture');

const now = new Date('2026-10-20T12:00:00Z');
const report = buildAnnualReport({
  configuration: fixture.configuration(),
  results: fixture.results(),
  managerRows: { 'op.mon.2': fixture.opMon2Row(), 'op.exp.7': fixture.opExp7Row() },
  maturity: new Map([['op.acc.1', fixture.opAcc1Maturity], ['mp.eq.2', fixture.mpEq2Maturity]]),
  records: fixture.records(),
  now,
  timeZone: 'Europe/Madrid',
  pluginVersion: '1.4.0',
});
const closed = { ...report, period: '2026' };
const responseFor = (period?: string) => ({
  period: period || '2027',
  currentPeriod: '2027',
  lastClosedPeriod: '2026',
  closing: '03-31',
  periodFrom: period === '2026' ? '2025-04-01' : '2026-04-01',
  periodTo: period === '2026' ? '2026-03-31' : '2027-03-31',
  periods: [],
  report: period === '2026' ? closed : report,
  maturityVersion: { seqNo: 7, primaryTerm: 1 },
});

// Period 2025: frozen twice (r1 by the job, r2 regenerated); reading r1 returns the archived one.
const r1 = { revision: 1, frozenAt: '2026-04-01T00:30:00.000Z', frozenBy: 'ENSFácil (tarea diaria)' };
const r2 = { revision: 2, frozenAt: '2026-10-20T12:05:00.000Z', frozenBy: 'rsis', reason: 'Corrección de la DA' };
let regenerationBlocked = false;
const frozenResponse = (revision?: string) => ({
  ...responseFor('2026'),
  period: '2025',
  periodFrom: '2024-04-01',
  periodTo: '2025-03-31',
  frozen: revision === '1' ? { ...r1, history: [] } : { ...r2, history: [r1] },
  regeneration: regenerationBlocked ? { allowed: false, reason: 'No se puede regenerar: op.mon.2 reenvía los incidentes de los 400 días anteriores (desde el 2025-09-15) y el periodo empieza el 2024-04-01. El congelado vigente se conserva.' } : { allowed: true },
  report: { ...closed, period: '2025', header: closed.header.map((d: any) => (d.id === 'header.revision' ? { ...d, value: revision === '1' ? 1 : 2 } : d)) },
});
const gets: any[] = [];
const posts: any[] = [];
const puts: any[] = [];
http.setENSConfigurationHttp(() => ({
  get: async (path: string, options: any) => {
    gets.push({ path, query: options?.query });
    return path === '/api/ensfacil/annual-report'
      ? { statusCode: 200, error: 0, data: options?.query?.period === '2025' ? frozenResponse(options?.query?.revision) : responseFor(options?.query?.period) }
      : { statusCode: 200, error: 0, data: { configuration: null, metadata: null } };
  },
  post: async (path: string, options: any) => {
    posts.push({ path, body: JSON.parse(options.body) });
    return { statusCode: 200, error: 0, data: { frozen: { revision: 1 }, report: closed } };
  },
  put: async (path: string, options: any) => {
    puts.push({ path, body: JSON.parse(options.body) });
    return { statusCode: 200, error: 0, data: { record: {}, version: { seqNo: 8, primaryTerm: 1 } } };
  },
}));

(async () => {
  const doc = JSON.parse(JSON.stringify(defaultENSConfigurationTemplate));
  doc.global.ensLevel = 'MEDIO';
  ensConfigurationRepository.completeHydration(doc);
  const control = ENSControls.find((c: any) => c.id === 'op.mon.2');
  const result = fixture.result('op.mon.2', 'CUMPLE', 100);
  evaluations.control = { data: { meta: { computedAt: now.toISOString(), evaluatedAt: now.toISOString(), fingerprint: 'f', level: 'MEDIO', facts: { count: 1 }, scope: [] }, result, agents: [], traceabilityTotal: 0, traceabilityAvailable: 0 }, isLoading: false };

  console.log('1. op.mon.2 detail: the annual report');
  let p = await h.render(ControlDetailENS, { control, onBack: () => undefined }, 6);
  check('the panel asks the annual report route for the current period', gets.some(g => g.path === '/api/ensfacil/annual-report' && !g.query?.period));
  check('«Informe anual (art. 32)» with the period and its state', /Informe anual \(art\. 32\)/.test(p) && /Periodo 2027 \(del 2026-04-01 al 2027-03-31\), en curso: cifras de hoy/.test(p), p.slice(p.indexOf('Informe anual'), p.indexOf('Informe anual') + 600));
  check('the summary of the data set', /Grado de implantación de la organización: 80 %/.test(p));
  check('JSON and CSV downloads; no freeze of the open period', /Descargar JSON/.test(p) && /Descargar CSV/.test(p) && !/\[ Congelar \]/.test(p));

  console.log('2. «Medidas sin motor»');
  check('the section with the declared entries and the DRAFT controls', /Medidas sin motor/.test(p) && /Política de seguridad/.test(p) && /POL-SEG-01 Política de seguridad/.test(p) && /Sin medición todavía/.test(p));
  const declare = h.findAll('EuiButtonEmpty').filter(node => /Declarar/.test(node.texto));
  check('one «Declarar» per measure without engine (50)', declare.length === 50, declare.length);
  await declare[0].props.onClick();
  p = await h.rerender();
  check('«Declarar» on org.1 opens the form with what is declared', /Declarar la medida · org\.1/.test(p) && /Medida sin motor: esta entrada es el dato del informe anual/.test(p));
  await h.click(/^Guardar$/);
  p = await h.rerender();
  const sent = puts[0]?.body;
  check('saved through the maturity route with the version of the report', puts[0]?.path === '/api/ensfacil/maturity' && sent.kind === 'declaration' && sent.controlId === 'org.1' && sent.entry.applies === 'si' && sent.entry.level === 3 && JSON.stringify(sent.expectedVersion) === '{"seqNo":7,"primaryTerm":1}', sent);
  check('...and the report is read again', gets.filter(g => g.path === '/api/ensfacil/annual-report').length >= 2);

  console.log('3. A closed period: «Congelar» with a reason');
  const select = h.findAll('EuiSelect').find(node => node.props.prepend === 'Periodo');
  check('the period selector offers the current and the last closed period', Boolean(select) && select!.props.options.map((o: any) => o.value).join() === '2027,2026');
  select!.props.onChange({ target: { value: '2026' } });
  p = await h.rerender(6);
  check('the closed period says its figures are today\'s, not the closing\'s', /cerrado y sin congelar: cifras de hoy, no las del cierre/.test(p));
  await h.click(/^Congelar$/, 'EuiButtonEmpty');
  p = await h.rerender();
  await h.click(/^Congelar$/, 'EuiButton');
  p = await h.rerender();
  check('without a reason nothing is sent', posts.length === 0 && /Motivo: obligatorio/.test(p));
  h.findAll('EuiTextArea')[0].props.onChange({ target: { value: 'Cierre del ejercicio' } });
  await h.rerender();
  await h.click(/^Congelar$/, 'EuiButton');
  await h.rerender();
  check('the freeze is sent with the period, the reason and a null revision', posts[0]?.path === '/api/ensfacil/annual-report/freeze' && JSON.stringify(posts[0].body) === '{"period":"2026","reason":"Cierre del ejercicio","expectedRevision":null}', posts);

  console.log('4. A frozen period with an earlier revision');
  h.findAll('EuiSelect').find(node => node.props.prepend === 'Periodo')!.props.onChange({ target: { value: '2025' } });
  p = await h.rerender(6);
  const revisionSelect = () => h.findAll('EuiSelect').find(node => node.props.prepend === 'Revisión');
  check('the frozen period offers its revisions, the current one marked', Boolean(revisionSelect()) && revisionSelect()!.props.options.map((o: any) => o.text).join(' | ') === 'r2 · 2026-10-20 · rsis (vigente) | r1 · 2026-04-01 · ENSFácil (tarea diaria)', revisionSelect()?.props.options);
  check('the current revision offers «Regenerar»', /\[ Regenerar \]/.test(p) && !h.findAll('EuiButtonEmpty').find(node => /Regenerar/.test(node.texto))!.props.isDisabled);
  regenerationBlocked = true;
  h.findAll('EuiSelect').find(node => node.props.prepend === 'Periodo')!.props.onChange({ target: { value: '2026' } });
  await h.rerender(6);
  h.findAll('EuiSelect').find(node => node.props.prepend === 'Periodo')!.props.onChange({ target: { value: '2025' } });
  p = await h.rerender(6);
  const blockedButton = h.findAll('EuiButtonEmpty').find(node => /Regenerar/.test(node.texto));
  const tip = h.findAll('EuiToolTip').find(node => /No se puede regenerar/.test(String(node.props.content)));
  check('once op.mon.2 no longer re-sends the period, «Regenerar» is disabled with the reason in its tooltip', Boolean(blockedButton?.props.isDisabled) && Boolean(tip), [blockedButton?.props.isDisabled, tip?.props.content]);
  regenerationBlocked = false;
  revisionSelect()!.props.onChange({ target: { value: '1' } });
  p = await h.rerender(6);
  check('choosing r1 reads it from the route', gets.some(g => g.query?.period === '2025' && g.query?.revision === '1'));
  check('r1 is shown and exported as r1, without «Regenerar» (only the current one is regenerated)', /revisión 1/.test(p) && !/\[ Regenerar \]/.test(p) && revisionSelect()!.props.value === '1');

  console.log('5. Field 8 of the op.mon.2 report');
  const model = buildOpMon2ReportModel(result, [result], { annualReport: report });
  const field8 = model.fields.find((f: any) => f.id === 'op.mon.2.campo8');
  check('field 8 is the summary of the same data set', JSON.stringify(field8.details) === JSON.stringify(describeAnnualReport(report)) && /ensfacil\.art32\.v1/.test(field8.value));
  const without = buildOpMon2ReportModel(result, [result]).fields.find((f: any) => f.id === 'op.mon.2.campo8');
  check('without the data set it keeps its lines', without.status === 'NO_APLICA' && /Grado de implantación/.test(without.details.join(' ')));

  console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
