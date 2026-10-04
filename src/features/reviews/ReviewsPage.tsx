import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { CalendarRange, Flame, NotebookPen, Sun } from 'lucide-react';
import { Badge, Button, EmptyState, Surface, type BadgeTone } from '@/components/ui';
import { useHotkeys } from '@/app/hooks/useHotkeys';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { Page } from '@/app/shell/Page';
import { addDays, weekday } from '@/core/dates';
import { formatShortDate } from '@/core/format';
import { reviewStreak, reviewWeek, weekEnd } from '@/core/reviews/reviews';
import type { Review } from '@/data/schemas';
import { de } from '@/i18n/de';
import { spring } from '@/styles/motion';
import { useReviews } from './useReviews';

const t = de.reviews;

type Status = 'open' | 'draft' | 'done';

function statusOf(review?: Review): Status {
  if (!review) return 'open';
  return review.doneAt ? 'done' : 'draft';
}

const STATUS_TONE: Record<Status, BadgeTone> = { open: 'signal', draft: 'accent', done: 'success' };

function StartCard({
  title,
  subtitle,
  status,
  hint,
  to,
  icon: Icon,
  testId,
}: {
  title: string;
  subtitle: string;
  status: Status;
  hint?: string;
  to: string;
  icon: typeof Sun;
  testId: string;
}) {
  const navigate = useNavigate();
  const action = status === 'open' ? t.start : status === 'draft' ? t.continue : t.view;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid={testId}
    >
      <Surface className="flex h-full flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Icon size={21} aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
            <span className="text-sm text-fg-secondary">{subtitle}</span>
          </div>
          <Badge tone={STATUS_TONE[status]}>
            <span data-testid="review-status">{t.status[status]}</span>
          </Badge>
        </div>
        {hint && <p className="text-sm text-fg-muted">{hint}</p>}
        <Button
          variant={status === 'done' ? 'secondary' : 'primary'}
          onClick={() => void navigate(to)}
          className="mt-auto self-start"
          data-testid={`${testId}-open`}
        >
          {action}
        </Button>
      </Surface>
    </motion.div>
  );
}

function HistoryRow({ review }: { review: Review }) {
  const weekly = review.kind === 'weekly';
  const status = statusOf(review);
  const to = weekly ? `/reviews/week/${review.date}` : `/reviews/day/${review.date}`;
  const first = weekly
    ? review.changes[0]
    : (review.wentWell[0] ?? review.notWell[0] ?? review.improve[0]);
  return (
    <li data-testid="review-row">
      <Link
        to={to}
        className="focus-ring flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors active:bg-accent-soft [@media(hover:hover)]:hover:bg-surface-sunken"
      >
        <span
          className={
            weekly
              ? 'flex size-9 shrink-0 items-center justify-center rounded-full bg-signal text-on-signal'
              : 'flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent'
          }
        >
          {weekly ? <CalendarRange size={17} aria-hidden /> : <NotebookPen size={17} aria-hidden />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-base font-medium text-fg">
            {weekly ? t.weekly : formatShortDate(review.date)}
          </span>
          <span className="truncate text-sm text-fg-secondary">
            {weekly
              ? t.changesCount(review.changes.length)
              : t.counts(review.wentWell.length, review.notWell.length, review.improve.length)}
            {first ? ` · ${first}` : ''}
          </span>
        </span>
        {status !== 'done' && <Badge tone={STATUS_TONE[status]}>{t.status[status]}</Badge>}
      </Link>
    </li>
  );
}

/** Reviews: today's daily review, this week's weekly review, the streak and the history. */
export function ReviewsPage() {
  const navigate = useNavigate();
  const today = useLocalDate();
  const reviews = useReviews();
  const sunday = reviewWeek(today);
  const todayReview = reviews.find((r) => r.kind === 'daily' && r.date === today);
  const weekReview = reviews.find((r) => r.kind === 'weekly' && r.date === sunday);
  const streak = reviewStreak(reviews, today);

  // Grouped by the week they belong to (newest first).
  const weeks = useMemo(() => {
    const groups = new Map<string, Review[]>();
    for (const review of reviews) {
      const week = weekEnd(review.date);
      const list = groups.get(week) ?? [];
      list.push(review);
      groups.set(week, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [reviews]);

  useHotkeys([
    { combo: 'n', handler: () => void navigate(`/reviews/day/${today}`) },
    { combo: 'w', handler: () => void navigate(`/reviews/week/${sunday}`) },
  ]);

  return (
    <Page title={t.title}>
      <div className="flex flex-col gap-6" data-testid="reviews-page">
        {streak > 0 && (
          <p className="-mt-1 flex items-center gap-2 px-1 text-base text-fg-secondary">
            <Flame size={18} aria-hidden className="text-signal-fg" />
            <span data-testid="reviews-streak">{t.streak(streak)}</span>
          </p>
        )}
        <div className="grid gap-4 wide:grid-cols-2">
          <StartCard
            title={t.daily}
            subtitle={`${t.today} · ${formatShortDate(today)}`}
            status={statusOf(todayReview)}
            to={`/reviews/day/${today}`}
            icon={Sun}
            testId="reviews-today"
          />
          <StartCard
            title={t.weekly}
            subtitle={t.weekRange(formatShortDate(addDays(sunday, -6)), formatShortDate(sunday))}
            status={statusOf(weekReview)}
            hint={weekday(today) === 6 ? undefined : t.weekHint}
            to={`/reviews/week/${sunday}`}
            icon={CalendarRange}
            testId="reviews-week"
          />
        </div>

        {reviews.length === 0 ? (
          <EmptyState title={t.empty} text={t.emptyText} />
        ) : (
          <section className="flex flex-col gap-3" data-testid="reviews-history">
            <h2 className="px-1 text-lg font-semibold tracking-tight text-fg">{t.history}</h2>
            {weeks.map(([week, list]) => (
              <Surface key={week} padding="sm" className="flex flex-col gap-1">
                <h3 className="px-3 pt-2 text-sm font-medium text-fg-secondary">
                  {t.weekRange(formatShortDate(addDays(week, -6)), formatShortDate(week))}
                </h3>
                <ul className="flex flex-col">
                  {list.map((review) => (
                    <HistoryRow key={review.id} review={review} />
                  ))}
                </ul>
              </Surface>
            ))}
          </section>
        )}
      </div>
    </Page>
  );
}
