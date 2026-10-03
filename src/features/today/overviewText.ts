import type { OverviewFacts } from '@/core/today/overview';
import { de } from '@/i18n/de';

const t = de.today.overview;

const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

export function formatTime(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** Which sources failed (as opposed to not being connected). */
export interface SourceState {
  calendarFailed: boolean;
  gmailFailed: boolean;
}

function focusSentence(facts: OverviewFacts): string {
  const { focus } = facts;
  if (focus.kind === 'task') {
    return focus.overdueDays > 0
      ? t.focusTaskOverdue(focus.task.title, focus.overdueDays)
      : t.focusTaskToday(focus.task.title);
  }
  if (focus.kind === 'mail') {
    const { senderName, subject, deadline, question } = focus.mail;
    const shown = subject || de.today.mails.noSubject;
    if (deadline) return t.focusDeadline(senderName, shown);
    if (question) return t.focusQuestion(senderName, shown);
    return t.focusMail(senderName, shown);
  }
  if (focus.kind === 'event') {
    const { event } = focus;
    return focus.now
      ? t.focusNow(event.title, formatTime(event.end))
      : t.focusNext(event.title, formatTime(event.start), event.location);
  }
  return t.focusNone;
}

function scheduleSentence(facts: OverviewFacts, sources: SourceState): string {
  const schedule = facts.schedule;
  if (!schedule) return sources.calendarFailed ? t.scheduleUnknown : t.scheduleNotConnected;
  if (schedule.count === 0) {
    return schedule.allDay > 0 ? t.scheduleAllDayOnly(schedule.allDay) : t.scheduleFree;
  }
  if (schedule.remaining === 0) return t.scheduleDone(schedule.count);
  const span = t.scheduleSpan(
    schedule.count,
    formatTime(schedule.firstStart ?? ''),
    formatTime(schedule.lastEnd ?? ''),
  );
  const tight = schedule.tight[0];
  if (!tight) return `${span}${t.scheduleRelaxed}`;
  if (tight.gapMinutes < 0)
    return `${span}${t.scheduleOverlap(tight.before.title, tight.after.title)}`;
  return `${span}${t.scheduleTight(formatTime(tight.before.end), tight.before.title, tight.after.title)}`;
}

/** Inbox and task list in one sentence. */
function inboxSentence(facts: OverviewFacts, sources: SourceState): string {
  const { mails, tasks } = facts;
  const taskText = tasks.due > 0 ? t.tasks(tasks.due, tasks.overdue) : null;
  if (!mails) {
    if (sources.gmailFailed) return taskText ? t.mailsFailedAndTasks(taskText) : t.mailsUnknown;
    return taskText ? t.onlyTasks(taskText) : t.noTasks;
  }
  if (mails.total === 0) return taskText ? t.noMailsButTasks(taskText) : t.mailsNone;
  const mailText = `${t.mailsTotal(mails.total)}${
    mails.important > 0 ? t.mailsImportant(mails.important) : ''
  }`;
  if (taskText) return t.mailsAndTasks(mailText, taskText);
  return `${mailText}${mails.bulk > 0 ? t.mailsBulk(mails.bulk) : ''}.`;
}

/**
 * The rule-based overview: what matters most, where it gets tight, what waits in the inbox
 * and on the task list.
 */
export function overviewSentences(
  facts: OverviewFacts,
  sources: SourceState = { calendarFailed: false, gmailFailed: false },
): [string, string, string] {
  return [focusSentence(facts), scheduleSentence(facts, sources), inboxSentence(facts, sources)];
}
