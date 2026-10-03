import { describe, expect, it } from 'vitest';
import {
  dayRange,
  dedupeEvents,
  eventTiming,
  isOnDay,
  localDate,
  normalizeEvent,
  sortEvents,
  tightSpots,
  type CalendarEvent,
} from './events';

const at = (time: string) => new Date(`2026-10-05T${time}:00`);
const iso = (time: string) => at(time).toISOString();

function timed(id: string, from: string, to: string, title = id): CalendarEvent {
  return { id, calendarId: 'primary', title, start: iso(from), end: iso(to), allDay: false };
}

describe('calendar events', () => {
  it('normalizes Google events and drops cancelled or declined ones', () => {
    expect(
      normalizeEvent(
        {
          id: 'a',
          summary: ' Zahnarzt ',
          location: 'Praxis Dr. Weiß',
          start: { dateTime: '2026-10-05T09:00:00+02:00' },
          end: { dateTime: '2026-10-05T09:30:00+02:00' },
          htmlLink: 'https://calendar.google.com/event?eid=a',
        },
        'primary',
        'Ohne Titel',
      ),
    ).toEqual({
      id: 'a',
      calendarId: 'primary',
      title: 'Zahnarzt',
      location: 'Praxis Dr. Weiß',
      start: '2026-10-05T09:00:00+02:00',
      end: '2026-10-05T09:30:00+02:00',
      allDay: false,
      link: 'https://calendar.google.com/event?eid=a',
    });
    expect(
      normalizeEvent(
        { id: 'b', start: { date: '2026-10-05' }, end: { date: '2026-10-06' } },
        'feiertage',
        'Ohne Titel',
      ),
    ).toMatchObject({ title: 'Ohne Titel', allDay: true, start: '2026-10-05' });
    expect(normalizeEvent({ id: 'c', status: 'cancelled' }, 'primary', '')).toBeNull();
    expect(
      normalizeEvent(
        {
          id: 'd',
          start: { dateTime: iso('10:00') },
          end: { dateTime: iso('11:00') },
          attendees: [{ self: true, responseStatus: 'declined' }],
        },
        'primary',
        '',
      ),
    ).toBeNull();
    expect(normalizeEvent({ id: 'e' }, 'primary', '')).toBeNull();
  });

  it('knows the local day', () => {
    const now = at('13:00');
    expect(localDate(now)).toBe('2026-10-05');
    const { start, end } = dayRange(now);
    expect(start).toEqual(at('00:00'));
    expect(end.getTime() - start.getTime()).toBeGreaterThanOrEqual(23 * 3_600_000);
    const allDay: CalendarEvent = {
      id: 'x',
      calendarId: 'p',
      title: 'Urlaub',
      start: '2026-10-04',
      end: '2026-10-07',
      allDay: true,
    };
    expect(isOnDay(allDay, now)).toBe(true);
    expect(isOnDay({ ...allDay, end: '2026-10-05' }, now)).toBe(false);
    expect(isOnDay(timed('t', '23:30', '23:45'), now)).toBe(true);
  });

  it('sorts all-day first, then by time, and removes duplicates', () => {
    const events = [
      timed('b', '11:00', '12:00'),
      timed('a', '09:00', '10:00'),
      { ...timed('c', '00:00', '00:00'), allDay: true, start: '2026-10-05', end: '2026-10-06' },
      { ...timed('a2', '09:00', '10:00', 'a'), calendarId: 'work' },
    ];
    expect(sortEvents(events).map((event) => event.id)).toEqual(['c', 'a', 'a2', 'b']);
    expect(dedupeEvents(sortEvents(events)).map((event) => event.id)).toEqual(['c', 'a', 'b']);
  });

  it('tells past, running and upcoming events apart', () => {
    const event = timed('m', '10:00', '11:00');
    expect(eventTiming(event, at('09:59'))).toBe('upcoming');
    expect(eventTiming(event, at('10:30'))).toBe('now');
    expect(eventTiming(event, at('11:00'))).toBe('past');
  });

  it('finds tight spots: less than 15 minutes or overlaps', () => {
    const spots = tightSpots([
      timed('a', '09:00', '10:00'),
      timed('b', '10:10', '11:00'),
      timed('c', '11:30', '12:30'),
      timed('d', '12:15', '13:00'),
      timed('long', '14:00', '17:00'),
      timed('inside', '15:00', '15:30'),
      timed('after', '17:20', '18:00'),
    ]);
    expect(spots.map((s) => [s.before.id, s.after.id, s.gapMinutes])).toEqual([
      ['a', 'b', 10],
      ['c', 'd', -15],
      ['long', 'inside', -120],
    ]);
  });
});
