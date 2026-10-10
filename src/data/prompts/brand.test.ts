import { describe, expect, it } from 'vitest';
import {
  buildBrandProfileMessage,
  buildBrandWriteMessage,
  parseBrandProfile,
  parseBrandWrite,
} from './brand';

describe('brand prompts', () => {
  it('sends only the answers (and the allowed fonts)', () => {
    const message = JSON.parse(
      buildBrandProfileMessage({ answers: [{ frage: 'Wer?', antwort: 'Ich.' }] }),
    ) as { interview: unknown; schriften: string[] };
    expect(message.interview).toEqual([{ frage: 'Wer?', antwort: 'Ich.' }]);
    expect(message.schriften).toContain('avenir');
  });

  it('reads the profile; invalid colours drop the palette', () => {
    const base = {
      tonalitaet: '**Locker** und direkt.',
      werte: ['Ehrlichkeit', 'ehrlichkeit', ' Neugier '],
      woerter_nutzen: ['Hey du'],
      woerter_nie: ['Hustle'],
      beispielsaetze: ['Eins.', 'Zwei.', 'Drei.', 'Vier.'],
      schrift_ueberschrift: 'didot',
      schrift_text: null,
    };
    const parsed = parseBrandProfile(
      JSON.stringify({
        ...base,
        palette: {
          primary: '#1D4ED8',
          secondary: '#0f172a',
          accent: '#f5c400',
          background: '#ffffff',
          text: '#111111',
        },
      }),
    );
    expect(parsed).toMatchObject({
      tone: 'Locker und direkt.',
      values: ['Ehrlichkeit', 'ehrlichkeit', 'Neugier'],
      examples: ['Eins.', 'Zwei.', 'Drei.'],
      headingFont: 'didot',
    });
    expect(parsed?.palette?.primary).toBe('#1d4ed8');
    expect(parsed?.bodyFont).toBeUndefined();
    const bad = parseBrandProfile(
      JSON.stringify({
        ...base,
        palette: {
          primary: 'blau',
          secondary: '#000000',
          accent: '#000000',
          background: '#ffffff',
          text: '#000000',
        },
      }),
    );
    expect(bad?.palette).toBeUndefined();
    expect(parseBrandProfile(JSON.stringify({ ...base, schrift_text: 'Comic Sans' }))).toBeNull();
  });

  it('write: brief and profile go out, the text comes back without markdown', () => {
    const message = JSON.parse(
      buildBrandWriteMessage({
        kind: 'video',
        topic: 'Lernen',
        profile: {
          werte: ['Ehrlichkeit'],
          woerter_nutzen: [],
          woerter_nie: ['Hustle'],
          beispielsaetze: [],
        },
      }),
    ) as Record<string, unknown>;
    expect(message).toMatchObject({ format: 'video', thema: 'Lernen' });
    expect(message).not.toHaveProperty('details');
    expect(parseBrandWrite(JSON.stringify({ text: '**HOOK**\n\n\n\nHey du' }))).toBe(
      'HOOK\n\nHey du',
    );
    expect(parseBrandWrite(JSON.stringify({ text: '  ' }))).toBeNull();
  });
});
