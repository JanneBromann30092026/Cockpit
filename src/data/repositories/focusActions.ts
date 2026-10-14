/**
 * The focus profile: one encrypted record with the activities to plan (name, hours a week,
 * block length, part of the day) and when blocks may go into the calendar.
 */
import type { FocusWish } from '@/core/commands/parse';
import { DEFAULT_FOCUS_SETTINGS, type FocusSettings } from '@/core/focus/plan';
import type { FocusActivityRecord, FocusProfile } from '../schemas';
import { LIMITS } from '../schemas';
import { useDataStore } from '../store';
import { focusRepo } from './records';

export type FocusPatch = Partial<Pick<FocusProfile, 'activities' | keyof FocusSettings>>;

/** The profile (the newest, should there ever be two). */
export function currentFocus(state = useDataStore.getState().focus): FocusProfile | undefined {
  return Object.values(state).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
}

/** A new activity with the usual values (1,5-hour blocks, three hours a week). */
export function newActivity(name: string, wish: Omit<FocusWish, 'name'> = {}): FocusActivityRecord {
  return {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, LIMITS.name),
    minutesPerWeek: Math.round(Math.min(Math.max(wish.minutesPerWeek ?? 180, 15), 40 * 60)),
    blockMinutes: Math.min(Math.max(wish.blockMinutes ?? 90, 30), 240),
    dayPart: wish.dayPart ?? 'any',
  };
}

async function ensure(): Promise<FocusProfile> {
  return currentFocus() ?? focusRepo.create({ ...DEFAULT_FOCUS_SETTINGS });
}

export const focusActions = {
  async save(patch: FocusPatch): Promise<FocusProfile> {
    const profile = await ensure();
    return focusRepo.update(profile.id, patch);
  },

  /**
   * Adds spoken wishes ("Zeit fürs Nacharbeiten"); an activity with the same name keeps its
   * place and only takes over hours or part of the day that were said explicitly.
   */
  async addWishes(wishes: readonly FocusWish[]): Promise<FocusProfile> {
    const profile = await ensure();
    const activities = [...profile.activities];
    for (const wish of wishes) {
      const index = activities.findIndex(
        (activity) => activity.name.toLowerCase() === wish.name.trim().toLowerCase(),
      );
      if (index === -1) {
        if (activities.length < LIMITS.items) activities.push(newActivity(wish.name, wish));
        continue;
      }
      const current = activities[index]!;
      activities[index] = {
        ...current,
        ...(wish.dayPart ? { dayPart: wish.dayPart } : {}),
      };
    }
    return focusRepo.update(profile.id, { activities });
  },
};
