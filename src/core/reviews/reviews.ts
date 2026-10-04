/**
 * Daily and weekly reviews: which week a review belongs to, the facts of a day (tasks and
 * events) and of a week (daily reviews, tasks), recurring themes and the review streak.
 * Pure logic on calendar dates ("JJJJ-MM-TT", local time). Reviews only use real data;
 * open tasks are never postponed, only listed under "Besser machen".
 */
import { tightSpots, type CalendarEvent, type TightSpot } from '../calendar/events';
import { addDays, daysBetween, localIsoDate, weekday } from '../dates';
import { PRIORITY_RANK, type TaskInfo } from '../tasks/tasks';

export type ReviewTask = TaskInfo;

/** The fields of a stored review the logic reads. */
export interface ReviewInfo {
  kind: 'daily' | 'weekly';
  date: string;
  wentWell: string[];
  notWell: string[];
  improve: string[];
  note?: string;
  doneAt?: string;
}

/** The Sunday whose week a weekly review covers: today on a Sunday, else the last one. */
export function reviewWeek(today: string): string {
  const day = weekday(today);
  return day === 6 ? today : addDays(today, -(day + 1));
}

/** The Sunday ending the (Monday to Sunday) week of `date`. */
export function weekEnd(date: string): string {
  return addDays(date, 6 - weekday(date));
}

/** Monday to Sunday of the week ending on `sunday`. */
export function weekDays(sunday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(sunday, index - 6));
}

/** The three changes are due on the Monday after the week – never in the past. */
export function changesDueDate(sunday: string, today: string): string {
  const monday = addDays(sunday, 1);
  return monday >= today ? monday : today;
}

/** Local calendar date of a UTC timestamp. */
export function localDayOf(timestamp: string): string {
  return localIsoDate(new Date(timestamp));
}

export interface OpenTask<T extends ReviewTask = ReviewTask> {
  task: T;
  /** Days overdue at the reviewed day (0 = due that day). */
  overdueDays: number;
}

export interface DayFacts<T extends ReviewTask = ReviewTask> {
  date: string;
  /** Completed on that day, important first. */
  done: T[];
  /** Still open and due on or before that day, most overdue first. */
  open: OpenTask<T>[];
  /** Null: the calendar is not available. */
  events: CalendarEvent[] | null;
  tight: TightSpot[];
}

function byPriority<T extends ReviewTask>(a: T, b: T): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title, 'de')
  );
}

export function dayFacts<T extends ReviewTask>(
  date: string,
  tasks: readonly T[],
  events: readonly CalendarEvent[] | null,
): DayFacts<T> {
  const done = tasks
    .filter(
      (task) => task.status === 'done' && task.completedAt && localDayOf(task.completedAt) === date,
    )
    .sort(byPriority);
  const open = tasks
    .filter((task) => task.status === 'open' && task.dueDate !== undefined && task.dueDate <= date)
    .map((task) => ({ task, overdueDays: daysBetween(task.dueDate ?? date, date) }))
    .sort((a, b) => b.overdueDays - a.overdueDays || byPriority(a.task, b.task));
  return {
    date,
    done,
    open,
    events: events ? [...events] : null,
    tight: events ? tightSpots(events) : [],
  };
}

export type ReviewSection = 'wentWell' | 'notWell' | 'improve';

export interface WeekFacts<T extends ReviewTask = ReviewTask, R extends ReviewInfo = ReviewInfo> {
  sunday: string;
  days: string[];
  /** Daily reviews of the week, Monday first. */
  daily: R[];
  /** Completed during the week. */
  done: T[];
  /** Open tasks that were due by the end of the week, most overdue first. */
  open: OpenTask<T>[];
  /** Words that come up on two or more days, per section. */
  recurring: Record<ReviewSection, Recurring[]>;
}

export interface Recurring {
  word: string;
  /** Number of days it came up. */
  days: number;
}

