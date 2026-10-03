import { cn } from '@/components/ui';
import { useDueCount } from '@/features/tasks/useTasks';
import { de } from '@/i18n/de';

const count = (to: string, due: number) => (to === '/tasks' ? due : 0);

/** Due tasks on the "Aufgaben" navigation item (hidden at zero; visual only). */
export function NavBadge({ to, className }: { to: string; className?: string }) {
  const due = count(to, useDueCount());
  if (due === 0) return null;
  return (
    <span
      aria-hidden
      className={cn(
        'flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-xs font-bold text-on-signal tabular-nums',
        className,
      )}
      data-testid="nav-due-badge"
    >
      {due > 99 ? '99+' : due}
    </span>
  );
}

/** The same count for screen readers, placed after the label ("Aufgaben, 3 fällig"). */
export function NavBadgeText({ to }: { to: string }) {
  const due = count(to, useDueCount());
  if (due === 0) return null;
  return <span className="sr-only">, {de.tasks.dueCount(due)}</span>;
}
