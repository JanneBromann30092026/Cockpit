/**
 * Strictly increasing ISO timestamp: if the clock did not move on (same millisecond, or a
 * clock set back), one millisecond is added. Other tabs detect changes by updatedAt, so two
 * writes of the same record must never share a timestamp.
 */
export function nextTimestamp(previous: string | undefined, now: number = Date.now()): string {
  const last = previous ? Date.parse(previous) : Number.NEGATIVE_INFINITY;
  return new Date(Math.max(now, last + 1)).toISOString();
}
