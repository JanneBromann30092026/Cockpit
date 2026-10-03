import { describe, expect, it } from 'vitest';
import { overviewFacts } from '@/core/today/overview';
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
    expect(overviewSentences(overviewFacts({ now, events: null, mails: null }))).toEqual([
      'Heute steht nichts Dringendes an.',
      'Deine Termine konnten gerade nicht geladen werden.',
      'Deine Mails konnten gerade nicht geladen werden.',
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
});
