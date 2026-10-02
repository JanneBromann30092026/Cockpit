import { describe, expect, it } from 'vitest';
import { mergeTags, parseTags, TAG_MAX_LENGTH } from './tags';

describe('tags', () => {
  it('splits at comma, semicolon and line break and removes leading #', () => {
    expect(parseTags('Seminar, #Altersvorsorge; Azubis\nBU')).toEqual([
      'Seminar',
      'Altersvorsorge',
      'Azubis',
      'BU',
    ]);
  });

  it('collapses whitespace, drops empty entries and case-insensitive duplicates', () => {
    expect(parseTags('  Junge   Familie ,, junge familie; ;Ärzte, ÄRZTE')).toEqual([
      'Junge Familie',
      'Ärzte',
    ]);
  });

  it('cuts overly long tags', () => {
    const [tag] = parseTags('x'.repeat(TAG_MAX_LENGTH + 10));
    expect(tag).toHaveLength(TAG_MAX_LENGTH);
  });

  it('keeps existing tags and their spelling when merging', () => {
    expect(mergeTags(['BU', 'Kfz'], ['bu', 'Hausrat'])).toEqual(['BU', 'Kfz', 'Hausrat']);
  });
});
