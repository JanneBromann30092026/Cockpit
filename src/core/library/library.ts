/**
 * Life library: order, topics, search and statistics. Works on the decrypted entries in
 * memory (nothing is searchable in the database – CLAUDE.md).
 */

/** Fields of a library entry the logic needs (LibraryEntry fits). */
export interface LibraryItem {
  id: string;
  title: string;
  type: string;
  author?: string;
  link?: string;
  /** "JJJJ-MM-TT". */
  consumedAt?: string;
  topics: readonly string[];
  keyPoints: readonly { text: string; byClaude: boolean }[];
  thoughts?: string;
  createdAt: string;
}

// --- Words --------------------------------------------------------------------------

/** Lower case without accents: "Gewöhnung" → "gewohnung" (umlauts typed as ö or o match). */
export function fold(text: string): string {
  return text.toLocaleLowerCase('de').replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');
}

export function words(text: string): string[] {
  return fold(text).match(/[\p{L}\d]+/gu) ?? [];
}

/** Rough German stem: long words lose up to three letters ("Gewohnheiten" → "gewohnhei"). */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, Math.max(5, word.length - 3)) : word;
}

/** A word of the text matches a searched term (same stem, or the term typed so far). */
export function wordMatches(word: string, term: string, prefix = false): boolean {
  if (prefix && word.startsWith(term)) return true;
  if (word === term) return true;
  if (term.length < 4 || word.length < 4) return false;
  return word.startsWith(stem(term)) || term.startsWith(stem(word));
}

// --- Topics -------------------------------------------------------------------------

export function normalizeTopic(topic: string): string {
  return topic
    .replace(/^#+/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
}

/** Topics without empty ones and without duplicates (ignoring case; first spelling wins). */
export function cleanTopics(topics: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of topics) {
    const topic = normalizeTopic(raw);
    const key = fold(topic);
    if (!topic || seen.has(key)) continue;
    seen.add(key);
    result.push(topic);
  }
  return result;
}

export interface TopicCount {
  topic: string;
  count: number;
}

/** All topics with the number of entries, most used first. */
export function topicCounts(entries: readonly LibraryItem[]): TopicCount[] {
  const counts = new Map<string, TopicCount>();
  for (const entry of entries) {
    for (const topic of cleanTopics(entry.topics)) {
      const key = fold(topic);
      const current = counts.get(key);
      if (!current) {
        counts.set(key, { topic, count: 1 });
        continue;
      }
      current.count += 1;
      // "Produktivität" reads better than "produktivität".
      if (/^\p{Ll}/u.test(current.topic) && /^\p{Lu}/u.test(topic)) current.topic = topic;
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.topic.localeCompare(b.topic, 'de'),
  );
}

export function hasTopic(entry: LibraryItem, topic: string): boolean {
  const key = fold(normalizeTopic(topic));
  return entry.topics.some((candidate) => fold(normalizeTopic(candidate)) === key);
}

// --- Order and statistics -----------------------------------------------------------

/** Newest first: by "konsumiert am", entries without date after them by creation. */
export function compareEntries(a: LibraryItem, b: LibraryItem): number {
  if (a.consumedAt && b.consumedAt && a.consumedAt !== b.consumedAt) {
    return a.consumedAt < b.consumedAt ? 1 : -1;
  }
  if (a.consumedAt && !b.consumedAt) return -1;
  if (!a.consumedAt && b.consumedAt) return 1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function sortEntries<T extends LibraryItem>(entries: readonly T[]): T[] {
  return [...entries].sort(compareEntries);
}

export interface LibraryStats {
  total: number;
  /** Consumed in the year of `today`. */
  thisYear: number;
  byType: Record<string, number>;
}

export function libraryStats(entries: readonly LibraryItem[], today: string): LibraryStats {
  const year = today.slice(0, 4);
  const byType: Record<string, number> = {};
  for (const entry of entries) byType[entry.type] = (byType[entry.type] ?? 0) + 1;
  return {
    total: entries.length,
    thisYear: entries.filter((entry) => entry.consumedAt?.startsWith(year)).length,
    byType,
  };
}

// --- Search -------------------------------------------------------------------------

/** Words that carry no meaning in a search or question. */
export const STOPWORDS = new Set(
  [
    'der die das den dem des ein eine einer einem einen und oder aber mit von vom zu zum zur',
    'im in am an auf aus bei fur uber unter um als wie was wer wo wann warum welche welcher',
    'welches habe hab hast hat haben ich mir mich mein meine meinen meiner du dir dein es',
    'ist sind war waren gelernt lernen gelesen gehort gesehen weiss kenne kann konnte thema',
    'themen etwas alles dazu daruber bisher schon mal noch nur auch so sich the a an of to',
  ]
    .join(' ')
    .split(' '),
);

/** Search terms of a query: meaningful words (umlauts folded). */
export function searchTerms(query: string): string[] {
  return [...new Set(words(query).filter((word) => !STOPWORDS.has(word) && word.length >= 2))];
}

const FIELD_WEIGHTS = { title: 5, topics: 4, author: 3, keyPoints: 2, thoughts: 1 } as const;
type Field = keyof typeof FIELD_WEIGHTS;

function fieldWords(entry: LibraryItem): Record<Field, string[]> {
  return {
    title: words(entry.title),
    topics: entry.topics.flatMap(words),
    author: words(entry.author ?? ''),
    keyPoints: entry.keyPoints.flatMap((point) => words(point.text)),
    thoughts: words(entry.thoughts ?? ''),
  };
}

/** Score of one term in an entry (0 = not found). */
function termScore(fields: Record<Field, string[]>, term: string, prefix: boolean): number {
  let score = 0;
  for (const field of Object.keys(FIELD_WEIGHTS) as Field[]) {
    if (fields[field].some((word) => wordMatches(word, term, prefix))) {
      score = Math.max(score, FIELD_WEIGHTS[field]);
    }
  }
  return score;
}

export interface SearchFilter {
  type?: string | null;
  topic?: string | null;
}

/**
 * Entries matching every search term (typed words match as prefix: "prod" finds
 * "Produktivität"), best matches first; without a query newest first.
 */
export function searchEntries<T extends LibraryItem>(
  entries: readonly T[],
  query: string,
  filter: SearchFilter = {},
): T[] {
  const filtered = entries.filter(
    (entry) =>
      (!filter.type || entry.type === filter.type) &&
      (!filter.topic || hasTopic(entry, filter.topic)),
  );
  const terms = searchTerms(query);
  if (terms.length === 0) return sortEntries(filtered);
  return filtered
    .map((entry) => {
      const fields = fieldWords(entry);
      const scores = terms.map((term) => termScore(fields, term, true));
      return {
        entry,
        score: scores.every((score) => score > 0) ? scores.reduce((a, b) => a + b) : 0,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || compareEntries(a.entry, b.entry))
    .map((result) => result.entry);
}

/** Same title (ignoring case, accents and punctuation) – for "schon vorhanden". */
export function sameTitle(a: string, b: string): boolean {
  return words(a).join(' ') === words(b).join(' ');
}
