import { describe, expect, it } from 'vitest';
import { answerLibraryQuestion, exampleTopics } from './ask';
import {
  cleanTopics,
  libraryStats,
  sameTitle,
  searchEntries,
  searchTerms,
  sortEntries,
  topicCounts,
  type LibraryItem,
} from './library';
import { parseLine, parseList, typeFromLink, withoutFutureDate } from './list';

let count = 0;
function entry(fields: Partial<LibraryItem> & { title: string }): LibraryItem {
  count += 1;
  return {
    id: `e${count}`,
    type: 'book',
    topics: [],
    keyPoints: [],
    createdAt: `2026-01-${String(count).padStart(2, '0')}T10:00:00.000Z`,
    ...fields,
  };
}

const habits = entry({
  title: 'Atomic Habits',
  author: 'James Clear',
  consumedAt: '2026-03-01',
  topics: ['Gewohnheiten', 'Produktivität'],
  keyPoints: [
    { text: 'Kleine Gewohnheiten summieren sich wie Zinseszins.', byClaude: false },
    { text: 'Umgebung schlägt Willenskraft.', byClaude: false },
  ],
  thoughts: 'Handy abends in die Küche legen.',
});
const deepWork = entry({
  title: 'Deep Work',
  author: 'Cal Newport',
  consumedAt: '2025-11-10',
  topics: ['Fokus', 'produktivität'],
  keyPoints: [{ text: 'Tiefe Arbeit braucht feste Blöcke ohne Ablenkung.', byClaude: true }],
});
const podcast = entry({
  title: 'Hard Fork: KI im Alltag',
  type: 'podcast',
  topics: ['KI'],
  keyPoints: [{ text: 'Neue Gewohnheit: Fragen zuerst an die KI.', byClaude: false }],
});
const all = [podcast, deepWork, habits];

describe('topics', () => {
  it('cleans and counts topics ignoring case', () => {
    expect(cleanTopics(['#Deep_Work', ' fokus ', 'Fokus', ''])).toEqual(['Deep Work', 'fokus']);
    expect(topicCounts(all)[0]).toEqual({ topic: 'Produktivität', count: 2 });
    expect(exampleTopics(all, 1)).toEqual(['Produktivität']);
  });
});

describe('order, stats and search', () => {
  it('sorts by consumed date, undated last', () => {
    expect(sortEntries(all).map((e) => e.title)).toEqual([
      'Atomic Habits',
      'Deep Work',
      'Hard Fork: KI im Alltag',
    ]);
    expect(libraryStats(all, '2026-10-09')).toEqual({
      total: 3,
      thisYear: 1,
      byType: { book: 2, podcast: 1 },
    });
  });

  it('finds words as typed, in every field, umlauts folded', () => {
    expect(searchEntries(all, 'prod').map((e) => e.title)).toEqual(['Atomic Habits', 'Deep Work']);
    expect(searchEntries(all, 'Kuche').map((e) => e.title)).toEqual(['Atomic Habits']);
    expect(searchEntries(all, 'newport fokus').map((e) => e.title)).toEqual(['Deep Work']);
    expect(searchEntries(all, 'gewohnheit').map((e) => e.title)).toEqual([
      'Atomic Habits',
      'Hard Fork: KI im Alltag',
    ]);
    expect(searchEntries(all, '', { type: 'podcast' })).toEqual([podcast]);
    expect(searchEntries(all, '', { topic: 'PRODUKTIVITÄT' })).toHaveLength(2);
    expect(searchTerms('Was habe ich über Gewohnheiten gelernt?')).toEqual(['gewohnheiten']);
  });

  it('recognises the same title', () => {
    expect(sameTitle('Atomic Habits', '  atomic habits!')).toBe(true);
    expect(sameTitle('Deep Work', 'Deep Work 2')).toBe(false);
  });
});

describe('questions without AI', () => {
  it('quotes the key points about the topic, each with its entry', () => {
    const answer = answerLibraryQuestion('Was habe ich zu Gewohnheiten gelernt?', all);
    expect(answer.terms).toEqual(['gewohnheiten']);
    expect(answer.items.map((item) => item.entry.title)).toEqual([
      'Atomic Habits',
      'Hard Fork: KI im Alltag',
    ]);
    expect(answer.items[0]?.points.map((p) => p.text)).toEqual([
      'Kleine Gewohnheiten summieren sich wie Zinseszins.',
    ]);
    expect(answer.items[0]?.matchedIn).toContain('topic');
  });

  it('a matching topic brings all key points of the entry', () => {
    const answer = answerLibraryQuestion('Was weiß ich über Fokus?', all);
    expect(answer.items.map((item) => item.entry.title)).toEqual(['Deep Work']);
    expect(answer.items[0]?.points).toHaveLength(1);
  });

  it('says when nothing matches or the question has no topic', () => {
    expect(answerLibraryQuestion('Was habe ich zu Kochen gelernt?', all).items).toEqual([]);
    expect(answerLibraryQuestion('Was habe ich gelernt?', all).terms).toEqual([]);
  });
});

describe('list import', () => {
  it('reads headings, prefixes, links, dates, topics and authors', () => {
    const parsed = parseList(
      [
        'Bücher:',
        '- Atomic Habits – James Clear #Gewohnheiten',
        '2. „Deep Work“ von Cal Newport 12.03.2026',
        '',
        'Podcast: Hard Fork | NYT #KI #Tech_News',
        'https://youtu.be/abc123 2026-02-01',
        'Artikel: Warum wir prokrastinieren (2019)',
        'Sapiens (Yuval Noah Harari)',
        '- 12.03.2026',
      ].join('\n'),
      'article',
    );
    expect(parsed.skipped).toBe(1);
    expect(parsed.items.map((item) => ({ ...item, line: undefined }))).toEqual([
      { title: 'Atomic Habits', type: 'book', author: 'James Clear', topics: ['Gewohnheiten'] },
      {
        title: 'Deep Work',
        type: 'book',
        author: 'Cal Newport',
        consumedAt: '2026-03-12',
        topics: [],
      },
      { title: 'Hard Fork', type: 'podcast', author: 'NYT', topics: ['KI', 'Tech News'] },
      {
        title: 'youtu.be',
        type: 'video',
        link: 'https://youtu.be/abc123',
        consumedAt: '2026-02-01',
        topics: [],
      },
      { title: 'Warum wir prokrastinieren', type: 'article', topics: [] },
      { title: 'Sapiens', type: 'book', author: 'Yuval Noah Harari', topics: [] },
    ]);
  });

  it('takes the type from the link when nothing else says it', () => {
    expect(
      parseLine('Lex Fridman https://open.spotify.com/episode/1', undefined, 'book')?.type,
    ).toBe('podcast');
    expect(typeFromLink('https://www.youtube.com/watch?v=1')).toBe('video');
    expect(typeFromLink('https://lenny.substack.com/p/x')).toBe('newsletter');
    expect(typeFromLink('https://zeit.de/x')).toBe('article');
    expect(parseLine('Nur ein Titel', undefined, 'video')?.type).toBe('video');
  });

  it('ignores invalid and future dates', () => {
    expect(parseLine('Buch 31.02.2026', undefined, 'book')?.consumedAt).toBeUndefined();
    const item = parseLine('Buch 01.12.2026', undefined, 'book');
    expect(item?.consumedAt).toBe('2026-12-01');
    expect(item && withoutFutureDate(item, '2026-10-09').consumedAt).toBeUndefined();
  });
});
