/**
 * The day in three statements without AI: what matters most, where time gets tight, what
 * waits in the inbox and on the task list. Returns facts; the feature turns them into
 * German sentences.
 */
import {
  eventTiming,
  localDate,
  sortEvents,
  tightSpots,
  type CalendarEvent,
  type TightSpot,
} from '../calendar/events';
import { daysBetween } from '../dates';
import type { Mail } from '../mail/classify';
import { compareDueTasks, isDue, type TaskInfo } from '../tasks/tasks';

export type Focus<T extends TaskInfo = TaskInfo> =
  | { kind: 'task'; task: T; overdueDays: number }
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

export interface TaskFacts {
  /** Open tasks due today or earlier. */
  due: number;
  overdue: number;
}

export interface OverviewFacts<T extends TaskInfo = TaskInfo> {
  focus: Focus<T>;
  /** null when the calendar is not available (not connected, error). */
  schedule: ScheduleFacts | null;
  /** null when Gmail is not available. */
  mails: MailFacts | null;
  tasks: TaskFacts;
}

export interface OverviewInput<T extends TaskInfo = TaskInfo> {
  now: Date;
  events: readonly CalendarEvent[] | null;
  mails: readonly Mail[] | null;
  /** All tasks (only the open, due ones count). */
  tasks?: readonly T[];
}

/**
 * Most important first: an overdue high-priority task, a person waiting with a question or
 * deadline, a high-priority task due today, the running or next event, any other due task,
 * a mail from a person.
 */
function pickFocus<T extends TaskInfo>(
  now: Date,
  events: readonly CalendarEvent[],
  mails: readonly Mail[],
  due: readonly T[],
): Focus<T> {
  const today = localDate(now);
  const taskFocus = (task: T): Focus<T> => ({
    kind: 'task',
    task,
    overdueDays: Math.max(0, daysBetween(task.dueDate ?? today, today)),
  });
  const high = due.filter((task) => task.priority === 'high');
  const overdueHigh = high.find((task) => (task.dueDate ?? today) < today);
  if (overdueHigh) return taskFocus(overdueHigh);
  const urgent = mails
    .filter((mail) => mail.rank === 0)
    .sort((a, b) => Number(b.deadline) - Number(a.deadline) || b.receivedAt - a.receivedAt);
  if (urgent[0]) return { kind: 'mail', mail: urgent[0] };
  if (high[0]) return taskFocus(high[0]);
  const next = events.find((event) => !event.allDay && eventTiming(event, now) !== 'past');
  if (next) return { kind: 'event', event: next, now: eventTiming(next, now) === 'now' };
  if (due[0]) return taskFocus(due[0]);
  const person = mails.find((mail) => mail.category === 'person');
  if (person) return { kind: 'mail', mail: person };
  return { kind: 'none' };
}

export function overviewFacts<T extends TaskInfo>({
  now,
  events,
  mails,
  tasks = [],
}: OverviewInput<T>): OverviewFacts<T> {
  const today = localDate(now);
  const due = tasks.filter((task) => isDue(task, today)).sort(compareDueTasks);
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
  return {
    focus: pickFocus(now, sorted ?? [], mails ?? [], due),
    schedule,
    mails: mailFacts,
    tasks: {
      due: due.length,
      overdue: due.filter((task) => (task.dueDate ?? today) < today).length,
    },
  };
}
