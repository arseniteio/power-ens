// What the art. 32 panels show and offer, kept apart from React so it can be tested.
import type { ENSAnnualDatum, ENSAnnualMeasure, ENSAnnualReport, ENSAnnualReportResponse, ENSAnnualValue } from '../../../common/ens/annual-report/annual-report-types';

export const ANNUAL_REPORT_GUIDE_URL = 'https://gitlab.com/quersystem/plugin-wazuh-ens/-/blob/main/docs/deployment/11-annual-report-art-32.md';

export const ENGINE_LABELS: Record<ENSAnnualMeasure['engine'], string> = {
  MEDIDO: 'Medida por ENSFácil',
  SIN_MEDICION: 'Sin medición todavía',
  SIN_MOTOR: 'Sin motor',
};

const datumOf = (data: ENSAnnualDatum[], id: string): ENSAnnualDatum | undefined => data.find(entry => entry.id === id);
const valueOf = (data: ENSAnnualDatum[], id: string): ENSAnnualValue => datumOf(data, id)?.value ?? null;
const text = (value: ENSAnnualValue): string => (value === null ? '' : String(value));

export interface WithoutEngineRow {
  id: string;
  name: string;
  engine: string;
  level: string;
  requirement: string;
  applies: string;
  appliesSource: string;
  assessed: string;
  target: string;
  reference: string;
  owner: string;
  date: string;
  declared: boolean;
}

const SOURCE_LABELS: Record<string, string> = { SOA: 'DA (P-01)', DECLARED: 'declarada', ANNEX_II: 'Anexo II' };

// «Medidas sin motor»: the Annex II measures outside the catalog and those in DRAFT, in Annex order.
export const withoutEngineRows = (report: ENSAnnualReport): WithoutEngineRow[] =>
  report.measures
    .filter(measure => measure.engine !== 'MEDIDO')
    .map(measure => {
      const d = measure.data;
      const applies = datumOf(d, 'measure.applies');
      const assessed = valueOf(d, 'measure.maturity_assessed');
      const target = valueOf(d, 'measure.maturity_target');
      return {
        id: measure.id,
        name: measure.name,
        engine: ENGINE_LABELS[measure.engine],
        level: text(valueOf(d, 'measure.level')),
        requirement: text(valueOf(d, 'measure.annex_requirement')),
        applies: applies?.value === true ? 'Sí' : applies?.value === false ? 'No' : '—',
        appliesSource: SOURCE_LABELS[applies?.source || ''] || '',
        assessed: typeof assessed === 'number' ? `L${assessed}` : '—',
        target: typeof target === 'number' ? `L${target}` : '—',
        reference: text(valueOf(d, 'measure.documentary_reference')),
        owner: text(valueOf(d, 'measure.owner')),
        date: text(valueOf(d, 'measure.assessed_at')),
        declared: d.some(entry => entry.source === 'DECLARED'),
      };
    });

// The declaration form starts from what the data set shows as declared.
export const declarationInitial = (measure?: ENSAnnualMeasure): Record<string, string> => {
  if (!measure) return {};
  const declared = (id: string) => {
    const entry = datumOf(measure.data, id);
    return entry && entry.source === 'DECLARED' ? entry.value : null;
  };
  const applies = declared('measure.applies');
  const reference = text(declared('measure.documentary_reference'));
  const link = /\((https?:\/\/[^)]+|file:\/\/[^)]+|\\\\[^)]+)\)$/.exec(reference);
  return {
    applies: applies === false ? 'no' : 'si',
    level: text(declared('measure.maturity_assessed')),
    target: text(declared('measure.maturity_target')),
    reference: link ? reference.slice(0, link.index).trim() : reference,
    link: link ? link[1] : '',
    owner: text(declared('measure.owner')),
  };
};

// The resources form starts from the declared totals of the period shown.
export const resourcesInitial = (report: ENSAnnualReport): Record<string, string> => {
  const declared = (id: string) => {
    const entry = datumOf(report.resources, id);
    return entry && entry.source === 'DECLARED' ? text(entry.value) : '';
  };
  return { period: report.period, ictBudget: declared('resources.ict_budget_total'), ictStaff: declared('resources.ict_staff_total'), securityStaff: declared('resources.security_staff') };
};

// Freeze offered for the period shown: «Congelar» a closed one without freeze, «Regenerar» a frozen one.
export const freezeActionOf = (response: ENSAnnualReportResponse): { label: string; expectedRevision: number | null } | undefined => {
  if (response.frozen) return { label: 'Regenerar', expectedRevision: response.frozen.revision };
  if (response.period <= response.lastClosedPeriod && !response.freezeError) return { label: 'Congelar', expectedRevision: null };
  return undefined;
};

export const describeFreezeStatus = (response: ENSAnnualReportResponse): string => {
  const range = `del ${response.periodFrom} al ${response.periodTo}`;
  if (response.frozen) {
    const f = response.frozen;
    return `Periodo ${response.period} (${range}): congelado el ${f.frozenAt.slice(0, 16).replace('T', ' ')} UTC por ${f.frozenBy}, revisión ${f.revision}${f.reason ? ` («${f.reason}»)` : ''}.`;
  }
  if (response.period > response.lastClosedPeriod) return `Periodo ${response.period} (${range}), en curso: cifras de hoy. Se congela solo al cierre (${response.closing}).`;
  return `Periodo ${response.period} (${range}), cerrado y sin congelar: cifras de hoy, no las del cierre.`;
};

// Periods offered: the current one, the last closed one and every frozen one, newest first.
export const periodOptions = (response: ENSAnnualReportResponse): string[] =>
  Array.from(new Set([response.currentPeriod, response.lastClosedPeriod, response.period, ...response.periods.map(entry => entry.period)])).sort((a, b) => b.localeCompare(a));
