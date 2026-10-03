import { useMemo } from 'react';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { daysBetween } from '@/core/dates';
import { isDue } from '@/core/tasks/tasks';
import type { Task } from '@/data/schemas';
import { useDataStore } from '@/data/store';
import { de } from '@/i18n/de';

const t = de.tasks;

/** All decrypted tasks (empty while locked). */
export function useTasks(): Task[] {
  const tasks = useDataStore((state) => state.tasks);
  return useMemo(() => Object.values(tasks), [tasks]);
}

/** Open tasks due today or earlier (badge on the navigation). */
export function useDueCount(): number {
  const today = useLocalDate();
  const tasks = useTasks();
  return useMemo(() => tasks.filter((task) => isDue(task, today)).length, [tasks, today]);
}

/** "heute", "morgen", "in 5 Tagen", "seit gestern", "seit 3 Tagen". */
export function dueLabel(dueDate: string, today: string): string {
  const days = daysBetween(today, dueDate);
  if (days === 0) return t.due.today;
  if (days === 1) return t.due.tomorrow;
  if (days === -1) return t.due.yesterday;
  return days > 0 ? t.due.inDays(days) : t.due.daysAgo(-days);
}

const SHORT_DATE = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  timeZone: 'UTC',
});

/** "2026-10-07" → "Mi., 07.10." */
export function formatShortDate(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split('-').map(Number);
  return SHORT_DATE.format(new Date(Date.UTC(y, m - 1, d)));
}
