/** Art. 32 data set: per Annex II measure (measured, declared, DRAFT, not applicable), incidents, resources, export. */
import * as fs from 'fs';
import * as path from 'path';
import { buildAnnualReport, markAnnualReportFrozen } from '../common/ens/annual-report/annual-report';
import { annualReportData, annualReportFileName, describeAnnualReport, ENS_ANNUAL_CSV_COLUMNS, toAnnualReportCsv, toAnnualReportJson } from '../common/ens/annual-report/annual-report-export';
import { annualPeriodBounds, annualPeriodOfDay, lastClosedAnnualPeriod } from '../common/ens/annual-report/annual-period';
import { ENS_ANNUAL_FIELD_IDS } from '../common/ens/annual-report/annual-report-types';
import type { ENSAnnualDatum, ENSAnnualReport } from '../common/ens/annual-report/annual-report-types';
import { ENS_ANNEX_II_MEASURES } from '../common/ens/annual-report/annex-ii-measures';
import { ENS_MEASURES_WITHOUT_ENGINE, maturityRecordTargetError } from '../common/ens/annual-report/declared-measures';
import { ENSCatalog } from '../common/ens/catalog';
import { listControlDimensions } from '../common/ens/core/control-level';
import { readControlMaturityRecord, validateMaturityEntry } from '../common/ens/maturity/maturity-records';
import { withoutEngineRows, declarationInitial, freezeActionOf, describeFreezeStatus } from '../public/ens/annual-report/annual-report-view';
import { buildOpMon2ReportModel } from '../public/ens/reports/op-mon-2-report-model';
import { configuration, consolidated, INCIDENTS, mpEq2Maturity, opAcc1Maturity, opExp7Row, opMon2Row, records, result, results } from './fixtures/annual-report-fixture';

