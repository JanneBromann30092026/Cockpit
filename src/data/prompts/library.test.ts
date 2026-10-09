import { describe, expect, it } from 'vitest';
import {
  buildLibraryKeyPointsMessage,
  buildLibraryListMessage,
  buildLibraryQuestionMessage,
  LIBRARY_LIST_MAX_CHARS,
  parseLibraryAnswer,
  parseLibraryKeyPoints,
  parseLibraryList,
} from './library';

describe('library prompts', () => {
  it('question: sends only the given fields and keeps known sources', () => {
    const message = buildLibraryQuestionMessage({
      question: 'Was weiß ich über Fokus?',
      entries: [
        { ref: 'b1', titel: 'Deep Work', typ: 'Buch', themen: ['Fokus'], kernaussagen: ['Blöcke'] },
      ],
    });
    expect(JSON.parse(message)).toEqual({
      frage: 'Was weiß ich über Fokus?',
      eintraege: [
        { ref: 'b1', titel: 'Deep Work', typ: 'Buch', themen: ['Fokus'], kernaussagen: ['Blöcke'] },
      ],
    });
    expect(
      parseLibraryAnswer(JSON.stringify({ antwort: '**Feste Blöcke.**', quellen: ['b1', 'b7'] }), [
        'b1',
      ]),
    ).toEqual({ text: 'Feste Blöcke.', sources: ['b1'] });
    expect(parseLibraryAnswer('kein json', ['b1'])).toBeNull();
    expect(parseLibraryAnswer(JSON.stringify({ antwort: ' ', quellen: [] }), [])).toBeNull();
  });

  it('list: cuts long lists, drops invalid links and dates, keeps at most three topics', () => {
    const message = JSON.parse(
      buildLibraryListMessage({
        text: 'x'.repeat(LIBRARY_LIST_MAX_CHARS + 50),
        defaultType: 'book',
        today: '2026-10-09',
      }),
    ) as { liste: string; standardtyp: string };
    expect(message.liste).toHaveLength(LIBRARY_LIST_MAX_CHARS);
    expect(message.standardtyp).toBe('book');
    const entries = parseLibraryList(
      JSON.stringify({
        eintraege: [
          {
            titel: ' Sapiens ',
            typ: 'book',
            autor: 'Yuval Noah Harari',
            link: 'javascript:alert(1)',
            datum: '2026-02-30',
            themen: ['Geschichte', 'Menschheit', 'Evolution', 'Zu viel'],
          },
          {
            titel: 'Hard Fork',
            typ: 'podcast',
            autor: null,
            link: 'https://x.org/a',
            datum: '2026-12-01',
            themen: [],
          },
          { titel: '   ', typ: 'video', autor: null, link: null, datum: null, themen: [] },
        ],
      }),
      '2026-10-09',
    );
    expect(entries).toEqual([
      {
        title: 'Sapiens',
        type: 'book',
        author: 'Yuval Noah Harari',
        topics: ['Geschichte', 'Menschheit', 'Evolution'],
      },
      { title: 'Hard Fork', type: 'podcast', link: 'https://x.org/a', topics: [] },
    ]);
    expect(
      parseLibraryList(JSON.stringify({ eintraege: [{ titel: 'x' }] }), '2026-10-09'),
    ).toBeNull();
  });

  it('key points: only from my thoughts, at most five', () => {
    expect(
      JSON.parse(
        buildLibraryKeyPointsMessage({ title: 'Deep Work', type: 'Buch', thoughts: 'Blöcke' }),
      ),
    ).toEqual({ titel: 'Deep Work', typ: 'Buch', gedanken: 'Blöcke' });
    expect(
      parseLibraryKeyPoints(JSON.stringify({ kernaussagen: ['a', ' ', 'b', 'c', 'd', 'e', 'f'] })),
    ).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});
