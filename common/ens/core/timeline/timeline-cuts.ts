// Cuts of the daily series: which days have a point, which instant each is evaluated against and with which events.
// Kept apart from `compliance-timeline.ts` and without importing the engine on purpose (the engine drags `kibana-services`, which exists only in the Wazuh plugin tree), so all the logic that can go wrong is testable here.
// Three decisions define a point:
// 1. Events are ACCUMULATED up to the cut, not the day's own: compliance is a state, not a flow; expiry is the collector window's business.
// 2. Each point is evaluated against ITS cut, not today; otherwise every coverage window would be measured against the present and the history would show expired.
// 3. A day BEFORE the first event gives no point: with zero events the engine returns NO_EVALUABLE, a legitimate verdict but a lie as history.
import type { ENSNormalizedEvent } from '../data-source/types';

export interface ENSTimelineCut {
  // Start of the day the point represents.
  day: Date;
  label: string;
  // The instant evaluated against: end of the day, or NOW for the last.
  cutoff: Date;
  isCurrent: boolean;
  // Everything known up to the cut.
  events: ENSNormalizedEvent[];
}

export interface ENSTimelineCutsOptions {
  // Maximum number of days. Each cut is a full engine pass.
  days?: number;
  now?: Date;
  // Time zone of the days (IANA, "Europe/Madrid"). Without it, the process zone. The server receives it from the browser so the chart days match.
  timeZone?: string;
  // The series budget (see `fittingStep`). The server removes it (`Infinity`): it computes past days once and stores them.
  maxEvaluatedEvents?: number;
}

const DEFAULT_DAYS = 7;

export const startOfDay = (date: Date): Date => {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  return start;
};

const endOfDay = (date: Date): Date => {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return end;
};

const addDays = (date: Date, days: number): Date => {
  const moved = new Date(date);
  moved.setDate(moved.getDate() + days);

  return moved;
};

// `dd/mm` by hand, not `toLocaleDateString`: locale formatting depends on the runtime ICU and the same day would come out `03/08` or `3/8`, misaligning the axis.
const labelOf = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${day}/${month}`;
};

// Calendar days of a concrete time zone. The server cannot use the process zone: the viewer's zone says what "today" is.
interface ENSTimelineCalendar {
  startOfDay(date: Date): Date;
  endOfDay(date: Date): Date;
  addDays(date: Date, days: number): Date;
  label(date: Date): string;
}

const localCalendar: ENSTimelineCalendar = {
  startOfDay,
  endOfDay,
  addDays,
  label: labelOf,
};

const zonedParts = (date: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => Number(parts.find(p => p.type === type)?.value);

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
};

// Zone offset at that instant (ms to add to UTC).
const zoneOffset = (date: Date, timeZone: string): number => {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

  return asUtc - (date.getTime() - date.getMilliseconds());
};

// Local midnight of a calendar day (year, month, day) in the zone.
const zonedMidnight = (year: number, month: number, day: number, timeZone: string): Date => {
  const utc = Date.UTC(year, month - 1, day);
  let timestamp = utc - zoneOffset(new Date(utc), timeZone);
  // A second pass in case the clock changes in between (daylight saving).
  timestamp = utc - zoneOffset(new Date(timestamp), timeZone);

  return new Date(timestamp);
};

export const zonedCalendar = (timeZone: string): ENSTimelineCalendar => {
  const start = (date: Date): Date => {
    const p = zonedParts(date, timeZone);

    return zonedMidnight(p.year, p.month, p.day, timeZone);
  };
  const move = (date: Date, days: number): Date => {
    const p = zonedParts(date, timeZone);
    const target = new Date(Date.UTC(p.year, p.month - 1, p.day + days));

    return zonedMidnight(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
      timeZone
    );
  };

  return {
    startOfDay: start,
    endOfDay: date => new Date(move(start(date), 1).getTime() - 1),
    addDays: (date, days) => move(start(date), days),
    label: date => {
      const p = zonedParts(date, timeZone);

      return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}`;
    },
  };
};

const calendarOf = (timeZone?: string): ENSTimelineCalendar =>
  timeZone ? zonedCalendar(timeZone) : localCalendar;

// Start of the day of `date` in the zone (or the process zone, without one).
export const startOfDayIn = (date: Date, timeZone?: string): Date =>
  calendarOf(timeZone).startOfDay(date);

