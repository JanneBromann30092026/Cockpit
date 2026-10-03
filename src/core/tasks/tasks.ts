/**
 * Tasks by due date: groups, order, postponing and what counts as due. Pure logic on
 * calendar dates ("JJJJ-MM-TT", local time).
 */
import { addDays, daysBetween } from '../dates';

export type TaskPriority = 'high' | 'medium' | 'low';

/** The fields of a task the logic needs (the full record lives in src/data). */
export interface TaskInfo {
  title: string;
  status: 'open' | 'done';
  dueDate?: string;
  priority: TaskPriority;
  createdAt: string;
  completedAt?: string;
}

export const TASK_BUCKETS = ['overdue', 'today', 'tomorrow', 'week', 'later', 'someday'] as const;
export type TaskBucket = (typeof TASK_BUCKETS)[number];

/** Overdue, today, tomorrow, within 7 days, later – or without a date. */
export function taskBucket(dueDate: string | undefined, today: string): TaskBucket {
  if (!dueDate) return 'someday';
  const days = daysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return 'week';
  return 'later';
}

/** Open and due today or earlier. */
export function isDue(task: TaskInfo, today: string): boolean {
  return task.status === 'open' && task.dueDate !== undefined && task.dueDate <= today;
}

export function isOverdue(task: TaskInfo, today: string): boolean {
  return task.status === 'open' && task.dueDate !== undefined && task.dueDate < today;
}

export const PRIORITY_RANK: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Open tasks: earliest due date first (without date last), then priority, then oldest. */
export function compareOpenTasks(a: TaskInfo, b: TaskInfo): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  }
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt)
  );
}

/** Due tasks for "Heute": most important first, then the longest overdue. */
export function compareDueTasks(a: TaskInfo, b: TaskInfo): number {
  return (
    PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
    (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/** Completed tasks: most recently completed first. */
export function compareDoneTasks(a: TaskInfo, b: TaskInfo): number {
  return (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt);
}

export function dueTasks<T extends TaskInfo>(tasks: readonly T[], today: string): T[] {
  return tasks.filter((task) => isDue(task, today)).sort(compareDueTasks);
}

export type PostponeStep = 'tomorrow' | 'week';

/** Tomorrow – or a week later than the due date (from today if it is already overdue). */
export function postponedDate(
  dueDate: string | undefined,
  step: PostponeStep,
  today: string,
): string {
  if (step === 'tomorrow') return addDays(today, 1);
  const base = !dueDate || dueDate < today ? today : dueDate;
  return addDays(base, 7);
}