declare const process: { exit(code: number): void };
declare const __dirname: string;
const failures: string[] = [];
const check = (name: string, ok: boolean, detail: unknown = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${!ok && detail !== '' ? ` — ${JSON.stringify(detail).slice(0, 500)}` : ''}`);
  if (!ok) failures.push(name);
};
const section = (title: string) => console.log(`\n${title}`);

const NOW = new Date('2026-10-20T12:00:00Z');
const build = (extra: Partial<Parameters<typeof buildAnnualReport>[0]> = {}): ENSAnnualReport =>
  buildAnnualReport({
    configuration: configuration(),
    results: results(),
    managerRows: { 'op.mon.2': opMon2Row(), 'op.exp.7': opExp7Row() },
    maturity: new Map([
      ['op.acc.1', opAcc1Maturity],
      ['mp.eq.2', mpEq2Maturity],
    ]),
    records: records(),
    now: NOW,
    timeZone: 'Europe/Madrid',
    pluginVersion: '1.4.0',
    ...extra,
  });
const measure = (report: ENSAnnualReport, id: string) => report.measures.find(entry => entry.id === id)!;
const get = (data: ENSAnnualDatum[], id: string, key?: string) => data.find(entry => entry.id === id && (key === undefined || entry.key === key));
const m = (report: ENSAnnualReport, measureId: string, field: string) => get(measure(report, measureId).data, `measure.${field}`)!;

const report = build();

section('Annex II table and the measures without engine');
check('73 measures, in the order of the Annex', ENS_ANNEX_II_MEASURES.length === 73 && report.measures.map(entry => entry.id).join() === ENS_ANNEX_II_MEASURES.map(entry => entry.id).join());
const engines = (engine: string) => report.measures.filter(entry => entry.engine === engine).length;
check('23 measured, 11 «Sin medición todavía», 39 without engine', engines('MEDIDO') === 23 && engines('SIN_MEDICION') === 11 && engines('SIN_MOTOR') === 39, [engines('MEDIDO'), engines('SIN_MEDICION'), engines('SIN_MOTOR')]);
check('«Medidas sin motor» lists the 50 measures that take a declared entry', ENS_MEASURES_WITHOUT_ENGINE.length === 50 && withoutEngineRows(report).length === 50);
check(
  'every catalog control follows the axis of the Annex table',
  ENSCatalog.every(control => {
    const annex = ENS_ANNEX_II_MEASURES.find(entry => entry.id === control.id);
    const dimensions = listControlDimensions(control);
    return annex && (annex.axis === 'CATEGORIA' ? dimensions.length === 0 : annex.axis.join() === dimensions.join());
  })
);

section('Measured control (op.acc.1)');
check('applies by the Statement of Applicability', m(report, 'op.acc.1', 'applies').value === true && m(report, 'op.acc.1', 'applies').source === 'SOA' && /P-01, fila «op\.acc\.1 \| sí \| MEDIO»/.test(m(report, 'op.acc.1', 'applies').trace));
check('implementation and coverage from the engine', m(report, 'op.acc.1', 'implementation_pct').value === 80 && m(report, 'op.acc.1', 'implementation_pct').source === 'ENGINE' && m(report, 'op.acc.1', 'coverage_pct').value === 85);
check('status from the engine', m(report, 'op.acc.1', 'status').value === 'PARCIAL');
check(
  'maturity: accredited by the engine, assessed by a person, target of the category',
  m(report, 'op.acc.1', 'maturity_accredited').value === 2 &&
    m(report, 'op.acc.1', 'maturity_accredited').source === 'MATURITY_ENGINE' &&
    m(report, 'op.acc.1', 'maturity_assessed').value === 3 &&
    m(report, 'op.acc.1', 'maturity_assessed').source === 'ASSESSMENT' &&
    /Luis Pérez/.test(m(report, 'op.acc.1', 'maturity_assessed').trace) &&
    m(report, 'op.acc.1', 'maturity_target').value === 3 &&
    m(report, 'op.acc.1', 'maturity_target').source === 'CONFIGURATION'
);
check('documentary reference: the procedure registered in its maturity', /^PRO-ACC-01 versión 2\.1/.test(String(m(report, 'op.acc.1', 'documentary_reference').value)) && m(report, 'op.acc.1', 'owner').value === 'RSEG');
check('applied level and requirement of the Annex (T A, MEDIO: +R1)', m(report, 'op.acc.1', 'level').value === 'MEDIO' && m(report, 'op.acc.1', 'annex_requirement').value === '+R1');

section('Measures without engine, declared');
check('org.1: applies by the DA, latest declared entry is the assessed level', m(report, 'org.1', 'applies').source === 'SOA' && m(report, 'org.1', 'maturity_assessed').value === 3 && m(report, 'org.1', 'maturity_assessed').source === 'DECLARED');
check('org.1: reference, link, owner and date of the latest entry', /^POL-SEG-01 Política de seguridad \(https:\/\/intranet\.ejemplo\/pol-seg-01\.pdf\)$/.test(String(m(report, 'org.1', 'documentary_reference').value)) && m(report, 'org.1', 'owner').value === 'RSEG' && m(report, 'org.1', 'assessed_at').value === '2026-06-01');
check('org.1: no implementation percentage (no engine), said so', m(report, 'org.1', 'implementation_pct').value === null && m(report, 'org.1', 'implementation_pct').source === 'NONE' && m(report, 'org.1', 'status').value === 'SIN_MOTOR');
check('op.pl.1: without a DA row, the declared entry decides it does not apply', m(report, 'op.pl.1', 'applies').value === false && m(report, 'op.pl.1', 'applies').source === 'DECLARED');
check('op.pl.1: not applicable and not assessed', m(report, 'op.pl.1', 'maturity_assessed').value === null);

section('DRAFT control: «Sin medición todavía»');
check('mp.eq.2: SIN_MEDICION, no percentage', m(report, 'mp.eq.2', 'status').value === 'SIN_MEDICION' && m(report, 'mp.eq.2', 'implementation_pct').value === null);
check('mp.eq.2: no accredited level, the declared one is the assessed level', m(report, 'mp.eq.2', 'maturity_accredited').value === null && m(report, 'mp.eq.2', 'maturity_assessed').value === 2 && m(report, 'mp.eq.2', 'maturity_assessed').source === 'DECLARED');
check('mp.eq.2 is in «Medidas sin motor» as «Sin medición todavía»', withoutEngineRows(report).find(row => row.id === 'mp.eq.2')?.engine === 'Sin medición todavía');

section('Not applicable');
check('op.ext.3: the DA says no', m(report, 'op.ext.3', 'applies').value === false && m(report, 'op.ext.3', 'applies').source === 'SOA');
check('op.cont.1 (D at BAJO): the Annex does not require it, no DA row', m(report, 'op.cont.1', 'applies').value === false && m(report, 'op.cont.1', 'applies').source === 'ANNEX_II' && m(report, 'op.cont.1', 'level').value === 'BAJO');
check('mp.if.6: the DA says yes although the Annex does not require it at BAJO, and the trace says so', m(report, 'mp.if.6', 'applies').value === true && /el Anexo II no la exige en nivel BAJO/.test(m(report, 'mp.if.6', 'applies').trace));
check('op.cont.2 (measured, NO_APLICA at its level): no percentage, does not apply', m(report, 'op.cont.2', 'implementation_pct').value === null && m(report, 'op.cont.2', 'applies').value === false);
check('mp.eq.4 (C at BAJO, DRAFT, no declaration): applies by the Annex, target of BÁSICA', m(report, 'mp.eq.4', 'applies').value === true && m(report, 'mp.eq.4', 'maturity_target').value === 2);

section('Aggregates');
const imp = (id: string, key?: string) => get(report.implementation, id, key)?.value;
check('global implementation: over the DA (P-01) only, op.acc.1 80 %', imp('implementation.global_pct') === 80 && imp('implementation.framework_pct', 'op') === 80 && imp('implementation.framework_pct', 'org') === null);
check(
  'P-01 applicable = measured + declared + without data (op.acc.1; org.1 and mp.eq.2; mp.if.6)',
  imp('implementation.measures_applicable') === 4 &&
    imp('implementation.measures_measured') === 1 &&
    imp('implementation.measures_declared') === 2 &&
    imp('implementation.measures_without_data') === 1 &&
    /mp\.if\.6/.test(get(report.implementation, 'implementation.measures_without_data')!.trace)
);
check('measures that apply outside the DA are counted apart, not in the figure', (imp('implementation.measures_applicable_outside_soa') as number) > 0 && /op\.exp\.3/.test(get(report.implementation, 'implementation.measures_applicable_outside_soa')!.trace));
{
  // A partial DA: field 2 of op.mon.2 and the data set give the same figure (60 % = op.acc.1 80 and op.exp.3 40).
  const partialRow = opMon2Row('03-31', { p01: ['op.acc.1 | sí', 'op.exp.3 | sí', 'org.1 | sí'] });
  const partial = build({ managerRows: { 'op.mon.2': partialRow, 'op.exp.7': opExp7Row() } });
  const field2 = buildOpMon2ReportModel(partialRow, results()).fields.find((f: any) => f.id === 'op.mon.2.campo2')!;
  check('a partial DA: the same implementation figure in field 2 and in the data set', get(partial.implementation, 'implementation.global_pct')!.value === 60 && /^60 % global sobre 2 de 3 medidas aplicables/.test(field2.value), [get(partial.implementation, 'implementation.global_pct')!.value, field2.value]);
  const noDa = build({ managerRows: { 'op.mon.2': opMon2Row('03-31', { p01: [] }), 'op.exp.7': opExp7Row() } });
  check('without a DA: no figure, and the reason', get(noDa.implementation, 'implementation.global_pct')!.value === null && /no tiene base/.test(get(noDa.implementation, 'implementation.global_pct')!.trace));
}
const mat = (id: string, key?: string) => get(report.maturity, id, key)?.value;
check('maturity distribution: L3 2, L2 1, one below its target (mp.eq.2)', mat('maturity.measures_at_level', 'L3') === 2 && mat('maturity.measures_at_level', 'L2') === 1 && mat('maturity.below_target') === 1);

section('Categorisation');
const cat = (id: string) => get(report.categorisation, id)!;
check('C and D declared BAJO; I, T, A absent = ENS level', cat('category.level_c').value === 'BAJO' && cat('category.level_d').value === 'BAJO' && cat('category.level_i').value === 'MEDIO' && /clave ausente/.test(cat('category.level_i').trace));
check('category MEDIA', cat('category.category').value === 'MEDIA' && cat('category.ens_level').value === 'MEDIO');
const incoherent = build({ configuration: configuration({ availabilityLevel: 'ALTO' }) });
check('a dimension above the ENS level: the header category is the categorisation one', get(incoherent.header, 'header.category')!.value === 'ALTA' && get(incoherent.categorisation, 'category.category')!.value === 'ALTA' && /Subir el nivel ENS/.test(get(incoherent.categorisation, 'category.category')!.trace));

section('Period');
const h = (r: ENSAnnualReport, id: string) => get(r.header, id)?.value;
check('closing 03-31 (P-02): the current period is 2027, from 2026-04-01 to 2027-03-31, open', report.period === '2027' && h(report, 'header.period_start') === '2026-04-01' && h(report, 'header.period_end') === '2027-03-31' && h(report, 'header.period_open') === true);
check('header: organisation, unit, system, category, version', h(report, 'header.organisation') === 'Ayuntamiento de Ejemplo' && h(report, 'header.unit') === 'Servicio de Informática' && h(report, 'header.system') === 'Sede electrónica y gestión de expedientes' && h(report, 'header.category') === 'MEDIA' && h(report, 'header.plugin_version') === '1.4.0');
const noClosing = build({ managerRows: { 'op.mon.2': opMon2Row(''), 'op.exp.7': opExp7Row() } });
check('without cierre_anual the year closes on 12-31', noClosing.period === '2026' && h(noClosing, 'header.period_start') === '2026-01-01' && /sin cierre_anual/.test(get(noClosing.header, 'header.period_end')!.trace));
check('02-29 closes on 02-28 in a common year', annualPeriodBounds('2027', '02-29').to === '2027-02-28' && annualPeriodBounds('2028', '02-29').to === '2028-02-29' && annualPeriodBounds('2028', '02-29').from === '2027-03-01');
check('period of a day and last closed period', annualPeriodOfDay('2026-03-31', '03-31') === '2026' && annualPeriodOfDay('2026-04-01', '03-31') === '2027' && lastClosedAnnualPeriod('2026-04-01', '03-31') === '2026');

section('Incidents: MTTD both ways, MTTC, MTTR, notifications');
const inc = (id: string, key?: string) => get(report.incidents, id, key);
check('only incidents opened in the period count (INC-0 is of the previous one)', inc('incidents.total')!.value === 3);
check('by severity and type', inc('incidents.by_severity', 'alta')!.value === 1 && inc('incidents.by_severity', 'critica')!.value === 0 && inc('incidents.by_type', 'sin clasificar')!.value === 1 && inc('incidents.by_type', 'código dañino')!.value === 1);
check(
  'MTTD: INC-1 with fecha_ocurrencia (4 h) exact; INC-2 with the first reconciled alert (2 h) as a separate lower bound; INC-3 without data',
  inc('incidents.mttd_hours')!.value === 4 &&
    inc('incidents.mttd_lower_bound_hours')!.value === 2 &&
    inc('incidents.mttd_from_occurrence')!.value === 1 &&
    inc('incidents.mttd_from_alert')!.value === 1 &&
    inc('incidents.mttd_without_data')!.value === 1 &&
    /INC-3/.test(inc('incidents.mttd_without_data')!.trace),
  report.incidents
);
check('the headline says how many lower bounds are left out of it', /1 más solo con cota inferior/.test(inc('incidents.mttd_hours')!.trace));
check('the lower bound is marked as such, with its window', /^cota inferior/.test(inc('incidents.mttd_lower_bound_hours')!.trace) && inc('incidents.mttd_lower_bound_hours')!.source === 'ALERT_RECONCILIATION' && /cota inferior/.test(inc('incidents.mttd_from_alert')!.trace));
const onlyOccurrence = build({ managerRows: { 'op.mon.2': opMon2Row(), 'op.exp.7': result('op.exp.7', 'CUMPLE', 100) } });
check('without op.exp.7 only fecha_ocurrencia counts', get(onlyOccurrence.incidents, 'incidents.mttd_hours')!.value === 4 && get(onlyOccurrence.incidents, 'incidents.mttd_lower_bound_hours')!.value === null && get(onlyOccurrence.incidents, 'incidents.mttd_without_data')!.value === 2);
check('MTTC and MTTR', inc('incidents.mttc_hours')!.value === 1.5 && inc('incidents.mttr_hours')!.value === 26);
check('CCN-CERT and AEPD', inc('incidents.notified_ccn_cert')!.value === 1 && inc('incidents.with_personal_data')!.value === 1 && inc('incidents.notified_aepd')!.value === 1);
check('alerts that ended in an incident: 6 of 8 decided = 75 %, window of op.exp.7 in the trace', inc('incidents.alerts_to_incident_pct')!.value === 75 && inc('incidents.alerts_relevant')!.value === 10 && /no del periodo entero/.test(inc('incidents.alerts_to_incident_pct')!.trace));
const noneDecided = build({
  managerRows: {
    'op.mon.2': opMon2Row(),
    'op.exp.7': result('op.exp.7', 'CUMPLE', 100, {
      policyRuntime: { runtimeVariables: [{ name: 'informe_art32_conciliacion', value: JSON.stringify({ relevantes: 1, enIncidente: 0, pendientes: 1, sinIncidente: 0, sinPlazo: 0, excluidas: 0, ventanaDias: 30 }), parameterIds: [], evidenceIds: [], eventIds: [], description: '' }] } as any,
    }),
  },
});
check('no alert decided yet: no percentage (not 0 %)', get(noneDecided.incidents, 'incidents.alerts_to_incident_pct')!.value === null);
const noRegister = build({ managerRows: { 'op.mon.2': opMon2Row('03-31', { incidents: { motivo: 'No existe el registro de incidentes', incidentes: [] } }), 'op.exp.7': opExp7Row() } });
check('without the register: no figures, with the reason', get(noRegister.incidents, 'incidents.total')!.value === null && /No existe el registro/.test(get(noRegister.incidents, 'incidents.total')!.trace));
const fromConsolidated = build({ managerRows: undefined });
check('the consolidated organisation result gives the same incidents as the manager row', JSON.stringify(fromConsolidated.incidents) === JSON.stringify(report.incidents));
const closed = build({ period: '2026' });
check('a closed period counts its own incidents and is not open', get(closed.incidents, 'incidents.total')!.value === 1 && h(closed, 'header.period_open') === false && h(closed, 'header.period_start') === '2025-04-01');
check(
  'the alert share is not published for a period its 30-day window does not touch',
  get(closed.incidents, 'incidents.alerts_to_incident_pct')!.value === null && /no disponible para este periodo: la ventana de conciliación/.test(get(closed.incidents, 'incidents.alerts_to_incident_pct')!.trace) && describeAnnualReport(closed).some(line => /no disponible para este periodo/.test(line))
);
const covered = (period: string) =>
  build({ period, managerRows: { 'op.mon.2': opMon2Row('03-31', { incidents: { ...INCIDENTS, desde: '2025-03-31T00:00:00Z' } }), 'op.exp.7': opExp7Row() } });
check('op.mon.2 publishes from the previous period: that one is complete, an older one is not', get(covered('2026').incidents, 'incidents.total')!.value === 1 && get(covered('2025').incidents, 'incidents.total')!.value === null && /solo está completo en su congelado/.test(get(covered('2025').incidents, 'incidents.total')!.trace));

section('Resources');
const res = (id: string) => get(report.resources, id)!;
check('cycles of the period summed, declared', res('resources.cycles').value === 2 && res('resources.hours_internal').value === 210 && res('resources.hours_external').value === 50 && res('resources.budget_executed').value === 12000 && res('resources.budget_executed').source === 'CYCLE_REGISTER');
check('ICT totals of the period declared and the percentages', res('resources.ict_budget_total').value === 100000 && res('resources.budget_pct_of_ict').value === 12 && res('resources.security_staff_pct_of_ict').value === 10);
check('another period has no ICT totals', get(closed.resources, 'resources.ict_budget_total')!.value === null && get(closed.resources, 'resources.budget_pct_of_ict')!.value === null);

section('Measurement');
const mea = (id: string) => get(report.measurement, id)!;
check('coverage from op.mon.2 EV-04, controls not evaluable, last cycle', mea('measurement.coverage_pct').value === 92.5 && mea('measurement.controls_not_evaluable').value === 1 && /op\.exp\.3/.test(mea('measurement.controls_not_evaluable').trace) && mea('measurement.last_cycle').value === '2026-T2');

section('Export: stable ids, JSON and CSV');
const data = annualReportData(report);
check('every datum has an id of the catalogue', data.every(entry => ENS_ANNUAL_FIELD_IDS.includes(entry.id)), data.filter(entry => !ENS_ANNUAL_FIELD_IDS.includes(entry.id)).map(entry => entry.id));
check('every id of the catalogue appears in a complete data set', ENS_ANNUAL_FIELD_IDS.every(id => data.some(entry => entry.id === id)), ENS_ANNUAL_FIELD_IDS.filter(id => !data.some(entry => entry.id === id)));
check('every datum names its source and trace', data.every(entry => entry.source && typeof entry.trace === 'string' && entry.trace.length > 0));
check('16 data per measure, keyed by the measure', report.measures.every(entry => entry.data.length === 16 && entry.data.every(d => d.key === entry.id)));
const csv = toAnnualReportCsv(report);
const parseCsv = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i += 1;
    } else cell += c;
  }
  return rows;
};
const rows = parseCsv(csv);
check('CSV: header row with the six columns', rows[0].join() === ENS_ANNUAL_CSV_COLUMNS.join() && ENS_ANNUAL_CSV_COLUMNS.join() === 'field_id,key,value,unit,source,trace');
check('CSV: one row per datum, in order, with its value', rows.length === data.length + 1 && rows.slice(1).every((row, i) => {
  const value = data[i].value;
  const expected = value === null ? '' : typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : String(value);
  return row[0] === data[i].id && row.length === 6 && row[1] === (data[i].key ?? '') && row[2] === expected;
}));
check('CSV: CRLF and quoted cells (commas in traces)', csv.endsWith('\r\n') && /"[^"]*,[^"]*"/.test(csv));
const cellOf = (r: string[][], id: string, key: string) => r.find(row => row[0] === id && row[1] === key)!;
check('CSV: «+R1» is neutralised with a leading quote (no formula), the JSON keeps it', cellOf(rows, 'measure.annex_requirement', 'op.acc.1')[2] === "'+R1" && /"'\+R1"/.test(csv) && m(report, 'op.acc.1', 'annex_requirement').value === '+R1');
check('CSV: no value cell starts with = + - @', rows.slice(1).every(row => !/^[=+\-@\t\r]/.test(row[2]) && !/^[=+\-@\t\r]/.test(row[5])));
{
  const injected = records();
  (injected.controls['org.1'] as any).declarations.push({ applies: true, level: 1, reference: '=HYPERLINK("http://x.invalid","clic")', owner: '@SUM(1+1)', date: '2026-07-01', recordedAt: '2026-07-01T09:00:00Z', recordedBy: '-rsis' });
  const evil = parseCsv(toAnnualReportCsv(build({ records: injected })));
  check(
    'CSV: text typed by an administrator that looks like a formula is neutralised too',
    cellOf(evil, 'measure.documentary_reference', 'org.1')[2].startsWith("'=HYPERLINK") && cellOf(evil, 'measure.owner', 'org.1')[2] === "'@SUM(1+1)" && evil.slice(1).every(row => row.every(cell => !/^[=+\-@\t\r]/.test(cell))),
    [cellOf(evil, 'measure.documentary_reference', 'org.1'), cellOf(evil, 'measure.owner', 'org.1')]
  );
}
check('JSON: the data set as is', JSON.stringify(JSON.parse(toAnnualReportJson(report))) === JSON.stringify(report));
check('file names', annualReportFileName(report, 'csv') === 'ensfacil-informe-art32-2027.csv' && annualReportFileName(markAnnualReportFrozen(report, { revision: 2, frozenAt: 'x', frozenBy: 'y' }), 'json') === 'ensfacil-informe-art32-2027-r2.json');
check('same inputs, same data set (reproducible)', JSON.stringify(build()) === JSON.stringify(report));
const frozen = markAnnualReportFrozen(report, { revision: 1, frozenAt: '2027-04-01T00:30:00.000Z', frozenBy: 'ENSFácil (tarea diaria)' });
check('marking it frozen changes only the header', h(frozen, 'header.frozen') === true && h(frozen, 'header.revision') === 1 && JSON.stringify({ ...frozen, header: [] }) === JSON.stringify({ ...report, header: [] }));
check(
  'field 8 summary: implementation on the DA as field 2, MTTD exact and lower bound apart',
  describeAnnualReport(report).some(line => /Grado de implantación de la organización: 80 % .*de la DA, P-01, como el campo 2/.test(line)) &&
    describeAnnualReport(report).some(line => /MTTD 4 h con fecha de ocurrencia \(1 incidentes\) y cota inferior 2 h con la primera alerta conciliada \(1\)/.test(line)),
  describeAnnualReport(report)
);
['11-annual-report-art-32.md', '11-annual-report-art-32.en.md'].forEach(file => {
  const guide = fs.existsSync(path.join(__dirname, '..', 'docs', 'deployment', file)) ? fs.readFileSync(path.join(__dirname, '..', 'docs', 'deployment', file), 'utf8') : '';
  const missing = ENS_ANNUAL_FIELD_IDS.filter(id => !guide.includes(`\`${id}\``));
  check(`guide ${file} documents every field id`, guide.length > 0 && missing.length === 0, missing);
});

