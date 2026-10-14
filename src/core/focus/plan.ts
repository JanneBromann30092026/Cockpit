/**
 * Focus blocks: finds free time between calendar events and spreads the wanted activities
 * (e.g. "Uni nacharbeiten" 3 h a week) over the next days. Pure logic in local time.
 */

export const DAY_PARTS = ['any', 'morning', 'afternoon', 'evening'] as const;
export type DayPart = (typeof DAY_PARTS)[number];

/** Preferred hours [from, to) of a part of the day. */
const DAY_PART_HOURS: Record<Exclude<DayPart, 'any'>, [number, number]> = {
  morning: [6, 12],
  afternoon: [12, 17],
  evening: [17, 24],
};

export interface FocusActivity {
  id: string;
  name: string;
  /** Wanted time in the planning period (the next seven days). */
  minutesPerWeek: number;
  blockMinutes: number;
  dayPart: DayPart;
}

export interface FocusSettings {
  /** "HH:MM" – no blocks before … */
  dayStart: string;
  /** … and none after. */
  dayEnd: string;
  /** Days with blocks, 0 = Monday … 6 = Sunday. */
  weekdays: number[];
  /** Free time kept before and after every event and block. */
  bufferMinutes: number;
  /** At most this much focus time a day. */
  maxMinutesPerDay: number;
}

export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  dayStart: '08:00',
  dayEnd: '20:00',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  bufferMinutes: 15,
  maxMinutesPerDay: 240,
};

/** Blocks shorter than this are not worth planning. */
export const MIN_BLOCK_MINUTES = 30;
/** Blocks start on a quarter hour. */
const STEP_MS = 15 * 60_000;
const MINUTE = 60_000;

export interface Interval {
  start: number;
  end: number;
}

/** A focus block already in the calendar (made by Cockpit before). */
export interface ExistingBlock extends Interval {
  /** Activity name as written into the event; matched case-insensitively. */
  activity: string;
}

export interface PlannedBlock extends Interval {
  activityId: string;
}

export interface FocusPlan {
  blocks: PlannedBlock[];
  /** Minutes per activity that found no free time. */
  missing: { activityId: string; minutes: number }[];
  /** Minutes per activity already covered by existing blocks. */
  existing: { activityId: string; minutes: number }[];
}

export interface PlanInput {
  now: Date;
  /** Days to plan, starting today. */
  days: number;
  activities: readonly FocusActivity[];
  settings: FocusSettings;
  /** Timed events of all shown calendars (all-day events and free-time events left out). */
  busy: readonly Interval[];
  existing?: readonly ExistingBlock[];
}

function minutesOf(time: string): number {
  const [h = 0, m = 0] = time.split(':').map(Number);
  return h * 60 + m;
}

function atMinutes(day: Date, minutes: number): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes).getTime();
}

function weekdayOf(day: Date): number {
  return (day.getDay() + 6) % 7;
}

function ceilToStep(ms: number): number {
  return Math.ceil(ms / STEP_MS) * STEP_MS;
}

/** Removes `cut` from every interval. */
function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const result: Interval[] = [];
  for (const interval of intervals) {
    if (cut.end <= interval.start || cut.start >= interval.end) {
      result.push(interval);
      continue;
    }
    if (cut.start > interval.start) result.push({ start: interval.start, end: cut.start });
    if (cut.end < interval.end) result.push({ start: cut.end, end: interval.end });
  }
  return result;
}

interface Day {
  key: number;
  date: Date;
  free: Interval[];
  focusMinutes: number;
  activities: Map<string, number>;
}

/** Per planned day: the day window without events (plus buffer) and past time. */
function buildDays({ now, days, settings, busy, existing = [] }: Omit<PlanInput, 'activities'>) {
  const buffer = settings.bufferMinutes * MINUTE;
  const start = minutesOf(settings.dayStart);
  const end = minutesOf(settings.dayEnd);
  const blocked = [...busy, ...existing].map((interval) => ({
    start: interval.start - buffer,
    end: interval.end + buffer,
  }));
  const result: Day[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    if (!settings.weekdays.includes(weekdayOf(date))) continue;
    const from = Math.max(atMinutes(date, start), ceilToStep(now.getTime()));
    const to = atMinutes(date, end);
    let free: Interval[] = from < to ? [{ start: from, end: to }] : [];
    for (const cut of blocked) free = subtract(free, cut);
    const focusMinutes = existing
      .filter((block) => block.start >= atMinutes(date, 0) && block.start < atMinutes(date, 1440))
      .reduce((sum, block) => sum + (block.end - block.start) / MINUTE, 0);
    result.push({ key: offset, date, free, focusMinutes, activities: new Map() });
  }
  return result;
}

