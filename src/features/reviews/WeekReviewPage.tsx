import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { Check, ChevronLeft, ChevronRight, ListChecks, Repeat, Trash2, Turtle } from 'lucide-react';
import {
  ActionMenuButton,
  Button,
  ConfirmDialog,
  cn,
  IconButton,
  Input,
  Spinner,
  Surface,
  Textarea,
  toast,
} from '@/components/ui';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { Page } from '@/app/shell/Page';
import { withAiMark } from '@/core/aiMark';
import { addDays } from '@/core/dates';
import { formatDate, formatShortDate, formatWeekday } from '@/core/format';
import type { SortedSentence } from '@/core/reviews/dictation';
import { changesDueDate, reviewWeek, weekFacts } from '@/core/reviews/reviews';
import { reviewActions } from '@/data/repositories';
import type { WeekReviewPoints } from '@/data/prompts/reviews';
import { isoDate, LIMITS, type Review } from '@/data/schemas';
import { useDataStore } from '@/data/store';
import { useSettings } from '@/features/settings/settingsStore';
import { useTasks } from '@/features/tasks/useTasks';
import { de } from '@/i18n/de';
import { AiError, reviewWeekWithAi } from '@/services/ai';
import { PointList, Suggestions } from './PointList';
import {
  AiCard,
  AutosaveStatus,
  Completed,
  ProposalSection,
  type ProposalState,
} from './ReviewParts';
import { weekReviewRequest } from './reviewAi';
import { DictationCard } from './DictationCard';
import { addPoint, weekSuggestions } from './reviewText';
import { useAutosave, useReviews } from './useReviews';

const t = de.reviews;
const CHANGES = 3;

/** Three slots; empty strings are open slots. */
function slots(changes: readonly string[]): string[] {
  return Array.from({ length: CHANGES }, (_, index) => changes[index] ?? '');
}

/** Fills the first empty slot. */
function fillSlot(changes: readonly string[], change: string): string[] {
  const next = slots(changes);
  if (next.includes(change)) return next;
  const index = next.findIndex((entry) => !entry.trim());
  if (index >= 0) next[index] = change.slice(0, LIMITS.title);
  return next;
}

