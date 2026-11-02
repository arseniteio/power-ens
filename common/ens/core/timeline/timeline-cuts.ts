import type { ENSNormalizedEvent } from '../data-source/types';

export interface ENSTimelineCut {
  day: Date;
  label: string;
  cutoff: Date;
  isCurrent: boolean;
  events: ENSNormalizedEvent[];
}

interface ENSTimelineCutsOptions {
  days?: number;
  now?: Date;
  timeZone?: string;
  maxEvaluatedEvents?: number;
}

const DEFAULT_DAYS = 7;

const startOfDay = (date: Date): Date => {
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

const labelOf = (date: Date): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${day}/${month}`;
};

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

const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

const zonedFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = zonedFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    zonedFormatters.set(timeZone, formatter);
  }
  return formatter;
};

const zonedParts = (date: Date, timeZone: string) => {
  const parts = zonedFormatter(timeZone).formatToParts(date);
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

const zoneOffset = (date: Date, timeZone: string): number => {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);

  return asUtc - (date.getTime() - date.getMilliseconds());
};

const zonedMidnight = (year: number, month: number, day: number, timeZone: string): Date => {
  const utc = Date.UTC(year, month - 1, day);
  let timestamp = utc - zoneOffset(new Date(utc), timeZone);
  timestamp = utc - zoneOffset(new Date(timestamp), timeZone);

  return new Date(timestamp);
};

const zonedCalendar = (timeZone: string): ENSTimelineCalendar => {
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

export const startOfDayIn = (date: Date, timeZone?: string): Date =>
  calendarOf(timeZone).startOfDay(date);

const MAX_EVALUATED_EVENTS = 400000;

const fittingStep = (
  days: number,
  events: number,
  budget: number = MAX_EVALUATED_EVENTS
): number => {
  if (days <= 1 || events <= 0) {
    return 1;
  }

  const dailyCost = (days * events) / 2;

  if (dailyCost <= budget) {
    return 1;
  }

  return Math.min(
    days,
    Math.ceil(dailyCost / budget)
  );
};

export type ENSTimelineCutPlan = Omit<ENSTimelineCut, 'events'>;

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
    if (day.getTime() >= today.getTime()) {
      break;
    }

    const cutoff = calendar.endOfDay(day);

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

  cuts.push({
    day: today,
    label: calendar.label(today),
    cutoff: now,
    isCurrent: true,
  });

  return cuts;
};
