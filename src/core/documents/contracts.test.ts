import { describe, expect, it } from 'vitest';
import {
  cancelBy,
  cancelMissed,
  costs,
  deadlines,
  nextPayment,
  parseNotice,
  subtractNotice,
  termEndPassed,
  totalCosts,
  upcomingDeadlines,
  type ContractInfo,
} from './contracts';

const TODAY = '2026-10-05';

describe('notice periods', () => {
  it('reads digits and German number words with their unit', () => {
    expect(parseNotice('3 Monate zum Ende der Vertragslaufzeit')).toEqual({
      amount: 3,
      unit: 'months',
    });
    expect(parseNotice('mit einer Frist von einem Monat')).toEqual({ amount: 1, unit: 'months' });
    expect(parseNotice('14 Tage nach Erhalt')).toEqual({ amount: 14, unit: 'days' });
    expect(parseNotice('Sechs Wochen zum Quartalsende')).toEqual({ amount: 6, unit: 'weeks' });
    expect(parseNotice('jederzeit zum Monatsende')).toBeNull();
    expect(parseNotice(undefined)).toBeNull();
  });

  it('counts back from the term end, months clamped to the month end', () => {
    expect(subtractNotice('2026-12-31', { amount: 3, unit: 'months' })).toBe('2026-09-30');
    expect(subtractNotice('2027-05-31', { amount: 3, unit: 'months' })).toBe('2027-02-28');
    expect(subtractNotice('2026-10-31', { amount: 4, unit: 'weeks' })).toBe('2026-10-03');
    expect(subtractNotice('2026-10-31', { amount: 14, unit: 'days' })).toBe('2026-10-17');
  });

  it('calculates the latest cancel day only when term end and period are known', () => {
    const gym: ContractInfo = {
      id: 'g',
      name: 'Fitnessstudio',
      termEnd: '2026-11-14',
      notice: { amount: 4, unit: 'weeks' },
    };
    expect(cancelBy(gym)).toBe('2026-10-17');
    expect(cancelBy({ ...gym, notice: undefined })).toBeNull();
    expect(cancelBy({ ...gym, termEnd: undefined })).toBeNull();
    expect(cancelMissed(gym, '2026-10-20')).toBe(true);
    expect(cancelMissed(gym, TODAY)).toBe(false);
    expect(termEndPassed(gym, '2026-11-15')).toBe(true);
  });
});

describe('payments and costs', () => {
  it('moves a past due date on by the interval', () => {
    expect(nextPayment('2026-10-10', 'monthly', TODAY)).toBe('2026-10-10');
    expect(nextPayment('2026-08-31', 'monthly', TODAY)).toBe('2026-10-31');
    expect(nextPayment('2026-01-15', 'quarterly', TODAY)).toBe('2026-10-15');
    expect(nextPayment('2025-03-01', 'yearly', TODAY)).toBe('2027-03-01');
    expect(nextPayment('2026-09-01', 'once', TODAY)).toBe('2026-09-01');
    expect(nextPayment(undefined, 'monthly', TODAY)).toBeNull();
  });

  it('converts to monthly and yearly costs', () => {
    expect(costs({ id: 'a', name: 'A', amount: 120, interval: 'yearly' })).toEqual({
      monthly: 10,
      yearly: 120,
    });
    expect(costs({ id: 'b', name: 'B', amount: 30, interval: 'quarterly' }).monthly).toBe(10);
    expect(costs({ id: 'c', name: 'C', amount: 50, interval: 'once' })).toEqual({
      monthly: 0,
      yearly: 0,
    });
    expect(
      totalCosts([
        { id: 'a', name: 'A', amount: 120, interval: 'yearly' },
        { id: 'b', name: 'B', amount: 19.99, interval: 'monthly' },
        { id: 'c', name: 'C' },
      ]).monthly,
    ).toBeCloseTo(29.99);
  });
});

describe('deadlines', () => {
  const contracts: ContractInfo[] = [
    {
      id: 'gym',
      name: 'Fitnessstudio',
      dueDate: '2026-10-17',
      interval: 'monthly',
      termEnd: '2026-11-14',
      notice: { amount: 4, unit: 'weeks' },
    },
    { id: 'phone', name: 'Handy', dueDate: '2026-10-08', interval: 'monthly' },
    { id: 'old', name: 'Alt', termEnd: '2026-09-01' },
  ];

  it('lists future dates, cancel before term end before payment on the same day', () => {
    const list = deadlines(contracts, TODAY);
    expect(list.map((d) => [d.contract.id, d.kind, d.date, d.days])).toEqual([
      ['phone', 'payment', '2026-10-08', 3],
      ['gym', 'cancel', '2026-10-17', 12],
      ['gym', 'payment', '2026-10-17', 12],
      ['gym', 'termEnd', '2026-11-14', 40],
    ]);
  });

  it('shows cancelling and term ends 30 days ahead, payments only 7', () => {
    const upcoming = upcomingDeadlines(contracts, TODAY);
    expect(upcoming.map((d) => `${d.contract.id}:${d.kind}`)).toEqual([
      'phone:payment',
      'gym:cancel',
    ]);
  });
});