function DayStrip({ days, reviews }: { days: string[]; reviews: Review[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" data-testid="review-week-days">
      {days.map((day) => {
        const review = reviews.find((entry) => entry.date === day);
        const label = formatWeekday(day);
        return (
          <li key={day}>
            <Link
              to={`/reviews/day/${day}`}
              aria-label={t.week.dayLabel(formatShortDate(day))}
              className="focus-ring flex min-h-11 flex-col items-center gap-1 rounded-lg py-1.5 text-xs text-fg-secondary active:bg-accent-soft"
            >
              {label}
              <span
                aria-hidden
                className={cn(
                  'size-3.5 rounded-full border-2',
                  review?.doneAt
                    ? 'border-accent bg-accent'
                    : review
                      ? 'border-accent'
                      : 'border-line-strong',
                )}
                data-done={review?.doneAt ? 'true' : 'false'}
              />
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

function DailyPoints({ reviews }: { reviews: Review[] }) {
  const sections = ['wentWell', 'notWell', 'improve'] as const;
  if (reviews.length === 0) return <p className="text-base text-fg-muted">{t.week.noDaily}</p>;
  return (
    <div className="flex flex-col gap-2">
      {sections.map((section) => {
        const points = reviews.flatMap((review) =>
          review[section].map((point) => ({ day: review.date, point })),
        );
        return (
          <details key={section} className="group rounded-lg border border-line">
            <summary className="focus-ring flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-base text-fg">
              <ChevronRight
                size={16}
                aria-hidden
                className="text-fg-muted transition-transform group-open:rotate-90"
              />
              {t.sections[section]} ({points.length})
            </summary>
            <ul className="flex flex-col gap-1 px-4 pb-3 text-base text-fg">
              {points.map(({ day, point }) => (
                <li key={`${day}-${point}`}>
                  <span className="text-sm text-fg-muted">{formatWeekday(day)}: </span>
                  {point}
                </li>
              ))}
            </ul>
          </details>
        );
      })}
    </div>
  );
}

function WeekEditor({ sunday, initial }: { sunday: string; initial?: Review }) {
  const navigate = useNavigate();
  const today = useLocalDate();
  const tasks = useTasks();
  const reviews = useReviews();
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);

  const [patterns, setPatterns] = useState(initial?.patterns ?? []);
  const [brakes, setBrakes] = useState(initial?.brakes ?? []);
  const [changes, setChanges] = useState(slots(initial?.changes ?? []));
  const [note, setNote] = useState(initial?.note ?? '');
  const [dirty, setDirty] = useState(false);
  const [touched, setTouched] = useState(false);
  const [finished, setFinished] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [proposal, setProposal] = useState<ProposalState<WeekReviewPoints>>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const fields = useMemo(
    () => ({
      patterns,
      brakes,
      changes: changes.map((entry) => entry.trim()).filter(Boolean),
      note: note.trim() || undefined,
    }),
    [patterns, brakes, changes, note],
  );
  const filled = fields.changes;
  const { status, settle } = useAutosave('weekly', sunday, fields, dirty);
  const change =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setDirty(true);
    };

  const facts = useMemo(() => weekFacts(sunday, tasks, reviews), [sunday, tasks, reviews]);
  const suggestions = useMemo(() => weekSuggestions(facts), [facts]);
  const record = reviews.find((review) => review.kind === 'weekly' && review.date === sunday);
  const dueDate = changesDueDate(sunday, today);
  const missing = filled.length !== CHANGES;

  const evaluate = async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setProposal({ status: 'loading' });
    try {
      const result = await reviewWeekWithAi(
        { enabled: aiEnabled, model: aiModel },
        weekReviewRequest(facts, { patterns, brakes, changes: filled }),
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
    const marked = (points: string[]) => points.map(withAiMark);
    change(setPatterns)(marked(proposal.points.patterns).reduce(addPoint, patterns));
    change(setBrakes)(marked(proposal.points.brakes).reduce(addPoint, brakes));
    change(setChanges)(marked(proposal.points.changes).reduce(fillSlot, changes));
    setProposal({ status: 'idle' });
  };

  /** Spoken sentences: what went well → patterns, problems → brakes, plans → changes. */
  const applyDictation = (sentences: SortedSentence[]) => {
    const of = (section: SortedSentence['section']) =>
      sentences.filter((entry) => entry.section === section).map((entry) => entry.text);
    change(setPatterns)(of('wentWell').reduce(addPoint, patterns));
    change(setBrakes)(of('notWell').reduce(addPoint, brakes));
    const nextChanges = of('improve').reduce(fillSlot, changes);
    change(setChanges)(nextChanges);
    // Only three changes: further plans are kept in the note.
    const extra = [
      ...of('improve').filter((sentence) => !nextChanges.includes(sentence.slice(0, LIMITS.title))),
      ...of('note'),
    ];
    if (extra.length > 0) change(setNote)([note.trim(), ...extra].filter(Boolean).join('\n'));
    toast.success(t.dictation.applied(sentences.length));
  };

  const finish = async () => {
    setTouched(true);
    if (missing) return;
    setSaving(true);
    try {
      await settle();
      await reviewActions.finishWeek(
        sunday,
        { ...fields, changes: filled },
        { dueDate, notes: t.week.taskNote(formatDate(sunday)) },
      );
      setDirty(false);
      setFinished(dueDate);
    } catch {
      toast.error(t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

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
      <Page title={t.weekly} leading={back} width="narrow">
        <Completed title={t.doneWeekTitle} text={t.doneWeekText(formatShortDate(finished))}>
          <ol className="flex w-full flex-col gap-2 text-left" data-testid="review-week-tasks">
            {filled.map((change, index) => (
              <li
                key={change}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-base text-fg"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-signal text-sm font-semibold text-on-signal">
                  {index + 1}
                </span>
                {change}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => void navigate('/tasks')} data-testid="review-to-tasks">
              {t.toTasks}
            </Button>
            <Button variant="ghost" onClick={() => void navigate('/reviews')}>
              {t.toOverview}
            </Button>
          </div>
        </Completed>
      </Page>
    );
  }

  const go = (weeks: number) => void navigate(`/reviews/week/${addDays(sunday, weeks * 7)}`);
  const changeSuggestions = suggestions.changes.filter((item) => !changes.includes(item));

  return (
    <Page
      title={t.weekly}
      leading={back}
      actions={
        <>
          <AutosaveStatus status={status} />
          <IconButton icon={ChevronLeft} label={t.previousWeek} onClick={() => go(-1)} />
          <IconButton
            icon={ChevronRight}
            label={t.nextWeek}
            onClick={() => go(1)}
            disabled={sunday >= reviewWeek(today)}
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
            aria-label={t.finishWeek}
            data-testid="review-finish"
          >
            <span className="hidden sm:inline">{t.finishWeek}</span>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6" data-testid="review-week">
        <p className="-mt-1 px-1 text-base text-fg-secondary" data-testid="review-date">
          {t.weekRange(formatShortDate(facts.days[0] ?? sunday), formatShortDate(sunday))}
        </p>
        <div className="grid items-start gap-6 wide:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <Surface className="flex flex-col gap-4" data-testid="review-facts">
              <h2 className="text-lg font-semibold tracking-tight text-fg">{t.week.facts}</h2>
              <DayStrip days={facts.days} reviews={facts.daily} />
              <ul className="flex flex-col gap-1 text-base text-fg" data-testid="review-week-stats">
                <li>{t.week.reviewed(facts.daily.length)}</li>
                <li>{t.week.done(facts.done.length)}</li>
                <li>{t.week.open(facts.open.length)}</li>
              </ul>
              <h3 className="text-sm font-medium text-fg-secondary">{t.week.fromDaily}</h3>
              <DailyPoints reviews={facts.daily} />
            </Surface>
            <DictationCard variant="week" onApply={applyDictation} />
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
                hint={t.ai.hintWeek}
                onEvaluate={() => void evaluate()}
                onAccept={accept}
                onDiscard={() => setProposal({ status: 'idle' })}
              >
                {proposal.status === 'done' && (
                  <>
                    <ProposalSection
                      title={t.sections.patterns}
                      points={proposal.points.patterns.map(withAiMark)}
                    />
                    <ProposalSection
                      title={t.sections.brakes}
                      points={proposal.points.brakes.map(withAiMark)}
                    />
                    <ProposalSection
                      title={t.sections.changes}
                      points={proposal.points.changes.map(withAiMark)}
                    />
                  </>
                )}
              </AiCard>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <PointList
              title={t.sections.patterns}
              hint={t.hints.patterns}
              points={patterns}
              onChange={change(setPatterns)}
              placeholder={t.placeholders.patterns}
              suggestions={suggestions.patterns}
              icon={<Repeat size={19} aria-hidden className="text-accent" />}
              testId="review-patterns"
            />
            <PointList
              title={t.sections.brakes}
              hint={t.hints.brakes}
              points={brakes}
              onChange={change(setBrakes)}
              placeholder={t.placeholders.brakes}
              suggestions={suggestions.brakes}
              icon={<Turtle size={19} aria-hidden className="text-warning" />}
              testId="review-brakes"
            />
            <Surface className="flex flex-col gap-4" data-testid="review-changes">
              <div className="flex flex-col gap-1">
                <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-fg">
                  <ListChecks size={19} aria-hidden className="text-signal-fg" />
                  {t.sections.changes}
                </h2>
                <p className="text-sm text-fg-muted">{t.hints.changes}</p>
              </div>
              <ol className="flex flex-col gap-3">
                {changes.map((value, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signal text-sm font-semibold text-on-signal"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Input
                        aria-label={t.week.change(index + 1)}
                        placeholder={t.week.changePlaceholder}
                        value={value}
                        maxLength={LIMITS.title}
                        onChange={(event) => {
                          const next = [...changes];
                          next[index] = event.target.value;
                          change(setChanges)(next);
                        }}
                        error={touched && !value.trim() ? t.week.changesMissing : undefined}
                        data-testid={`review-change-${index + 1}`}
                      />
                    </div>
                  </li>
                ))}
              </ol>
              <p className="text-sm text-fg-muted" data-testid="review-changes-due">
                {t.week.changesDue(formatShortDate(dueDate))}
              </p>
              <Suggestions
                items={changeSuggestions}
                onPick={(item) => change(setChanges)(fillSlot(changes, item))}
              />
            </Surface>
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

/** /reviews/week/:date – the weekly review of the week ending on that Sunday. */
export function WeekReviewPage() {
  const { date = '' } = useParams();
  const today = useLocalDate();
  const ready = useDataStore((state) => state.ready);
  const reviews = useDataStore((state) => state.reviews);
  const current = reviewWeek(today);
  if (date === 'current') return <Navigate to={`/reviews/week/${current}`} replace />;
  if (!isoDate.safeParse(date).success) return <Navigate to="/reviews" replace />;
  const sunday = reviewWeek(date);
  if (sunday !== date || sunday > current) {
    return <Navigate to={`/reviews/week/${sunday > current ? current : sunday}`} replace />;
  }
  if (!ready) {
    return (
      <Page title={t.weekly}>
        <Spinner />
      </Page>
    );
  }
  const initial = Object.values(reviews).find(
    (review) => review.kind === 'weekly' && review.date === sunday,
  );
  return <WeekEditor key={sunday} sunday={sunday} initial={initial} />;
}
