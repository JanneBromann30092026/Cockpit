/**
 * What the optional Claude evaluation of a review contains: for a day the events (time and
 * title only), task titles with priority, the note and the current points; for a week the
 * daily reviews, the number of finished tasks and the open task titles.
 */
import type { DayFacts, OpenTask, WeekFacts } from '@/core/reviews/reviews';
import { formatLongDate, formatShortDate, formatDate } from '@/core/format';
import type { DayReviewRequest, ReviewTaskLine, WeekReviewRequest } from '@/data/prompts/reviews';
import type { Review, Task } from '@/data/schemas';
import { eventTime } from './reviewText';

const PRIORITY: Record<Task['priority'], ReviewTaskLine['prioritaet']> = {
  high: 'hoch',
  medium: 'mittel',
  low: 'niedrig',
};

function openLine(open: OpenTask<Task>): ReviewTaskLine {
  return {
    titel: open.task.title,
    prioritaet: PRIORITY[open.task.priority],
    ...(open.overdueDays > 0 ? { ueberfaellig_seit_tagen: open.overdueDays } : {}),
  };
}

export function dayReviewRequest(
  facts: DayFacts<Task>,
  note: string,
  current: DayReviewRequest['current'],
): DayReviewRequest {
  return {
    date: formatLongDate(facts.date),
    events: facts.events?.map((event) => ({ zeit: eventTime(event), titel: event.title })) ?? null,
    done: facts.done.map((task) => ({ titel: task.title, prioritaet: PRIORITY[task.priority] })),
    open: facts.open.map(openLine),
    note: note.trim() || undefined,
    current,
  };
}

export function weekReviewRequest(
  facts: WeekFacts<Task, Review>,
  current: WeekReviewRequest['current'],
): WeekReviewRequest {
  const first = facts.days[0] ?? facts.sunday;
  return {
    week: `${formatShortDate(first)} – ${formatShortDate(facts.sunday)} ${formatDate(facts.sunday).slice(-4)}`,
    days: facts.daily.map((review) => ({
      datum: formatShortDate(review.date),
      gut_gelaufen: review.wentWell,
      nicht_gut: review.notWell,
      besser_machen: review.improve,
      ...(review.note ? { notiz: review.note } : {}),
    })),
    doneCount: facts.done.length,
    open: facts.open.map(openLine),
    current,
  };
}
