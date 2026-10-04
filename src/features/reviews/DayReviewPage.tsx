import { useMemo, useRef, useState, useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  Lightbulb,
  Trash2,
  ThumbsUp,
} from 'lucide-react';
import {
  ActionMenuButton,
  Button,
  ConfirmDialog,
  IconButton,
  Spinner,
  Surface,
  Textarea,
  toast,
} from '@/components/ui';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { Page } from '@/app/shell/Page';
import { withAiMark } from '@/core/aiMark';
import { addDays } from '@/core/dates';
import { formatLongDate } from '@/core/format';
import { dayFacts, reviewStreak } from '@/core/reviews/reviews';
import { isoDate, LIMITS, type Review } from '@/data/schemas';
import { reviewActions } from '@/data/repositories';
import type { DayReviewPoints } from '@/data/prompts/reviews';
import { useDataStore } from '@/data/store';
import { useSettings } from '@/features/settings/settingsStore';
import { useTasks } from '@/features/tasks/useTasks';
import { de } from '@/i18n/de';
import { AiError, reviewDayWithAi } from '@/services/ai';
import { PointList } from './PointList';
import {
  AiCard,
  AutosaveStatus,
  Completed,
  ProposalSection,
  type ProposalState,
} from './ReviewParts';
import { dayReviewRequest } from './reviewAi';
import { useDayEvents, type DayEventsState } from './reviewEvents';
import { addPoint, daySuggestions, eventTime } from './reviewText';
import { useAutosave, useReviews } from './useReviews';

const t = de.reviews;

