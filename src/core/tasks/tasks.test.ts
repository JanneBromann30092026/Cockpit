import { describe, expect, it } from 'vitest';
import {
  compareDoneTasks,
  compareOpenTasks,
  dueTasks,
  isDue,
  isOverdue,
  postponedDate,
  taskBucket,
  type TaskInfo,
} from './tasks';

const TODAY = '2026-10-05';

const task = (title: string, overrides: Partial<TaskInfo> = {}): TaskInfo => ({
  title,
  status: 'open',
  priority: 'medium',
  createdAt: '2026-10-01T08:00:00.000Z',
  ...overrides,
});

describe('task buckets', () => {
  it('groups by due date', () => {
    expect(taskBucket('2026-10-01', TODAY)).toBe('overdue');
    expect(taskBucket(TODAY, TODAY)).toBe('today');
    expect(taskBucket('2026-10-06', TODAY)).toBe('tomorrow');
    expect(taskBucket('2026-10-12', TODAY)).toBe('week');
    expect(taskBucket('2026-10-13', TODAY)).toBe('later');
    expect(taskBucket(undefined, TODAY)).toBe('someday');
  });

  it('counts only open tasks with a date today or earlier as due', () => {
    expect(isDue(task('a', { dueDate: TODAY }), TODAY)).toBe(true);
    expect(isDue(task('b', { dueDate: '2026-10-01' }), TODAY)).toBe(true);
    expect(isDue(task('c', { dueDate: '2026-10-06' }), TODAY)).toBe(false);
    expect(isDue(task('d'), TODAY)).toBe(false);
    expect(isDue(task('e', { dueDate: TODAY, status: 'done' }), TODAY)).toBe(false);
    expect(isOverdue(task('f', { dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(task('g', { dueDate: '2026-10-04' }), TODAY)).toBe(true);
  });
});

describe('task order', () => {
  it('sorts open tasks by date, then priority, then age; undated last', () => {
    const list = [
      task('undated'),
      task('low today', { dueDate: TODAY, priority: 'low' }),
      task('high today', { dueDate: TODAY, priority: 'high' }),
      task('overdue', { dueDate: '2026-10-02' }),
      task('older high today', {
        dueDate: TODAY,
        priority: 'high',
        createdAt: '2026-09-01T08:00:00.000Z',
      }),
    ];
    expect([...list].sort(compareOpenTasks).map((item) => item.title)).toEqual([
      'overdue',
      'older high today',
      'high today',
      'low today',
      'undated',
    ]);
  });

  it('puts the most important due task first in "Heute"', () => {
    const list = [
      task('medium overdue', { dueDate: '2026-10-01' }),
      task('high today', { dueDate: TODAY, priority: 'high' }),
      task('tomorrow', { dueDate: '2026-10-06', priority: 'high' }),
      task('done', { dueDate: TODAY, status: 'done' }),
    ];
    expect(dueTasks(list, TODAY).map((item) => item.title)).toEqual([
      'high today',
      'medium overdue',
    ]);
  });

  it('shows the most recently completed first', () => {
    const list = [
      task('earlier', { status: 'done', completedAt: '2026-10-04T08:00:00.000Z' }),
      task('later', { status: 'done', completedAt: '2026-10-05T08:00:00.000Z' }),
    ];
    expect(list.sort(compareDoneTasks).map((item) => item.title)).toEqual(['later', 'earlier']);
  });
});

describe('postponing', () => {
  it('moves to tomorrow or one week later (from today when overdue)', () => {
    expect(postponedDate('2026-10-01', 'tomorrow', TODAY)).toBe('2026-10-06');
    expect(postponedDate('2026-10-01', 'week', TODAY)).toBe('2026-10-12');
    expect(postponedDate('2026-10-20', 'week', TODAY)).toBe('2026-10-27');
    expect(postponedDate(undefined, 'week', TODAY)).toBe('2026-10-12');
  });
});
