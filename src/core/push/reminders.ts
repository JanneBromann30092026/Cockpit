/**
 * Push reminders: what the sender (GitHub Actions) sends and what the service worker shows.
 * The payload only names the kind of reminder – never personal data. The texts live in the
 * app (src/i18n/de.ts), a tap opens the matching page.
 */

export const PUSH_REMINDERS = ['morning', 'dayReview', 'weekReview', 'test'] as const;
export type PushReminder = (typeof PUSH_REMINDERS)[number];

/** Payload format version, so an older service worker can still show something sensible. */
export const PUSH_PAYLOAD_VERSION = 1;

export interface PushPayload {
  v: typeof PUSH_PAYLOAD_VERSION;
  reminder: PushReminder;
}

/** Router path a tap on the notification opens (aliases resolve to today / this week). */
export const REMINDER_PATHS: Record<PushReminder, string> = {
  morning: '/today',
  dayReview: '/reviews/day/today',
  weekReview: '/reviews/week/current',
  test: '/settings',
};

export function isPushReminder(value: unknown): value is PushReminder {
  return typeof value === 'string' && (PUSH_REMINDERS as readonly string[]).includes(value);
}

export function pushPayload(reminder: PushReminder): PushPayload {
  return { v: PUSH_PAYLOAD_VERSION, reminder };
}

/** Reads a received payload; anything unknown becomes null (shown as a generic notice). */
export function parsePushPayload(text: string | null | undefined): PushReminder | null {
  if (!text) return null;
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const reminder = (value as Record<string, unknown>).reminder;
    return isPushReminder(reminder) ? reminder : null;
  } catch {
    return null;
  }
}

/** Only paths Cockpit itself sends may be opened from a notification. */
export function isReminderPath(path: unknown): path is string {
  return typeof path === 'string' && Object.values(REMINDER_PATHS).includes(path);
}

/** Message the service worker sends to an open app window after a tap. */
export const NAVIGATE_MESSAGE = 'cockpit:navigate';

/** What the service worker remembers about the last push (for the check in the settings). */
export interface LastPush {
  reminder: PushReminder | null;
  at: string;
}

export function parseLastPush(value: unknown): LastPush | null {
  if (typeof value !== 'object' || value === null) return null;
  const { reminder, at } = value as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  return { reminder: isPushReminder(reminder) ? reminder : null, at };
}

/** Cache (Cache Storage) and key under which the service worker keeps the last push. */
export const LAST_PUSH_CACHE = 'cockpit-push';
export const LAST_PUSH_KEY = 'last-push';
