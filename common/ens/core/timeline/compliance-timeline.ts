export interface ENSComplianceTimelinePoint {
  date: Date;
  label: string;
  score: number;
  // The last point is the present: its number is the panel's.
  isCurrent: boolean;
  // How many verdicts were known at that cut: tells a machine that got worse from one that stopped reporting.
  events: number;
}
