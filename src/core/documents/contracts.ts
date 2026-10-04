/**
 * My own contracts: notice periods, the latest day to cancel, the next payment, costs and
 * upcoming deadlines. Pure logic on calendar dates ("JJJJ-MM-TT", local time). Everything
 * calculated here is shown with "im Original-PDF prüfen" – the contract text decides.
 */
import { addDays, addMonths, daysBetween } from '../dates';

export type NoticeUnit = 'days' | 'weeks' | 'months';
export type PaymentInterval = 'monthly' | 'quarterly' | 'halfYearly' | 'yearly' | 'once';

export interface Notice {
  amount: number;
  unit: NoticeUnit;
}

/** The fields of a contract the logic needs (the full record lives in src/data). */
export interface ContractInfo {
  id: string;
  name: string;
  dueDate?: string;
  amount?: number;
  interval?: PaymentInterval;
  termEnd?: string;
  notice?: Notice;
}

const NUMBER_WORDS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einen: 1,
  einem: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwölf: 12,
};

const UNITS: { pattern: RegExp; unit: NoticeUnit }[] = [
  { pattern: /^tag(e|en)?$/, unit: 'days' },
  { pattern: /^woche(n)?$/, unit: 'weeks' },
  { pattern: /^monat(e|en|s)?$/, unit: 'months' },
];

/**
 * Reads a notice period from contract text: "3 Monate zum Ende der Laufzeit", "einen Monat",
 * "14 Tage", "sechs Wochen". Null when there is no clear period (then nothing is calculated).
 */
export function parseNotice(text: string | undefined): Notice | null {
  if (!text) return null;
  const words = text.toLowerCase().match(/[\p{L}\d]+/gu) ?? [];
  for (let index = 0; index < words.length - 1; index += 1) {
    const word = words[index] ?? '';
    const amount = /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word];
    if (!amount || amount > 36) continue;
    const next = words[index + 1] ?? '';
    const unit = UNITS.find((entry) => entry.pattern.test(next))?.unit;
    if (unit) return { amount, unit };
  }
  return null;
}

/** The date `notice` before `date` (months are clamped to the end of the month). */
export function subtractNotice(date: string, notice: Notice): string {
  if (notice.unit === 'months') return addMonths(date, -notice.amount);
  return addDays(date, -(notice.unit === 'weeks' ? 7 : 1) * notice.amount);
}

/** The last day to cancel for the current term end – only when both are known. */
export function cancelBy(contract: ContractInfo): string | null {
  if (!contract.termEnd || !contract.notice) return null;
  return subtractNotice(contract.termEnd, contract.notice);
}

const MONTHS_PER_INTERVAL: Record<Exclude<PaymentInterval, 'once'>, number> = {
  monthly: 1,
  quarterly: 3,
  halfYearly: 6,
  yearly: 12,
};

/**
 * The next payment on or after `today`: a past due date moves on by the interval (a
 * contract keeps running); a one-time payment stays where it is.
 */
export function nextPayment(
  dueDate: string | undefined,
  interval: PaymentInterval | undefined,
  today: string,
): string | null {
  if (!dueDate) return null;
  if (dueDate >= today || !interval || interval === 'once') return dueDate;
  const step = MONTHS_PER_INTERVAL[interval];
  let months = step;
  let next = addMonths(dueDate, months);
  // Bounded: at most 50 years of monthly steps.
  for (let guard = 0; next < today && guard < 600; guard += 1) {
    months += step;
    next = addMonths(dueDate, months);
  }
  return next;
}

/** Cost per month and per year (one-time payments and missing amounts count as 0). */
export function costs(contract: ContractInfo): { monthly: number; yearly: number } {
  if (contract.amount === undefined || !contract.interval || contract.interval === 'once') {
    return { monthly: 0, yearly: 0 };
  }
  const months = MONTHS_PER_INTERVAL[contract.interval];
  const yearly = (contract.amount * 12) / months;
  return { monthly: yearly / 12, yearly };
}

export function totalCosts(contracts: readonly ContractInfo[]): {
  monthly: number;
  yearly: number;
} {
  return contracts.reduce(
    (sum, contract) => {
      const cost = costs(contract);
      return { monthly: sum.monthly + cost.monthly, yearly: sum.yearly + cost.yearly };
    },
    { monthly: 0, yearly: 0 },
  );
}

export type DeadlineKind = 'cancel' | 'termEnd' | 'payment';

export interface Deadline<C extends ContractInfo = ContractInfo> {
  contract: C;
  kind: DeadlineKind;
  date: string;
  /** Days from today (0 = today). */
  days: number;
}

/** Cancelling comes before the term end on the same day, payments last. */
const KIND_ORDER: Record<DeadlineKind, number> = { cancel: 0, termEnd: 1, payment: 2 };

/** All upcoming dates of the contracts (today or later), earliest first. */
export function deadlines<C extends ContractInfo>(
  contracts: readonly C[],
  today: string,
): Deadline<C>[] {
  const list: Deadline<C>[] = [];
  const push = (contract: C, kind: DeadlineKind, date: string | null | undefined) => {
    if (!date || date < today) return;
    list.push({ contract, kind, date, days: daysBetween(today, date) });
  };
  for (const contract of contracts) {
    push(contract, 'cancel', cancelBy(contract));
    push(contract, 'termEnd', contract.termEnd);
    push(contract, 'payment', nextPayment(contract.dueDate, contract.interval, today));
  }
  return list.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.contract.name.localeCompare(b.contract.name, 'de'),
  );
}

/** Days ahead that "Heute" shows: cancelling needs time, payments only matter shortly. */
export const UPCOMING_DAYS: Record<DeadlineKind, number> = {
  cancel: 30,
  termEnd: 30,
  payment: 7,
};

export function upcomingDeadlines<C extends ContractInfo>(
  contracts: readonly C[],
  today: string,
): Deadline<C>[] {
  return deadlines(contracts, today).filter(
    (deadline) => deadline.days <= UPCOMING_DAYS[deadline.kind],
  );
}

/** The term end lies in the past: the date has to be checked (renewed or ended?). */
export function termEndPassed(contract: ContractInfo, today: string): boolean {
  return contract.termEnd !== undefined && contract.termEnd < today;
}

/** The latest cancel day passed but the term has not ended yet: too late for this term. */
export function cancelMissed(contract: ContractInfo, today: string): boolean {
  const last = cancelBy(contract);
  return (
    last !== null && last < today && contract.termEnd !== undefined && contract.termEnd >= today
  );
}
