import { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'motion/react';
import {
  CalendarArrowUp,
  CalendarDays,
  Check,
  CircleCheck,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ActionMenuButton, Badge, cn, toast, type ActionMenuItem } from '@/components/ui';
import { localIsoDate } from '@/core/dates';
import { postponedDate, taskBucket, type PostponeStep } from '@/core/tasks/tasks';
import { taskActions } from '@/data/repositories';
import type { Task } from '@/data/schemas';
import { de } from '@/i18n/de';
import { easeOut, spring } from '@/styles/motion';
import { useReducedMotion } from '@/styles/useReducedMotion';
import { DateDialog } from './DateDialog';
import { TaskEditor } from './TaskEditor';
import { dueLabel, formatShortDate } from './useTasks';

const t = de.tasks;
/** Pointer distance that completes a task when swiping right. */
const SWIPE_DISTANCE = 120;
/** The success light plays before the task leaves the list. */
const CELEBRATE_MS = 450;

const DUE_TONES = {
  overdue: 'text-warning',
  today: 'text-signal-fg',
  tomorrow: 'text-fg',
  week: 'text-fg',
  later: 'text-fg-secondary',
  someday: 'text-fg-secondary',
} as const;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Dialog = 'date' | 'edit';

/**
 * One task: complete by the round button or by swiping right (with a short success
 * light), more actions in the "⋯" menu. Deleting and completing can be undone.
 */
export function TaskRow({
  task,
  today,
  compact = false,
}: {
  task: Task;
  today: string;
  /** In "Heute": without notes. */
  compact?: boolean;
}) {
  const reduced = useReducedMotion();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const x = useMotionValue(0);
  const reveal = useTransform(x, [0, SWIPE_DISTANCE / 2], [0, 1]);
  const done = task.status === 'done';
  const bucket = taskBucket(task.dueDate, today);

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      toast.error(t.saveFailed);
    }
  };

  const complete = async () => {
    setCelebrating(true);
    if (!reduced) await wait(CELEBRATE_MS);
    try {
      await taskActions.complete(task.id);
      toast.success(t.toastDone(task.title), {
        label: t.undo,
        onSelect: () => void run(async () => void (await taskActions.reopen(task.id))),
      });
    } catch {
      setCelebrating(false);
      toast.error(t.saveFailed);
    }
  };

  const reopen = () =>
    run(async () => {
      await taskActions.reopen(task.id);
      toast.success(t.toastReopened(task.title));
    });

  const postpone = (date: string) =>
    run(async () => {
      setDialog(null);
      await taskActions.postpone(task.id, date);
      toast.success(t.toastPostponed(formatShortDate(date)));
    });

  const remove = () =>
    run(async () => {
      const removed = await taskActions.remove(task.id);
      toast.success(t.toastDeleted(task.title), {
        label: t.undo,
        onSelect: () => void run(async () => void (await taskActions.restore(removed))),
      });
    });

  const step = (by: PostponeStep, label: string): ActionMenuItem => ({
    id: `postpone-${by}`,
    label,
    icon: CalendarArrowUp,
    onSelect: () => void postpone(postponedDate(task.dueDate, by, today)),
  });

  const items: ActionMenuItem[] = done
    ? [{ id: 'reopen', label: t.reopen, icon: RotateCcw, onSelect: () => void reopen() }]
    : [
        step('tomorrow', t.postponeTomorrow),
        step('week', t.postponeWeek),
        {
          id: 'postpone-date',
          label: t.postponeDate,
          icon: CalendarDays,
          onSelect: () => setDialog('date'),
        },
        { id: 'edit', label: t.edit, icon: Pencil, onSelect: () => setDialog('edit') },
      ];
  items.push({
    id: 'delete',
    label: t.remove,
    icon: Trash2,
    danger: true,
    onSelect: () => void remove(),
  });

  const priorityBadge =
    task.priority === 'high' ? (
      <Badge tone="signal">{t.priorityBadge.high}</Badge>
    ) : task.priority === 'low' ? (
      <Badge>{t.priorityBadge.low}</Badge>
    ) : null;

  return (
    <motion.li
      layout={reduced ? false : 'position'}
      initial={{ opacity: 0, y: reduced ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.25, ease: easeOut }}
      className="relative"
      data-testid="task-row"
      data-task-id={task.id}
      data-done={done}
      data-bucket={bucket}
    >
      <div className="relative overflow-hidden rounded-xl">
        {!done && (
          <motion.div
            aria-hidden
            style={{ opacity: reveal }}
            className="absolute inset-0 flex items-center gap-2 bg-success-soft pl-5 text-base font-semibold text-success"
          >
            <CircleCheck size={22} />
            {t.complete}
          </motion.div>
        )}
        <motion.div
          drag={done || celebrating ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0, right: 0.6 }}
          dragDirectionLock
          onDragEnd={(_event, info) => {
            if (info.offset.x > SWIPE_DISTANCE) void complete();
          }}
          style={{ x, touchAction: 'pan-y' }}
          className={cn(
            'relative flex items-start gap-2 rounded-xl border border-line bg-surface-sunken py-1.5 pr-1.5 pl-1.5',
            done && 'opacity-80',
          )}
        >
          {celebrating && (
            <motion.div
              aria-hidden
              className="success-glow pointer-events-none absolute inset-0 rounded-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.8] }}
              transition={{ duration: CELEBRATE_MS / 1000, times: [0, 0.4, 1] }}
            />
          )}
          <button
            type="button"
            aria-label={done ? t.reopenLabel(task.title) : t.completeLabel(task.title)}
            onClick={() => void (done ? reopen() : complete())}
            disabled={celebrating}
            className="focus-ring no-callout relative flex size-11 shrink-0 items-center justify-center rounded-full"
            data-testid="task-complete"
          >
            <motion.span
              animate={celebrating ? { scale: [1, 1.25, 1] } : { scale: 1 }}
              transition={spring.snappy}
              className={cn(
                'flex size-7 items-center justify-center rounded-full border-2 transition-colors',
                celebrating || done
                  ? 'border-success bg-success text-on-success'
                  : task.priority === 'high'
                    ? 'border-signal text-transparent'
                    : 'border-fg-muted text-transparent',
              )}
            >
              <Check size={16} strokeWidth={3} aria-hidden />
            </motion.span>
          </button>
          <div className="flex min-w-0 flex-1 flex-col gap-1 py-2">
            <p
              className={cn(
                'text-base font-medium break-words text-fg',
                done && 'text-fg-secondary line-through decoration-fg-muted',
              )}
              data-testid="task-title"
            >
              {task.title}
            </p>
            {(done || task.dueDate || priorityBadge) && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {done ? (
                  <span className="text-sm font-medium text-success">
                    {t.doneOn(
                      formatShortDate(localIsoDate(new Date(task.completedAt ?? task.updatedAt))),
                    )}
                  </span>
                ) : (
                  task.dueDate && (
                    <>
                      <span
                        className={cn('text-sm font-semibold', DUE_TONES[bucket])}
                        data-testid="task-due"
                      >
                        {dueLabel(task.dueDate, today)}
                      </span>
                      <span className="text-sm text-fg-muted tabular-nums">
                        {formatShortDate(task.dueDate)}
                      </span>
                    </>
                  )
                )}
                {!done && priorityBadge}
              </div>
            )}
            {!compact && !done && task.notes && (
              <p className="line-clamp-2 text-sm whitespace-pre-line text-fg-secondary">
                {task.notes}
              </p>
            )}
          </div>
          <ActionMenuButton items={items} label={t.actions(task.title)} testId="task-menu" />
        </motion.div>
      </div>

      {dialog === 'date' && (
        <DateDialog
          initial={postponedDate(task.dueDate, 'week', today)}
          onClose={() => setDialog(null)}
          onConfirm={(date) => void postpone(date)}
        />
      )}
      {dialog === 'edit' && (
        <TaskEditor task={task} today={today} onClose={() => setDialog(null)} />
      )}
    </motion.li>
  );
}
