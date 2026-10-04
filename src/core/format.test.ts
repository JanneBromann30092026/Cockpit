import { describe, expect, it } from 'vitest';
import { formatBytes } from './format';

describe('formatBytes', () => {
  it('formats bytes without decimals', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('uses decimal units and a German decimal comma', () => {
    expect(formatBytes(1000)).toBe('1 KB');
    expect(formatBytes(1500)).toBe('1,5 KB');
    expect(formatBytes(2_340_000)).toBe('2,3 MB');
    expect(formatBytes(1_000_000_000)).toBe('1 GB');
  });

  it('drops decimals for values of 100 and above', () => {
    expect(formatBytes(123_456_789)).toBe('123 MB');
  });

  it('caps at the largest unit', () => {
    expect(formatBytes(5e15)).toBe('5.000 TB');
  });

  it('returns a dash for invalid input', () => {
    expect(formatBytes(-1)).toBe('–');
    expect(formatBytes(Number.NaN)).toBe('–');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('–');
  });
});

describe('dates and amounts', () => {
  it('formats calendar dates and euros', async () => {
    const { formatDate, formatEuro, formatShortDate } = await import('./format');
    expect(formatShortDate('2026-10-07')).toBe('Mi., 07.10.');
    expect(formatDate('2026-10-07')).toBe('07.10.2026');
    expect(formatEuro(19.9).replace(/\s/g, ' ')).toBe('19,90 €');
  });

  it('reads amounts as typed on a German keyboard', async () => {
    const { amountInput, parseAmount } = await import('./format');
    expect(parseAmount('19,99')).toBe(19.99);
    expect(parseAmount('1.234,50 €')).toBe(1234.5);
    expect(parseAmount('1234.5')).toBe(1234.5);
    expect(parseAmount('1.234')).toBe(1234);
    expect(parseAmount('12,345')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
    expect(amountInput(19.9)).toBe('19,90');
    expect(amountInput(850)).toBe('850');
  });
});
