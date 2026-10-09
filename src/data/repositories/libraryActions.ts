/**
 * Library actions on top of the generic repository: edit, delete with undo and adding a
 * whole list at once (one encrypted commit, so an import is all or nothing).
 */
import { cleanTopics } from '@/core/library/library';
import { nextTimestamp } from '@/core/time';
import type { LibraryEntry } from '../schemas';
import { libraryRepo } from './records';
import { requireRecord, validateRecord } from './recordsRepo';
import { commit } from './rows';

export type LibraryInput = Parameters<typeof libraryRepo.create>[0];
export type LibraryPatch = Partial<
  Pick<
    LibraryEntry,
    'title' | 'type' | 'author' | 'link' | 'consumedAt' | 'topics' | 'keyPoints' | 'thoughts'
  >
>;

function tidy<T extends { topics?: readonly string[] }>(input: T): T {
  return input.topics ? { ...input, topics: cleanTopics(input.topics) } : input;
}

export const libraryActions = {
  create(input: LibraryInput): Promise<LibraryEntry> {
    return libraryRepo.create(tidy(input));
  },

  /** Changes the editable fields; an empty optional field removes it. */
  edit(id: string, patch: LibraryPatch): Promise<LibraryEntry> {
    return libraryRepo.update(id, tidy(patch));
  },

  /** Adds many entries in one transaction ("Liste nachtragen"). */
  async createMany(inputs: readonly LibraryInput[]): Promise<LibraryEntry[]> {
    const now = nextTimestamp(undefined);
    const records = inputs.map((input) =>
      validateRecord('library', {
        ...tidy(input),
        demo: input.demo ?? false,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      }),
    );
    await commit(records.map((record) => ({ table: 'library' as const, record })));
    return records;
  },

  /** Deletes and returns the entry, so "Rückgängig" can bring it back. */
  async remove(id: string): Promise<LibraryEntry> {
    const entry = requireRecord('library', id);
    await libraryRepo.remove(id);
    return entry;
  },

  async restore(entry: LibraryEntry): Promise<LibraryEntry> {
    const record = validateRecord('library', {
      ...entry,
      updatedAt: nextTimestamp(entry.updatedAt),
    });
    await commit([{ table: 'library', record }]);
    return record;
  },
};