function FactList({ title, items, testId }: { title: string; items: string[]; testId: string }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <h3 className="text-sm font-medium text-fg-secondary">{title}</h3>
      {items.length === 0 ? (
        <p className="text-base text-fg-muted">{t.day.none}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-base text-fg">
          {items.map((item) => (
            <li key={item} className="break-words">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventFacts({ state }: { state: DayEventsState }) {
  if (state.status === 'notConnected') {
    return <p className="text-sm text-fg-muted">{t.day.notConnected}</p>;
  }
  if (state.status === 'loading') {
    return (
      <p className="flex items-center gap-2 text-sm text-fg-muted">
        <Spinner size={14} />
        {t.day.eventsLoading}
      </p>
    );
  }
  if (state.status === 'error') {
    return <p className="text-sm text-fg-muted">{t.day.eventsFailed}</p>;
  }
  return (
    <FactList
      title={`${t.day.events} · ${t.day.eventsCount(state.events.length)}`}
      items={state.events.map((event) => `${eventTime(event)}  ${event.title}`)}
      testId="review-day-events"
    />
  );
}

function DayEditor({ date, initial }: { date: string; initial?: Review }) {
  const navigate = useNavigate();
  const today = useLocalDate();
  const tasks = useTasks();
  const reviews = useReviews();
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);
  const events = useDayEvents(date);

  const [wentWell, setWentWell] = useState(initial?.wentWell ?? []);
  const [notWell, setNotWell] = useState(initial?.notWell ?? []);
  const [improve, setImprove] = useState(initial?.improve ?? []);
  const [note, setNote] = useState(initial?.note ?? '');
  const [dirty, setDirty] = useState(false);
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [proposal, setProposal] = useState<ProposalState<DayReviewPoints>>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const fields = useMemo(
    () => ({ wentWell, notWell, improve, note: note.trim() || undefined }),
    [wentWell, notWell, improve, note],
  );
  const { status, settle } = useAutosave('daily', date, fields, dirty);
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setDirty(true);
    };

  const facts = useMemo(
    () => dayFacts(date, tasks, events.status === 'ready' ? events.events : null),
    [date, tasks, events],
  );
  const suggestions = useMemo(() => daySuggestions(facts), [facts]);
  const record = reviews.find((review) => review.kind === 'daily' && review.date === date);

  const evaluate = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setProposal({ status: 'loading' });
    try {
      const result = await reviewDayWithAi(
        { enabled: aiEnabled, model: aiModel },
        dayReviewRequest(facts, note, { wentWell, notWell, improve }),
        { signal: current.signal },
      );
      if (current.signal.aborted) return;
      setProposal({ status: 'done', points: result });
    } catch (error: unknown) {
      if (current.signal.aborted) return;
      setProposal({ status: 'error', code: error instanceof AiError ? error.code : 'API_ERROR' });
    }
  };

  const accept = () => {
    if (proposal.status !== 'done') return;
    const merge = (points: string[], extra: string[]) =>
      extra.map(withAiMark).reduce(addPoint, points);
    change(setWentWell)(merge(wentWell, proposal.points.wentWell));
    change(setNotWell)(merge(notWell, proposal.points.notWell));
    change(setImprove)(merge(improve, proposal.points.improve));
    setProposal({ status: 'idle' });
  };

  const finish = async () => {
    setSaving(true);
    try {
      await settle();
      await reviewActions.finishDay(date, fields);
      setDirty(false);
      setFinished(true);
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const streak = reviewStreak(reviews, today);
  const go = (offset: number) => void navigate(`/reviews/day/${addDays(date, offset)}`);

  const back = (
    <IconButton
      icon={ChevronLeft}
      label={t.back}
      onClick={() => void navigate('/reviews')}
      data-testid="review-back"
    />
  );

  if (finished) {
    return (
      <Page title={t.daily} leading={back} width="narrow">
        <Completed title={t.doneDayTitle} text={t.doneDayText} streak={streak}>
          <Button onClick={() => void navigate('/reviews')} data-testid="review-to-overview">
            {t.toOverview}
          </Button>
          <Button variant="ghost" onClick={() => setFinished(false)}>
            {t.view}
          </Button>
        </Completed>
      </Page>
    );
  }

  return (
    <Page
      title={t.daily}
      leading={back}
      actions={
        <>
          <AutosaveStatus status={status} />
          <IconButton icon={ChevronLeft} label={t.previous} onClick={() => go(-1)} />
          <IconButton
            icon={ChevronRight}
            label={t.next}
            onClick={() => go(1)}
            disabled={date >= today}
          />
          {record && (
            <ActionMenuButton
              testId="review-menu"
              items={[
                {
                  id: 'delete',
                  label: t.remove,
                  icon: Trash2,
                  danger: true,
                  onSelect: () => setRemoving(true),
                },
              ]}
            />
          )}
          <Button
            size="sm"
            icon={Check}
            loading={saving}
            onClick={() => void finish()}
            data-testid="review-finish"
          >
            {record?.doneAt ? t.finishAgain : t.finish}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6" data-testid="review-day">
        <p className="-mt-1 px-1 text-base text-fg-secondary" data-testid="review-date">
          {formatLongDate(date)}
        </p>
        <div className="grid items-start gap-6 wide:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Surface className="flex flex-col gap-4" data-testid="review-facts">
              <h2 className="text-lg font-semibold tracking-tight text-fg">{t.day.facts}</h2>
              <EventFacts state={events} />
              <FactList
                title={t.day.done}
                items={facts.done.map((task) => task.title)}
                testId="review-day-done"
              />
              <FactList
                title={t.day.open}
                items={facts.open.map((open) => open.task.title)}
                testId="review-day-open"
              />
            </Surface>
            <Surface className="flex flex-col gap-3">
              <Textarea
                label={t.note}
                placeholder={t.notePlaceholder}
                value={note}
                maxLength={LIMITS.notes}
                onChange={(event) => change(setNote)(event.target.value)}
                data-testid="review-note"
              />
            </Surface>
            {aiEnabled && (
              <AiCard
                state={proposal}
                hint={t.ai.hintDay}
                onEvaluate={() => void evaluate()}
                onAccept={accept}
                onDiscard={() => setProposal({ status: 'idle' })}
              >
                {proposal.status === 'done' && (
                  <>
                    <ProposalSection
                      title={t.sections.wentWell}
                      points={proposal.points.wentWell.map(withAiMark)}
                    />
                    <ProposalSection
                      title={t.sections.notWell}
                      points={proposal.points.notWell.map(withAiMark)}
                    />
                    <ProposalSection
                      title={t.sections.improve}
                      points={proposal.points.improve.map(withAiMark)}
                    />
                  </>
                )}
              </AiCard>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <PointList
              title={t.sections.wentWell}
              hint={t.hints.wentWell}
              points={wentWell}
              onChange={change(setWentWell)}
              placeholder={t.placeholders.wentWell}
              suggestions={suggestions.wentWell}
              icon={<ThumbsUp size={19} aria-hidden className="text-success" />}
              testId="review-went-well"
            />
            <PointList
              title={t.sections.notWell}
              hint={t.hints.notWell}
              points={notWell}
              onChange={change(setNotWell)}
              placeholder={t.placeholders.notWell}
              suggestions={suggestions.notWell}
              icon={<CircleX size={19} aria-hidden className="text-warning" />}
              testId="review-not-well"
            />
            <PointList
              title={t.sections.improve}
              hint={t.hints.improve}
              points={improve}
              onChange={change(setImprove)}
              placeholder={t.placeholders.improve}
              suggestions={suggestions.improve}
              icon={<Lightbulb size={19} aria-hidden className="text-signal-fg" />}
              testId="review-improve"
            />
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        onConfirm={async () => {
          if (!record) return;
          await reviewActions.remove(record.id);
          toast.success(t.removed);
          void navigate('/reviews');
        }}
        title={t.removeTitle}
        message={t.removeText}
        confirmLabel={t.remove}
        variant="danger"
      />
    </Page>
  );
}

/** Status icon of a review: open, started or finished. */
export function ReviewStatusIcon({ review }: { review?: Review }) {
  if (!review) return <CircleDashed size={18} aria-hidden className="text-fg-muted" />;
  return review.doneAt ? (
    <CircleCheck size={18} aria-hidden className="text-success" />
  ) : (
    <CircleDashed size={18} aria-hidden className="text-signal-fg" />
  );
}

/** /reviews/day/:date – the daily review of a day (today by default). */
export function DayReviewPage() {
  const { date = '' } = useParams();
  const today = useLocalDate();
  const ready = useDataStore((state) => state.ready);
  const reviews = useDataStore((state) => state.reviews);
  if (date === 'today') return <Navigate to={`/reviews/day/${today}`} replace />;
  if (!isoDate.safeParse(date).success || date > today) return <Navigate to="/reviews" replace />;
  if (!ready) {
    return (
      <Page title={t.daily}>
        <Spinner />
      </Page>
    );
  }
  const initial = Object.values(reviews).find(
    (review) => review.kind === 'daily' && review.date === date,
  );
  return <DayEditor key={date} date={date} initial={initial} />;
}
