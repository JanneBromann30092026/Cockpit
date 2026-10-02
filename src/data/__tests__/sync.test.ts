import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { tasksRepo } from '@/data/repositories';
import { encryptRow } from '@/data/repositories/rows';
import { taskSchema } from '@/data/schemas';
import { useDataStore } from '@/data/store';
import { vault } from '@/services/vault';
import { resetDb } from './testDb';

async function waitFor(check: () => boolean) {
  for (let i = 0; i < 100 && !check(); i += 1) await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
}

beforeEach(async () => {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup('Cockpit-Test-2026!');
  vault.finishOpening();
});

describe('sync with other tabs', () => {
  it('picks up rows written directly to the database (as another tab would)', async () => {
    const own = await tasksRepo.create({ title: 'Eigene Aufgabe' });
    const now = new Date(Date.now() + 1000).toISOString();
    const other = taskSchema.parse({
      id: crypto.randomUUID(),
      title: 'Aus anderem Tab',
      createdAt: now,
      updatedAt: now,
    });
    await db.tasks.put(await encryptRow('tasks', other));
    await waitFor(() => useDataStore.getState().tasks[other.id]?.title === 'Aus anderem Tab');

    const renamed = { ...own, title: 'Umbenannt', updatedAt: now };
    await db.tasks.put(await encryptRow('tasks', renamed));
    await waitFor(() => useDataStore.getState().tasks[own.id]?.title === 'Umbenannt');

    await db.tasks.delete(other.id);
    await waitFor(() => !useDataStore.getState().tasks[other.id]);
  });

  it('keeps local writes made right after a change', async () => {
    const created = await Promise.all(
      ['A', 'B', 'C', 'D'].map((title) => tasksRepo.create({ title })),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(Object.keys(useDataStore.getState().tasks).sort()).toEqual(
      created.map((task) => task.id).sort(),
    );
  });
});