// THE SERIES BUDGET. Each point is a COMPLETE engine pass over the event prefix of that day; with a real 30-day window (about 98,000 ENS events) that is roughly a million and a half evaluations
// on the browser thread and the tab never loads. The exit is NOT trimming events (a point over half the facts is a false number) but reducing HOW MANY POINTS: with a 4-day step the line has eight exact points instead of thirty.
// The budget is in evaluated events summed over the whole series.
const MAX_EVALUATED_EVENTS = 400000;

// Step in days that keeps the series within budget. Never below 1 (daily), and today's point always enters.
const fittingStep = (
  days: number,
  events: number,
  budget: number = MAX_EVALUATED_EVENTS
): number => {
  if (days <= 1 || events <= 0) {
    return 1;
  }

  // Prefixes grow roughly linearly, so the cost of an N-point series is about N * events / 2.
  const dailyCost = (days * events) / 2;

  if (dailyCost <= budget) {
    return 1;
  }

  return Math.min(
    days,
    Math.ceil(dailyCost / budget)
  );
};

// A series point without its events: which day, against which instant.
export type ENSTimelineCutPlan = Omit<ENSTimelineCut, 'events'>;

// The series points from the only things they decide: the first past event and how many there are. It is the event-less half of `buildENSTimelineCuts`, also used by the server to evaluate control by control.
export const planENSTimelineCuts = (
  firstPastTime: number | undefined,
  pastCount: number,
  options: ENSTimelineCutsOptions = {}
): ENSTimelineCutPlan[] => {
  const now = options.now || new Date();
  const calendar = calendarOf(options.timeZone);

  const days =
    options.days && options.days > 0
      ? Math.floor(options.days)
      : DEFAULT_DAYS;

  if (firstPastTime === undefined || !pastCount) {
    return [];
  }

  const windowStart = calendar.startOfDay(
    calendar.addDays(now, -(days - 1))
  );

  const today = calendar.startOfDay(now);

  const cuts: ENSTimelineCutPlan[] = [];

  const step = fittingStep(days, pastCount, options.maxEvaluatedEvents);

  for (
    let day = new Date(windowStart);
    day.getTime() <= today.getTime();
    day = calendar.addDays(day, step)
  ) {
    // Today's point is added OUTSIDE the loop, always: with step > 1 the loop need not land on today, and this is the one point that MUST equal the panel.
    if (day.getTime() >= today.getTime()) {
      break;
    }

    const cutoff = calendar.endOfDay(day);

    // With nothing known yet there is no point: this prevents the false 0 % of the days before the first event.
    if (firstPastTime > cutoff.getTime()) {
      continue;
    }

    cuts.push({
      day,
      label: calendar.label(day),
      cutoff,
      isCurrent: false,
    });
  }

  // The present: same instant and SAME events as the panel (all, including future-dated ones from a skewed clock), because both numbers must be the same number.
  cuts.push({
    day: today,
    label: calendar.label(today),
    cutoff: now,
    isCurrent: true,
  });

  return cuts;
};

export const buildENSTimelineCuts = (
  events: ENSNormalizedEvent[] = [],
  options: ENSTimelineCutsOptions = {}
): ENSTimelineCut[] => {
  const now = options.now || new Date();

  // Sorted ONCE, and each cut is a prefix of this array; a `filter` per point would walk the same thousands of events per day.
  const sorted = events
    .map(event => ({
      event,
      time: new Date(event.timestamp).getTime(),
    }))
    .filter(item => Number.isFinite(item.time))
    .sort((left, right) => left.time - right.time);

  const nowMs = now.getTime();

  // A future-dated event (skewed agent clock) cannot define the series origin or extend it forward. It does enter today's point (see `planENSTimelineCuts`).
  const past = sorted.filter(
    item => item.time <= nowMs
  );

  // Cuts advance over a sorted array, so the prefix only grows: this index advances once over the whole series.
  let cursor = 0;

  return planENSTimelineCuts(past[0]?.time, past.length, { ...options, now }).map(
    cut => {
      if (cut.isCurrent) {
        return { ...cut, events };
      }

      const cutoffMs = cut.cutoff.getTime();

      while (
        cursor < past.length &&
        past[cursor].time <= cutoffMs
      ) {
        cursor += 1;
      }

      return {
        ...cut,
        events: past
          .slice(0, cursor)
          .map(item => item.event),
      };
    }
  );
};
