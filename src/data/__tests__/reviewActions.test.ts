import { beforeEach, describe, expect, it } from 'vitest';
import { demoReviews } from '@/data/demo/reviews';
import { demoActions, reviewActions, tasksRepo } from '@/data/repositories';
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

const reviews = () => Object.values(useDataStore.getState().reviews);
const tasks = () => Object.values(useDataStore.getState().tasks);
const CHANGE_TASKS = { dueDate: '2026-10-05', notes: 'Aus dem Wochen-Review vom 04.10.2026' };

describe('reviews', () => {
  it('one review per kind and day: drafts update it, finishing marks it done – encrypted', async () => {
    await reviewActions.saveDraft('daily', '2026-10-05', { wentWell: ['Sport gemacht'] });
    await reviewActions.saveDraft('daily', '2026-10-05', {
      wentWell: ['Sport gemacht'],
      note: 'Geheime Notiz',
    });
    expect(reviews()).toHaveLength(1);
    expect(reviews()[0]).toMatchObject({ kind: 'daily', note: 'Geheime Notiz' });
    expect(reviews()[0]?.doneAt).toBeUndefined();
    const done = await reviewActions.finishDay(
      '2026-10-05',
      { wentWell: ['Sport gemacht'] },
      new Date('2026-10-05T19:00:00Z'),
    );
    expect(done.doneAt).toBe('2026-10-05T19:00:00.000Z');
    expect(reviewActions.find('daily', '2026-10-05')?.id).toBe(done.id);
    expect(reviewActions.find('weekly', '2026-10-05')).toBeUndefined();
    const dump = await rawDump();
    expect(dump).not.toContain('Sport gemacht');
    expect(dump).not.toContain('Geheime Notiz');
  });

  it('finishing a week creates three tasks for Monday – plain titles, linked to the review', async () => {
    const { review, tasks: created } = await reviewActions.finishWeek(
      '2026-10-04',
      {
        patterns: ['Sport hilft'],
        changes: ['Handy in die Schublade (Claude)', 'Meetings mit Agenda', 'Sonntags planen'],
      },
      CHANGE_TASKS,
    );
    expect(created.map((task) => task.title)).toEqual([
      'Handy in die Schublade',
      'Meetings mit Agenda',
      'Sonntags planen',
    ]);
    for (const task of created) {
      expect(task).toMatchObject({
        status: 'open',
        priority: 'medium',
        dueDate: '2026-10-05',
        notes: 'Aus dem Wochen-Review vom 04.10.2026',
      });
    }
    expect(review.changeTaskIds).toEqual(created.map((task) => task.id));
    expect(review.changes[0]).toBe('Handy in die Schublade (Claude)');
    expect(review.doneAt).toBeDefined();
    expect(tasks()).toHaveLength(3);
  });

  it('finishing again updates the tasks; a deleted task is created again', async () => {
    const first = await reviewActions.finishWeek(
      '2026-10-04',
      { changes: ['A', 'B', 'C'] },
      CHANGE_TASKS,
    );
    const [, second] = first.tasks;
    await tasksRepo.remove(second?.id ?? '');
    const again = await reviewActions.finishWeek(
      '2026-10-04',
      { changes: ['A2', 'B2', 'C'] },
      CHANGE_TASKS,
    );
    expect(again.tasks[0]?.id).toBe(first.tasks[0]?.id);
    expect(again.tasks[1]?.id).not.toBe(second?.id);
    expect(again.tasks[2]?.id).toBe(first.tasks[2]?.id);
    expect(
      tasks()
        .map((task) => task.title)
        .sort(),
    ).toEqual(['A2', 'B2', 'C']);
    expect(reviews()).toHaveLength(1);
  });

  it('demo reviews leave days that already have a review alone', async () => {
    const today = '2026-10-05';
    await reviewActions.saveDraft('daily', '2026-10-04', { wentWell: ['Echt'] });
    const created = await demoActions.createReviews(demoReviews(today));
    expect(created).toBe(5);
    expect(reviews().filter((review) => review.demo)).toHaveLength(5);
    expect(reviewActions.find('daily', '2026-10-04')?.wentWell).toEqual(['Echt']);
    expect(await demoActions.removeAll()).toBe(5);
    expect(reviews()).toHaveLength(1);
  });
});
