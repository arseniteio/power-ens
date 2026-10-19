/** The Overview: machines, control x machine matrix and totals. */
import { installReactHarness } from './fixtures/react-harness';

declare const process: { exit(code: number): void };
declare const require: (id: string) => any;
declare const __dirname: string;

const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => {
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d).slice(0, 500)}` : ''}`);
  if (!c) failures.push(n);
};

const responses: Record<string, any> = {};
const h = installReactHarness({
  overrides: {
    [`${__dirname}/../public/evaluation/use-evaluation.ts`]: () => ({
      useEnsEvaluation: (p: any) => {
        const r = responses[p.include];
        return { data: r, error: undefined, isLoading: !r, isRefreshing: false, retry: () => undefined };
      },
    }),
  },
});

const m = require('../public/ens/overview/overview-model') as typeof import('../public/ens/overview/overview-model');
const { ENSControls } = require('../public/ens/data');
const { ensConfigurationRepository } = require('../common/ens/configuration/repository');
const { defaultENSConfigurationTemplate } = require('../common/ens/configuration/data/default-configuration');
const { OverviewENS } = require('../public/ens/overview');
const { parseRouterSearch } = require('../public/routing/router-search');

const NOW = Date.parse('2026-10-17T16:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();
const entry = (controlId: string, status: string, score?: number, notMet = 0, notEvidenced = 0) => ({ controlId, status, score, evaluated: true, requirementsNotMet: notMet, requirementsNotEvidenced: notEvidenced });
const scope = [
  { id: '000', name: 'manager01', status: 'active' },
  { id: '102', name: 'ldap01', status: 'disconnected' },
  { id: '101', name: 'srv-web01', status: 'active' },
];
const response: any = {
  meta: { evaluatedAt: new Date(NOW).toISOString(), computedAt: new Date(NOW).toISOString(), fingerprint: 'f', refreshing: false, level: 'BAJO', scope, facts: { count: 10 }, window: {}, inventory: {} },
  controls: [entry('op.acc.1', 'PARCIAL', 50, 2), entry('op.exp.7', 'NO_CUMPLE', 0, 3), entry('mp.info.6', 'NO_CUMPLE', 0, 1)],
  agents: [
    { agentId: '101', controls: [entry('op.acc.1', 'CUMPLE', 100), entry('mp.info.6', 'NO_CUMPLE', 0, 1), entry('op.exp.3', 'NO_EVALUABLE', 0, 2, 2)] },
    { agentId: '102', controls: [entry('op.acc.1', 'NO_CUMPLE', 0, 4, 1), entry('op.exp.3', 'PARCIAL', 40, 1)] },
    { agentId: '000', controls: [entry('op.exp.7', 'NO_CUMPLE', 0, 3), entry('op.mon.3', 'CUMPLE', 100)] },
  ],
  freshness: {
    checkedAt: new Date(NOW).toISOString(),
    agents: [
      { agentId: '101', count: 50, newest: ago(1) },
      { agentId: '102', count: 20, newest: ago(50) },
      { agentId: '000', count: 30, newest: ago(0.5), lastHeartbeat: ago(0.5) },
    ],
    cells: [
      { controlId: 'op.acc.1', agentId: '101', count: 10, newest: ago(1) },
      { controlId: 'op.acc.1', agentId: '102', count: 10, newest: ago(50) },
      { controlId: 'op.exp.7', agentId: '000', count: 5, newest: ago(2) },
    ],
  },
  nonConformities: [
    { controlId: 'op.exp.6', id: 'NC-1', requirementId: 'op.exp.6.1', origin: 'MEDIDA', evidenceIds: ['EV-11'], agentIds: ['101'], title: 'Faltan scripts de respuesta.', titleEvidenceId: 'EV-11', titleStatus: 'NO_CUMPLE' },
    { controlId: 'op.acc.1', id: 'NC-2', requirementId: 'op.acc.1.2', origin: 'NO_EVIDENCIADA', cause: 'COLLECTION', evidenceIds: ['EV-03'], agentIds: ['102'], title: 'El requisito op.acc.1.2 no se ha podido demostrar: no ha llegado ningún dato para EV-03.' },
    { controlId: 'op.nub.1', id: 'NC-3', requirementId: 'op.nub.1.1', origin: 'NO_EVIDENCIADA', cause: 'CATALOG', evidenceIds: [], agentIds: [], title: 'El requisito op.nub.1.1 no declara ninguna evidencia en el catálogo.' },
    { controlId: 'op.exp.4', id: 'NC-4', requirementId: 'op.exp.4.1', origin: 'NO_EVIDENCIADA', cause: 'CONFIGURATION', evidenceIds: ['EV-01'], agentIds: ['101', '102'], title: 'P-01 (inventario) sin configurar.', titleEvidenceId: 'EV-01', titleStatus: 'NO_EVALUABLE' },
  ],
};

(async () => {
  console.log('1. The model');
  const machines = m.overviewMachines(scope);
  check('machines by id and the manager last', machines.map(x => x.agentId).join() === '101,102,000');
  const matrix = m.buildMatrix(ENSControls.map((c: any) => ({ id: c.id, title: c.title })), machines, response.controls, response.agents, {
    isManagerOnly: id => ['op.exp.7', 'op.exp.9', 'op.cont.2', 'op.cont.3', 'op.mon.1', 'op.mon.2', 'op.nub.1'].includes(id),
    notMeasuredReason: (id, a) => `${id} no se mide en ${a}`,
  });
  const row = (id: string) => matrix.find(r => r.controlId === id)!;
  check('the 23 controls, always', matrix.length === 23);
  check('op.acc.1: result on 101 and 102; on the manager, «no se mide» with the motive', row('op.acc.1').cells['101'].kind === 'result' && (row('op.acc.1').cells['102'] as any).notMet === 4 && row('op.acc.1').cells['000'].kind === 'not-measured' && (row('op.acc.1').cells['000'] as any).reason === 'op.acc.1 no se mide en 000');
  check('op.exp.7 (manager only): result on 000, «en el manager» on the others', row('op.exp.7').cells['000'].kind === 'result' && row('op.exp.7').cells['101'].kind === 'manager');
  check('mp.info.6 only on 101 (outside its scope on 102: «no se mide»)', row('mp.info.6').cells['101'].kind === 'result' && row('mp.info.6').cells['102'].kind === 'not-measured');
  check('the control bar across machines (V4)', row('op.acc.1').tally?.cumple === 1 && row('op.acc.1').tally?.noCumple === 1 && row('op.acc.1').tally?.total === 2);
  check('freshness: fresh, old (> 24 h), never, not expected',
    m.freshnessCell(response.freshness, 'op.acc.1', '101', true, NOW).kind === 'fresh' &&
    m.freshnessCell(response.freshness, 'op.acc.1', '102', true, NOW).kind === 'stale' &&
    m.freshnessCell(response.freshness, 'op.exp.3', '101', true, NOW).kind === 'never' &&
    m.freshnessCell(response.freshness, 'op.acc.1', '000', false, NOW).kind === 'not-expected');
  const summary = m.buildMachineSummaries(machines, response.agents, response.freshness, NOW);
  const r101 = summary.find(x => x.agentId === '101')!;
  const r102 = summary.find(x => x.agentId === '102')!;
  check('per machine: states, requirements that do not comply and unproven', r101.counts.CUMPLE === 1 && r101.counts.NO_CUMPLE === 1 && r101.counts.NO_EVALUABLE === 1 && r101.notMet === 3 && r101.notEvidenced === 2, r101);
  check('the machine without data for 50 h, old; the one from 1 h ago, not', r102.stale && !r101.stale);
  const r000 = summary.find(x => x.agentId === '000')!;
  check('«Último dato» is the date used to decide red (the latest of fact and heartbeat)', r102.lastSeen === ago(50) && r000.lastSeen === ago(0.5));
  check('worst first: NO_CUMPLE before NO_EVALUABLE; without those that comply', r101.worst.map(w => w.controlId).join() === 'mp.info.6,op.exp.3', r101.worst);
  const names: Record<string, string> = { '101': 'srv-web01', '102': 'ldap01' };
  const cola = m.buildWorkQueue(response.nonConformities, undefined, () => true, id => names[id]);
  check('the queue, by owner and in action order', cola.map(g => g.owner).join(' | ') === 'Sistema auditado | Responsable ENS | Operación Wazuh | Producto ENSFácil', cola.map(g => g.owner));
  check('the server headline, with its evidence and state', cola[0].items[0].title === 'Faltan scripts de respuesta.' && cola[0].items[0].evidenceId === 'EV-11' && cola[0].items[0].status === 'NO_CUMPLE');
  check('without a culprit evidence, only the headline', cola[2].items[0].evidenceId === undefined);
  const unregistered = m.buildWorkQueue(response.nonConformities, undefined, id => id !== 'op.acc.1', id => names[id]);
  check('an unconfigured control: to «Responsable ENS», with the action of adding it', unregistered.find(g => g.owner === 'Responsable ENS')!.items.some(i => i.controlId === 'op.acc.1') && !unregistered.some(g => g.owner === 'Operación Wazuh'));
  check('where: machines by name; the catalog\'s, all', cola[0].items[0].machines === 'srv-web01 (101)' && cola[3].items[0].machines === 'todas las máquinas');
  const of102 = m.buildWorkQueue(response.nonConformities, '102');
  check('with a machine chosen, only its own (and the catalog\'s)', of102.flatMap(g => g.items.map(i => i.nc.id)).sort().join() === 'NC-2,NC-3,NC-4');
  const tl = [
    { date: '2026-10-15', label: '15/10', isCurrent: false, events: 1, score: 40, controls: { 'op.acc.1': { status: 'NO_CUMPLE', score: 0 }, 'op.exp.7': { status: 'NO_CUMPLE', score: 0 } } },
    { date: '2026-10-16', label: '16/10', isCurrent: false, events: 1, score: 45, controls: { 'op.acc.1': { status: 'PARCIAL', score: 50 }, 'op.exp.7': { status: 'NO_CUMPLE', score: 0 } } },
    { date: '2026-10-17', label: '17/10', isCurrent: true, events: 1, score: 50, controls: { 'op.acc.1': { status: 'PARCIAL', score: 50 }, 'op.exp.7': { status: 'NO_CUMPLE', score: 0 } } },
  ];
  const series = m.buildTrend(tl as any, ['op.acc.1', 'op.exp.7', 'op.nub.1']);
  check('trend: +10 points; op.acc.1 changed (NO_CUMPLE → PARCIAL), op.exp.7 did not', series.delta === 10 && series.rows[0].changed && series.rows[0].first === 'NO_CUMPLE' && series.rows[0].last === 'PARCIAL' && !series.rows[1].changed);
  check('a control without points: cells without state', series.rows[2].cells.every(c => !c.status));
  check('age: min, h, d, never', m.describeAge(ago(0.2), NOW) === 'hace 12 min' && m.describeAge(ago(5), NOW) === 'hace 5 h' && m.describeAge(ago(72), NOW) === 'hace 3 d' && m.describeAge(undefined, NOW) === 'nunca');

  console.log('2. The screen');
  ensConfigurationRepository.completeHydration(JSON.parse(JSON.stringify(defaultENSConfigurationTemplate)));
  h.setSearch('?tabView=overview');
  responses.overview = response;
  responses.summary = { meta: response.meta, controls: [], timeline: tl };
  let p = await h.render(OverviewENS);
  check('the machine table, with the old one in red', h.findAll('EuiHealth').some(n => n.props.color === 'danger') && /hace 50 h|hace 2 d/.test(p));
  check('the matrix: 23 rows', h.findAll('EuiTableRow').length === 23, h.findAll('EuiTableRow').length);
  let opens: any;
  for (const enlace of h.findAll('EuiLink')) {
    h.setSearch('?tabView=overview');
    enlace.props.onClick?.();
    const q = parseRouterSearch(h.search());
    if (q.control === 'op.acc.1' && q.agentId === '102') { opens = q; break; }
  }
  check('op.acc.1\'s cell on 102 opens that control\'s detail on that machine', opens?.tabView === 'plugins', opens);
  const rowAcc1 = h.findAll('EuiBadge').filter(n => n.texto === '0%');
  check('...and paints 0 % with the 4 requirements that do not comply', rowAcc1.length > 0 && /\[ 0% \] 4/.test(p), p.slice(p.indexOf('op.acc.1'), p.indexOf('op.acc.1') + 200));
  h.setSearch('?tabView=overview');
  p = await h.render(OverviewENS);
  const group = h.find('EuiButtonGroup');
  group!.props.onChange('frescura');
  p = await h.rerender();
  check('freshness: «nunca» where it is measured and nothing has arrived, and ages', /nunca/.test(p) && /hace 1 h/.test(p) && /hace 2 d/.test(p));
  check('the queue: one accordion per owner', h.findAll('EuiAccordion').length === 4);
  check('the trend: one segment per day and op.acc.1\'s row marked as changed', /NO_CUMPLE → PARCIAL/.test(p));
  check('the trend: legend with the five states and «sin resultado», and the dates of the first and last day', ['CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA'].every(e => p.includes(e)) && /sin resultado ese día/.test(p) && /15\/10 — 17\/10 \(hoy\)/.test(p));
  responses.summary = undefined;
  p = await h.rerender();
  check('without the trend yet: its loading, and the rest already painted', /Calculando el resultado de cada día/.test(p) && h.findAll('EuiTableRow').length === 23);

  console.log('3. The matrix with 6 and with 50 machines');
  for (const n of [6, 50]) {
    const many2 = Array.from({ length: n }, (_, i) => ({ id: String(200 + i).padStart(3, '0'), name: `servidor-de-nombre-largo-${i}`, status: 'active' }));
    responses.overview = {
      ...response,
      meta: { ...response.meta, scope: many2 },
      agents: many2.map(m => ({ agentId: m.id, controls: [entry('op.acc.1', 'CUMPLE', 100)] })),
      freshness: { checkedAt: response.meta.evaluatedAt, agents: [], cells: [] },
    };
    h.reset();
    p = await h.render(OverviewENS);
    const tabla = h.findAll('EuiTable')[0];
    const headers = h.findAll('EuiTableHeaderCell');
    check(`${n} machines: table in automatic layout, wider than ${n} × 64 px (it scrolls, it does not narrow)`, tabla?.props.tableLayout === 'auto' && tabla.props.style.minWidth >= n * 64, tabla?.props);
    check(`${n} machines: «Control» fixed on the left and «Máquinas» next to it; each machine with a minimum width`,
      headers.length === n + 2 && headers[0].props.style.position === 'sticky' && /Máquinas/.test(headers[1].texto) && headers.slice(2).every(c => c.props.style.minWidth === 64));
    check(`${n} machines: each header with id and name (trimmed; whole in the tooltip)`, h.findAll('EuiToolTip').filter(t => /^2\d\d · servidor-de-nombre-largo-/.test(String(t.props.content))).length === n && /200 servidor-de-nombre-largo-0/.test(p));
    check(`${n} machines: the «Control» cells fixed too`, h.findAll('EuiTableRowCell').filter(c => c.props.style?.position === 'sticky').length === 23);
  }

  console.log('4. First load in parts (`meta.pending`) and pending series');
  {
    const pendingOne = { controlId: 'op.exp.8', status: 'NO_EVALUABLE', evaluated: false, pending: true, requirementsNotMet: 0, requirementsNotEvidenced: 0 };
    const managerPending = { ...pendingOne, controlId: 'op.exp.7' };
    const partialControls = [entry('op.acc.1', 'PARCIAL', 50, 2), managerPending, pendingOne, entry('mp.info.6', 'NO_CUMPLE', 0, 1)];
    const matrix = m.buildMatrix(ENSControls.map((c: any) => ({ id: c.id, title: c.title })), m.overviewMachines(scope), partialControls, response.agents, {
      isManagerOnly: id => ['op.exp.7'].includes(id),
      notMeasuredReason: () => 'no se mide',
    });
    const row8 = matrix.find(r => r.controlId === 'op.exp.8')!;
    const row7 = matrix.find(r => r.controlId === 'op.exp.7')!;
    check('a pending control: «calculando» on each machine, neither result nor «no se mide», no bar', row8.pending === true && Object.values(row8.cells).every(c => c.kind === 'pending') && row8.tally === undefined);
    check('pending and manager-only: «en el manager» on agents, «calculando» on 000 (even if its old row said otherwise)', row7.cells['101'].kind === 'manager' && row7.cells['000'].kind === 'pending');
    check('those already computed, as always', matrix.find(r => r.controlId === 'op.acc.1')!.cells['101'].kind === 'result' && !matrix.find(r => r.controlId === 'op.acc.1')!.pending);
    const text = m.describeOverviewPending({ rows: 4, controls: ['op.exp.7', 'op.exp.8'], total: 20 });
    check('what is missing, stated', text?.title === 'Calculando la evaluación: 16 de 20 filas (control × máquina) listas' && /Faltan 2 controles \(op\.exp\.7, op\.exp\.8\)/.test(text!.text) && m.describeOverviewPending(undefined) === undefined, text);

    h.reset();
    h.setSearch('?tabView=overview');
    responses.overview = {
      ...response,
      meta: { ...response.meta, refreshing: true, pending: { rows: 4, controls: ['op.exp.7', 'op.exp.8'], total: 20 } },
      controls: partialControls,
      nonConformities: [],
    };
    responses.summary = { meta: { ...response.meta, refreshing: true, seriesPending: true }, controls: [] };
    p = await h.render(OverviewENS);
    check('the screen says how much is missing and what', h.findAll('EuiCallOut').some(c => /Calculando la evaluación: 16 de 20 filas/.test(String(c.props.title))) && /Faltan 2 controles \(op\.exp\.7, op\.exp\.8\)/.test(p));
    check('no per-machine figures that look final (neither counts nor worst controls)', !h.findAll('EuiBadge').some(b => /^\d+ (CUMPLE|NO_CUMPLE|PARCIAL|NO_EVALUABLE|NO_APLICA)$/.test(b.texto)) && h.findAll('EuiBadge').filter(b => b.props.iconType === 'clock').length >= 3 * 3);
    check('the matrix: «…» in pending rows, the computed ones with their result', h.findAll('EuiTableRow').length === 23 && /\[ 50% \]|\[ 100% \]/.test(p) && /Calculando…/.test(p));
    check('the queue does not say «No hay no conformidades abiertas» with controls still to compute', !/No hay no conformidades abiertas/.test(p) && /Incompleta: faltan op\.exp\.7, op\.exp\.8/.test(p));
    check('the trend, with the series pending: «Calculando la serie», not an empty chart', /Calculando la serie de 30 días/.test(p) && !/sin resultado ese día/.test(p));
    responses.overview = response;
    responses.summary = { meta: response.meta, controls: [], timeline: [] };
    p = await h.rerender();
    check('complete: without the notice, with the queue and the counts', !/Calculando la evaluación/.test(p) && h.findAll('EuiAccordion').length === 4 && h.findAll('EuiBadge').some(b => /^\d+ CUMPLE$/.test(b.texto)));
  }

  console.log(failures.length ? `\n${failures.length} FAILURES` : '\nALL OK');
  process.exit(failures.length ? 1 : 0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
