// Exports of the art. 32 data set (JSON and CSV with stable field ids) and its summary for field 8 of the PDF.
import { ENS_ANNUAL_SECTIONS } from './annual-report-types';
import type { ENSAnnualDatum, ENSAnnualReport, ENSAnnualValue } from './annual-report-types';

export const ENS_ANNUAL_CSV_COLUMNS = ['field_id', 'key', 'value', 'unit', 'source', 'trace'];

// Every datum in export order: header, categorisation, implementation, maturity, measures, incidents, resources, measurement.
export const annualReportData = (report: ENSAnnualReport): ENSAnnualDatum[] => [
  ...ENS_ANNUAL_SECTIONS.slice(0, 4).flatMap(section => report[section]),
  ...report.measures.flatMap(measure => measure.data),
  ...ENS_ANNUAL_SECTIONS.slice(4).flatMap(section => report[section]),
];

const cell = (value: ENSAnnualValue | undefined): string => {
  const text = value === null || value === undefined ? '' : typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

// RFC 4180: comma, double quotes, CRLF; UTF-8 without BOM. Empty value: no datum.
export const toAnnualReportCsv = (report: ENSAnnualReport): string =>
  [
    ENS_ANNUAL_CSV_COLUMNS.join(','),
    ...annualReportData(report).map(entry => [entry.id, entry.key ?? '', entry.value, entry.unit ?? '', entry.source, entry.trace].map(cell).join(',')),
  ].join('\r\n') + '\r\n';

export const toAnnualReportJson = (report: ENSAnnualReport): string => `${JSON.stringify(report, null, 2)}\n`;

const headerValue = (report: ENSAnnualReport, id: string): ENSAnnualValue => report.header.find(entry => entry.id === id)?.value ?? null;

export const annualReportFileName = (report: ENSAnnualReport, extension: 'json' | 'csv'): string => {
  const revision = headerValue(report, 'header.revision');
  return `ensfacil-informe-art32-${report.period}${typeof revision === 'number' ? `-r${revision}` : ''}.${extension}`;
};

const find = (data: ENSAnnualDatum[], id: string, key?: string): ENSAnnualValue =>
  data.find(entry => entry.id === id && (key === undefined || entry.key === key))?.value ?? null;

const figure = (value: ENSAnnualValue, unit = ''): string => (value === null ? 'sin dato' : `${value}${unit ? ` ${unit}` : ''}`);

// Summary lines of the data set: field 8 of the op.mon.2 PDF and the screen.
export const describeAnnualReport = (report: ENSAnnualReport): string[] => {
  const h = (id: string) => headerValue(report, id);
  const i = (id: string) => find(report.implementation, id);
  const n = (id: string) => find(report.incidents, id);
  const r = (id: string) => find(report.resources, id);
  const m = (id: string) => find(report.measurement, id);
  const levels = [0, 1, 2, 3, 4, 5].map(level => `L${level} ${find(report.maturity, 'maturity.measures_at_level', `L${level}`) ?? 0}`).join(', ');
  return [
    `Periodo ${report.period}: del ${h('header.period_from')} al ${h('header.period_to')}${h('header.period_open') ? ' (en curso)' : ''}; categoría ${h('header.category')}.`,
    h('header.frozen')
      ? `Congelado el ${h('header.frozen_at')} por ${h('header.frozen_by')} (revisión ${h('header.revision')}${h('header.freeze_reason') ? `: ${h('header.freeze_reason')}` : ''}).`
      : `Sin congelar: calculado el ${h('header.generated_at')}.`,
    `Grado de implantación: ${figure(i('implementation.global_pct'), '%')} (motor de ENSFácil sobre ${i('implementation.measures_measured')} de ${i('implementation.measures_applicable')} medidas aplicables; ${i('implementation.measures_declared')} con madurez declarada y ${i('implementation.measures_without_data')} sin dato).`,
    `Madurez de las medidas aplicables: ${levels}; ${find(report.maturity, 'maturity.not_assessed')} sin nivel; ${find(report.maturity, 'maturity.below_target')} por debajo del objetivo.`,
    `Incidentes del periodo: ${figure(n('incidents.total'))}; MTTD ${figure(n('incidents.mttd_hours'), 'h')} (${figure(n('incidents.mttd_from_occurrence'))} con fecha de ocurrencia, ${figure(n('incidents.mttd_from_alert'))} con la primera alerta), MTTC ${figure(n('incidents.mttc_hours'), 'h')}, MTTR ${figure(n('incidents.mttr_hours'), 'h')}; notificados al CCN-CERT ${figure(n('incidents.notified_ccn_cert'))}, a la AEPD ${figure(n('incidents.notified_aepd'))} de ${figure(n('incidents.with_personal_data'))} con datos personales (registro de incidentes de op.exp.7).`,
    `Alertas relevantes que acaban en incidente: ${figure(n('incidents.alerts_to_incident_pct'), '%')} (conciliación de op.exp.7, últimos 30 días).`,
    r('resources.cycles') === null
      ? 'Recursos del periodo: sin el registro de ciclos de métricas.'
      : `Recursos del periodo (dato declarado, ${r('resources.cycles')} ciclo(s)): ${figure(r('resources.hours_internal'), 'h')} internas, ${figure(r('resources.hours_external'), 'h')} externas, ${figure(r('resources.budget_executed'), '€')}${
          r('resources.budget_pct_of_ict') !== null ? `, ${r('resources.budget_pct_of_ict')} % del presupuesto TIC` : ''
        }${r('resources.security_staff_pct_of_ict') !== null ? `; plantilla de seguridad ${r('resources.security_staff_pct_of_ict')} % de la TIC` : ''}.`,
    `Fiabilidad de la medición: ${figure(m('measurement.coverage_pct'), '%')}; controles no evaluables por falta de parámetros: ${figure(m('measurement.controls_not_evaluable'))}.`,
    'Exportación con identificadores de campo estables y la traza de cada cifra: «Informe anual (art. 32)», JSON o CSV.',
  ];
};
