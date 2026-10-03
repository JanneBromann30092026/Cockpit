import { describe, expect, it } from 'vitest';
import { buildDaySummaryMessage, parseDaySummary } from './daySummary';

describe('day summary prompt', () => {
  it('sends only what the overview needs', () => {
    const message = JSON.parse(
      buildDaySummaryMessage({
        now: 'Montag, 5. Oktober 2026, 09:00 Uhr',
        events: [{ time: '10:00–11:30', title: 'Vorlesung', location: 'Hörsaal 2' }],
        mails: {
          important: [{ from: 'Lena', subject: 'Frist', snippet: 'Bis Freitag?', deadline: true }],
          people: [],
          updates: [{ from: 'Bank', subject: 'Kontoauszug' }],
          newsletters: 7,
        },
      }),
    ) as Record<string, unknown>;
    expect(message).toMatchObject({
      termine: [{ title: 'Vorlesung' }],
      mails: { anzahl_newsletter_und_werbung: 7, updates: [{ subject: 'Kontoauszug' }] },
    });
    expect(
      JSON.parse(buildDaySummaryMessage({ now: 'x', events: null, mails: null })),
    ).toMatchObject({ termine: 'nicht verfügbar', mails: 'nicht verfügbar' });
  });

  it('turns the answer into at most three clean sentences', () => {
    expect(
      parseDaySummary(
        '1. **Wichtig** ist die Frist von Lena.\n2. Um 11:30 wird es eng!\n3. Sonst ruhig. Extra?',
      ),
    ).toEqual(['Wichtig ist die Frist von Lena.', 'Um 11:30 wird es eng!', 'Sonst ruhig.']);
    expect(parseDaySummary('Ein Satz ohne Punkt')).toEqual(['Ein Satz ohne Punkt']);
    expect(parseDaySummary('  ')).toEqual([]);
  });
});
