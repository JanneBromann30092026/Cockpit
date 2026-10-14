/**
 * Focus blocks in Google Calendar: reading busy times of the next days (all shown
 * calendars) and Cockpit's own blocks, creating and removing blocks in the primary
 * calendar. Blocks carry a private marker so Cockpit finds them again – nothing else is
 * written: a title like "Fokus: Instagram", times, colour and the marker.
 */
import { z } from 'zod';
import type { ExistingBlock, Interval } from '@/core/focus/plan';
import { CALENDAR_API, googleGet, googleSend } from './api';

/** Private extended property on every Cockpit block. */
export const FOCUS_MARKER = { key: 'cockpit', value: 'focus' } as const;
/** "Blaubeere" in Google Calendar – close to Cockpit's cobalt. */
const FOCUS_COLOR_ID = '9';

const calendarListSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        primary: z.boolean().optional(),
        selected: z.boolean().optional(),
      }),
    )
    .default([]),
});

const eventTimeSchema = z.object({ date: z.string().optional(), dateTime: z.string().optional() });

const eventSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  transparency: z.string().optional(),
  start: eventTimeSchema.optional(),
  end: eventTimeSchema.optional(),
  attendees: z
    .array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() }))
    .optional(),
  extendedProperties: z.object({ private: z.record(z.string(), z.string()).optional() }).optional(),
});

const eventsSchema = z.object({
  items: z.array(eventSchema).default([]),
  nextPageToken: z.string().optional(),
});

export interface FocusBlockEvent extends ExistingBlock {
  id: string;
}

export interface CalendarLoad {
  /** Timed events that block time (not cancelled, declined, all-day or "free"). */
  busy: Interval[];
  /** Cockpit's own focus blocks in the range (primary calendar). */
  blocks: FocusBlockEvent[];
}

function timed(event: z.output<typeof eventSchema>): Interval | null {
  const start = event.start?.dateTime;
  const end = event.end?.dateTime;
  if (!start || !end) return null;
  return { start: Date.parse(start), end: Date.parse(end) };
}

async function listEvents(calendarId: string, from: Date, to: Date, signal?: AbortSignal) {
  const items: z.output<typeof eventSchema>[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      maxResults: '250',
      fields:
        'nextPageToken,items(id,status,transparency,start,end,attendees(self,responseStatus),extendedProperties)',
    });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await googleGet(
      `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${query.toString()}`,
      eventsSchema,
      signal,
    );
    items.push(...page.items);
    pageToken = page.nextPageToken;
  } while (pageToken && items.length < 2000);
  return items;
}

/** Busy times and existing focus blocks between `from` and `to`. */
export async function loadCalendarForFocus(
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<CalendarLoad> {
  const list = await googleGet(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&fields=items(id,primary,selected)`,
    calendarListSchema,
    signal,
  );
  const calendars = list.items.filter((calendar) => calendar.primary || calendar.selected);
  const busy: Interval[] = [];
  const blocks: FocusBlockEvent[] = [];
  const perCalendar = await Promise.all(
    calendars.map(async (calendar) => ({
      calendar,
      events: await listEvents(calendar.id, from, to, signal),
    })),
  );
  for (const { calendar, events } of perCalendar) {
    for (const event of events) {
      if (event.status === 'cancelled') continue;
      if (event.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue;
      const interval = timed(event);
      if (!interval) continue;
      const marker = event.extendedProperties?.private;
      if (calendar.primary && marker?.[FOCUS_MARKER.key] === FOCUS_MARKER.value) {
        blocks.push({ ...interval, id: event.id, activity: marker.activity ?? '' });
        continue;
      }
      if (event.transparency === 'transparent') continue;
      busy.push(interval);
    }
  }
  return { busy, blocks: blocks.sort((a, b) => a.start - b.start) };
}

export interface NewFocusBlock extends Interval {
  activity: string;
  title: string;
  description: string;
}

/** Creates the blocks one after another; returns how many were created before a failure. */
export async function createFocusBlocks(
  blocks: readonly NewFocusBlock[],
  onProgress?: (done: number) => void,
  signal?: AbortSignal,
): Promise<number> {
  let done = 0;
  for (const block of blocks) {
    await googleSend(
      'POST',
      `${CALENDAR_API}/calendars/primary/events?fields=id`,
      z.object({ id: z.string() }),
      {
        summary: block.title,
        description: block.description,
        start: { dateTime: new Date(block.start).toISOString() },
        end: { dateTime: new Date(block.end).toISOString() },
        colorId: FOCUS_COLOR_ID,
        transparency: 'opaque',
        reminders: { useDefault: true },
        extendedProperties: {
          private: { [FOCUS_MARKER.key]: FOCUS_MARKER.value, activity: block.activity },
        },
      },
      signal,
    );
    done += 1;
    onProgress?.(done);
  }
  return done;
}

/** Removes Cockpit blocks by id (already deleted ones count as removed). */
export async function deleteFocusBlocks(ids: readonly string[], signal?: AbortSignal) {
  for (const id of ids) {
    await googleSend(
      'DELETE',
      `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(id)}`,
      z.null(),
      undefined,
      signal,
    );
  }
}
