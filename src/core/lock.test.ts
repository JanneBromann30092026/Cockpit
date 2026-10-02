import { describe, expect, it } from 'vitest';
import {
  backgroundExpired,
  BACKGROUND_LOCK_MS,
  DEFAULT_LOCK_AFTER_MINUTES,
  inactivityExpired,
  remainingUnlockDelayMs,
  unlockDelayMs,
} from './lock';

describe('app lock rules', () => {
  it('locks after the inactivity timeout (default 5 minutes)', () => {
    const timeout = DEFAULT_LOCK_AFTER_MINUTES * 60_000;
    expect(DEFAULT_LOCK_AFTER_MINUTES).toBe(5);
    expect(inactivityExpired(1_000 + timeout - 1, 1_000, timeout)).toBe(false);
    expect(inactivityExpired(1_000 + timeout, 1_000, timeout)).toBe(true);
  });

  it('locks after more than one minute in the background', () => {
    expect(BACKGROUND_LOCK_MS).toBe(60_000);
    expect(backgroundExpired(10_000, null)).toBe(false);
    expect(backgroundExpired(70_000, 10_000)).toBe(false);
    expect(backgroundExpired(70_001, 10_000)).toBe(true);
  });

  it('waits a little longer after every failed attempt from the third on', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(unlockDelayMs)).toEqual([
      0, 0, 5_000, 10_000, 30_000, 60_000, 60_000,
    ]);
    expect(remainingUnlockDelayMs(null, 0)).toBe(0);
    expect(remainingUnlockDelayMs({ count: 3, lastFailedAt: 1_000 }, 3_000)).toBe(3_000);
    expect(remainingUnlockDelayMs({ count: 3, lastFailedAt: 1_000 }, 9_000)).toBe(0);
  });
});
