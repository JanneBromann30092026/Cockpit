import { describe, expect, it } from 'vitest';
import {
  PUSH_REMINDERS,
  REMINDER_PATHS,
  isReminderPath,
  parseLastPush,
  parsePushPayload,
  pushPayload,
} from './reminders';

describe('push reminders', () => {
  it('round-trips the payload and ignores anything unknown', () => {
    for (const reminder of PUSH_REMINDERS) {
      expect(parsePushPayload(JSON.stringify(pushPayload(reminder)))).toBe(reminder);
    }
    expect(parsePushPayload('{"v":1,"reminder":"steal"}')).toBeNull();
    expect(parsePushPayload('kein JSON')).toBeNull();
    expect(parsePushPayload('')).toBeNull();
    expect(parsePushPayload(null)).toBeNull();
  });

  it('opens only Cockpit pages', () => {
    expect(REMINDER_PATHS.dayReview).toBe('/reviews/day/today');
    expect(isReminderPath('/reviews/week/current')).toBe(true);
    expect(isReminderPath('https://example.com')).toBe(false);
    expect(isReminderPath('/documents')).toBe(false);
  });

  it('reads what the service worker remembered', () => {
    expect(parseLastPush({ reminder: 'morning', at: '2026-10-09T05:01:00.000Z' })).toEqual({
      reminder: 'morning',
      at: '2026-10-09T05:01:00.000Z',
    });
    expect(parseLastPush({ reminder: 'x', at: '2026-10-09T05:01:00.000Z' })?.reminder).toBeNull();
    expect(parseLastPush({ at: 'gestern' })).toBeNull();
  });
});
