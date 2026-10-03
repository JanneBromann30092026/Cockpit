import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../calendar/events';
import { classifyMail, type MailInput } from '../mail/classify';
import { overviewFacts } from './overview';

const at = (time: string) => new Date(`2026-10-05T${time}:00`);
const timed = (id: string, from: string, to: string): CalendarEvent => ({
  id,
  calendarId: 'primary',
  title: id,
  start: at(from).toISOString(),
  end: at(to).toISOString(),
  allDay: false,
});
const mail = (overrides: Partial<MailInput>) =>
  classifyMail({
    id: 'm',
    threadId: 't',
    from: 'Lena <lena@example.com>',
    subject: 'Hallo',
    snippet: '',
    receivedAt: 1,
    labelIds: [],
    listUnsubscribe: false,
    ...overrides,
  });

describe('overview facts', () => {
  const events = [
    timed('Vorlesung', '10:00', '11:30'),
    timed('Mittag', '11:40', '12:30'),
    timed('Frühstück', '08:00', '08:30'),
    {
      ...timed('Feiertag', '00:00', '00:00'),
      allDay: true,
      start: '2026-10-05',
      end: '2026-10-06',
    },
  ];

  it('puts a person with a deadline first', () => {
    const facts = overviewFacts({
      now: at('09:00'),
      events,
      mails: [
        mail({ id: 'q', snippet: 'Kommst du?' }),
        mail({ id: 'd', subject: 'Frist für die Anmeldung' }),
        mail({ id: 'news', listUnsubscribe: true }),
      ],
    });
    expect(facts.focus).toMatchObject({ kind: 'mail', mail: { id: 'd' } });
    expect(facts.schedule).toMatchObject({ count: 3, allDay: 1, remaining: 2 });
    expect(facts.schedule?.firstStart).toBe(at('08:00').toISOString());
    expect(facts.schedule?.lastEnd).toBe(at('12:30').toISOString());
    expect(facts.schedule?.tight.map((s) => [s.before.id, s.after.id])).toEqual([
      ['Vorlesung', 'Mittag'],
    ]);
    expect(facts.mails).toEqual({ total: 3, important: 2, people: 2, bulk: 1 });
  });

  it('otherwise focuses on the next or running event', () => {
    expect(overviewFacts({ now: at('10:15'), events, mails: [] }).focus).toMatchObject({
      kind: 'event',
      event: { id: 'Vorlesung' },
      now: true,
    });
    expect(overviewFacts({ now: at('13:00'), events, mails: [] }).focus).toEqual({ kind: 'none' });
  });

  it('keeps unavailable sources apart from empty ones', () => {
    const facts = overviewFacts({ now: at('09:00'), events: null, mails: null });
    expect(facts).toEqual({ focus: { kind: 'none' }, schedule: null, mails: null });
    // Tight spots only matter until the next event begins.
    expect(overviewFacts({ now: at('11:35'), events, mails: [] }).schedule?.tight).toHaveLength(1);
    expect(overviewFacts({ now: at('11:45'), events, mails: [] }).schedule?.tight).toHaveLength(0);
  });
});
