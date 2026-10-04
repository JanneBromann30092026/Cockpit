/**
 * Spoken review text → points: split into sentences and pre-sort each one into "Was gut
 * lief", "Was nicht gut lief" or "Besser machen" by German signal words. Only a proposal:
 * the user can move every sentence before it is taken over. Unclear sentences go to the
 * note.
 */

export type DictationSection = 'wentWell' | 'notWell' | 'improve' | 'note';

/** Spoken filler that is not a point on its own. */
const FILLER = new Set([
  'äh',
  'ähm',
  'öhm',
  'hm',
  'hmm',
  'also',
  'ja',
  'ok',
  'okay',
  'so',
  'genau',
]);

function isFiller(sentence: string): boolean {
  const words = sentence.toLocaleLowerCase('de').match(/[\p{L}\d]+/gu) ?? [];
  return words.every((word) => FILLER.has(word));
}

/** Splits on sentence ends, line breaks and "und dann"; filler and tiny pieces are dropped. */
export function splitSentences(text: string, maxLength = 500): string[] {
  return text
    .replace(/\s+und dann\s+/giu, '. ')
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((sentence) =>
      sentence
        .replace(/\s+/g, ' ')
        .replace(/[.…]+$/u, '')
        .trim(),
    )
    .filter((sentence) => sentence.replace(/[^\p{L}\d]/gu, '').length >= 3 && !isFiller(sentence))
    .map((sentence) => {
      const capitalised = sentence.charAt(0).toLocaleUpperCase('de') + sentence.slice(1);
      return capitalised.slice(0, maxLength).trim();
    });
}

const IMPROVE = [
  'morgen',
  'nächstes mal',
  'beim nächsten mal',
  'künftig',
  'in zukunft',
  'ab jetzt',
  'ich will',
  'ich möchte',
  'ich sollte',
  'ich muss',
  'besser',
  'vornehmen',
  'nehme mir vor',
  'werde ich',
];

const NOT_WELL = [
  'nicht',
  'kein',
  'keine',
  'schlecht',
  'zu spät',
  'verpasst',
  'vergessen',
  'stress',
  'gestresst',
  'müde',
  'abgelenkt',
  'genervt',
  'nervig',
  'ärger',
  'problem',
  'leider',
  'schwierig',
  'zu viel',
  'zu lange',
  'überzogen',
  'aufgeschoben',
  'liegen gelassen',
  'verschlafen',
  'krank',
];

const WENT_WELL = [
  'gut',
  'super',
  'toll',
  'geschafft',
  'erledigt',
  'fertig',
  'endlich',
  'gelungen',
  'gefreut',
  'schön',
  'stolz',
  'produktiv',
  'erfolgreich',
  'geklappt',
  'spaß',
];

/** Endings a single signal word may have ("gute", "keinen", "erledigte"). */
const MAX_ENDING = 2;

function contains(sentence: string, phrases: readonly string[]): boolean {
  const words = sentence.toLocaleLowerCase('de').match(/[\p{L}\d]+/gu) ?? [];
  const text = ` ${words.join(' ')} `;
  return phrases.some((phrase) =>
    phrase.includes(' ')
      ? text.includes(` ${phrase} `)
      : words.some((word) => word.startsWith(phrase) && word.length - phrase.length <= MAX_ENDING),
  );
}

/**
 * The section a sentence most likely belongs to. Plans for tomorrow win ("Morgen will ich
 * früher anfangen"), then problems ("nicht gut" is a problem), then what went well.
 */
export function sortSentence(sentence: string): DictationSection {
  if (contains(sentence, IMPROVE)) return 'improve';
  if (contains(sentence, NOT_WELL)) return 'notWell';
  if (contains(sentence, WENT_WELL)) return 'wentWell';
  return 'note';
}

export interface SortedSentence {
  text: string;
  section: DictationSection;
}

export function sortDictation(text: string): SortedSentence[] {
  return splitSentences(text).map((sentence) => ({
    text: sentence,
    section: sortSentence(sentence),
  }));
}