section('Declared entries: validation and target');
const now = new Date('2026-10-20T12:00:00Z');
const declaration = { applies: 'si', level: 3, reference: 'POL-SEG-01', owner: 'RSEG', date: '2026-10-01' };
check('a declared entry is valid and stored with a boolean', validateMaturityEntry('declaration', declaration, now).entry?.['applies' as never] === true);
check('applies: level required', validateMaturityEntry('declaration', { ...declaration, level: '' }, now).errors.some(e => /obligatorio si la medida aplica/.test(e)));
check('does not apply: justification required', validateMaturityEntry('declaration', { ...declaration, applies: 'no', level: undefined }, now).errors.some(e => /Justificación/.test(e)));
check('reference, owner and a past date required', validateMaturityEntry('declaration', { applies: 'si', level: 2, date: '2027-01-01' }, now).errors.length >= 3);
check('a bad link is refused', validateMaturityEntry('declaration', { ...declaration, link: 'ejemplo' }, now).errors.some(e => /Enlace/.test(e)));
check('resources: the year and at least one total', validateMaturityEntry('resources', { period: '26', reference: 'x', owner: 'y' }, now).errors.length === 2);
check('resources: security staff not above ICT staff', validateMaturityEntry('resources', { period: '2027', ictStaff: 2, securityStaff: 3, reference: 'x', owner: 'y' }, now).errors.some(e => /no puede superar/.test(e)));
check('resources: numbers stored as numbers', (validateMaturityEntry('resources', { period: '2027', ictBudget: '1000,5', reference: 'x', owner: 'y' }, now).entry as any)?.ictBudget === 1000.5);
check('a declared entry is for a measure without engine', maturityRecordTargetError('org.1', 'declaration') === undefined && maturityRecordTargetError('mp.eq.2', 'declaration') === undefined);
check('a measured control is refused a declared entry', /lo mide ENSFácil/.test(maturityRecordTargetError('op.acc.1', 'declaration') || ''));
check('an unknown measure is refused', /no es una medida del Anexo II/.test(maturityRecordTargetError('op.xx.1', 'declaration') || ''));
check('resources only in op.mon.2; maturity only for catalog controls', Boolean(maturityRecordTargetError('op.acc.1', 'resources')) && Boolean(maturityRecordTargetError('org.1', 'assessment')) && !maturityRecordTargetError('op.acc.1', 'assessment'));
check('records keep declarations and resources lists', readControlMaturityRecord(records(), 'org.1').declarations.length === 2 && readControlMaturityRecord(records(), 'op.mon.2').resources.length === 1);

section('Screen helpers');
check('the declaration form starts from the declared figures', JSON.stringify(declarationInitial(measure(report, 'org.1'))) === JSON.stringify({ applies: 'si', level: '3', target: '3', reference: 'POL-SEG-01 Política de seguridad', link: 'https://intranet.ejemplo/pol-seg-01.pdf', owner: 'RSEG' }));
const response = (extra: any) => ({ period: '2026', currentPeriod: '2027', lastClosedPeriod: '2026', closing: '03-31', periodFrom: '2025-04-01', periodTo: '2026-03-31', periods: [], maturityVersion: null, ...extra });
check('a closed period without freeze offers «Congelar»; a frozen one «Regenerar»; the current one nothing', freezeActionOf(response({}))?.label === 'Congelar' && freezeActionOf(response({ frozen: { revision: 1, frozenAt: 'a', frozenBy: 'b', history: [] } }))?.expectedRevision === 1 && freezeActionOf(response({ period: '2027' })) === undefined);
check('the status line says when the figures are not those of the closing', /cifras de hoy, no las del cierre/.test(describeFreezeStatus(response({}))));

console.log(failures.length ? `\n${failures.length} FAILED` : '\nALL OK');
process.exit(failures.length ? 1 : 0);
