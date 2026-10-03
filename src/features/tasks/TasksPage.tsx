import { useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { ChevronDown, Plus } from 'lucide-react';
import { Button, cn, EmptyState } from '@/components/ui';
import { useHotkeys } from '@/app/hooks/useHotkeys';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { Page } from '@/app/shell/Page';
import {
  compareDoneTasks,
  compareOpenTasks,
  isDue,
  TASK_BUCKETS,
  taskBucket,
  type TaskBucket,
} from '@/core/tasks/tasks';
import type { Task } from '@/data/schemas';
import { de } from '@/i18n/de';
import { QuickAdd } from './QuickAdd';
import { TaskEditor } from './TaskEditor';
import { TaskRow } from './TaskRow';
import { useTasks } from './useTasks';

const t = de.tasks;
const DONE_LIMIT = 50;

const BUCKET_TONES: Record<TaskBucket, string> = {
  overdue: 'text-warning',
  today: 'text-signal-fg',
  tomorrow: 'text-fg',
  week: 'text-fg',
  later: 'text-fg-secondary',
  someday: 'text-fg-secondary',
};

function TaskList({ tasks, today }: { tasks: Task[]; today: string }) {
  return (
    <ul className="flex flex-col gap-2">
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} today={today} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

/** All tasks by due date: overdue, today, tomorrow, next 7 days, later, without date. */
export function TasksPage() {
  const today = useLocalDate();
  const tasks = useTasks();
  const quickInput = useRef<HTMLInputElement>(null);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const open = useMemo(
    () => tasks.filter((task) => task.status === 'open').sort(compareOpenTasks),
    [tasks],
  );
  const done = useMemo(
    () => tasks.filter((task) => task.status === 'done').sort(compareDoneTasks),
    [tasks],
  );
  const groups = TASK_BUCKETS.map((bucket) => ({
    bucket,
    items: open.filter((task) => taskBucket(task.dueDate, today) === bucket),
  })).filter((group) => group.items.length > 0);
  const dueCount = open.filter((task) => isDue(task, today)).length;

  useHotkeys([
    {
      combo: 'n',
      handler: () => {
        if (document.querySelector('[aria-modal="true"]')) return;
        quickInput.current?.focus();
      },
    },
  ]);

  return (
    <Page
      title={t.title}
      actions={
        <Button
          size="sm"
          icon={Plus}
          onClick={() => setAdding(true)}
          aria-label={t.add}
          data-testid="tasks-add"
        >
          <span className="hidden sm:inline">{t.add}</span>
        </Button>
      }
    >
      <div className="flex flex-col gap-6" data-testid="tasks-page">
        <p className="-mt-1 px-1 text-base text-fg-secondary" data-testid="tasks-summary">
          {t.count(open.length)}
          {dueCount > 0 && (
            <span className="font-semibold text-warning"> · {t.dueCount(dueCount)}</span>
          )}
        </p>

        <QuickAdd today={today} inputRef={quickInput} />

        {open.length === 0 ? (
          <EmptyState
            className="py-6"
            title={done.length > 0 ? t.allDone : t.empty}
            text={done.length > 0 ? t.allDoneText : t.emptyText}
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(({ bucket, items }) => (
              <section
                key={bucket}
                className="flex flex-col gap-2.5"
                data-testid={`bucket-${bucket}`}
              >
                <h2 className={cn('px-1 text-base font-semibold', BUCKET_TONES[bucket])}>
                  {t.buckets[bucket]}{' '}
                  <span className="font-normal text-fg-muted">({items.length})</span>
                </h2>
                <TaskList tasks={items} today={today} />
              </section>
            ))}
            <p className="px-1 text-sm text-fg-muted">{t.swipeHint}</p>
          </div>
        )}

        {done.length > 0 && (
          <section className="flex flex-col gap-2.5" data-testid="tasks-done">
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showDone}
              onClick={() => setShowDone(!showDone)}
              className="self-start"
              data-testid="tasks-show-done"
            >
              {showDone ? t.hideDone : t.showDone(done.length)}
              <ChevronDown
                size={16}
                aria-hidden
                className={cn('transition-transform', showDone && 'rotate-180')}
              />
            </Button>
            {showDone && <TaskList tasks={done.slice(0, DONE_LIMIT)} today={today} />}
          </section>
        )}
      </div>

      {adding && <TaskEditor today={today} onClose={() => setAdding(false)} />}
    </Page>
  );
}
