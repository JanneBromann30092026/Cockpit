import { describe, expect, it } from 'vitest';
import { buildContractQuestionMessage, parseContractAnswer } from './contractQuestion';

describe('contract question', () => {
  it('the message holds date, question and the contracts', () => {
    const message = JSON.parse(
      buildContractQuestionMessage({
        today: '2026-10-05',
        question: 'Was kostet das Abo?',
        contracts: [
          {
            ref: 'v1',
            name: 'Streaming-Abo',
            kategorie: 'Abo',
            betrag_eur: 13.99,
            zusammenfassung: [],
            offene_punkte: [],
          },
        ],
      }),
    ) as Record<string, unknown>;
    expect(message).toMatchObject({
      heute: '2026-10-05',
      frage: 'Was kostet das Abo?',
      vertraege: [{ ref: 'v1', name: 'Streaming-Abo', betrag_eur: 13.99 }],
    });
  });

  it('keeps only known sources and strips markdown', () => {
    expect(
      parseContractAnswer(
        JSON.stringify({ antwort: '**13,99 €** im Monat.', quellen: [' v1 ', 'v7'] }),
        ['v1', 'v2'],
      ),
    ).toEqual({ text: '13,99 € im Monat.', sources: ['v1'] });
    expect(parseContractAnswer(JSON.stringify({ antwort: ' ', quellen: [] }), [])).toBeNull();
    expect(parseContractAnswer('kein JSON', [])).toBeNull();
  });
});
