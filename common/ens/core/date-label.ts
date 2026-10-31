const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

const two = (n: number) => String(n).padStart(2, '0');

const parse = (value?: string | number | Date): Date | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

// Built by hand, not with toLocaleString: the output must not depend on the runtime ICU.

// «31 oct 2026, 17:11», in the viewer's zone.
export const dateTimeLabel = (value?: string | number | Date): string => {
  const d = parse(value);
  return d ? `${dateLabel(d)}, ${two(d.getHours())}:${two(d.getMinutes())}` : '';
};

// «31 oct 2026».
export const dateLabel = (value?: string | number | Date): string => {
  const d = parse(value);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '';
};

// «hace 5 min» within the hour, «hace 3 h» within the day, the date otherwise.
export const ageLabel = (value?: string | number | Date, now: number = Date.now()): string => {
  const d = parse(value);
  if (!d) return '';
  const minutes = Math.floor((now - d.getTime()) / 60000);
  if (minutes < 0) return dateTimeLabel(d);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 24 * 60) return `hace ${Math.floor(minutes / 60)} h`;
  return dateTimeLabel(d);
};
