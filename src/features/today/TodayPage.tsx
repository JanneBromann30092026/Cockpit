import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import {
  CalendarDays,
  CircleAlert,
  FileText,
  ListChecks,
  LogIn,
  Mail as MailIcon,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Button, cn, EmptyState, Skeleton, Surface } from '@/components/ui';
import { useHotkeys } from '@/app/hooks/useHotkeys';
import { useLocalDate } from '@/app/hooks/useLocalDate';
import { useNow } from '@/app/hooks/useNow';
import { Page } from '@/app/shell/Page';
import { eventTiming, localDate, tightSpots, type CalendarEvent } from '@/core/calendar/events';
import { mailGroup, type Mail, type MailGroup } from '@/core/mail/classify';
import { compareOpenTasks, dueTasks } from '@/core/tasks/tasks';
import { overviewFacts } from '@/core/today/overview';
import { upcomingDeadlines } from '@/core/documents/contracts';
import type { DocumentRecord, Task } from '@/data/schemas';
import { DeadlineList } from '@/features/documents/DeadlineList';
import { useDocuments } from '@/features/documents/useDocuments';
import { useGoogleClientId, useSettings } from '@/features/settings/settingsStore';
import { TaskEditor } from '@/features/tasks/TaskEditor';
import { TaskRow } from '@/features/tasks/TaskRow';
import { dueLabel, formatShortDate, useTasks } from '@/features/tasks/useTasks';
import { de } from '@/i18n/de';
import {
  connectWithPopup,
  gmailThreadUrl,
  MAX_MAILS,
  useGoogleSession,
  type GoogleErrorCode,
} from '@/services/google';
import { spring } from '@/styles/motion';
import { formatTime, overviewSentences } from './overviewText';
import {
  clearToday,
  loadDemoDay,
  refreshToday,
  resetSummary,
  STALE_AFTER_MS,
  summarizeToday,
  useToday,
} from './todayStore';

const t = de.today;

const dateFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function Card({
  icon: Icon,
  title,
  count,
  children,
  testId,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  children: ReactNode;
  testId: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid={testId}
    >
      <Surface padding="none" className="flex flex-col overflow-hidden">
        <div className="flex min-h-14 items-center gap-3 px-5 pt-4 pb-2">
          <Icon size={20} aria-hidden className="shrink-0 text-accent" />
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight text-fg">
            {title}
          </h2>
          {count !== undefined && count > 0 && <Badge>{count}</Badge>}
        </div>
        {children}
      </Surface>
    </motion.section>
  );
}

function CardNote({ children, tone = 'muted' }: { children: string; tone?: 'muted' | 'error' }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'mx-5 mb-5 flex items-start gap-2 text-base',
        tone === 'error' ? 'rounded-lg bg-danger-soft px-4 py-3 text-fg' : 'text-fg-muted',
      )}
    >
      {tone === 'error' && (
        <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
      )}
      {children}
    </p>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3 px-5 pb-5" aria-busy="true" aria-label={de.ui.loading}>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-4/5" />
    </div>
  );
}

/** Row that opens Google (Calendar/Gmail) when a link exists. */
function RowLink({ href, label, children }: { href?: string; label: string; children: ReactNode }) {
  const className = 'flex min-h-14 gap-4 px-5 py-3';
  if (!href) return <div className={className}>{children}</div>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className={cn(
        className,
        'focus-ring transition-colors active:bg-accent-soft [@media(hover:hover)]:hover:bg-accent-soft/60',
      )}
    >
      {children}
    </a>
  );
}

function NowMarker({ now }: { now: Date }) {
  return (
    <li aria-hidden className="flex items-center gap-2 px-5 py-1" data-testid="now-marker">
      <span className="text-xs font-semibold text-signal-fg tabular-nums">
        {formatTime(now.toISOString())}
      </span>
      <span className="size-2 rounded-full bg-signal" />
      <span className="h-0.5 flex-1 rounded-full bg-signal" />
    </li>
  );
}

