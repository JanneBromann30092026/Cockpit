/**
 * Task actions on top of the generic repository: complete, reopen, postpone, delete with
 * undo, and the invented demo tasks of the developer mode.
 */
import { nextTimestamp } from '@/core/time';
import { DATA_TABLES, type DataTable } from '../db';
import type { Task } from '../schemas';
import { useDataStore } from '../store';
import { requireRecord, validateRecord } from './recordsRepo';
import { commit } from './rows';
import { tasksRepo } from './records';

export type TaskInput = Parameters<typeof tasksRepo.create>[0];
export type TaskPatch = Partial<Pick<Task, 'title' | 'dueDate' | 'priority' | 'notes'>>;

export const taskActions = {
  create(input: TaskInput): Promise<Task> {
    return tasksRepo.create(input);
  },

  /** Changes the editable fields; an empty date or note removes it. */
  edit(id: string, patch: TaskPatch): Promise<Task> {
    return tasksRepo.update(id, patch);
  },

  complete(id: string, now: Date = new Date()): Promise<Task> {
    return tasksRepo.update(id, { status: 'done', completedAt: now.toISOString() });
  },

  reopen(id: string): Promise<Task> {
    return tasksRepo.update(id, { status: 'open', completedAt: undefined });
  },

  postpone(id: string, dueDate: string): Promise<Task> {
    return tasksRepo.update(id, { dueDate });
  },

  /** Deletes and returns the task, so "Rückgängig" can bring it back. */
  async remove(id: string): Promise<Task> {
    const task = requireRecord('tasks', id);
    await tasksRepo.remove(id);
    return task;
  },

  /** Brings a deleted task back with its id (undo). */
  async restore(task: Task): Promise<Task> {
    const record = validateRecord('tasks', { ...task, updatedAt: nextTimestamp(task.updatedAt) });
    await commit([{ table: 'tasks', record }]);
    return record;
  },
};

/** The technical fields every record has (enough to find demo data). */
function records(table: DataTable): { id: string; demo: boolean }[] {
  const map: Record<string, { id: string; demo: boolean }> = useDataStore.getState()[table];
  return Object.values(map);
}

/** Developer mode: invented data, marked as demo. */
export const demoActions = {
  async createTasks(inputs: readonly TaskInput[]): Promise<number> {
    for (const input of inputs) await tasksRepo.create({ ...input, demo: true });
    return inputs.length;
  },

  count(): number {
    return DATA_TABLES.reduce(
      (sum, table) => sum + records(table).filter((record) => record.demo).length,
      0,
    );
  },

  /** Removes every record marked as demo (nothing else). */
  async removeAll(): Promise<number> {
    const deletes = DATA_TABLES.map((table) => ({
      table,
      ids: records(table)
        .filter((record) => record.demo)
        .map((record) => record.id),
    })).filter((entry) => entry.ids.length > 0);
    await commit([], deletes);
    return deletes.reduce((sum, entry) => sum + entry.ids.length, 0);
  },
};
