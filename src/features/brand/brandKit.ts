/**
 * The brand kit as plain text (Markdown-like) to paste into Canva, Notion, a prompt …
 * and the AI requests of the brand area (only the parts each function needs).
 */
import { INTERVIEW } from '@/data/brand/interview';
import { FONT_STACKS } from '@/data/brand/design';
import { BRAND_COLOR_ROLES } from '@/data/domain';
import type { BrandProfileRequest, BrandWriteRequest } from '@/data/prompts/brand';
import type { BrandProfile } from '@/data/schemas';
import { de } from '@/i18n/de';

const k = de.brand.kit;

export function brandKitText(profile: BrandProfile): string {
  const list = (items: readonly string[]) => items.map((item) => `- ${item}`).join('\n');
  const parts: string[] = [`# ${k.title}`];
  if (profile.tone) parts.push(`## ${k.tone}\n${profile.tone}`);
  if (profile.values.length) parts.push(`## ${k.values}\n${list(profile.values)}`);
  if (profile.wordsUsed.length) parts.push(`## ${k.wordsUsed}\n${list(profile.wordsUsed)}`);
  if (profile.wordsAvoided.length) {
    parts.push(`## ${k.wordsAvoided}\n${list(profile.wordsAvoided)}`);
  }
  if (profile.examples.length) parts.push(`## ${k.examples}\n${list(profile.examples)}`);
  if (profile.design) {
    const design = profile.design;
    parts.push(
      `## ${k.colors}\n${BRAND_COLOR_ROLES.map(
        (role) => `- ${de.brand.design.roles[role]}: ${design.colors[role]}`,
      ).join('\n')}`,
    );
    parts.push(
      `## ${k.fonts}\n- ${k.heading}: ${FONT_STACKS[design.headingFont].name}\n- ${k.body}: ${FONT_STACKS[design.bodyFont].name}\n- ${k.radius}: ${de.brand.design.radii[design.radius]}`,
    );
  }
  return parts.join('\n\n');
}

export function brandProfileRequest(profile: BrandProfile): BrandProfileRequest {
  return {
    answers: INTERVIEW.flatMap((question) => {
      const answer = profile.answers[question.key]?.trim();
      return answer ? [{ frage: question.question, antwort: answer }] : [];
    }),
  };
}

export function brandWriteRequest(
  profile: BrandProfile | undefined,
  brief: Omit<BrandWriteRequest, 'profile'>,
): BrandWriteRequest {
  const answers = profile?.answers ?? {};
  return {
    ...brief,
    profile: {
      ...(answers.who ? { wer: answers.who } : {}),
      ...(answers.audience ? { zielgruppe: answers.audience } : {}),
      ...(answers.promise ? { versprechen: answers.promise } : {}),
      ...(answers.different ? { anders: answers.different } : {}),
      ...(profile?.tone ? { tonalitaet: profile.tone } : {}),
      werte: profile?.values ?? [],
      woerter_nutzen: profile?.wordsUsed ?? [],
      woerter_nie: profile?.wordsAvoided ?? [],
      beispielsaetze: profile?.examples ?? [],
    },
  };
}
