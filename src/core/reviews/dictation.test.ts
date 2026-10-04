import { describe, expect, it } from 'vitest';
import { sortDictation, sortSentence, splitSentences } from './dictation';

describe('spoken review text', () => {
  it('splits into sentences, also at "und dann", and drops filler', () => {
    expect(
      splitSentences(
        'heute lief die Präsentation gut. Morgen will ich mehr Sport machen!\nähm. Erst Uni und dann Sport…',
      ),
    ).toEqual([
      'Heute lief die Präsentation gut',
      'Morgen will ich mehr Sport machen!',
      'Erst Uni',
      'Sport',
    ]);
  });

  it('pre-sorts by signal words: plans, then problems, then what went well', () => {
    expect(sortSentence('Heute lief die Präsentation richtig gut')).toBe('wentWell');
    expect(sortSentence('Habe endlich die Steuererklärung erledigt')).toBe('wentWell');
    expect(sortSentence('Das Meeting war nicht gut vorbereitet')).toBe('notWell');
    expect(sortSentence('Ich war den ganzen Nachmittag abgelenkt')).toBe('notWell');
    expect(sortSentence('Keine Pause gemacht')).toBe('notWell');
    expect(sortSentence('Morgen will ich früher anfangen')).toBe('improve');
    expect(sortSentence('Nächstes Mal plane ich mehr Puffer ein')).toBe('improve');
    expect(sortSentence('Mittags mit Mia gegessen')).toBe('note');
  });

  it('does not take inflected or longer words for signal words', () => {
    // "musste" is not "ich muss", "Gutschein" is not "gut".
    expect(sortSentence('Ich musste lange warten')).toBe('note');
    expect(sortSentence('Gutschein eingelöst')).toBe('note');
    expect(sortSentence('Eine gute Idee gehabt')).toBe('wentWell');
  });

  it('returns sentence and section together', () => {
    expect(sortDictation('Sport geschafft. Zu spät ins Bett.')).toEqual([
      { text: 'Sport geschafft', section: 'wentWell' },
      { text: 'Zu spät ins Bett', section: 'notWell' },
    ]);
  });
});
