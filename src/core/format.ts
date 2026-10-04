const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/**
 * Formats a byte count as a short, human-readable German string, e.g. "1,5 MB".
 * Uses decimal units (1 KB = 1000 B) like iPadOS does in its storage settings.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '–';
  }
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1000 && unitIndex < UNITS.length - 1) {
    value /= 1000;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 100 ? 0 : 1;
  const formatted = new Intl.NumberFormat('de-DE', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
  return `${formatted} ${UNITS[unitIndex]}`;
}

const SHORT_DATE = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

const FULL_DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
});

function utcDate(date: string): Date {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** "2026-10-07" → "Mi., 07.10." */
export function formatShortDate(date: string): string {
  return SHORT_DATE.format(utcDate(date));
}

/** Short date close to `today`, with the year when it is further away. */
export function formatDeadlineDate(date: string, today: string): string {
  const days = (utcDate(date).getTime() - utcDate(today).getTime()) / 86_400_000;
  return days >= 0 && days <= 180 ? formatShortDate(date) : formatDate(date);
}

/** "2026-10-07" → "07.10.2026" */
export function formatDate(date: string): string {
  return FULL_DATE.format(utcDate(date));
}

const EURO = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** 19.9 → "19,90 €" */
export function formatEuro(amount: number): string {
  return EURO.format(amount);
}

/**
 * Reads an amount as typed on a German keyboard: "19,99", "1.234,50", "1234.5", "19,99 €".
 * Returns null for anything that is not a plain non-negative amount.
 */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[€\s]/g, '');
  if (!clean) return null;
  let normalized = clean;
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) normalized = clean.replace(/\./g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Number(normalized);
}

/** 19.99 → "19,99" (for an input field). */
export function amountInput(amount: number | undefined): string {
  if (amount === undefined) return '';
  return amount.toFixed(2).replace('.', ',').replace(/,00$/, '');
}
