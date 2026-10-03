/**
 * The day in three statements without AI: what matters most, where time gets tight, what
 * waits in the inbox. Returns facts; the feature turns them into German sentences.
 */
import {
  eventTiming,
  sortEvents,
  tightSpots,
  type CalendarEvent,
  type TightSpot,
} from '../calendar/events';
import type { Mail } from '../mail/classify';

export type Focus =
  | { kind: 'mail'; mail: Mail }
  | { kind: 'event'; event: CalendarEvent; now: boolean }
  | { kind: 'none' };

export interface ScheduleFacts {
  /** Timed events of the day (all-day events are listed separately). */
  count: number;
  allDay: number;
  /** Timed events still ahead or running. */
  remaining: number;
  firstStart?: string;
  lastEnd?: string;
  tight: TightSpot[];
}

export interface MailFacts {
  total: number;
  important: number;
  people: number;
  bulk: number;
}

export interface OverviewFacts {
  focus: Focus;
  /** null when the calendar is not available (not connected, error). */
  schedule: ScheduleFacts | null;
  /** null when Gmail is not available. */
  mails: MailFacts | null;
}

export interface OverviewInput {
  now: Date;
  events: readonly CalendarEvent[] | null;
  mails: readonly Mail[] | null;
}

function pickFocus(now: Date, events: readonly CalendarEvent[], mails: readonly Mail[]): Focus {
  const urgent = mails
    .filter((mail) => mail.rank === 0)
    .sort((a, b) => Number(b.deadline) - Number(a.deadline) || b.receivedAt - a.receivedAt);
  if (urgent[0]) return { kind: 'mail', mail: urgent[0] };
  const next = events.find((event) => !event.allDay && eventTiming(event, now) !== 'past');
  if (next) return { kind: 'event', event: next, now: eventTiming(next, now) === 'now' };
  const person = mails.find((mail) => mail.category === 'person');
  if (person) return { kind: 'mail', mail: person };
  return { kind: 'none' };
}

export function overviewFacts({ now, events, mails }: OverviewInput): OverviewFacts {
  const sorted = events ? sortEvents(events) : null;
  const timed = (sorted ?? []).filter((event) => !event.allDay);
  const schedule: ScheduleFacts | null = sorted
    ? {
        count: timed.length,
        allDay: sorted.length - timed.length,
        remaining: timed.filter((event) => eventTiming(event, now) !== 'past').length,
        firstStart: timed[0]?.start,
        lastEnd: timed.reduce<string | undefined>(
          (latest, event) =>
            !latest || Date.parse(event.end) > Date.parse(latest) ? event.end : latest,
          undefined,
        ),
        // Only spots still ahead: once the next event has begun, the gap no longer matters.
        tight: tightSpots(timed).filter((spot) => eventTiming(spot.after, now) === 'upcoming'),
      }
    : null;
  const mailFacts: MailFacts | null = mails
    ? {
        total: mails.length,
        important: mails.filter((mail) => mail.rank === 0).length,
        people: mails.filter((mail) => mail.category === 'person').length,
        bulk: mails.filter(
          (mail) => mail.category === 'newsletter' || mail.category === 'promotion',
        ).length,
      }
    : null;
  return { focus: pickFocus(now, sorted ?? [], mails ?? []), schedule, mails: mailFacts };
}
