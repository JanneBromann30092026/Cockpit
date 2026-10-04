import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { CalendarRange, NotebookPen } from 'lucide-react';
import { Button, Surface } from '@/components/ui';
import { weekday } from '@/core/dates';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { useReview } from './useReviews';

const t = de.today.reviewPrompt;

/** From this hour on, "Heute" reminds of the daily review (Sundays: the weekly one at 17). */
export const DAY_REVIEW_HOUR = 18;
export const WEEK_REVIEW_HOUR = 17;

function Prompt({
  title,
  text,
  started,
  to,
  icon: Icon,
  testId,
}: {
  title: string;
  text: string;
  started: boolean;
  to: string;
  icon: typeof NotebookPen;
  testId: string;
}) {
  const navigate = useNavigate();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid={testId}
    >
      <Surface className="flex flex-wrap items-center gap-4 border-signal/40 bg-signal-soft">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-signal text-on-signal">
          <Icon size={21} aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
          <p className="text-sm text-fg-secondary">{text}</p>
        </div>
        <Button onClick={() => void navigate(to)} data-testid={`${testId}-start`}>
          {started ? t.continue : t.start}
        </Button>
      </Surface>
    </motion.div>
  );
}

/** Evening reminders in "Heute" (the same as the push messages of step 8, but in the app). */
export function ReviewPromptCard({ now, today }: { now: Date; today: string }) {
  const daily = useReview('daily', today);
  const weekly = useReview('weekly', today);
  const hour = now.getHours();
  const sunday = weekday(today) === 6;
  const showWeek = sunday && hour >= WEEK_REVIEW_HOUR && !weekly?.doneAt;
  const showDay = hour >= DAY_REVIEW_HOUR && !daily?.doneAt;
  if (!showWeek && !showDay) return null;
  return (
    <div className="flex flex-col gap-4">
      {showDay && (
        <Prompt
          title={t.dayTitle}
          text={t.dayText}
          started={daily !== undefined}
          to={`/reviews/day/${today}`}
          icon={NotebookPen}
          testId="today-review-day"
        />
      )}
      {showWeek && (
        <Prompt
          title={t.weekTitle}
          text={t.weekText}
          started={weekly !== undefined}
          to={`/reviews/week/${today}`}
          icon={CalendarRange}
          testId="today-review-week"
        />
      )}
    </div>
  );
}
