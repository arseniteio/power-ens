import type { ENSControlSummaryEntry } from '../../../common/ens/evaluation/types';

export const DASHBOARD_STATUSES = ['CUMPLE', 'PARCIAL', 'NO_CUMPLE', 'NO_EVALUABLE', 'NO_APLICA'] as const;

const ATTENTION_ORDER = ['NO_CUMPLE', 'PARCIAL', 'NO_EVALUABLE'];

export interface CatalogEntry {
  id: string;
  title: string;
  family: string;
}

export interface FamilyRow {
  family: string;
  name: string;
  total: number;
  counts: Record<string, number>;
  unmeasured: number;
  score?: number;
}

export interface AttentionRow {
  controlId: string;
  title: string;
  status: string;
  score?: number;
  requirementsNotMet: number;
  requirementsNotEvidenced: number;
}

export interface TrendPoint {
  label: string;
  score?: number;
  isCurrent: boolean;
}

const familyOf = (controlId: string): string => controlId.split('.').slice(0, 2).join('.');

const emptyCounts = (): Record<string, number> => Object.fromEntries(DASHBOARD_STATUSES.map(status => [status, 0]));

const average = (values: number[]): number | undefined =>
  values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : undefined;

export const buildFamilyRows = (catalog: CatalogEntry[], controls: ENSControlSummaryEntry[]): FamilyRow[] => {
  const byId = new Map(controls.map(control => [control.controlId, control]));
  const rows = new Map<string, FamilyRow & { scores: number[] }>();

  catalog.forEach(entry => {
    const family = familyOf(entry.id);
    const row = rows.get(family) || { family, name: entry.family, total: 0, counts: emptyCounts(), unmeasured: 0, scores: [] };
    const control = byId.get(entry.id);
    row.total += 1;

    if (!control || !control.evaluated || control.pending) {
      row.unmeasured += 1;
    } else {
      row.counts[control.status] = (row.counts[control.status] || 0) + 1;
      if (control.status !== 'NO_APLICA' && typeof control.score === 'number') row.scores.push(control.score);
    }

    rows.set(family, row);
  });

  return [...rows.values()].map(({ scores, ...row }) => ({ ...row, score: average(scores) }));
};

export const buildAttentionRows = (catalog: CatalogEntry[], controls: ENSControlSummaryEntry[]): AttentionRow[] => {
  const annexIndex = new Map(catalog.map((entry, index) => [entry.id, index]));
  const titleOf = (controlId: string) => catalog.find(entry => entry.id === controlId)?.title || controlId;

  return controls
    .filter(control => control.evaluated && !control.pending && ATTENTION_ORDER.includes(control.status))
    .map(control => ({
      controlId: control.controlId,
      title: titleOf(control.controlId),
      status: control.status,
      score: control.score,
      requirementsNotMet: control.requirementsNotMet,
      requirementsNotEvidenced: control.requirementsNotEvidenced,
    }))
    .sort(
      (a, b) =>
        ATTENTION_ORDER.indexOf(a.status) - ATTENTION_ORDER.indexOf(b.status) ||
        (a.score ?? 0) - (b.score ?? 0) ||
        (annexIndex.get(a.controlId) ?? Infinity) - (annexIndex.get(b.controlId) ?? Infinity)
    );
};

export const countControls = (controls: ENSControlSummaryEntry[]): Record<string, number> =>
  controls
    .filter(control => control.evaluated && !control.pending)
    .reduce((counts, control) => ({ ...counts, [control.status]: (counts[control.status] || 0) + 1 }), emptyCounts());

export const trendDelta = (points: TrendPoint[]): number | undefined => {
  const scored = points.filter(point => typeof point.score === 'number');
  if (scored.length < 2) return undefined;

  return (scored[scored.length - 1].score as number) - (scored[0].score as number);
};

export interface ControlMapCell {
  controlId: string;
  title: string;
  status?: string;
  score?: number;
}

export interface ControlMapRow {
  family: string;
  cells: ControlMapCell[];
}

export const buildControlMap = (catalog: CatalogEntry[], controls: ENSControlSummaryEntry[]): ControlMapRow[] => {
  const byId = new Map(controls.map(control => [control.controlId, control]));
  const rows = new Map<string, ControlMapCell[]>();

  catalog.forEach(entry => {
    const control = byId.get(entry.id);
    const measured = control && control.evaluated && !control.pending;
    const cells = rows.get(familyOf(entry.id)) || [];
    cells.push({ controlId: entry.id, title: entry.title, status: measured ? control.status : undefined, score: measured ? control.score : undefined });
    rows.set(familyOf(entry.id), cells);
  });

  return [...rows.entries()].map(([family, cells]) => ({ family, cells }));
};
