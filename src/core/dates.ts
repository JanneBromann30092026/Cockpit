/**
 * Calendar dates as "JJJJ-MM-TT" strings in local time (no time zone). Arithmetic runs on
 * UTC midnights, so daylight saving time never shifts a day.
 */

const DAY_MS = 86_400_000;

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Today in local time as "JJJJ-MM-TT". */
export function localIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function addDays(date: string, days: number): string {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** Day of the week, 0 = Monday … 6 = Sunday. */
export function weekday(date: string): number {
  return (new Date(toUtc(date)).getUTCDay() + 6) % 7;
}

/** The Monday after `date` (a Monday gives the following one). */
export function nextMonday(date: string): string {
  return addDays(date, 7 - weekday(date));
}

/** Adds months; the day is clamped to the end of the month (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = total - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromUtc(Date.UTC(year, month, Math.min(d, lastDay)));
}
