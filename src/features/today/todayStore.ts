/**
 * State of "Heute": today's events and unread mails, only in memory (never stored). Cleared
 * when the app locks; Google data is fetched again after unlocking.
 */
import { create } from 'zustand';
import type { CalendarEvent } from '@/core/calendar/events';
import { daysBetween, localIsoDate } from '@/core/dates';
import { dueTasks, type TaskInfo } from '@/core/tasks/tasks';
import { mailGroup, type Mail } from '@/core/mail/classify';
import type { DaySummaryMail, DaySummaryRequest } from '@/data/prompts/daySummary';
import { demoEvents, demoMails } from '@/data/demo/today';
import { de } from '@/i18n/de';
import { AiError, summarizeDayWithAi, type AiConfig, type AiErrorCode } from '@/services/ai';
import {
  currentGoogleToken,
  fetchTodayEvents,
  fetchUnreadMails,
  GoogleError,
  useGoogleSession,
  type GoogleErrorCode,
} from '@/services/google';
import { useVault } from '@/services/vault';
import { formatTime } from './overviewText';

export interface DaySummary {
  sentences: string[];
  model: string;
}

export type SummaryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; summary: DaySummary }
  | { status: 'error'; code: AiErrorCode };

interface TodayState {
  /** null: not loaded (or the calendar could not be read). */
  events: CalendarEvent[] | null;
  mails: Mail[] | null;
  calendarError: GoogleErrorCode | null;
  gmailError: GoogleErrorCode | null;
  loading: boolean;
  /** Epoch milliseconds of the last successful load. */
  fetchedAt: number | null;
  /** Invented demo day (developer mode). */
  demo: boolean;
  summary: SummaryState;
}

const EMPTY: TodayState = {
  events: null,
  mails: null,
  calendarError: null,
  gmailError: null,
  loading: false,
  fetchedAt: null,
  demo: false,
  summary: { status: 'idle' },
};

export const useToday = create<TodayState>(() => EMPTY);

/** Data older than this is loaded again when "Heute" opens. */
export const STALE_AFTER_MS = 5 * 60_000;

let controller: AbortController | null = null;
let summaryController: AbortController | null = null;

function errorCode(reason: unknown): GoogleErrorCode {
  if (reason instanceof GoogleError) return reason.code;
  if (reason instanceof DOMException && reason.name === 'AbortError') return 'NETWORK';
  return 'API_ERROR';
}

function abortAll(): void {
  controller?.abort();
  controller = null;
  summaryController?.abort();
  summaryController = null;
}

/** Forgets everything (lock, disconnect, end of the demo). */
export function clearToday(): void {
  abortAll();
  useToday.setState(EMPTY);
}

/** Loads today's events and mails from Google (both in parallel, errors per source). */
export async function refreshToday(now = new Date()): Promise<void> {
  if (useToday.getState().demo) {
    loadDemoDay(now);
    return;
  }
  if (!currentGoogleToken()) return;
  abortAll();
  const current = new AbortController();
  controller = current;
  useToday.setState({ loading: true });
  const [events, mails] = await Promise.allSettled([
    fetchTodayEvents(now, de.today.events.untitled, current.signal),
    fetchUnreadMails(current.signal),
  ]);
  if (controller !== current) return;
  controller = null;
  // The token ran out on the way: keep what is shown, "Heute" asks to connect again.
  if (!currentGoogleToken()) {
    useToday.setState({ loading: false });
    return;
  }
  useToday.setState({
    events: events.status === 'fulfilled' ? events.value : null,
    mails: mails.status === 'fulfilled' ? mails.value : null,
    calendarError: events.status === 'rejected' ? errorCode(events.reason) : null,
    gmailError: mails.status === 'rejected' ? errorCode(mails.reason) : null,
    loading: false,
    fetchedAt: Date.now(),
    demo: false,
    summary: { status: 'idle' },
  });
}

/** The invented demo day (developer mode, screenshots). */
export function loadDemoDay(now = new Date()): void {
  abortAll();
  useToday.setState({
    ...EMPTY,
    events: demoEvents(now),
    mails: demoMails(now),
    fetchedAt: Date.now(),
    demo: true,
  });
}

const SUMMARY_PRIORITY = { high: 'hoch', medium: 'mittel', low: 'niedrig' } as const;

const dateTimeFormat = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function summaryMail(mail: Mail, withSnippet: boolean): DaySummaryMail {
  return {
    from: mail.senderName,
    subject: mail.subject,
    ...(withSnippet && mail.snippet ? { snippet: mail.snippet } : {}),
    ...(mail.question ? { question: true } : {}),
    ...(mail.deadline ? { deadline: true } : {}),
  };
}

/** Only what the overview needs: events, people's mails with snippet, update subjects. */
export function daySummaryRequest(
  now: Date,
  events: readonly CalendarEvent[] | null,
  mails: readonly Mail[] | null,
  tasks: readonly TaskInfo[] = [],
): DaySummaryRequest {
  const today = localIsoDate(now);
  const byGroup = (group: ReturnType<typeof mailGroup>) =>
    (mails ?? []).filter((mail) => mailGroup(mail) === group);
  return {
    now: `${dateTimeFormat.format(now)} Uhr`,
    events:
      events?.map((event) => ({
        time: event.allDay
          ? de.today.events.allDay
          : `${formatTime(event.start)}–${formatTime(event.end)}`,
        title: event.title,
        ...(event.location ? { location: event.location } : {}),
      })) ?? null,
    mails: mails
      ? {
          important: byGroup('important').map((mail) => summaryMail(mail, true)),
          people: byGroup('people').map((mail) => summaryMail(mail, true)),
          updates: byGroup('updates').map((mail) => summaryMail(mail, false)),
          newsletters: byGroup('bulk').length,
        }
      : null,
    tasks: dueTasks(tasks, today).map((task) => ({
      title: task.title,
      priority: SUMMARY_PRIORITY[task.priority],
      overdueDays: Math.max(0, daysBetween(task.dueDate ?? today, today)),
    })),
  };
}

/** Sends the overview data to Claude (only on an explicit tap). */
export async function summarizeToday(
  config: AiConfig,
  tasks: readonly TaskInfo[],
  now = new Date(),
): Promise<void> {
  const { events, mails } = useToday.getState();
  summaryController?.abort();
  const current = new AbortController();
  summaryController = current;
  useToday.setState({ summary: { status: 'loading' } });
  try {
    const result = await summarizeDayWithAi(config, daySummaryRequest(now, events, mails, tasks), {
      signal: current.signal,
    });
    if (summaryController !== current) return;
    useToday.setState({ summary: { status: 'done', summary: result } });
  } catch (error: unknown) {
    if (summaryController !== current) return;
    useToday.setState({
      summary: { status: 'error', code: error instanceof AiError ? error.code : 'API_ERROR' },
    });
  } finally {
    if (summaryController === current) summaryController = null;
  }
}

/** Back to the rule-based overview. */
export function resetSummary(): void {
  summaryController?.abort();
  summaryController = null;
  useToday.setState({ summary: { status: 'idle' } });
}

// Locking removes everything decrypted from memory – Google data included.
useVault.subscribe((state, previous) => {
  if (
    state.status !== previous.status &&
    state.status !== 'unlocked' &&
    state.status !== 'opening'
  ) {
    clearToday();
  }
});

// "Trennen" forgets the data; an expired token keeps it visible until the next refresh.
useGoogleSession.subscribe((state, previous) => {
  if (
    previous.status === 'connected' &&
    state.status === 'disconnected' &&
    state.error !== 'EXPIRED' &&
    !useToday.getState().demo
  ) {
    clearToday();
  }
});