function EventRow({
  event,
  now,
  tightMinutes,
  demo,
}: {
  event: CalendarEvent;
  now: Date;
  tightMinutes?: number;
  demo: boolean;
}) {
  const timing = eventTiming(event, now);
  return (
    <li data-testid="event" data-timing={timing}>
      <RowLink href={demo ? undefined : event.link} label={t.events.openInCalendar}>
        <div
          className={cn(
            'flex w-14 shrink-0 flex-col pt-0.5 tabular-nums',
            timing === 'past' && 'opacity-60',
          )}
        >
          <span className="text-base font-semibold text-fg">{formatTime(event.start)}</span>
          <span className="text-sm text-fg-muted">{formatTime(event.end)}</span>
        </div>
        <div
          className={cn(
            'flex min-w-0 flex-1 flex-col gap-1 border-l-2 pl-4',
            timing === 'now' ? 'border-accent' : 'border-line',
            timing === 'past' && 'opacity-60',
          )}
        >
          <span className="text-base font-medium text-fg">{event.title}</span>
          {event.location && (
            <span className="flex items-start gap-1.5 text-sm text-fg-secondary">
              <MapPin size={15} aria-hidden className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{event.location}</span>
            </span>
          )}
          {(timing === 'now' || (tightMinutes !== undefined && timing === 'upcoming')) && (
            <span className="flex flex-wrap gap-1.5 pt-0.5">
              {timing === 'now' && <Badge tone="accent">{t.events.now}</Badge>}
              {tightMinutes !== undefined && timing === 'upcoming' && (
                <Badge tone="warning">{t.events.tight(tightMinutes)}</Badge>
              )}
            </span>
          )}
        </div>
      </RowLink>
    </li>
  );
}

