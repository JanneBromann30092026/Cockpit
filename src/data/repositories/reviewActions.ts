/**
 * Daily and weekly reviews: one review per kind and date, saved as a draft while writing
 * and finished explicitly. Finishing a weekly review turns its three changes into tasks
 * (in the same transaction); finishing again updates those tasks instead of adding more.
 */
import { withoutAiMark } from '@/core/aiMark';
import { nextTimestamp } from '@/core/time';
import type { ReviewKind } from '../domain';
import type { Review, Task } from '../schemas';
import { useDataStore } from '../store';
import { reviewsRepo } from './records';
import { validateRecord } from './recordsRepo';
import { commit } from './rows';

/** The fields of a review the editors write. */
export type ReviewDraft = Partial<
  Pick<Review, 'wentWell' | 'notWell' | 'improve' | 'note' | 'patterns' | 'brakes' | 'changes'>
>;

export interface ChangeTasks {
  /** "JJJJ-MM-TT" – the Monday after the week (or today, if that is later). */
  dueDate: string;
  /** Note on every task, e.g. "Aus dem Wochen-Review vom 04.10.2026". */
  notes: string;
}

function find(kind: ReviewKind, date: string): Review | undefined {
  return Object.values(useDataStore.getState().reviews).find(
    (review) => review.kind === kind && review.date === date,
  );
}

async function upsert(
  kind: ReviewKind,
  date: string,
  fields: ReviewDraft & Pick<Partial<Review>, 'doneAt' | 'changeTaskIds'>,
): Promise<Review> {
  const current = find(kind, date);
  if (!current) return reviewsRepo.create({ kind, date, ...fields });
  return reviewsRepo.update(current.id, fields);
}

export const reviewActions = {
  find,

  /** Saves what was written so far (creates the review on first save). */
  saveDraft(kind: ReviewKind, date: string, fields: ReviewDraft): Promise<Review> {
    return upsert(kind, date, fields);
  },

  /** Finishes a daily review. */
  finishDay(date: string, fields: ReviewDraft, now: Date = new Date()): Promise<Review> {
    return upsert('daily', date, { ...fields, doneAt: now.toISOString() });
  },

  /**
   * Finishes a weekly review: each of the three changes becomes a task (or updates the task
   * it created before). Review and tasks are written together.
   */
  async finishWeek(
    sunday: string,
    fields: ReviewDraft & { changes: string[] },
    tasks: ChangeTasks,
    now: Date = new Date(),
  ): Promise<{ review: Review; tasks: Task[] }> {
    const draft = await upsert('weekly', sunday, fields);
    const records = useDataStore.getState().tasks;
    const written: Task[] = fields.changes.map((change, index) => {
      // The review keeps Claude's mark; the task title is the plain change.
      const title = withoutAiMark(change);
      const previous = records[draft.changeTaskIds[index] ?? ''];
      const stamp = nextTimestamp(previous?.updatedAt);
      if (previous) return validateRecord('tasks', { ...previous, title, updatedAt: stamp });
      return validateRecord('tasks', {
        id: crypto.randomUUID(),
        createdAt: stamp,
        updatedAt: stamp,
        demo: draft.demo,
        title,
        status: 'open',
        priority: 'medium',
        dueDate: tasks.dueDate,
        notes: tasks.notes,
      });
    });
    const review = validateRecord('reviews', {
      ...draft,
      changeTaskIds: written.map((task) => task.id),
      doneAt: now.toISOString(),
      updatedAt: nextTimestamp(draft.updatedAt),
    });
    await commit([
      ...written.map((record) => ({ table: 'tasks' as const, record })),
      { table: 'reviews', record: review },
    ]);
    return { review, tasks: written };
  },

  remove(id: string): Promise<void> {
    return reviewsRepo.remove(id);
  },
};
