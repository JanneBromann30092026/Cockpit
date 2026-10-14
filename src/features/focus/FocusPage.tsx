import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  CalendarCheck,
  CalendarSearch,
  CircleAlert,
  LogIn,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import {
  Badge,
  Button,
  ChoiceChip,
  ConfirmDialog,
  IconButton,
  Input,
  Select,
  Surface,
  toast,
  type SelectOption,
} from '@/components/ui';
import { Page } from '@/app/shell/Page';
import { localIsoDate } from '@/core/dates';
import { formatShortDate } from '@/core/format';
import {
  DAY_PARTS,
  planFocusBlocks,
  plannedMinutes,
  type DayPart,
  type FocusPlan,
  type PlannedBlock,
} from '@/core/focus/plan';
import { canWriteCalendar } from '@/core/google/oauth';
import { currentFocus, focusActions, newActivity } from '@/data/repositories';
import type { FocusActivityRecord, FocusProfile } from '@/data/schemas';
import { useDataStore } from '@/data/store';
import { useGoogleClientId } from '@/features/settings/settingsStore';
import { refreshToday } from '@/features/today/todayStore';
import { formatTime } from '@/features/today/overviewText';
import { de } from '@/i18n/de';
import {
  connectWithPopup,
  createFocusBlocks,
  deleteFocusBlocks,
  GoogleError,
  loadCalendarForFocus,
  useGoogleSession,
  type FocusBlockEvent,
  type GoogleErrorCode,
} from '@/services/google';
import { spring } from '@/styles/motion';

const t = de.focus;
const DAYS = 7;
const SAVE_DELAY_MS = 500;

