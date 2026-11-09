import type { ControlSummary } from './use-control-summary';

export const controlStatusCounts = (summary: ControlSummary): Record<string, number> => ({
  CUMPLE: summary.compliant,
  PARCIAL: summary.partial,
  NO_CUMPLE: summary.nonCompliant,
  NO_EVALUABLE: summary.notEvaluable,
  NO_APLICA: summary.notApplicable,
});

export interface DonutArc<T> {
  segment: T;
  length: number;
  offset: number;
}

export const donutArcs = <T extends { count: number }>(segments: T[], circumference: number): Array<DonutArc<T>> => {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  if (total === 0) return [];

  let covered = 0;
  return segments
    .filter(segment => segment.count > 0)
    .map(segment => {
      const length = (segment.count / total) * circumference;
      const arc = { segment, length, offset: -covered };
      covered += length;
      return arc;
    });
};