/** Words that say nothing about the day on their own (only words of five letters or more). */
const STOP_WORDS = new Set([
  'nicht',
  'heute',
  'wieder',
  'etwas',
  'immer',
  'schon',
  'durch',
  'zwischen',
  'gegen',
  'unter',
  'wurde',
  'wurden',
  'werden',
  'hatte',
  'hatten',
  'haben',
  'gemacht',
  'machen',
  'besser',
  'konnte',
  'konnten',
  'viele',
  'vielen',
  'wenig',
  'weniger',
  'später',
  'morgen',
  'gestern',
  'meine',
  'meinen',
  'meinem',
  'meiner',
  'einen',
  'einem',
  'einer',
  'eines',
  'diese',
  'diesen',
  'dieser',
  'dieses',
  'endlich',
  'richtig',
  'wirklich',
  'trotzdem',
  'claude',
]);

/** A rough stem, so "Meeting" and "Meetings" count as one. */
function stem(word: string): string {
  const stripped = word.replace(/(en|er|es|e|n|s)$/u, '');
  return stripped.length >= 5 ? stripped : word;
}

/** Words of a section that come up on at least two days, most frequent first (at most 3). */
export function recurringWords(
  reviews: readonly ReviewInfo[],
  section: ReviewSection,
  limit = 3,
): Recurring[] {
  const days = new Map<string, Set<string>>();
  const forms = new Map<string, Map<string, number>>();
  for (const review of reviews) {
    for (const point of review[section]) {
      for (const match of point.matchAll(/[\p{L}]{5,}/gu)) {
        const word = match[0];
        const lower = word.toLocaleLowerCase('de');
        if (STOP_WORDS.has(lower)) continue;
        const key = stem(lower);
        const seen = days.get(key) ?? new Set<string>();
        seen.add(review.date);
        days.set(key, seen);
        const counts = forms.get(key) ?? new Map<string, number>();
        counts.set(word, (counts.get(word) ?? 0) + 1);
        forms.set(key, counts);
      }
    }
  }
  return [...days.entries()]
    .filter(([, dates]) => dates.size >= 2)
    .map(([key, dates]) => {
      const counts = [...(forms.get(key) ?? new Map<string, number>()).entries()];
      counts.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'));
      return { word: counts[0]?.[0] ?? key, days: dates.size };
    })
    .sort((a, b) => b.days - a.days || a.word.localeCompare(b.word, 'de'))
    .slice(0, limit);
}

export function weekFacts<T extends ReviewTask, R extends ReviewInfo>(
  sunday: string,
  tasks: readonly T[],
  reviews: readonly R[],
): WeekFacts<T, R> {
  const days = weekDays(sunday);
  const first = days[0] ?? sunday;
  const daily = reviews
    .filter((review) => review.kind === 'daily' && review.date >= first && review.date <= sunday)
    .sort((a, b) => a.date.localeCompare(b.date));
  const done = tasks
    .filter((task) => {
      if (task.status !== 'done' || !task.completedAt) return false;
      const day = localDayOf(task.completedAt);
      return day >= first && day <= sunday;
    })
    .sort(byPriority);
  const open = dayFacts(sunday, tasks, null).open;
  return {
    sunday,
    days,
    daily,
    done,
    open,
    recurring: {
      wentWell: recurringWords(daily, 'wentWell'),
      notWell: recurringWords(daily, 'notWell'),
      improve: recurringWords(daily, 'improve'),
    },
  };
}

/** Days in a row with a finished daily review, up to today (or yesterday, if today is open). */
export function reviewStreak(reviews: readonly ReviewInfo[], today: string): number {
  const done = new Set(
    reviews
      .filter((review) => review.kind === 'daily' && review.doneAt)
      .map((review) => review.date),
  );
  let day = done.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (done.has(day)) {
    count += 1;
    day = addDays(day, -1);
  }
  return count;
}
