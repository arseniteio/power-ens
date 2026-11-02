export interface ENSComplianceTimelinePoint {
  date: Date;
  label: string;
  score: number;
  isCurrent: boolean;
  events: number;
}