const HOUR_OPTIONS: SelectOption<string>[] = [30, 60, 90, 120, 180, 240, 300, 360, 480, 600].map(
  (minutes) => ({ value: String(minutes), label: t.hoursValue(minutes) }),
);
const BLOCK_OPTIONS: SelectOption<string>[] = [30, 45, 60, 90, 120, 180].map((minutes) => ({
  value: String(minutes),
  label: t.minutesValue(minutes),
}));
const PART_OPTIONS: SelectOption<DayPart>[] = DAY_PARTS.map((part) => ({
  value: part,
  label: t.dayParts[part],
}));
const CLOCK_OPTIONS: SelectOption<string>[] = Array.from({ length: 35 }, (_, index) => {
  const minutes = 6 * 60 + index * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${minutes % 60 === 0 ? '00' : '30'}`;
  return { value, label: value };
});
const BUFFER_OPTIONS: SelectOption<string>[] = [0, 10, 15, 30].map((minutes) => ({
  value: String(minutes),
  label: t.minutesValue(minutes),
}));
const MAX_OPTIONS: SelectOption<string>[] = [120, 180, 240, 300, 360, 480].map((minutes) => ({
  value: String(minutes),
  label: t.hoursValue(minutes),
}));

/** Options plus the current value, should it not be one of them. */
function withValue(options: SelectOption<string>[], value: number, label: string) {
  return options.some((option) => option.value === String(value))
    ? options
    : [...options, { value: String(value), label }].sort(
        (a, b) => Number(a.value) - Number(b.value),
      );
}

type Settings = Pick<
  FocusProfile,
  'dayStart' | 'dayEnd' | 'weekdays' | 'bufferMinutes' | 'maxMinutesPerDay'
>;

interface Draft extends Settings {
  activities: FocusActivityRecord[];
}

function draftOf(profile: FocusProfile | undefined): Draft {
  return {
    activities: profile?.activities ?? [],
    dayStart: profile?.dayStart ?? '08:00',
    dayEnd: profile?.dayEnd ?? '20:00',
    weekdays: profile?.weekdays ?? [0, 1, 2, 3, 4, 5, 6],
    bufferMinutes: profile?.bufferMinutes ?? 15,
    maxMinutesPerDay: profile?.maxMinutesPerDay ?? 240,
  };
}

function ActivityRow({
  activity,
  onChange,
  onRemove,
}: {
  activity: FocusActivityRecord;
  onChange: (next: FocusActivityRecord) => void;
  onRemove: () => void;
}) {
  return (
    <li
      className="flex flex-col gap-3 rounded-lg border border-line p-3"
      data-testid="focus-activity"
    >
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Input
            label={t.name}
            value={activity.name}
            maxLength={120}
            onChange={(event) => onChange({ ...activity, name: event.target.value })}
            data-testid="focus-activity-name"
          />
        </div>
        <IconButton
          icon={Trash2}
          label={t.remove(activity.name)}
          onClick={onRemove}
          data-testid="focus-activity-remove"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Select
          label={t.hours}
          options={withValue(
            HOUR_OPTIONS,
            activity.minutesPerWeek,
            t.hoursValue(activity.minutesPerWeek),
          )}
          value={String(activity.minutesPerWeek)}
          onChange={(value) => onChange({ ...activity, minutesPerWeek: Number(value) })}
          data-testid="focus-activity-hours"
        />
        <Select
          label={t.block}
          options={withValue(
            BLOCK_OPTIONS,
            activity.blockMinutes,
            t.minutesValue(activity.blockMinutes),
          )}
          value={String(activity.blockMinutes)}
          onChange={(value) => onChange({ ...activity, blockMinutes: Number(value) })}
          data-testid="focus-activity-block"
        />
        <Select
          label={t.dayPart}
          options={PART_OPTIONS}
          value={activity.dayPart}
          onChange={(dayPart) => onChange({ ...activity, dayPart })}
          data-testid="focus-activity-part"
        />
      </div>
    </li>
  );
}

function dayKey(ms: number): string {
  return localIsoDate(new Date(ms));
}

function timeRange(block: { start: number; end: number }): string {
  return `${formatTime(new Date(block.start).toISOString())}–${formatTime(new Date(block.end).toISOString())}`;
}

/** Proposal grouped by day, existing Cockpit blocks shown greyed. */
function ProposalList({
  blocks,
  existing,
  names,
  onRemove,
}: {
  blocks: PlannedBlock[];
  existing: FocusBlockEvent[];
  names: Map<string, string>;
  onRemove: (block: PlannedBlock) => void;
}) {
  const days = new Map<string, { planned: PlannedBlock[]; existing: FocusBlockEvent[] }>();
  for (const block of blocks) {
    const key = dayKey(block.start);
    const day = days.get(key) ?? { planned: [], existing: [] };
    day.planned.push(block);
    days.set(key, day);
  }
  for (const block of existing) {
    const key = dayKey(block.start);
    const day = days.get(key) ?? { planned: [], existing: [] };
    day.existing.push(block);
    days.set(key, day);
  }
  const ordered = [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  return (
    <ol className="flex flex-col gap-4" data-testid="focus-proposal">
      {ordered.map(([key, day]) => {
        const rows = [
          ...day.existing.map((block) => ({
            kind: 'existing' as const,
            block,
            start: block.start,
          })),
          ...day.planned.map((block) => ({ kind: 'planned' as const, block, start: block.start })),
        ].sort((a, b) => a.start - b.start);
        return (
          <li key={key} className="flex flex-col gap-2" data-testid="focus-day">
            <h3 className="px-1 text-sm font-semibold tracking-wide text-fg-muted uppercase">
              {formatShortDate(key)}
            </h3>
            <ul className="flex flex-col gap-2">
              {rows.map((row) =>
                row.kind === 'existing' ? (
                  <li
                    key={`e-${row.block.id}`}
                    className="flex min-h-12 items-center gap-3 rounded-lg bg-surface-sunken px-4 text-fg-secondary"
                    data-testid="focus-existing"
                  >
                    <span className="w-28 shrink-0 text-sm tabular-nums">
                      {timeRange(row.block)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base">{row.block.activity}</span>
                    <Badge tone="neutral">{t.existingBadge}</Badge>
                  </li>
                ) : (
                  <li
                    key={`p-${row.block.start}`}
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-accent/30 bg-accent-soft pl-4"
                    data-testid="focus-block"
                  >
                    <span className="w-28 shrink-0 text-sm font-medium text-fg tabular-nums">
                      {timeRange(row.block)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base font-medium text-fg">
                      {names.get(row.block.activityId) ?? ''}
                    </span>
                    <IconButton
                      icon={X}
                      label={t.removeBlock(timeRange(row.block))}
                      onClick={() => onRemove(row.block)}
                      data-testid="focus-block-remove"
                    />
                  </li>
                ),
              )}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

/** /focus – activities, when, proposal from the free time, writing into Google Calendar. */
export function FocusPage() {
  const navigate = useNavigate();
  const profile = useDataStore((state) => currentFocus(state.focus));
  const ready = useDataStore((state) => state.ready);
  const status = useGoogleSession((s) => s.status);
  const scopes = useGoogleSession((s) => s.scopes);
  const clientId = useGoogleClientId();
  const connected = status === 'connected';
  const canWrite = canWriteCalendar(scopes);

  const [draft, setDraft] = useState<Draft>(() => draftOf(profile));
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready'>('idle');
  const [error, setError] = useState<GoogleErrorCode | null>(null);
  const [existing, setExisting] = useState<FocusBlockEvent[]>([]);
  const [plan, setPlan] = useState<FocusPlan | null>(null);
  const [writing, setWriting] = useState<{ done: number; total: number } | null>(null);
  const [clearing, setClearing] = useState(false);
  const loadedProfile = useRef(profile !== undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Draft | null>(null);

  // The profile may arrive after the page opened (data still loading): take it over once.
  useEffect(() => {
    if (!profile || loadedProfile.current) return;
    loadedProfile.current = true;
    setDraft(draftOf(profile));
  }, [profile]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (!next) return;
    const activities = next.activities.filter((activity) => activity.name.trim());
    void focusActions.save({ ...next, activities }).catch(() => toast.error(t.saveFailed));
  };

  useEffect(
    () => () => {
      flush();
    },
    [],
  );

  const change = (next: Draft) => {
    setDraft(next);
    setPlan(null);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  const names = useMemo(
    () => new Map(draft.activities.map((activity) => [activity.id, activity.name.trim()])),
    [draft.activities],
  );
  const usable = draft.activities.filter((activity) => activity.name.trim());
  const suggestions = t.suggestionNames.filter(
    (name) =>
      !draft.activities.some((activity) => activity.name.toLowerCase() === name.toLowerCase()),
  );

  const range = () => {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + DAYS);
    return { now, from, to };
  };

  const findTimes = async () => {
    flush();
    setPhase('loading');
    setError(null);
    try {
      const { now, from, to } = range();
      const calendar = await loadCalendarForFocus(from, to);
      setExisting(calendar.blocks.filter((block) => block.end > now.getTime()));
      setPlan(
        planFocusBlocks({
          now,
          days: DAYS,
          activities: usable,
          settings: draft,
          busy: calendar.busy,
          existing: calendar.blocks,
        }),
      );
      setPhase('ready');
    } catch (problem: unknown) {
      setError(problem instanceof GoogleError ? problem.code : 'API_ERROR');
      setPhase('idle');
    }
  };

  const insert = async () => {
    if (!plan || plan.blocks.length === 0) return;
    const total = plan.blocks.length;
    setWriting({ done: 0, total });
    setError(null);
    let done = 0;
    try {
      done = await createFocusBlocks(
        plan.blocks.map((block) => {
          const name = names.get(block.activityId) ?? '';
          return {
            start: block.start,
            end: block.end,
            activity: name,
            title: t.eventTitle(name),
            description: t.eventDescription,
          };
        }),
        (count) => {
          done = count;
          setWriting({ done: count, total });
        },
      );
      toast.success(t.inserted(done));
      void refreshToday();
      await findTimes();
    } catch (problem: unknown) {
      setError(problem instanceof GoogleError ? problem.code : 'API_ERROR');
      if (done > 0) {
        toast.info(t.partly(done, total));
        await findTimes();
      }
    } finally {
      setWriting(null);
    }
  };

  const clear = async () => {
    setError(null);
    try {
      await deleteFocusBlocks(existing.map((block) => block.id));
      toast.success(t.cleared);
      void refreshToday();
      await findTimes();
    } catch (problem: unknown) {
      setError(problem instanceof GoogleError ? problem.code : 'API_ERROR');
    }
  };

  const totals = plan ? plannedMinutes(plan.blocks) : new Map<string, number>();
  const existingMinutes = new Map(plan?.existing.map((entry) => [entry.activityId, entry.minutes]));

  return (
    <Page
      title={t.title}
      width="narrow"
      leading={
        <IconButton
          icon={ArrowLeft}
          label={t.back}
          onClick={() => void navigate(-1)}
          data-testid="focus-back"
        />
      }
    >
      <div className="flex flex-col gap-5" data-testid="focus-page">
        <p className="px-1 text-base text-fg-secondary">{t.intro}</p>

        <Surface className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold tracking-tight text-fg">{t.activities}</h2>
            <p className="text-sm text-fg-muted">{t.activitiesHint}</p>
          </div>
          {draft.activities.length === 0 && ready && (
            <p className="text-base text-fg-muted">{t.noActivities}</p>
          )}
          <ul className="flex flex-col gap-3">
            {draft.activities.map((activity, index) => (
              <ActivityRow
                key={activity.id}
                activity={activity}
                onChange={(next) =>
                  change({
                    ...draft,
                    activities: draft.activities.map((entry, position) =>
                      position === index ? next : entry,
                    ),
                  })
                }
                onRemove={() =>
                  change({
                    ...draft,
                    activities: draft.activities.filter((_, position) => position !== index),
                  })
                }
              />
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            {suggestions.map((name) => (
              <ChoiceChip
                key={name}
                selected={false}
                onToggle={() =>
                  change({
                    ...draft,
                    activities: [
                      ...draft.activities,
                      newActivity(name, { blockMinutes: name === 'Instagram' ? 60 : 90 }),
                    ],
                  })
                }
              >
                + {name}
              </ChoiceChip>
            ))}
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              onClick={() =>
                change({ ...draft, activities: [...draft.activities, newActivity(t.newName)] })
              }
              data-testid="focus-add"
            >
              {t.add}
            </Button>
          </div>
        </Surface>

        <Surface className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold tracking-tight text-fg">{t.when}</h2>
          <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
            <Select
              label={t.dayStart}
              options={CLOCK_OPTIONS}
              value={draft.dayStart}
              onChange={(dayStart) => change({ ...draft, dayStart })}
              data-testid="focus-day-start"
            />
            <Select
              label={t.dayEnd}
              options={CLOCK_OPTIONS}
              value={draft.dayEnd}
              onChange={(dayEnd) => change({ ...draft, dayEnd })}
              data-testid="focus-day-end"
            />
            <Select
              label={t.buffer}
              options={BUFFER_OPTIONS}
              value={String(draft.bufferMinutes)}
              onChange={(value) => change({ ...draft, bufferMinutes: Number(value) })}
            />
            <Select
              label={t.maxPerDay}
              options={MAX_OPTIONS}
              value={String(draft.maxMinutesPerDay)}
              onChange={(value) => change({ ...draft, maxMinutesPerDay: Number(value) })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <span className="px-1 text-sm font-medium text-fg-secondary">{t.weekdays}</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label={t.weekdays}>
              {t.weekdayNames.map((label, day) => (
                <ChoiceChip
                  key={label}
                  selected={draft.weekdays.includes(day)}
                  onToggle={() =>
                    change({
                      ...draft,
                      weekdays: draft.weekdays.includes(day)
                        ? draft.weekdays.filter((entry) => entry !== day)
                        : [...draft.weekdays, day].sort(),
                    })
                  }
                >
                  {label}
                </ChoiceChip>
              ))}
            </div>
          </div>
        </Surface>

        <Surface className="flex flex-col gap-4" data-testid="focus-plan">
          {!connected ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-base text-fg-secondary">{t.needsGoogle}</p>
              <Button
                icon={LogIn}
                onClick={() => connectWithPopup(clientId)}
                data-testid="focus-connect"
              >
                {t.connect}
              </Button>
            </div>
          ) : (
            <Button
              icon={CalendarSearch}
              loading={phase === 'loading'}
              disabled={usable.length === 0 || draft.weekdays.length === 0}
              onClick={() => void findTimes()}
              className="self-start"
              data-testid="focus-find"
            >
              {phase === 'loading' ? t.planning : plan ? t.replan : t.plan}
            </Button>
          )}
          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
              data-testid="focus-error"
            >
              <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
              {de.google.errors[error]}
            </p>
          )}

          {plan && phase === 'ready' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={spring.soft}
              className="flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold tracking-tight text-fg">{t.proposal}</h2>
                <p className="text-sm text-fg-muted">
                  {plan.blocks.length > 0 ? t.proposalHint : t.noBlocks}
                </p>
              </div>
              <ul className="flex flex-wrap gap-2" data-testid="focus-summary">
                {usable.map((activity) => (
                  <li key={activity.id}>
                    <Badge tone="accent" className="h-auto min-h-8 py-1 text-sm">
                      {activity.name.trim()} ·{' '}
                      {t.summary(
                        t.hoursValue(
                          (totals.get(activity.id) ?? 0) + (existingMinutes.get(activity.id) ?? 0),
                        ),
                        t.hoursValue(activity.minutesPerWeek),
                      )}
                    </Badge>
                  </li>
                ))}
              </ul>
              {plan.missing.map((entry) => (
                <p
                  key={entry.activityId}
                  className="flex items-start gap-2 text-sm text-fg-secondary"
                  data-testid="focus-missing"
                >
                  <CircleAlert size={16} aria-hidden className="mt-0.5 shrink-0 text-warning" />
                  {t.missing(t.hoursValue(entry.minutes), names.get(entry.activityId) ?? '')}
                </p>
              ))}
              {existing.length > 0 && (
                <p className="text-sm text-fg-muted">{t.existing(existing.length)}</p>
              )}
              <ProposalList
                blocks={plan.blocks}
                existing={existing}
                names={names}
                onRemove={(block) =>
                  setPlan({ ...plan, blocks: plan.blocks.filter((entry) => entry !== block) })
                }
              />
              {plan.blocks.length > 0 &&
                (canWrite ? (
                  <Button
                    icon={CalendarCheck}
                    loading={writing !== null}
                    onClick={() => void insert()}
                    className="self-start"
                    data-testid="focus-insert"
                  >
                    {writing
                      ? t.inserting(writing.done, writing.total)
                      : t.insert(plan.blocks.length)}
                  </Button>
                ) : (
                  <div className="flex flex-col items-start gap-3 rounded-lg bg-signal-soft p-4">
                    <p className="text-base text-fg">{t.needsWrite}</p>
                    <Button
                      icon={LogIn}
                      variant="secondary"
                      onClick={() => connectWithPopup(clientId)}
                      data-testid="focus-reconnect"
                    >
                      {t.reconnect}
                    </Button>
                  </div>
                ))}
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/tasks"
                  className="focus-ring inline-flex min-h-11 items-center rounded-full px-4 text-base font-medium text-accent"
                >
                  {t.openTasks}
                </Link>
                {existing.length > 0 && canWrite && (
                  <Button
                    variant="ghost"
                    icon={Trash2}
                    onClick={() => setClearing(true)}
                    data-testid="focus-clear"
                  >
                    {t.clear}
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </Surface>
      </div>
      <ConfirmDialog
        open={clearing}
        onClose={() => setClearing(false)}
        onConfirm={clear}
        title={t.clearTitle}
        message={t.clearText(existing.length)}
        confirmLabel={t.clearConfirm}
      />
    </Page>
  );
}
