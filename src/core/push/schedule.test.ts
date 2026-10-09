import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PUSH_SLOTS, berlinOffsetMinutes, decideSlot, lastScheduledTime } from './schedule';

const at = (iso: string) => new Date(iso);

describe('push schedule', () => {
  it('knows Berlin summer and winter time', () => {
    expect(berlinOffsetMinutes(at('2026-07-01T12:00:00Z'))).toBe(120);
    expect(berlinOffsetMinutes(at('2026-12-01T12:00:00Z'))).toBe(60);
    // Switch on 25 October 2026 at 01:00 UTC.
    expect(berlinOffsetMinutes(at('2026-10-25T00:59:00Z'))).toBe(120);
    expect(berlinOffsetMinutes(at('2026-10-25T01:00:00Z'))).toBe(60);
  });

  it('finds the scheduled time of a (late) run', () => {
    expect(lastScheduledTime('23 19 * * *', at('2026-10-09T19:41:00Z'))?.toISOString()).toBe(
      '2026-10-09T19:23:00.000Z',
    );
    // Started after midnight UTC: the schedule was yesterday.
    expect(lastScheduledTime('23 20 * * *', at('2026-12-02T00:10:00Z'))?.toISOString()).toBe(
      '2026-12-01T20:23:00.000Z',
    );
  });

  it('sends the summer cron in summer and the winter cron in winter', () => {
    expect(decideSlot('23 19 * * *', at('2026-07-01T19:35:00Z'))).toEqual({
      send: true,
      reminder: 'dayReview',
      delayMinutes: 12,
    });
    expect(decideSlot('23 20 * * *', at('2026-07-01T20:30:00Z'))).toMatchObject({
      send: false,
      reason: 'otherSeason',
    });
    expect(decideSlot('23 20 * * *', at('2026-12-01T20:30:00Z'))).toMatchObject({
      send: true,
      reminder: 'dayReview',
    });
    expect(decideSlot('23 19 * * *', at('2026-12-01T19:30:00Z'))).toMatchObject({
      send: false,
      reason: 'otherSeason',
    });
  });

  it('each reminder arrives once a day, at the right local time, all year', () => {
    const local = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      hour: '2-digit',
      minute: '2-digit',
    });
    for (let day = 0; day < 366; day += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + day));
      const sent = PUSH_SLOTS.filter((slot) => {
        const [minute, hour, , , weekday] = slot.cron.split(' ');
        if (weekday !== '*' && Number(weekday) !== date.getUTCDay()) return false;
        const run = new Date(date);
        run.setUTCHours(Number(hour), Number(minute) + 5);
        const decision = decideSlot(slot.cron, run);
        if (decision.send) {
          run.setUTCMinutes(run.getUTCMinutes() - 5);
          expect(local.format(run)).toBe(
            { morning: '06:53', dayReview: '21:23', weekReview: '18:53' }[slot.reminder],
          );
        }
        return decision.send;
      }).map((slot) => slot.reminder);
      const expected = date.getUTCDay() === 0 ? ['dayReview', 'weekReview'] : ['dayReview'];
      expect(sent.filter((reminder) => reminder !== 'morning').sort()).toEqual(expected);
      expect(sent.filter((reminder) => reminder === 'morning')).toEqual(['morning']);
    }
  });

  it('skips runs GitHub started far too late and unknown crons', () => {
    expect(decideSlot('53 4 * * *', at('2026-07-01T07:00:00Z'))).toEqual({
      send: false,
      reason: 'tooLate',
      delayMinutes: 127,
    });
    expect(decideSlot('0 12 * * *', at('2026-07-01T12:00:00Z'))).toEqual({
      send: false,
      reason: 'unknownCron',
    });
  });

  it('matches the crons of the GitHub workflow', () => {
    const workflow = readFileSync(
      new URL('../../../.github/workflows/push.yml', import.meta.url),
      'utf8',
    );
    const crons = [...workflow.matchAll(/cron: '([^']+)'/g)].map((match) => match[1]);
    expect(crons).toEqual(PUSH_SLOTS.map((slot) => slot.cron));
  });
});
