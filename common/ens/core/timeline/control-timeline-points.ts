// The PURE half of the per-control series: cuts + evaluator -> points. Kept in its own file because `ens-engine` drags `configuration/services` and `kibana-services` (absent outside the `main` plugin tree), which would put the whole module out of tests.
// What can really break lives here: the instant of each cut, the `undefined` of a NO_APLICA, the last point being the present. `control-timeline.ts` is the shell passing the real engine.

export interface ENSControlTimelinePoint {
  date: Date;
  label: string;
  // The control's percentage that day. `undefined` when the control came out NO_APLICA: not a zero, since drawing it as zero would show a failure when the control did not even apply.
  score?: number;
  status: string;
  isCurrent: boolean;
  events: number;
}
