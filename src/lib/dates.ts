import { addDays as addDaysFns, differenceInCalendarDays, format, parseISO } from 'date-fns';

/**
 * Date helpers.
 *
 * Columns declared `@db.Date` (travel dates, due dates, membership periods) are
 * calendar dates, not instants. Postgres hands them back as midnight UTC, so
 * every comparison here works in UTC to avoid a booking due on the 1st looking
 * overdue on the 31st for anyone east or west of the server.
 */

/** Midnight UTC on the given date — the canonical form for a `@db.Date` value. */
export function toDateOnly(value: Date | string): Date {
  const date = typeof value === 'string' ? parseISO(value) : value;
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

/** Today as a calendar date in UTC. */
export function today(now: Date = new Date()): Date {
  return toDateOnly(now);
}

export function addDays(value: Date, days: number): Date {
  return toDateOnly(addDaysFns(toDateOnly(value), days));
}

/** Whole calendar days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: Date, to: Date): number {
  return differenceInCalendarDays(toDateOnly(to), toDateOnly(from));
}

export function isBefore(a: Date, b: Date): boolean {
  return toDateOnly(a).getTime() < toDateOnly(b).getTime();
}

export function isSameOrBefore(a: Date, b: Date): boolean {
  return toDateOnly(a).getTime() <= toDateOnly(b).getTime();
}

/** One year minus a day from `start` — the default membership period. */
export function annualExpiry(start: Date): Date {
  const s = toDateOnly(start);
  const next = new Date(
    Date.UTC(s.getUTCFullYear() + 1, s.getUTCMonth(), s.getUTCDate(), 0, 0, 0, 0),
  );
  return addDays(next, -1);
}

/**
 * `value` of `unit`, minus a day, from `start` — the general form of
 * `annualExpiry` (which is `addPeriod(start, 'YEAR', 1)`). Membership renewal
 * is no longer fixed to a single annual cycle; staff pick the unit and value.
 */
export function addPeriod(start: Date, unit: 'DAY' | 'MONTH' | 'YEAR', value: number): Date {
  const s = toDateOnly(start);
  let next: Date;
  if (unit === 'DAY') {
    next = addDays(s, value);
  } else if (unit === 'MONTH') {
    next = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + value, s.getUTCDate()));
  } else {
    next = new Date(Date.UTC(s.getUTCFullYear() + value, s.getUTCMonth(), s.getUTCDate()));
  }
  return addDays(toDateOnly(next), -1);
}

/** Display format, e.g. "17 Sep 2026". */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  return format(toDateOnly(value), 'dd MMM yyyy');
}

/** Display format including time, e.g. "17 Sep 2026, 14:30". */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = typeof value === 'string' ? parseISO(value) : value;
  return format(date, 'dd MMM yyyy, HH:mm');
}

/** `yyyy-MM-dd`, for <input type="date"> values. */
export function toInputDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  return format(toDateOnly(value), 'yyyy-MM-dd');
}
