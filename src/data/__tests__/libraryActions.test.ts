import { beforeEach, describe, expect, it } from 'vitest';
import { demoLibraryInputs } from '@/data/demo/library';
import { demoActions, libraryActions } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { vault } from '@/services/vault';
import { rawDump, resetDb } from './testDb';

const PASSWORD = 'Cockpit-Test-2026!';

beforeEach(async () => {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup(PASSWORD);
  vault.finishOpening();
});

const entries = () => Object.values(useDataStore.getState().library);

describe('library', () => {
  it('stores entries encrypted, cleans topics, marks key points by Claude', async () => {
    const entry = await libraryActions.create({
      title: 'Atomic Habits',
      type: 'book',
      author: 'James Clear',
      topics: ['#Gewohnheiten', 'gewohnheiten', ' Fokus '],
      keyPoints: [
        { text: 'Kleine Schritte summieren sich.', byClaude: false },
        { text: 'Systeme schlagen Ziele.', byClaude: true },
      ],
      thoughts: 'Geheimer Gedanke',
    });
    expect(entry.topics).toEqual(['Gewohnheiten', 'Fokus']);
    expect(entry.keyPoints[1]).toEqual({ text: 'Systeme schlagen Ziele.', byClaude: true });
    const dump = await rawDump();
    expect(dump).not.toContain('Atomic');
    expect(dump).not.toContain('Geheimer Gedanke');
    const edited = await libraryActions.edit(entry.id, { thoughts: undefined, topics: [] });
    expect(edited.thoughts).toBeUndefined();
    expect(edited.topics).toEqual([]);
  });

  it('rejects an invalid link', async () => {
    await expect(
      libraryActions.create({ title: 'X', type: 'article', link: 'kein link' }),
    ).rejects.toThrow();
  });

  it('adds a whole list in one go and deletes with undo', async () => {
    const created = await libraryActions.createMany([
      { title: 'Deep Work', type: 'book' },
      { title: 'Hard Fork', type: 'podcast', topics: ['KI'] },
    ]);
    expect(created).toHaveLength(2);
    expect(entries()).toHaveLength(2);
    const removed = await libraryActions.remove(created[0]!.id);
    expect(entries()).toHaveLength(1);
    await libraryActions.restore(removed);
    expect(
      entries()
        .map((entry) => entry.id)
        .sort(),
    ).toEqual(created.map((e) => e.id).sort());
  });

  it('demo entries are marked and removed with the other demo data', async () => {
    await libraryActions.create({ title: 'Mein eigenes Buch', type: 'book' });
    const count = await demoActions.createLibrary(demoLibraryInputs('2026-10-09'));
    expect(count).toBeGreaterThan(5);
    expect(entries().filter((entry) => entry.demo)).toHaveLength(count);
    await demoActions.removeAll();
    expect(entries().map((entry) => entry.title)).toEqual(['Mein eigenes Buch']);
  });
});
