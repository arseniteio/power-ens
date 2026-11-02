
export interface ENSControlTimelinePoint {
  date: Date;
  label: string;
  score?: number;
  status: string;
  isCurrent: boolean;
  events: number;
}