/** Earliest quarter-hour start for a block of `length` in the day (in the part if given). */
function findStart(day: Day, length: number, part: DayPart): number | null {
  const window =
    part === 'any'
      ? null
      : {
          start: atMinutes(day.date, DAY_PART_HOURS[part][0] * 60),
          end: atMinutes(day.date, DAY_PART_HOURS[part][1] * 60),
        };
  for (const interval of day.free) {
    const from = ceilToStep(Math.max(interval.start, window?.start ?? interval.start));
    const latestEnd = Math.min(interval.end, window ? window.end : interval.end);
    if (from + length <= latestEnd) return from;
  }
  return null;
}

/**
 * Spreads the activities over the free time: one activity at a time in turns (the one with
 * the most time left first), each block on the day with the least focus time so far and –
 * where possible – no second block of the same activity that day. Preferred parts of the
 * day are tried first, then any free time. Existing Cockpit blocks count as done.
 */
export function planFocusBlocks(input: PlanInput): FocusPlan {
  const { activities, settings } = input;
  const days = buildDays(input);
  const buffer = settings.bufferMinutes * MINUTE;
  const existing = input.existing ?? [];
  const covered = new Map<string, number>();
  for (const activity of activities) {
    const minutes = existing
      .filter((block) => block.activity.trim().toLowerCase() === activity.name.trim().toLowerCase())
      .reduce((sum, block) => sum + (block.end - block.start) / MINUTE, 0);
    covered.set(activity.id, minutes);
  }
  const remaining = new Map(
    activities.map((activity) => [
      activity.id,
      Math.max(0, activity.minutesPerWeek - (covered.get(activity.id) ?? 0)),
    ]),
  );
  const blocks: PlannedBlock[] = [];
  const stuck = new Set<string>();

  const place = (activity: FocusActivity): boolean => {
    const left = remaining.get(activity.id) ?? 0;
    const wanted = Math.min(activity.blockMinutes, left);
    // A short rest (e.g. 20 of 90 minutes) is rounded up to a sensible block.
    const length = Math.max(MIN_BLOCK_MINUTES, Math.ceil(wanted / 15) * 15) * MINUTE;
    const ordered = [...days].sort(
      (a, b) =>
        (a.activities.get(activity.id) ?? 0) - (b.activities.get(activity.id) ?? 0) ||
        a.focusMinutes - b.focusMinutes ||
        a.key - b.key,
    );
    const parts: DayPart[] = activity.dayPart === 'any' ? ['any'] : [activity.dayPart, 'any'];
    for (const part of parts) {
      for (const day of ordered) {
        if (day.focusMinutes + length / MINUTE > settings.maxMinutesPerDay) continue;
        const start = findStart(day, length, part);
        if (start === null) continue;
        const block = { activityId: activity.id, start, end: start + length };
        blocks.push(block);
        day.free = subtract(day.free, { start: start - buffer, end: block.end + buffer });
        day.focusMinutes += length / MINUTE;
        day.activities.set(activity.id, (day.activities.get(activity.id) ?? 0) + 1);
        remaining.set(activity.id, Math.max(0, left - length / MINUTE));
        return true;
      }
    }
    return false;
  };

  for (;;) {
    const open = activities
      .filter((activity) => (remaining.get(activity.id) ?? 0) > 0 && !stuck.has(activity.id))
      .sort((a, b) => (remaining.get(b.id) ?? 0) - (remaining.get(a.id) ?? 0));
    if (open.length === 0) break;
    for (const activity of open) {
      if (!place(activity)) stuck.add(activity.id);
    }
  }

  blocks.sort((a, b) => a.start - b.start);
  return {
    blocks,
    missing: activities
      .map((activity) => ({ activityId: activity.id, minutes: remaining.get(activity.id) ?? 0 }))
      .filter((entry) => entry.minutes > 0),
    existing: activities
      .map((activity) => ({ activityId: activity.id, minutes: covered.get(activity.id) ?? 0 }))
      .filter((entry) => entry.minutes > 0),
  };
}

/** Total planned minutes per activity. */
export function plannedMinutes(blocks: readonly PlannedBlock[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const block of blocks) {
    totals.set(
      block.activityId,
      (totals.get(block.activityId) ?? 0) + (block.end - block.start) / MINUTE,
    );
  }
  return totals;
}
