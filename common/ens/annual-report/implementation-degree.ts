// Implementation degree over the Statement of Applicability: the one figure of op.mon.2 field 2 and the art. 32 data.
import { getENSCatalogControl, isPendingMeasurement } from '../catalog';
import type { ENSComplianceResult } from '../core/evaluation/types';
import { parseStatementOfApplicability } from '../core/policy-runtime/policies/op-mon-2.policy';

const CONTROL = 'op.mon.2';

const FRAMEWORKS: Record<'org' | 'op' | 'mp', string> = {
  org: 'Marco organizativo',
  op: 'Marco operacional',
  mp: 'Medidas de protección',
};

const figure = (n: number): string => String(Math.round(n * 10) / 10);

export interface ENSImplementationDegree {
  // Mean engine score of the applicable measures with a score; undefined without any.
  global?: number;
  byFramework: Record<'org' | 'op' | 'mp', { score?: number; measures: number }>;
  // Applicable measures of P-01 and, of them, those with an engine score.
  medidas: number;
  evaluadas: number;
  scored: string[];
  lineas: string[];
}

// P-01 read once per measure (the last row wins), with the measures it repeats: field 2 and the data set use it.
export const applicableMeasures = (rows: Record<string, string>[]): { applicable: string[]; repeated: string[]; problems: string[] } => {
  const decided = new Map<string, boolean>();
  const seen = new Map<string, number>();
  const problems: string[] = [];

  rows.forEach(row => {
    const parsed = parseStatementOfApplicability([row]);
    const measure = parsed.aplicables[0] || parsed.noAplicables[0];

    problems.push(...parsed.problemas);

    if (measure) {
      seen.set(measure, (seen.get(measure) || 0) + 1);
      decided.set(measure, parsed.aplicables.length > 0);
    }
  });

  return {
    applicable: Array.from(decided.entries()).filter(([, applies]) => applies).map(([measure]) => measure),
    repeated: Array.from(seen.entries()).filter(([, n]) => n > 1).map(([measure]) => measure),
    problems,
  };
};

// Line that states a repeated measure, for field 2 and the trace of the data set.
export const describeRepeatedMeasures = (repeated: string[]): string =>
  repeated.length ? `P-01 repite ${repeated.join(', ')}: cuenta una vez, con su última fila (corregir P-01: una fila por medida)` : '';

// P-01's applicable measures against the organisation results; op.mon.2, DRAFT and NO_APLICA controls do not count.
export const implementationDegree = (applicable: string[], results: ENSComplianceResult[]): ENSImplementationDegree => {
  const byControl = new Map(results.filter(r => r.control.id !== CONTROL).map(r => [r.control.id, r]));
  const scored: { medida: string; score: number }[] = [];
  const lines: string[] = [];

  applicable.forEach(measure => {
    const r = byControl.get(measure);

    if (!r) {
      lines.push(`${measure}: sin evaluar en ENSFácil (no cuenta en la cifra)`);
    } else if (isPendingMeasurement(getENSCatalogControl(measure))) {
      // In the catalog without collector yet: its NO_APLICA is not a level decision, so P-01 is not to be reviewed.
      lines.push(`${measure}: sin medición todavía, documental hasta que su recolector emita (no cuenta en la cifra)`);
    } else if (r.status === 'NO_APLICA') {
      lines.push(`${measure}: P-01 la declara aplicable y el motor no la exige en esta categoría (revisa P-01)`);
    } else if (typeof r.score !== 'number') {
      lines.push(`${measure}: ${r.status}, sin puntuación`);
    } else {
      scored.push({ medida: measure, score: r.score });
      lines.push(`${measure}: ${figure(r.score)} % (${r.status})`);
    }
  });

  const mean = (list: { score: number }[]) => (list.length ? list.reduce((a, p) => a + p.score, 0) / list.length : undefined);
  const byFramework = Object.fromEntries(
    (Object.keys(FRAMEWORKS) as ('org' | 'op' | 'mp')[]).map(prefix => {
      const own = scored.filter(p => p.medida.split('.')[0] === prefix);
      return [prefix, { score: mean(own), measures: own.length }];
    })
  ) as ENSImplementationDegree['byFramework'];

  return {
    global: mean(scored),
    byFramework,
    medidas: applicable.length,
    evaluadas: scored.length,
    scored: scored.map(p => p.medida),
    lineas: [
      ...(Object.keys(FRAMEWORKS) as ('org' | 'op' | 'mp')[])
        .filter(prefix => byFramework[prefix].measures)
        .map(prefix => `${FRAMEWORKS[prefix]}: ${figure(byFramework[prefix].score as number)} % (${byFramework[prefix].measures} medidas)`),
      ...lines,
    ],
  };
};
