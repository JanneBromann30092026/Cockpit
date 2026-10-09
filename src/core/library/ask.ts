/**
 * "Was habe ich zu Thema X gelernt?" without AI: the question's meaningful words are
 * matched against topics, titles, key points and my thoughts; the answer lists the key
 * points of the matching entries – each with its entry as source. Nothing is phrased
 * anew, everything is quoted from the stored entries.
 */
import {
  compareEntries,
  searchTerms,
  topicCounts,
  wordMatches,
  words,
  type LibraryItem,
} from './library';

/** Most entries an answer lists (the best matches). */
export const MAX_ANSWER_ENTRIES = 8;
/** Key points quoted per entry. */
export const MAX_POINTS_PER_ENTRY = 4;

export interface LibraryAnswerItem<E extends LibraryItem = LibraryItem> {
  entry: E;
  /** Key points that mention the topic – or all of them when the entry matched otherwise. */
  points: E['keyPoints'][number][];
  /** My thoughts on it, when they mention the topic. */
  thoughts?: string;
  /** Where it matched (for the source line). */
  matchedIn: ('topic' | 'title' | 'keyPoints' | 'thoughts' | 'author')[];
}

export interface LibraryAnswer<E extends LibraryItem = LibraryItem> {
  /** The words the answer looked for (empty: the question had none). */
  terms: string[];
  items: LibraryAnswerItem<E>[];
  /** Matching entries beyond the listed ones. */
  more: number;
}

function matchesAny(text: string, terms: readonly string[]): boolean {
  const textWords = words(text);
  return terms.some((term) => textWords.some((word) => wordMatches(word, term)));
}

const WEIGHTS = { topic: 6, title: 4, keyPoints: 3, author: 2, thoughts: 1 } as const;

export function answerLibraryQuestion<E extends LibraryItem>(
  question: string,
  entries: readonly E[],
): LibraryAnswer<E> {
  const terms = searchTerms(question);
  if (terms.length === 0) return { terms, items: [], more: 0 };
  const scored = entries
    .map((entry) => {
      const matchedIn: LibraryAnswerItem['matchedIn'] = [];
      if (entry.topics.some((topic) => matchesAny(topic, terms))) matchedIn.push('topic');
      if (matchesAny(entry.title, terms)) matchedIn.push('title');
      const points = entry.keyPoints.filter((point) => matchesAny(point.text, terms));
      if (points.length > 0) matchedIn.push('keyPoints');
      if (entry.author && matchesAny(entry.author, terms)) matchedIn.push('author');
      const thoughts =
        entry.thoughts && matchesAny(entry.thoughts, terms) ? entry.thoughts : undefined;
      if (thoughts) matchedIn.push('thoughts');
      const score =
        matchedIn.reduce((sum, field) => sum + WEIGHTS[field], 0) + Math.min(points.length, 3);
      return {
        score,
        item: {
          entry,
          // Points about the topic; when only title or topic matched, the whole entry is about it.
          points: (points.length > 0 ? points : entry.keyPoints).slice(0, MAX_POINTS_PER_ENTRY),
          thoughts,
          matchedIn,
        } satisfies LibraryAnswerItem<E>,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || compareEntries(a.item.entry, b.item.entry));
  return {
    terms,
    items: scored.slice(0, MAX_ANSWER_ENTRIES).map((result) => result.item),
    more: Math.max(0, scored.length - MAX_ANSWER_ENTRIES),
  };
}

/** Example questions from the most used topics. */
export function exampleTopics(entries: readonly LibraryItem[], count = 3): string[] {
  return topicCounts(entries)
    .slice(0, count)
    .map((topic) => topic.topic);
}
