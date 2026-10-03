import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/data/db';
import { demoTaskInputs } from '@/data/demo/tasks';
import { demoActions, taskActions, tasksRepo } from '@/data/repositories';
import { useDataStore } from '@/data/store';
import { vault } from '@/services/vault';
import { rawDump, resetDb } from './testDb';

beforeEach(async () => {
  vault.lock();
  await resetDb();
  await vault.init(true);
  await vault.setup('Cockpit-Test-2026!');
  vault.finishOpening();
});

describe('task actions', () => {
  it('completes, reopens and postpones', async () => {
    const task = await taskActions.create({ title: 'Steuer', dueDate: '2026-10-05' });
    const done = await taskActions.complete(task.id, new Date('2026-10-05T10:00:00Z'));
    expect(done).toMatchObject({ status: 'done', completedAt: '2026-10-05T10:00:00.000Z' });
    const reopened = await taskActions.reopen(task.id);
    expect(reopened.status).toBe('open');
    expect(reopened.completedAt).toBeUndefined();
    const moved = await taskActions.postpone(task.id, '2026-10-12');
    expect(moved.dueDate).toBe('2026-10-12');
    const edited = await taskActions.edit(task.id, { dueDate: undefined, priority: 'high' });
    expect(edited).toMatchObject({ priority: 'high' });
    expect(edited.dueDate).toBeUndefined();
  });

  it('deletes with undo: the task comes back with its id', async () => {
    const task = await taskActions.create({ title: 'Zahnarzt', notes: 'Kontrolle' });
    const removed = await taskActions.remove(task.id);
    expect(await db.tasks.count()).toBe(0);
    expect(tasksRepo.get(task.id)).toBeUndefined();
    const restored = await taskActions.restore(removed);
    expect(restored).toMatchObject({ id: task.id, title: 'Zahnarzt', notes: 'Kontrolle' });
    expect(restored.updatedAt > task.updatedAt).toBe(true);
    expect(await db.tasks.count()).toBe(1);
  });

  it('creates demo tasks and removes only those', async () => {
    const real = await taskActions.create({ title: 'Echte Aufgabe' });
    const created = await demoActions.createTasks(demoTaskInputs('2026-10-05'));
    expect(created).toBe(9);
    expect(demoActions.count()).toBe(9);
    const tasks = Object.values(useDataStore.getState().tasks);
    expect(tasks.filter((task) => task.status === 'done')).toHaveLength(1);
    // Encrypted like real data.
    expect(await rawDump()).not.toContain('Steuererklärung');
    expect(await demoActions.removeAll()).toBe(9);
    expect(Object.keys(useDataStore.getState().tasks)).toEqual([real.id]);
    expect(await db.tasks.count()).toBe(1);
  });
});
