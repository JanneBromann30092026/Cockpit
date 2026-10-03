/**
 * Data for "Heute": today's events from all shown calendars and unread inbox mails of
 * the last 24 hours (metadata and snippet only). Read-only, kept in memory by the caller.
 */
import { z } from 'zod';
import {
  dayRange,
  dedupeEvents,
  isOnDay,
  normalizeEvent,
  sortEvents,
  type CalendarEvent,
} from '@/core/calendar/events';
import { classifyMail, sortMails, type Mail } from '@/core/mail/classify';
import { CALENDAR_API, GMAIL_API, googleGet } from './api';

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

const eventsSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        status: z.string().optional(),
        summary: z.string().optional(),
        location: z.string().optional(),
        htmlLink: z.string().optional(),
        start: eventTimeSchema.optional(),
        end: eventTimeSchema.optional(),
        attendees: z
          .array(z.object({ self: z.boolean().optional(), responseStatus: z.string().optional() }))
          .optional(),
      }),
    )
    .default([]),
});

/** Today's events of every calendar that is shown in Google Calendar. */
export async function fetchTodayEvents(
  now: Date,
  untitled: string,
  signal?: AbortSignal,
): Promise<CalendarEvent[]> {
  const list = await googleGet(
    `${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&fields=items(id,primary,selected)`,
    calendarListSchema,
    signal,
  );
  const calendars = list.items.filter((calendar) => calendar.primary || calendar.selected);
  const { start, end } = dayRange(now);
  const query = new URLSearchParams({
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '100',
    fields: 'items(id,status,summary,location,htmlLink,start,end,attendees(self,responseStatus))',
  });
  const perCalendar = await Promise.all(
    calendars.map(async (calendar) => {
      const response = await googleGet(
        `${CALENDAR_API}/calendars/${encodeURIComponent(calendar.id)}/events?${query.toString()}`,
        eventsSchema,
        signal,
      );
      return response.items
        .map((raw) => normalizeEvent(raw, calendar.id, untitled))
        .filter((event): event is CalendarEvent => event !== null && isOnDay(event, now));
    }),
  );
  return dedupeEvents(sortEvents(perCalendar.flat()));
}

const messageListSchema = z.object({
  messages: z.array(z.object({ id: z.string() })).default([]),
});

const messageSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  labelIds: z.array(z.string()).default([]),
  snippet: z.string().default(''),
  internalDate: z.string().optional(),
  payload: z
    .object({
      headers: z.array(z.object({ name: z.string(), value: z.string() })).default([]),
    })
    .default({ headers: [] }),
});

/** Unread inbox mails of the last 24 hours (at most this many). */
export const MAX_MAILS = 30;
/** Parallel Gmail requests (well below Gmail's per-user rate limit). */
const CONCURRENCY = 6;

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function fetchUnreadMails(signal?: AbortSignal): Promise<Mail[]> {
  const listQuery = new URLSearchParams({
    q: 'in:inbox is:unread newer_than:1d',
    maxResults: String(MAX_MAILS),
    fields: 'messages(id)',
  });
  const list = await googleGet(
    `${GMAIL_API}/users/me/messages?${listQuery.toString()}`,
    messageListSchema,
    signal,
  );
  const metadata = new URLSearchParams({
    format: 'metadata',
    fields: 'id,threadId,labelIds,snippet,internalDate,payload/headers',
  });
  for (const header of ['From', 'Subject', 'List-Unsubscribe', 'Precedence']) {
    metadata.append('metadataHeaders', header);
  }
  const messages = await mapLimited(list.messages, CONCURRENCY, (message) =>
    googleGet(
      `${GMAIL_API}/users/me/messages/${message.id}?${metadata.toString()}`,
      messageSchema,
      signal,
    ),
  );
  return sortMails(
    messages.map((message) => {
      const header = (name: string) =>
        message.payload.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
      return classifyMail({
        id: message.id,
        threadId: message.threadId,
        from: header('From') ?? '',
        subject: header('Subject') ?? '',
        snippet: message.snippet,
        receivedAt: Number(message.internalDate ?? 0),
        labelIds: message.labelIds,
        listUnsubscribe: header('List-Unsubscribe') !== undefined,
        precedence: header('Precedence'),
      });
    }),
  );
}

/** Opens the mail's conversation in Gmail (web or app). */
export function gmailThreadUrl(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}`;
}