function EventsCard({ now }: { now: Date }) {
  const events = useToday((s) => s.events);
  const error = useToday((s) => s.calendarError);
  const loading = useToday((s) => s.loading);
  const demo = useToday((s) => s.demo);

  let body: ReactNode;
  if (error) body = <CardNote tone="error">{t.sourceError(de.google.errors[error])}</CardNote>;
  else if (!events) body = loading ? <ListSkeleton /> : null;
  else if (events.length === 0) body = <CardNote>{t.events.empty}</CardNote>;
  else {
    const allDay = events.filter((event) => event.allDay);
    const timed = events.filter((event) => !event.allDay);
    const tight = new Map(tightSpots(timed).map((spot) => [spot.after.id, spot.gapMinutes]));
    const firstAhead = timed.findIndex((event) => eventTiming(event, now) !== 'past');
    const markerAt = firstAhead === -1 ? timed.length : firstAhead;
    body = (
      <div className="flex flex-col pb-3">
        {allDay.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-5 pb-2" data-testid="all-day">
            {allDay.map((event) => (
              <li key={event.id}>
                <Badge tone="signal">
                  {t.events.allDay}: {event.title}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <ul className="flex flex-col">
          {timed.map((event, index) => (
            <Fragment key={event.id}>
              {index === markerAt && index > 0 && eventTiming(event, now) !== 'now' && (
                <NowMarker now={now} />
              )}
              <EventRow event={event} now={now} tightMinutes={tight.get(event.id)} demo={demo} />
            </Fragment>
          ))}
          {markerAt === timed.length && timed.length > 0 && <NowMarker now={now} />}
        </ul>
      </div>
    );
  }

  return (
    <Card icon={CalendarDays} title={t.events.title} count={events?.length} testId="today-events">
      {body}
    </Card>
  );
}

/** "09:45" for today, "gestern 22:10" for yesterday (the list covers 24 hours). */
function receivedText(receivedAt: number, now: Date): string {
  const received = new Date(receivedAt);
  const time = formatTime(received.toISOString());
  return localDate(received) === localDate(now) ? time : t.mails.yesterday(time);
}

function MailRow({ mail, now, demo }: { mail: Mail; now: Date; demo: boolean }) {
  return (
    <li data-testid="mail" data-group={mailGroup(mail)}>
      <RowLink href={demo ? undefined : gmailThreadUrl(mail.threadId)} label={t.mails.openInGmail}>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-baseline gap-3">
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-fg">
              {mail.senderName}
            </span>
            <span className="shrink-0 text-sm text-fg-muted tabular-nums">
              {receivedText(mail.receivedAt, now)}
            </span>
          </div>
          <span className="truncate text-base text-fg">{mail.subject || t.mails.noSubject}</span>
          {mail.snippet && (
            <span className="line-clamp-1 text-sm text-fg-secondary">{mail.snippet}</span>
          )}
          {(mail.question || mail.deadline) && (
            <span className="flex flex-wrap gap-1.5 pt-1">
              {mail.deadline && <Badge tone="warning">{t.mails.deadline}</Badge>}
              {mail.question && <Badge tone="signal">{t.mails.question}</Badge>}
            </span>
          )}
        </div>
      </RowLink>
    </li>
  );
}

const GROUP_ORDER: readonly MailGroup[] = ['important', 'people', 'updates', 'bulk'];

function MailsCard({ now }: { now: Date }) {
  const mails = useToday((s) => s.mails);
  const error = useToday((s) => s.gmailError);
  const loading = useToday((s) => s.loading);
  const demo = useToday((s) => s.demo);
  const [showBulk, setShowBulk] = useState(false);

  let body: ReactNode;
  if (error) body = <CardNote tone="error">{t.sourceError(de.google.errors[error])}</CardNote>;
  else if (!mails) body = loading ? <ListSkeleton /> : null;
  else if (mails.length === 0) body = <CardNote>{t.mails.empty}</CardNote>;
  else {
    body = (
      <div className="flex flex-col gap-2 pb-3">
        {GROUP_ORDER.map((group) => {
          const list = mails.filter((mail) => mailGroup(mail) === group);
          if (list.length === 0) return null;
          const collapsed = group === 'bulk' && !showBulk;
          return (
            <section key={group} data-testid={`mail-group-${group}`}>
              <div className="flex min-h-11 items-center gap-2 px-5">
                <h3
                  className={cn(
                    'flex-1 text-sm font-semibold tracking-wide uppercase',
                    group === 'important' ? 'text-signal-fg' : 'text-fg-muted',
                  )}
                >
                  {t.mails.groups[group]}
                </h3>
                {group === 'bulk' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-expanded={showBulk}
                    onClick={() => setShowBulk(!showBulk)}
                  >
                    {showBulk ? t.mails.hideBulk : t.mails.showBulk(list.length)}
                  </Button>
                )}
              </div>
              {!collapsed && (
                <ul className="flex flex-col">
                  {list.map((mail) => (
                    <MailRow key={mail.id} mail={mail} now={now} demo={demo} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
        {mails.length >= MAX_MAILS && <CardNote>{t.mails.limit(MAX_MAILS)}</CardNote>}
      </div>
    );
  }

  return (
    <Card icon={MailIcon} title={t.mails.title} count={mails?.length} testId="today-mails">
      {body}
    </Card>
  );
}

function OverviewCard({
  now,
  tasks,
  contracts,
}: {
  now: Date;
  tasks: readonly Task[];
  contracts: readonly DocumentRecord[];
}) {
  const events = useToday((s) => s.events);
  const mails = useToday((s) => s.mails);
  const calendarError = useToday((s) => s.calendarError);
  const gmailError = useToday((s) => s.gmailError);
  const summary = useToday((s) => s.summary);
  const aiEnabled = useSettings((s) => s.aiEnabled);
  const aiModel = useSettings((s) => s.aiModel);

  const byClaude = summary.status === 'done';
  const sentences = byClaude
    ? summary.summary.sentences
    : overviewSentences(overviewFacts({ now, events, mails, tasks, contracts }), {
        calendarFailed: calendarError !== null,
        gmailFailed: gmailError !== null,
      });
  const summarize = () =>
    void summarizeToday({ enabled: aiEnabled, model: aiModel }, tasks, contracts, now);

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.soft}
      data-testid="today-overview"
    >
      <Surface className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-semibold tracking-tight text-fg">
            {t.overviewTitle}
          </h2>
          <Badge tone={byClaude ? 'accent' : 'neutral'}>
            <span data-testid="overview-source">{byClaude ? t.overviewByClaude : t.ruleBased}</span>
          </Badge>
        </div>
        <ol className="flex flex-col gap-3" data-testid="overview-sentences">
          {sentences.map((sentence, index) => (
            <motion.li
              key={`${index}-${sentence}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...spring.soft, delay: index * 0.06 }}
              className="flex items-start gap-3"
            >
              <span
                aria-hidden
                className={cn(
                  'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  index === 0 ? 'bg-signal text-on-signal' : 'bg-accent-soft text-accent',
                )}
              >
                {index + 1}
              </span>
              <span className="text-base text-fg wide:text-lg" data-testid="overview-sentence">
                {sentence}
              </span>
            </motion.li>
          ))}
        </ol>
        {aiEnabled && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <div className="flex flex-wrap gap-2">
              {byClaude ? (
                <>
                  <Button size="sm" variant="secondary" icon={Sparkles} onClick={summarize}>
                    {t.resummarize}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetSummary}>
                    {t.showRuleBased}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={Sparkles}
                  loading={summary.status === 'loading'}
                  onClick={summarize}
                  data-testid="summarize"
                >
                  {summary.status === 'loading' ? t.summarizing : t.summarize}
                </Button>
              )}
            </div>
            {summary.status === 'error' ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg bg-danger-soft px-4 py-3 text-base text-fg"
                data-testid="summary-error"
              >
                <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-danger" />
                {de.settings.ai.errors[summary.code]}
              </p>
            ) : (
              !byClaude && <p className="text-sm text-fg-muted">{t.summarizeHint}</p>
            )}
          </div>
        )}
      </Surface>
    </motion.section>
  );
}

function ConnectCard({ error }: { error: GoogleErrorCode | null }) {
  const clientId = useGoogleClientId();
  const devMode = useSettings((s) => s.devMode);
  const status = useGoogleSession((s) => s.status);
  const text = error === 'EXPIRED' ? `${t.connect.expired} ${t.connect.text}` : t.connect.text;

  return (
    <Surface data-testid="today-connect">
      <EmptyState
        className="py-6"
        title={t.connect.title}
        text={text}
        action={
          <div className="flex flex-col items-center gap-3">
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                icon={LogIn}
                loading={status === 'connecting'}
                onClick={() => connectWithPopup(clientId)}
              >
                {error === 'EXPIRED' ? t.connect.reconnect : t.connect.button}
              </Button>
              {devMode && (
                <Button variant="secondary" onClick={() => loadDemoDay()} data-testid="today-demo">
                  {t.demoLoad}
                </Button>
              )}
            </div>
            {error && error !== 'EXPIRED' && (
              <p role="alert" className="text-sm text-danger">
                {de.google.errors[error]}
              </p>
            )}
          </div>
        }
      />
    </Surface>
  );
}

function ExpiredBanner() {
  const clientId = useGoogleClientId();
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg bg-warning-soft px-4 py-3"
      data-testid="today-expired"
    >
      <CircleAlert size={20} aria-hidden className="shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-base text-fg">{t.connect.expired}</p>
      <Button size="sm" icon={LogIn} onClick={() => connectWithPopup(clientId)}>
        {t.connect.reconnect}
      </Button>
    </div>
  );
}

/** Open tasks due today or earlier; completing works right here. */
function TasksDueCard({ tasks, today }: { tasks: readonly Task[]; today: string }) {
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const due = dueTasks(tasks, today);
  const next = tasks
    .filter((task) => task.status === 'open' && task.dueDate !== undefined && task.dueDate > today)
    .sort(compareOpenTasks)[0];

  return (
    <Card icon={ListChecks} title={t.tasks.title} count={due.length} testId="today-tasks">
      {due.length === 0 ? (
        <CardNote>
          {next?.dueDate
            ? `${t.tasks.empty} ${t.tasks.next(next.title, `${dueLabel(next.dueDate, today)} (${formatShortDate(next.dueDate)})`)}`
            : t.tasks.empty}
        </CardNote>
      ) : (
        <ul className="flex flex-col gap-2 px-3 pb-3">
          <AnimatePresence initial={false}>
            {due.map((task) => (
              <TaskRow key={task.id} task={task} today={today} compact />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
          {t.tasks.add}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void navigate('/tasks')}>
          {t.tasks.all}
        </Button>
      </div>
      {adding && (
        <TaskEditor today={today} defaultDueDate={today} onClose={() => setAdding(false)} />
      )}
    </Card>
  );
}

/** Cancel dates and term ends within 30 days, payments within a week. */
function DeadlinesCard({
  contracts,
  today,
}: {
  contracts: readonly DocumentRecord[];
  today: string;
}) {
  const navigate = useNavigate();
  const upcoming = upcomingDeadlines(contracts, today);
  return (
    <Card
      icon={FileText}
      title={t.documents.title}
      count={upcoming.length}
      testId="today-deadlines"
    >
      {upcoming.length === 0 ? (
        <CardNote>{t.documents.empty}</CardNote>
      ) : (
        <DeadlineList deadlines={upcoming} className="px-3 pb-3" />
      )}
      <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
        <Button size="sm" variant="ghost" onClick={() => void navigate('/documents')}>
          {t.documents.all}
        </Button>
      </div>
    </Card>
  );
}

/** "Heute": events, unread mails and the day in three sentences. */
export function TodayPage() {
  const now = useNow();
  const status = useGoogleSession((s) => s.status);
  const sessionError = useGoogleSession((s) => s.error);
  const events = useToday((s) => s.events);
  const mails = useToday((s) => s.mails);
  const calendarError = useToday((s) => s.calendarError);
  const gmailError = useToday((s) => s.gmailError);
  const loading = useToday((s) => s.loading);
  const fetchedAt = useToday((s) => s.fetchedAt);
  const demo = useToday((s) => s.demo);
  const connected = status === 'connected';
  const today = useLocalDate();
  const tasks = useTasks();
  const contracts = useDocuments();
  const dueCount = dueTasks(tasks, today).length;
  const cancelSoon =
    overviewFacts({ now, events: null, mails: null, contracts }).focus.kind === 'cancel';
  const hasData =
    events !== null || mails !== null || calendarError !== null || gmailError !== null;

  // Load on opening (and after connecting) when nothing is there, it failed or is old.
  useEffect(() => {
    if (!connected || demo) return;
    const state = useToday.getState();
    if (state.loading) return;
    if (
      state.fetchedAt === null ||
      state.calendarError !== null ||
      state.gmailError !== null ||
      Date.now() - state.fetchedAt > STALE_AFTER_MS
    ) {
      void refreshToday();
    }
  }, [connected, demo]);

  const canRefresh = connected || demo;
  useHotkeys([
    {
      combo: 'r',
      handler: () => {
        if (!canRefresh || document.querySelector('[aria-modal="true"]')) return;
        void refreshToday();
      },
    },
  ]);

  const showData = demo || connected || hasData;

  return (
    <Page
      title={de.nav.today}
      actions={
        canRefresh && (
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            loading={loading}
            onClick={() => void refreshToday()}
            data-testid="today-refresh"
          >
            {loading ? t.refreshing : t.refresh}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 px-1">
          <p className="text-base text-fg-secondary" data-testid="today-date">
            {dateFormat.format(now)}
          </p>
          {fetchedAt !== null && (
            <p className="text-sm text-fg-muted tabular-nums" data-testid="today-updated">
              {t.updatedAt(formatTime(new Date(fetchedAt).toISOString()))}
            </p>
          )}
          {demo && (
            <span className="flex items-center gap-1">
              <Badge tone="signal">{t.demoBadge}</Badge>
              <Button size="sm" variant="ghost" icon={X} onClick={clearToday}>
                {t.demoEnd}
              </Button>
            </span>
          )}
        </div>

        {!demo && !connected && hasData && sessionError === 'EXPIRED' && <ExpiredBanner />}
        {!showData && <ConnectCard error={sessionError} />}
        {(events !== null || mails !== null || dueCount > 0 || cancelSoon) && (
          <OverviewCard now={now} tasks={tasks} contracts={contracts} />
        )}
        <div className="grid items-start gap-6 wide:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-6">
            {showData && <EventsCard now={now} />}
            <TasksDueCard tasks={tasks} today={today} />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            {showData && <MailsCard now={now} />}
            <DeadlinesCard contracts={contracts} today={today} />
          </div>
        </div>
      </div>
    </Page>
  );
}
