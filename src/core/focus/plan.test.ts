import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FOCUS_SETTINGS,
  planFocusBlocks,
  plannedMinutes,
  type FocusActivity,
  type Interval,
} from './plan';

// Monday, 12 Oct 2026, 07:00 local time.
const NOW = new Date(2026, 9, 12, 7, 0);
const at = (day: number, h: number) => new Date(2026, 9, 12 + day, 0, h * 60).getTime();
const span = (day: number, from: number, to: number): Interval => ({
  start: at(day, from),
  end: at(day, to),
});

const activity = (id: string, minutes: number, block = 90, extra: Partial<FocusActivity> = {}) => ({
  id,
  name: id,
  minutesPerWeek: minutes,
  blockMinutes: block,
  dayPart: 'any' as const,
  ...extra,
});

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

describe('focus blocks', () => {
  it('fills free time around events, keeps a buffer and spreads over the days', () => {
    // Uni every weekday 9–13, sport Tue/Thu 18–19:30.
    const busy = [0, 1, 2, 3, 4].flatMap((day) => [span(day, 9, 13)]);
    busy.push(span(1, 18, 19.5), span(3, 18, 19.5));
    const plan = planFocusBlocks({
      now: NOW,
      days: 7,
      activities: [activity('nach', 180), activity('vor', 180), activity('insta', 180, 60)],
      settings: DEFAULT_FOCUS_SETTINGS,
      busy,
    });
    expect(plan.missing).toEqual([]);
    const totals = plannedMinutes(plan.blocks);
    expect(totals.get('nach')).toBe(180);
    expect(totals.get('vor')).toBe(180);
    expect(totals.get('insta')).toBe(180);
    for (const block of plan.blocks) {
      for (const event of busy) {
        // 15 minutes buffer around every event.
        expect(
          overlaps(block, { start: event.start - 15 * 60_000, end: event.end + 15 * 60_000 }),
        ).toBe(false);
      }
      const start = new Date(block.start);
      expect(start.getHours() * 60 + start.getMinutes()).toBeGreaterThanOrEqual(8 * 60);
      expect(
        new Date(block.end).getHours() * 60 + new Date(block.end).getMinutes(),
      ).toBeLessThanOrEqual(20 * 60);
      expect(start.getMinutes() % 15).toBe(0);
    }
    // Blocks do not overlap each other.
    plan.blocks.forEach((a, i) =>
      plan.blocks.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
    );
    // Not everything on one day: the same activity at most once a day here.
    const days = new Set(
      plan.blocks.filter((b) => b.activityId === 'nach').map((b) => new Date(b.start).getDate()),
    );
    expect(days.size).toBe(2);
  });

  it('starts today not before now and honours the part of the day', () => {
    const now = new Date(2026, 9, 12, 14, 5);
    const plan = planFocusBlocks({
      now,
      days: 1,
      activities: [activity('abend', 60, 60, { dayPart: 'evening' })],
      settings: DEFAULT_FOCUS_SETTINGS,
      busy: [],
    });
    expect(plan.blocks).toHaveLength(1);
    expect(new Date(plan.blocks[0]!.start).getHours()).toBe(17);
    const early = planFocusBlocks({
      now,
      days: 1,
      activities: [activity('egal', 60, 60)],
      settings: DEFAULT_FOCUS_SETTINGS,
      busy: [],
    });
    expect(early.blocks[0]!.start).toBe(new Date(2026, 9, 12, 14, 15).getTime());
  });

  it('reports what does not fit and respects the daily maximum and weekdays', () => {
    const plan = planFocusBlocks({
      now: NOW,
      days: 7,
      activities: [activity('viel', 20 * 60, 120)],
      settings: { ...DEFAULT_FOCUS_SETTINGS, weekdays: [0, 1], maxMinutesPerDay: 240 },
      busy: [],
    });
    expect(plannedMinutes(plan.blocks).get('viel')).toBe(480);
    expect(plan.missing).toEqual([{ activityId: 'viel', minutes: 720 }]);
    for (const block of plan.blocks) expect([12, 13]).toContain(new Date(block.start).getDate());
  });

  it('counts existing Cockpit blocks as done and as busy', () => {
    const existing = [{ ...span(0, 14, 15.5), activity: 'Nach' }];
    const plan = planFocusBlocks({
      now: NOW,
      days: 7,
      activities: [{ ...activity('nach', 180), name: 'nach' }],
      settings: DEFAULT_FOCUS_SETTINGS,
      busy: [],
      existing,
    });
    expect(plan.existing).toEqual([{ activityId: 'nach', minutes: 90 }]);
    expect(plannedMinutes(plan.blocks).get('nach')).toBe(90);
    for (const block of plan.blocks) expect(overlaps(block, existing[0]!)).toBe(false);
  });
});
