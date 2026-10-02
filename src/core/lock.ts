/** Pure rules of the app lock: inactivity, background time and unlock attempts. */

/** After more than this time in the background the app always locks. */
export const BACKGROUND_LOCK_MS = 60_000;

/** Choices for "Automatisch sperren nach" in minutes. */
export const LOCK_AFTER_MINUTES = [1, 2, 5, 10, 15, 30] as const;
export type LockAfterMinutes = (typeof LOCK_AFTER_MINUTES)[number];
export const DEFAULT_LOCK_AFTER_MINUTES: LockAfterMinutes = 5;

export function inactivityExpired(now: number, lastActivityAt: number, timeoutMs: number): boolean {
  return now - lastActivityAt >= timeoutMs;
}

/** True when the app was hidden longer than the limit (hiddenAt null = never hidden). */
export function backgroundExpired(
  now: number,
  hiddenAt: number | null,
  limitMs: number = BACKGROUND_LOCK_MS,
): boolean {
  return hiddenAt !== null && now - hiddenAt > limitMs;
}

/** Failed unlock attempts (stored in meta, so reloading does not reset the wait time). */
export interface UnlockFailures {
  count: number;
  /** Epoch milliseconds of the last failed attempt. */
  lastFailedAt: number;
}

/** Short wait after repeated failures: none for the first two, then 5 s, 10 s, 30 s, 60 s. */
export function unlockDelayMs(failures: number): number {
  if (failures < 3) return 0;
  if (failures === 3) return 5_000;
  if (failures === 4) return 10_000;
  if (failures === 5) return 30_000;
  return 60_000;
}

/** Remaining wait before the next attempt is allowed (0 = allowed now). */
export function remainingUnlockDelayMs(failures: UnlockFailures | null, now: number): number {
  if (!failures) return 0;
  const until = failures.lastFailedAt + unlockDelayMs(failures.count);
  return Math.max(0, until - now);
}
