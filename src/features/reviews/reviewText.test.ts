import { describe, expect, it } from 'vitest';
import { dayFacts, weekFacts } from '@/core/reviews/reviews';
import type { CalendarEvent } from '@/core/calendar/events';
import type { Review, Task } from '@/data/schemas';
import { addPoint, daySuggestions, weekSuggestions } from './reviewText';

const at = (date: string) => `${date}T12:00:00.000Z`;

function task(title: string, fields: Partial<Task> = {}): Task {
  return {
    id: crypto.randomUUID(),
    createdAt: at('2026-09-01'),
    updatedAt: at('2026-09-01'),
    demo: false,
    title,
    status: 'open',
    priority: 'medium',
    notes: undefined,
    ...fields,
  };
}

function review(date: string, fields: Partial<Review>): Review {
  return {
    id: crypto.randomUUID(),
    createdAt: at(date),
    updatedAt: at(date),
    demo: false,
    kind: 'daily',
    date,
    wentWell: [],
    notWell: [],
    improve: [],
    note: undefined,
    patterns: [],
    brakes: [],
    changes: [],
    changeTaskIds: [],
    ...fields,
  };
}

const event = (title: string, start: string, end: string): CalendarEvent => ({
  id: title,
  calendarId: 'primary',
  title,
  start: `2026-10-05T${start}:00+02:00`,
  end: `2026-10-05T${end}:00+02:00`,
  allDay: false,
});

describe('suggestions of a day', () => {
  it('done tasks, tight spots, overdue and open tasks – open ones under "Besser machen"', () => {
    const facts = dayFacts(
      '2026-10-05',
      [
        task('Miete', { status: 'done', completedAt: at('2026-10-05') }),
        task('Steuer', { dueDate: '2026-10-03', priority: 'high' }),
        task('Folien', { dueDate: '2026-10-05' }),
      ],
      [event('Vorlesung', '08:00', '09:30'), event('Projekt', '09:20', '10:00')],
    );
    expect(daySuggestions(facts)).toEqual({
      wentWell: ['Erledigt: Miete'],
      notWell: [
        '„Vorlesung“ und „Projekt“ haben sich überschnitten',
        '„Steuer“ ist seit 2 Tagen überfällig',
      ],
      improve: ['Offen: Steuer', 'Offen: Folien'],
    });
  });

  it('a full day and many done tasks', () => {
    const events = ['08', '09', '10', '11', '13', '14'].map((hour) =>
      event(`T${hour}`, `${hour}:00`, `${hour}:30`),
    );
    const done = ['A', 'B', 'C', 'D'].map((title) =>
      task(title, { status: 'done', completedAt: at('2026-10-05') }),
    );
    const suggestions = daySuggestions(dayFacts('2026-10-05', done, events));
    expect(suggestions.wentWell).toEqual([
      'Erledigt: A',
      'Erledigt: B',
      'Erledigt: C',
      '4 Aufgaben erledigt',
    ]);
    expect(suggestions.notWell).toEqual(['Voller Tag mit 6 Terminen']);
  });
});

describe('suggestions of a week', () => {
  it('recurring themes, few reviews, overdue tasks and changes from "Besser machen"', () => {
    const facts = weekFacts(
      '2026-10-04',
      [task('Steuer', { dueDate: '2026-10-01' })],
      [
        review('2026-09-29', {
          notWell: ['Handy abgelenkt'],
          improve: ['Meetings kürzer', 'Offen: Steuer'],
        }),
        review('2026-10-02', {
          notWell: ['Wieder Handy'],
          improve: ['Vor Meetings Ziele notieren'],
        }),
        review('2026-10-03', { improve: ['Früher schlafen'] }),
      ],
    );
    expect(weekSuggestions(facts)).toEqual({
      patterns: ['Nur 3 Tages-Reviews diese Woche'],
      brakes: ['„Handy“ an 2 Tagen unter „Nicht gut“', '1 Aufgabe überfällig'],
      changes: ['Vor Meetings Ziele notieren', 'Meetings kürzer', 'Früher schlafen'],
    });
  });

  it('adds points only once', () => {
    expect(addPoint(['A'], ' A ')).toEqual(['A']);
    expect(addPoint(['A'], '  ')).toEqual(['A']);
    expect(addPoint(['A'], 'B')).toEqual(['A', 'B']);
  });
});
