/** Calendar events of a day: normalizing Google's format, sorting, tight spots. Pure logic. */

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  location?: string;
  /** ISO timestamp (timed) or calendar date "JJJJ-MM-TT" (all-day). */
  start: string;
  /** Exclusive end: ISO timestamp or the calendar date after the last day. */
  end: string;
  allDay: boolean;
  link?: string;
}

/** The part of a Google Calendar event the app reads. */
export interface RawCalendarEvent {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

/** Drops cancelled events and events I declined; null when the times are missing. */
export function normalizeEvent(
  raw: RawCalendarEvent,
  calendarId: string,
  untitled: string,
): CalendarEvent | null {
  if (raw.status === 'cancelled') return null;
  if (raw.attendees?.some((a) => a.self && a.responseStatus === 'declined')) return null;
  const allDay = Boolean(raw.start?.date);
  const start = raw.start?.dateTime ?? raw.start?.date;
  const end = raw.end?.dateTime ?? raw.end?.date ?? start;
  if (!start || !end) return null;
  return {
    id: raw.id,
    calendarId,
    title: raw.summary?.trim() || untitled,
    location: raw.location?.trim() || undefined,
    start,
    end,
    allDay,
    link: raw.htmlLink,
  };
}

/** Local calendar date "JJJJ-MM-TT" of a Date. */
export function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Start (inclusive) and end (exclusive) of the local day around `now`. */
export function dayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return { start, end };
}

/** True when the event touches the local day of `now`. */
export function isOnDay(event: CalendarEvent, now: Date): boolean {
  if (event.allDay) {
    const today = localDate(now);
    return event.start <= today && today < event.end;
  }
  const { start, end } = dayRange(now);
  return Date.parse(event.start) < end.getTime() && Date.parse(event.end) > start.getTime();
}

/** All-day events first (by title), then timed events by start and end. */
export function sortEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    if (a.allDay) return a.title.localeCompare(b.title, 'de');
    return Date.parse(a.start) - Date.parse(b.start) || Date.parse(a.end) - Date.parse(b.end);
  });
}

/** Events I really attend twice (two calendars) are shown once. */
export function dedupeEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = `${event.title}|${event.start}|${event.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export type EventTiming = 'past' | 'now' | 'upcoming';

export function eventTiming(event: CalendarEvent, now: Date): EventTiming {
  if (event.allDay) return 'now';
  const t = now.getTime();
  if (Date.parse(event.end) <= t) return 'past';
  if (Date.parse(event.start) <= t) return 'now';
  return 'upcoming';
}

/** Less than this between two events counts as tight. */
export const TIGHT_GAP_MS = 15 * 60_000;

export interface TightSpot {
  before: CalendarEvent;
  after: CalendarEvent;
  /** Minutes between the end of `before` and the start of `after` (negative = overlap). */
  gapMinutes: number;
}

/** Consecutive timed events with less than 15 minutes in between (or overlapping). */
export function tightSpots(events: readonly CalendarEvent[]): TightSpot[] {
  const timed = sortEvents(events).filter((event) => !event.allDay);
  const spots: TightSpot[] = [];
  let latest: CalendarEvent | undefined;
  for (const event of timed) {
    if (latest) {
      const gap = Date.parse(event.start) - Date.parse(latest.end);
      if (gap < TIGHT_GAP_MS) {
        spots.push({ before: latest, after: event, gapMinutes: Math.round(gap / 60_000) });
      }
    }
    // Compare with the event that ends last so far (a long event can contain short ones).
    if (!latest || Date.parse(event.end) > Date.parse(latest.end)) latest = event;
  }
  return spots;
}
