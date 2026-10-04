/**
 * Suggestions for the review sections from real data only (tasks, events, daily reviews).
 * They are offered, never written on their own; open tasks appear under "Besser machen"
 * and are not postponed.
 */
import type { DayFacts, WeekFacts } from '@/core/reviews/reviews';
import { formatTime } from '@/features/today/overviewText';
import { de } from '@/i18n/de';
import { LIMITS, type Review, type Task } from '@/data/schemas';

const s = de.reviews.suggest;

/** From this many timed events on, a day counts as full. */
const BUSY_DAY = 6;
const MAX_SUGGESTIONS = 3;

export interface DaySuggestions {
  wentWell: string[];
  notWell: string[];
  improve: string[];
}

export function daySuggestions(facts: DayFacts<Task>): DaySuggestions {
  const wentWell = facts.done.slice(0, MAX_SUGGESTIONS).map((task) => s.done(task.title));
  if (facts.done.length > MAX_SUGGESTIONS) wentWell.push(s.doneMany(facts.done.length));

  const notWell = [
    ...facts.tight
      .slice(0, 2)
      .map((spot) =>
        spot.gapMinutes < 0
          ? s.overlap(spot.before.title, spot.after.title)
          : s.tight(spot.before.title, spot.after.title, spot.gapMinutes),
      ),
    ...facts.open
      .filter((open) => open.overdueDays > 0)
      .slice(0, 2)
      .map((open) => s.overdue(open.task.title, open.overdueDays)),
  ];
  const timed = facts.events?.filter((event) => !event.allDay).length ?? 0;
  if (timed >= BUSY_DAY) notWell.push(s.busy(timed));

  const improve = facts.open.slice(0, MAX_SUGGESTIONS).map((open) => s.open(open.task.title));
  return { wentWell, notWell, improve };
}

export interface WeekSuggestions {
  patterns: string[];
  brakes: string[];
  changes: string[];
}

export function weekSuggestions(facts: WeekFacts<Task, Review>): WeekSuggestions {
  const patterns = facts.recurring.wentWell.map((r) => s.recurringGood(r.word, r.days));
  if (facts.daily.length < 4) patterns.push(s.fewReviews(facts.daily.length));
  if (facts.done.length > 0) patterns.push(s.doneWeek(facts.done.length));

  const brakes = facts.recurring.notWell.map((r) => s.recurringBad(r.word, r.days));
  const overdue = facts.open.filter((open) => open.overdueDays > 0);
  if (overdue.length > 0) brakes.push(s.overdueCount(overdue.length));

  // Changes: "Besser machen" points of the week, recurring themes first, newest first.
  const recurring = facts.recurring.improve.map((r) => r.word.toLocaleLowerCase('de'));
  const improve = [...facts.daily]
    .reverse()
    .flatMap((review) => review.improve)
    .filter((point) => !point.startsWith(s.open('')));
  const ranked = [
    ...improve.filter((point) =>
      recurring.some((word) => point.toLocaleLowerCase('de').includes(word)),
    ),
    ...improve,
  ];
  return {
    patterns: patterns.slice(0, 4),
    brakes: brakes.slice(0, 4),
    changes: [...new Set(ranked)].slice(0, 5),
  };
}

/** "08:00–09:30" or "ganztägig". */
export function eventTime(event: { start: string; end: string; allDay: boolean }): string {
  return event.allDay
    ? de.reviews.day.allDay
    : `${formatTime(event.start)}–${formatTime(event.end)}`;
}

/** Adds a point unless it is empty or already there. */
export function addPoint(points: readonly string[], point: string): string[] {
  const text = point.trim().slice(0, LIMITS.item);
  return text && !points.includes(text) ? [...points, text] : [...points];
}
