/**
 * When GitHub Actions sends which reminder. GitHub schedules run in UTC, so every reminder
 * has one cron for summer time (CEST, UTC+2) and one for winter time (CET, UTC+1); the
 * sender only sends when Berlin's offset at the scheduled time matches. The scheduled time
 * (not the start time) decides: GitHub often starts minutes, sometimes much later.
 * The minutes sit a few minutes before the target time and away from :00, the busiest slot.
 *
 * No imports: the sender script (scripts/push/send.ts) runs this file directly in Node.
 */

export type ScheduledReminder = 'morning' | 'dayReview' | 'weekReview';

export interface PushSlot {
  /** Cron expression exactly as in .github/workflows/push.yml (UTC). */
  cron: string;
  reminder: ScheduledReminder;
  /** Berlin's UTC offset (minutes) this slot is meant for. */
  offsetMinutes: 60 | 120;
}

export const PUSH_SLOTS: readonly PushSlot[] = [
  // "Dein Tag" around 7:00 (sent 6:53 Berlin time).
  { cron: '53 4 * * *', reminder: 'morning', offsetMinutes: 120 },
  { cron: '53 5 * * *', reminder: 'morning', offsetMinutes: 60 },
  // Daily review around 21:30 (sent 21:23).
  { cron: '23 19 * * *', reminder: 'dayReview', offsetMinutes: 120 },
  { cron: '23 20 * * *', reminder: 'dayReview', offsetMinutes: 60 },
  // Weekly review on Sundays around 19:00 (sent 18:53).
  { cron: '53 16 * * 0', reminder: 'weekReview', offsetMinutes: 120 },
  { cron: '53 17 * * 0', reminder: 'weekReview', offsetMinutes: 60 },
];

/** Berlin local times the reminders are meant for (shown in the settings). */
export const REMINDER_TIMES: Record<ScheduledReminder, string> = {
  morning: '07:00',
  dayReview: '21:30',
  weekReview: '19:00',
};

/** A reminder that arrives later than this is skipped (e.g. "Dein Tag" at noon). */
export const MAX_DELAY_MINUTES = 120;

const MINUTE = 60_000;

/** Berlin's offset from UTC in minutes at the given instant (60 in winter, 120 in summer). */
export function berlinOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    timeZoneName: 'longOffset',
  }).formatToParts(instant);
  const name = parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * The latest instant ≤ now matching the cron's minute and hour (UTC). Weekday fields are
 * checked by the caller; only fixed minute/hour crons are used here.
 */
export function lastScheduledTime(cron: string, now: Date): Date | null {
  const [minute, hour] = cron.trim().split(/\s+/);
  const m = Number(minute);
  const h = Number(hour);
  if (!Number.isInteger(m) || !Number.isInteger(h)) return null;
  const scheduled = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m),
  );
  if (scheduled.getTime() > now.getTime()) scheduled.setUTCDate(scheduled.getUTCDate() - 1);
  return scheduled;
}

export type SlotDecision =
  | { send: true; reminder: ScheduledReminder; delayMinutes: number }
  | { send: false; reason: 'unknownCron' | 'otherSeason' | 'tooLate'; delayMinutes?: number };

/** Decides for a scheduled run (cron that triggered it, actual start time) what to send. */
export function decideSlot(cron: string, now: Date): SlotDecision {
  const slot = PUSH_SLOTS.find((candidate) => candidate.cron === cron.trim());
  const scheduled = slot ? lastScheduledTime(slot.cron, now) : null;
  if (!slot || !scheduled) return { send: false, reason: 'unknownCron' };
  const delayMinutes = Math.round((now.getTime() - scheduled.getTime()) / MINUTE);
  if (berlinOffsetMinutes(scheduled) !== slot.offsetMinutes) {
    return { send: false, reason: 'otherSeason', delayMinutes };
  }
  if (delayMinutes > MAX_DELAY_MINUTES) return { send: false, reason: 'tooLate', delayMinutes };
  return { send: true, reminder: slot.reminder, delayMinutes };
}
