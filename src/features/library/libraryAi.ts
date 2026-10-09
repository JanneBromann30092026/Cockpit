/**
 * What a library question to Claude contains: title, type, author, date, topics and key
 * points – never my thoughts or links. Entries are referenced as "b1", "b2" …
 */
import type { LibraryQuestionRequest, QuestionEntry } from '@/data/prompts/library';
import type { LibraryEntry } from '@/data/schemas';
import { de } from '@/i18n/de';

/** At most this many entries are sent (the newest; a big library stays affordable). */
export const MAX_QUESTION_ENTRIES = 150;

export function libraryQuestionRequest(
  question: string,
  entries: readonly LibraryEntry[],
): { request: LibraryQuestionRequest; byRef: Map<string, LibraryEntry> } {
  const byRef = new Map<string, LibraryEntry>();
  const sent = entries.slice(0, MAX_QUESTION_ENTRIES).map((entry, index): QuestionEntry => {
    const ref = `b${index + 1}`;
    byRef.set(ref, entry);
    return {
      ref,
      titel: entry.title,
      typ: de.library.types[entry.type],
      ...(entry.author ? { autor: entry.author } : {}),
      ...(entry.consumedAt ? { datum: entry.consumedAt } : {}),
      themen: entry.topics,
      kernaussagen: entry.keyPoints.map((point) => point.text),
    };
  });
  return { request: { question: question.trim(), entries: sent }, byRef };
}
