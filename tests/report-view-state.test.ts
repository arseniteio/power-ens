/** What a control's report section shows: never an endless spinner or a filler that looks measured. */
import { canExportReport, reportViewState } from '../public/ens/reports/report-view-state';
import { describeNotMeasuredOnAgent } from '../common/ens/core/scope/measurement-planes';
import { getENSCatalogControl } from '../common/ens/catalog';

declare const process: { exit(code: number): void };
const failures: string[] = [];
const check = (n: string, c: boolean, d: unknown = '') => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${!c && d !== '' ? ` — ${JSON.stringify(d)}` : ''}`); if (!c) failures.push(n); };

const base = { controlId: 'op.exp.3', hasData: true, hasResult: true, usesPanorama: false, panoramaLoading: false, notMeasured: () => undefined };

const loading = reportViewState({ ...base, hasData: false, hasResult: false });
check('without this selection\'s evaluation: loading, no PDF', loading.kind === 'loading' && !canExportReport(loading));
const error = reportViewState({ ...base, error: new Error('down'), hasData: false, hasResult: false });
check('with an error: the error (before anything), no PDF', error.kind === 'error' && !canExportReport(error));

const opExp3 = getENSCatalogControl('op.exp.3')!;
let asked = 0;
const onManager = reportViewState({
  ...base,
  agentId: '000',
  agentLabel: '000 · wazuh4',
  hasResult: false,
  notMeasured: () => { asked += 1; return describeNotMeasuredOnAgent(opExp3, '000', 'wazuh4', undefined); },
});
check('U-N2: agent control on the manager: «no se mide en esta máquina», not a spinner',
  onManager.kind === 'not-measured' && /no se mide en esta máquina/.test(onManager.title) && onManager.reason?.cause === 'PLANE' && asked === 1, onManager);
check('U-N2: with the common rule\'s motive', onManager.kind === 'not-measured' && onManager.text === describeNotMeasuredOnAgent(opExp3, '000', 'wazuh4', undefined)!.text);
check('U-N2: sin PDF', !canExportReport(onManager));

const mpInfo6 = getENSCatalogControl('mp.info.6')!;
const p04 = { controlId: 'mp.info.6', parameters: [{ id: 'P-04', value: ['srv-web01 | MEDIA'] }] } as any;
const outsideP04 = reportViewState({
  ...base,
  controlId: 'mp.info.6',
  agentId: '028',
  agentLabel: '028 · zimbraHldap',
  hasResult: false,
  notMeasured: () => describeNotMeasuredOnAgent(mpInfo6, '028', 'zimbraHldap', p04),
});
check('U-N2: machine outside the declared scope (P-04): DECLARED_SCOPE and what it declares',
  outsideP04.kind === 'not-measured' && outsideP04.reason?.cause === 'DECLARED_SCOPE' && /P-04/.test(outsideP04.text), outsideP04);
const withoutMotive = reportViewState({ ...base, agentId: '024', hasResult: false });
check('U-N2: without a known motive, it says so all the same (never a spinner)', withoutMotive.kind === 'not-measured' && /024/.test(withoutMotive.text));
const noneAtAll = reportViewState({ ...base, hasResult: false });
check('U-N2: no machine chosen and no result: «en ninguna máquina»', noneAtAll.kind === 'not-measured' && /ninguna máquina/.test(noneAtAll.title));

const overviewInProgress = reportViewState({ ...base, controlId: 'op.mon.2', usesPanorama: true, panoramaLoading: true });
check('U-N3: overview in progress: loading, not SIN_DATOS, no PDF', overviewInProgress.kind === 'panorama-loading' && !canExportReport(overviewInProgress));
const overviewReady = reportViewState({ ...base, controlId: 'op.mon.2', usesPanorama: true, panoramaLoading: false });
check('U-N3: overview arrived (or failed, with its notice): report and PDF', overviewReady.kind === 'ready' && canExportReport(overviewReady));
const ready = reportViewState(base);
check('this selection\'s result: report and PDF', ready.kind === 'ready' && canExportReport(ready));

failures.length ? console.log(`\n${failures.length} FAILURES`) : console.log('\nAll checks pass.');
process.exit(failures.length ? 1 : 0);
