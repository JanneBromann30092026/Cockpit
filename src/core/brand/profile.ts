/**
 * The brand profile without AI: the interview answers become profile parts by rules
 * (lists split, sentences cut, look → palette and fonts). Nothing is invented – empty
 * answers leave empty parts.
 */

export type AnswerKey =
  | 'who'
  | 'audience'
  | 'promise'
  | 'different'
  | 'values'
  | 'tone'
  | 'wordsUsed'
  | 'wordsAvoided'
  | 'examples'
  | 'look';

export type Answers = Partial<Record<AnswerKey, string>>;

/** "Ehrlichkeit, Neugier; Leichtigkeit" or one per line → clean list (no duplicates). */
export function splitList(text: string | undefined, max = 20): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of text.split(/[,;\n•]|\s+und\s+/u)) {
    const item = raw
      .replace(/^[\s\-*–"„“'»«]+|[\s."“”'»«]+$/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
    const key = item.toLocaleLowerCase('de');
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

/** Sentences of a text (for the example sentences), at most `max`. */
export function sentences(text: string | undefined, max = 3): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.replace(/[^\p{L}]/gu, '').length >= 3)
    .slice(0, max);
}

const LOOK_WORDS: [RegExp, string][] = [
  [/\b(schwarz[\s-]?wei(ss|ß)|minimal|monochrom)/i, 'mono'],
  [/\b(dunkel|nacht|schwarz|dark)/i, 'night'],
  [/\b(gr(ü|ue)n|natur|wald|oliv)/i, 'forest'],
  [/\b(lila|violett|lavendel|pink|rosa)/i, 'lavender'],
  [/\b(rot|orange|koralle|warm|terrakotta)/i, 'coral'],
  [/\b(beige|sand|braun|erd|natürlich|creme)/i, 'sand'],
  [/\b(blau|kobalt|navy|klar|modern|seri(ö|oe)s)/i, 'cobalt'],
];

/** A palette preset for the described look ("dunkelblau, ruhig" → cobalt). */
export function presetForLook(look: string | undefined): string {
  if (!look) return 'cobalt';
  // "dunkelblau" is blue, not night.
  if (/dunkelblau|navy/i.test(look)) return 'cobalt';
  return LOOK_WORDS.find(([pattern]) => pattern.test(look))?.[1] ?? 'cobalt';
}

/** Heading and body font from the tone and look (rules, no taste claims). */
export function fontsForTone(text: string | undefined): { heading: string; body: string } {
  const words = text ?? '';
  if (/elegant|edel|klassisch|seri(ö|oe)s|ruhig|zeitlos|literar/i.test(words)) {
    return { heading: 'didot', body: 'charter' };
  }
  if (/verspielt|witzig|bunt|kreativ|jung/i.test(words)) {
    return { heading: 'futura', body: 'avenir' };
  }
  if (/technisch|nerd|code|präzise|praezise/i.test(words)) {
    return { heading: 'helvetica', body: 'inter' };
  }
  return { heading: 'avenir', body: 'inter' };
}

export interface RuleProfile {
  tone?: string;
  values: string[];
  wordsUsed: string[];
  wordsAvoided: string[];
  examples: string[];
  preset: string;
  headingFont: string;
  bodyFont: string;
}

export function profileFromAnswers(answers: Answers): RuleProfile {
  const tone = answers.tone?.trim() || undefined;
  const fonts = fontsForTone(`${answers.tone ?? ''} ${answers.look ?? ''}`);
  return {
    ...(tone ? { tone } : {}),
    values: splitList(answers.values, 8),
    wordsUsed: splitList(answers.wordsUsed),
    wordsAvoided: splitList(answers.wordsAvoided),
    examples: sentences(answers.examples, 3),
    preset: presetForLook(answers.look),
    headingFont: fonts.heading,
    bodyFont: fonts.body,
  };
}

/** Words from "nie benutzen" that a text contains (whole words, any case). */
export function avoidedWordsIn(text: string, avoided: readonly string[]): string[] {
  const lower = text.toLocaleLowerCase('de');
  return avoided.filter((word) => {
    const needle = word.toLocaleLowerCase('de').trim();
    if (!needle) return false;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\d])${escaped}($|[^\\p{L}\\d])`, 'u').test(lower);
  });
}
