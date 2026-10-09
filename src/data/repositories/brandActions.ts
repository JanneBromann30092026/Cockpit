/**
 * The brand profile: one encrypted record with the interview answers, the profile, the
 * design system and the saved texts of "Damit bauen".
 */
import { profileFromAnswers, type Answers } from '@/core/brand/profile';
import { PALETTE_PRESETS, type PalettePreset } from '../brand/design';
import type { BrandAiField, BrandDraftKind, BrandFont } from '../domain';
import { BRAND_FONTS } from '../domain';
import type { BrandDesign, BrandDraft, BrandProfile } from '../schemas';
import { LIMITS } from '../schemas';
import { useDataStore } from '../store';
import { brandRepo } from './records';

export type BrandPatch = Partial<
  Pick<BrandProfile, 'tone' | 'values' | 'wordsUsed' | 'wordsAvoided' | 'examples' | 'design'>
>;

/** The profile (the newest, should there ever be two). */
export function currentBrand(state = useDataStore.getState().brand): BrandProfile | undefined {
  return Object.values(state).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
}

function asFont(value: string): BrandFont {
  return (BRAND_FONTS as readonly string[]).includes(value) ? (value as BrandFont) : 'inter';
}

/** Design from the rules (palette preset for the look, fonts for the tone). */
export function ruleDesign(answers: Answers): BrandDesign {
  const rules = profileFromAnswers(answers);
  const preset = (rules.preset in PALETTE_PRESETS ? rules.preset : 'cobalt') as PalettePreset;
  return {
    colors: { ...PALETTE_PRESETS[preset].colors },
    headingFont: asFont(rules.headingFont),
    bodyFont: asFont(rules.bodyFont),
    radius: 'soft',
  };
}

async function ensure(): Promise<BrandProfile> {
  return currentBrand() ?? brandRepo.create({});
}

/** Parts changed by hand lose their "(Claude)" mark. */
function withoutAiMarks(profile: BrandProfile, patch: BrandPatch): BrandAiField[] {
  return profile.aiFields.filter(
    (field) => !(field in patch) || JSON.stringify(patch[field]) === JSON.stringify(profile[field]),
  );
}

export const brandActions = {
  async saveAnswer(key: string, text: string): Promise<BrandProfile> {
    const profile = await ensure();
    const answers = { ...profile.answers };
    if (text.trim()) answers[key] = text.trim().slice(0, LIMITS.text);
    else delete answers[key];
    return brandRepo.update(profile.id, { answers });
  },

  /**
   * Finishes the interview: empty profile parts are filled from the answers by rules
   * (parts already written – by hand or by Claude – stay).
   */
  async finishInterview(now: Date = new Date()): Promise<BrandProfile> {
    const profile = await ensure();
    const rules = profileFromAnswers(profile.answers);
    return brandRepo.update(profile.id, {
      interviewDoneAt: now.toISOString(),
      tone: profile.tone ?? rules.tone,
      values: profile.values.length > 0 ? profile.values : rules.values,
      wordsUsed: profile.wordsUsed.length > 0 ? profile.wordsUsed : rules.wordsUsed,
      wordsAvoided: profile.wordsAvoided.length > 0 ? profile.wordsAvoided : rules.wordsAvoided,
      examples: profile.examples.length > 0 ? profile.examples : rules.examples,
      design: profile.design ?? ruleDesign(profile.answers),
    });
  },

  async edit(patch: BrandPatch): Promise<BrandProfile> {
    const profile = await ensure();
    return brandRepo.update(profile.id, { ...patch, aiFields: withoutAiMarks(profile, patch) });
  },

  /** Takes over what Claude phrased; those parts are marked until edited. */
  async applyAi(patch: BrandPatch, fields: readonly BrandAiField[]): Promise<BrandProfile> {
    const profile = await ensure();
    return brandRepo.update(profile.id, {
      ...patch,
      aiFields: [...new Set([...profile.aiFields, ...fields])],
    });
  },

  async addDraft(draft: {
    kind: BrandDraftKind;
    topic: string;
    text: string;
    byClaude: boolean;
  }): Promise<BrandDraft> {
    const profile = await ensure();
    const created: BrandDraft = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...draft,
      topic: draft.topic.trim().slice(0, LIMITS.title),
    };
    // Newest first; the oldest drop out beyond the limit.
    await brandRepo.update(profile.id, {
      drafts: [created, ...profile.drafts].slice(0, LIMITS.drafts),
    });
    return created;
  },

  async removeDraft(id: string): Promise<void> {
    const profile = currentBrand();
    if (!profile) return;
    await brandRepo.update(profile.id, {
      drafts: profile.drafts.filter((draft) => draft.id !== id),
    });
  },

  /** Starts over: the whole profile is deleted. */
  async reset(): Promise<void> {
    const profile = currentBrand();
    if (profile) await brandRepo.remove(profile.id);
  },
};
