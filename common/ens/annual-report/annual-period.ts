// Report periods of art. 32: period N ends on the closing day (op.mon.2 P-02 `cierre_anual`, MM-DD) of year N.
import { zonedCalendar } from '../core/timeline/timeline-cuts';

export const ENS_DEFAULT_ANNUAL_CLOSING = '12-31';

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const isAnnualClosing = (value: unknown): value is string => {
  const m = typeof value === 'string' ? /^(\d{2})-(\d{2})$/.exec(value.trim()) : null;
  if (!m) return false;
  const month = Number(m[1]);
  const day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= MONTH_DAYS[month - 1];
};

export const isAnnualPeriod = (value: unknown): value is string => typeof value === 'string' && /^\d{4}$/.test(value) && Number(value) >= 2000;

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

// The closing day of a year: 02-29 falls on 02-28 in a common year.
const closingDay = (year: number, closing: string): string => {
  const [month, day] = closing.split('-').map(Number);
  const real = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return `${year}-${String(month).padStart(2, '0')}-${String(real).padStart(2, '0')}`;
};

const nextDay = (day: string): string => new Date(Date.parse(`${day}T00:00:00Z`) + 86400e3).toISOString().slice(0, 10);

// First and last day (inclusive, YYYY-MM-DD) of period `period`.
export const annualPeriodBounds = (period: string, closing: string = ENS_DEFAULT_ANNUAL_CLOSING): { from: string; to: string } => {
  const year = Number(period);
  return { from: nextDay(closingDay(year - 1, closing)), to: closingDay(year, closing) };
};

// The period a day belongs to.
export const annualPeriodOfDay = (day: string, closing: string = ENS_DEFAULT_ANNUAL_CLOSING): string => {
  const year = Number(day.slice(0, 4));
  return day <= closingDay(year, closing) ? String(year) : String(year + 1);
};

// The last period already closed on `day` (its closing day is before `day`).
export const lastClosedAnnualPeriod = (day: string, closing: string = ENS_DEFAULT_ANNUAL_CLOSING): string =>
  String(Number(annualPeriodOfDay(day, closing)) - 1);

// Instants of the period in the zone: [start of its first day, start of the day after its last).
export const annualPeriodInstants = (period: string, closing: string, timeZone: string): { fromMs: number; toMs: number } => {
  const { from, to } = annualPeriodBounds(period, closing);
  const calendar = zonedCalendar(timeZone);
  return {
    fromMs: calendar.startOfDay(new Date(`${from}T12:00:00Z`)).getTime(),
    toMs: calendar.startOfDay(new Date(`${nextDay(to)}T12:00:00Z`)).getTime(),
  };
};
