import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, localIsoDate, nextMonday, weekday } from './dates';

describe('calendar dates', () => {
  it('counts and adds days across months, years and daylight saving time', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-10-05', '2026-10-03')).toBe(-2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('knows weekdays and the next Monday', () => {
    expect(weekday('2026-10-05')).toBe(0); // Monday
    expect(weekday('2026-10-04')).toBe(6); // Sunday
    expect(nextMonday('2026-10-04')).toBe('2026-10-05');
    expect(nextMonday('2026-10-05')).toBe('2026-10-12');
  });

  it('formats the local date', () => {
    expect(localIsoDate(new Date(2026, 0, 9, 23, 30))).toBe('2026-01-09');
  });
});
