/**
 * Contract deadlines as calendar entries: only the contract name and the kind of deadline
 * (no amounts, no numbers), reminders a week and a day before.
 */
import type { IcsEvent } from '../calendar/ics';
import type { ContractInfo, Deadline, DeadlineKind } from './contracts';

export interface CalendarLabels {
  summary: Readonly<Record<DeadlineKind, (name: string) => string>>;
  description: string;
}

/** 9:00 one week before and 9:00 the day before (all-day events start at 00:00). */
export const DEADLINE_ALARMS_HOURS = [6 * 24 + 15, 15] as const;

/** Cancel dates and term ends – payments would flood the calendar. */
export function deadlineEvents(
  deadlines: readonly Deadline<ContractInfo>[],
  labels: CalendarLabels,
): IcsEvent[] {
  return deadlines
    .filter((deadline) => deadline.kind !== 'payment')
    .map((deadline) => ({
      uid: `${deadline.contract.id}-${deadline.kind}`,
      date: deadline.date,
      summary: labels.summary[deadline.kind](deadline.contract.name),
      description: labels.description,
      alarmsHoursBefore: DEADLINE_ALARMS_HOURS,
    }));
}
