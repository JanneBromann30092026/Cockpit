import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../calendar/events';
import {
  changesDueDate,
  dayFacts,
  recurringWords,
  reviewStreak,
  reviewWeek,
  weekDays,
  weekEnd,
  weekFacts,
  type ReviewInfo,
  type ReviewTask,
} from './reviews';

/** Noon UTC is the same calendar day in every European time zone. */
const at = (date: string) => `${date}T12:00:00.000Z`;

function task(title: string, fields: Partial<ReviewTask> = {}): ReviewTask {
  return { title, status: 'open', priority: 'medium', createdAt: at('2026-09-01'), ...fields };
}

function review(date: string, fields: Partial<ReviewInfo> = {}): ReviewInfo {
  return { kind: 'daily', date, wentWell: [], notWell: [], improve: [], ...fields };
}

describe('weeks', () => {
  it('a weekly review covers the week ending on Sunday – today on a Sunday, else the last one', () => {
    expect(reviewWeek('2026-10-04')).toBe('2026-10-04'); // Sunday
    expect(reviewWeek('2026-10-05')).toBe('2026-10-04'); // Monday
    expect(reviewWeek('2026-10-10')).toBe('2026-10-04'); // Saturday
    expect(weekEnd('2026-09-28')).toBe('2026-10-04');
    expect(weekEnd('2026-10-04')).toBe('2026-10-04');
    expect(weekDays('2026-10-04')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('the changes are due on the coming Monday, never in the past', () => {
    expect(changesDueDate('2026-10-04', '2026-10-04')).toBe('2026-10-05');
    expect(changesDueDate('2026-10-04', '2026-10-05')).toBe('2026-10-05');
    expect(changesDueDate('2026-10-04', '2026-10-07')).toBe('2026-10-07');
  });
});

describe('facts of a day', () => {
  const tasks = [
    task('Folien abgeben', { status: 'done', priority: 'high', completedAt: at('2026-10-05') }),
    task('Wäsche', { status: 'done', completedAt: at('2026-10-05') }),
    task('Gestern erledigt', { status: 'done', completedAt: at('2026-10-04') }),
    task('Steuer', { dueDate: '2026-10-01', priority: 'high' }),
    task('Anrufen', { dueDate: '2026-10-05' }),
    task('Später', { dueDate: '2026-10-09' }),
    task('Ohne Datum'),
  ];

  it('done that day, important first; open and due by then, most overdue first', () => {
    const facts = dayFacts('2026-10-05', tasks, null);
    expect(facts.done.map((t) => t.title)).toEqual(['Folien abgeben', 'Wäsche']);
    expect(facts.open.map((o) => [o.task.title, o.overdueDays])).toEqual([
      ['Steuer', 4],
      ['Anrufen', 0],
    ]);
    expect(facts.events).toBeNull();
    expect(facts.tight).toEqual([]);
  });

  it('finds tight spots between events', () => {
    const event = (id: string, start: string, end: string): CalendarEvent => ({
      id,
      calendarId: 'primary',
      title: id,
      start: `2026-10-05T${start}:00+02:00`,
      end: `2026-10-05T${end}:00+02:00`,
      allDay: false,
    });
    const facts = dayFacts(
      '2026-10-05',
      [],
      [
        event('Vorlesung', '08:00', '09:30'),
        event('Projekt', '09:35', '11:00'),
        event('Mittag', '13:00', '14:00'),
      ],
    );
    expect(facts.events).toHaveLength(3);
    expect(
      facts.tight.map((spot) => [spot.before.title, spot.after.title, spot.gapMinutes]),
    ).toEqual([['Vorlesung', 'Projekt', 5]]);
  });
});

describe('facts of a week', () => {
  const reviews = [
    review('2026-09-28', {
      notWell: ['Zu viele Meetings am Vormittag'],
      wentWell: ['Sport gemacht'],
    }),
    review('2026-09-30', { notWell: ['Meeting überzogen, Handy abgelenkt'] }),
    review('2026-10-02', {
      notWell: ['Handy lag auf dem Schreibtisch'],
      wentWell: ['Sport am Abend'],
    }),
    review('2026-09-27', { notWell: ['Meetings'] }), // the week before
    { ...review('2026-10-04'), kind: 'weekly' as const },
  ];

  it('collects the week: daily reviews, done tasks, open tasks and recurring words', () => {
    const facts = weekFacts(
      '2026-10-04',
      [
        task('Bericht', { status: 'done', completedAt: at('2026-09-29') }),
        task('Alt', { status: 'done', completedAt: at('2026-09-20') }),
        task('Offen', { dueDate: '2026-10-02' }),
      ],
      reviews,
    );
    expect(facts.daily.map((r) => r.date)).toEqual(['2026-09-28', '2026-09-30', '2026-10-02']);
    expect(facts.done.map((t) => t.title)).toEqual(['Bericht']);
    expect(facts.open.map((o) => [o.task.title, o.overdueDays])).toEqual([['Offen', 2]]);
    expect(facts.recurring.notWell).toEqual([
      { word: 'Handy', days: 2 },
      { word: 'Meeting', days: 2 },
    ]);
    expect(facts.recurring.wentWell).toEqual([{ word: 'Sport', days: 2 }]);
  });

  it('only words of five letters or more, without filler words', () => {
    expect(
      recurringWords(
        [
          review('2026-09-28', { notWell: ['Nicht gut geschlafen, wieder zu spät'] }),
          review('2026-09-29', { notWell: ['Wieder nicht gut geschlafen'] }),
        ],
        'notWell',
      ),
    ).toEqual([{ word: 'geschlafen', days: 2 }]);
  });
});

describe('streak', () => {
  const done = (date: string) => review(date, { doneAt: at(date) });

  it('counts finished daily reviews in a row up to today or yesterday', () => {
    const reviews = [
      done('2026-10-02'),
      done('2026-10-03'),
      done('2026-10-04'),
      done('2026-09-30'),
    ];
    expect(reviewStreak(reviews, '2026-10-04')).toBe(3);
    expect(reviewStreak(reviews, '2026-10-05')).toBe(3);
    expect(reviewStreak(reviews, '2026-10-06')).toBe(0);
    // A started but unfinished review does not count.
    expect(reviewStreak([review('2026-10-04')], '2026-10-04')).toBe(0);
  });
});
