import { describe, expect, it } from 'vitest';
import { overviewFacts } from '@/core/today/overview';
import { demoTaskInputs } from '@/data/demo/tasks';
import { demoEvents, demoMails } from '@/data/demo/today';
import { overviewSentences } from './overviewText';

const at = (time: string) => new Date(`2026-10-05T${time}:00`);

describe('overview sentences', () => {
  it('describes the demo day in three sentences', () => {
    const now = at('10:20');
    const sentences = overviewSentences(
      overviewFacts({ now, events: demoEvents(now), mails: demoMails(now) }),
    );
    expect(sentences).toEqual([
      'Das Wichtigste: Lena Berg wartet mit einer Frist auf dich – „Folien fürs Kundenportal“.',
      '6 Termine zwischen 08:30 und 19:15 Uhr – eng wird es um 15:30 Uhr zwischen „Projektmeeting Kundenportal“ und „Videodreh: Intro fürs Wochenvideo“.',
      '8 ungelesene Mails seit gestern, davon 2 mit Frage oder Frist; 2 Newsletter und Werbung können warten.',
    ]);
  });

  it('names the next event when no mail is urgent', () => {
    const now = at('16:45');
    const [focus, schedule, mails] = overviewSentences(
      overviewFacts({ now, events: demoEvents(now), mails: [] }),
    );
    expect(focus).toBe('Als Nächstes: „Laufen im Park“ um 18:30 Uhr.');
    expect(schedule).toBe('6 Termine zwischen 08:30 und 19:15 Uhr – dazwischen bleibt genug Luft.');
    expect(mails).toBe('Keine ungelesenen Mails seit gestern.');
  });

  it('says when sources are missing or the day is done', () => {
    const now = at('21:00');
    const failed = { calendarFailed: true, gmailFailed: true };
    expect(overviewSentences(overviewFacts({ now, events: null, mails: null }), failed)).toEqual([
      'Heute steht nichts Dringendes an.',
      'Deine Termine konnten gerade nicht geladen werden.',
      'Deine Mails konnten gerade nicht geladen werden.',
    ]);
    // Not connected (no error): a hint instead of a failure.
    expect(overviewSentences(overviewFacts({ now, events: null, mails: null }))).toEqual([
      'Heute steht nichts Dringendes an.',
      'Deine Termine siehst du hier, sobald Google verbunden ist.',
      'Heute ist keine Aufgabe fällig.',
    ]);
    const [, done] = overviewSentences(overviewFacts({ now, events: demoEvents(now), mails: [] }));
    expect(done).toBe('Deine 6 Termine sind für heute geschafft.');
    const [, free] = overviewSentences(overviewFacts({ now, events: [], mails: [] }));
    expect(free).toBe('Keine Termine – der Tag gehört dir.');
  });

  it('mentions overlapping events', () => {
    const now = at('12:00');
    const events = demoEvents(now).map((event) =>
      event.id === 'demo-shoot' ? { ...event, start: at('15:00').toISOString() } : event,
    );
    const [, schedule] = overviewSentences(overviewFacts({ now, events, mails: [] }));
    expect(schedule).toContain(
      '„Projektmeeting Kundenportal“ und „Videodreh: Intro fürs Wochenvideo“ überschneiden sich',
    );
  });

  it('adds the due tasks to the overview', () => {
    const now = at('10:20');
    const tasks = demoTaskInputs('2026-10-05', now).map((input) => ({
      title: input.title,
      status: input.status ?? 'open',
      dueDate: input.dueDate,
      priority: input.priority ?? 'medium',
      createdAt: '2026-10-01T08:00:00.000Z',
    }));
    expect(
      overviewSentences(
        overviewFacts({ now, events: demoEvents(now), mails: demoMails(now), tasks }),
      ),
    ).toEqual([
      'Das Wichtigste: „Steuererklärung abschicken“ ist seit 2 Tagen überfällig.',
      '6 Termine zwischen 08:30 und 19:15 Uhr – eng wird es um 15:30 Uhr zwischen „Projektmeeting Kundenportal“ und „Videodreh: Intro fürs Wochenvideo“.',
      '8 ungelesene Mails seit gestern, davon 2 mit Frage oder Frist – dazu 4 fällige Aufgaben, davon 2 überfällig.',
    ]);
    // Without Google: the task list alone.
    const [focus, schedule, inbox] = overviewSentences(
      overviewFacts({ now, events: null, mails: null, tasks }),
    );
    expect(focus).toContain('Steuererklärung');
    expect(schedule).toBe('Deine Termine siehst du hier, sobald Google verbunden ist.');
    expect(inbox).toBe('Auf deiner Liste: 4 fällige Aufgaben, davon 2 überfällig.');
    // Mails failed, tasks there; no unread mails but tasks.
    expect(
      overviewSentences(overviewFacts({ now, events: [], mails: null, tasks }), {
        calendarFailed: false,
        gmailFailed: true,
      })[2],
    ).toBe(
      'Deine Mails konnten gerade nicht geladen werden – dazu 4 fällige Aufgaben, davon 2 überfällig.',
    );
    expect(overviewSentences(overviewFacts({ now, events: [], mails: [], tasks }))[2]).toBe(
      'Keine ungelesenen Mails seit gestern, aber 4 fällige Aufgaben, davon 2 überfällig.',
    );
  });
});
