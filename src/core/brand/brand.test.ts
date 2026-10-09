import { describe, expect, it } from 'vitest';
import { PALETTE_PRESETS } from '@/data/brand/design';
import { buildTemplate } from '@/data/brand/templates';
import { BRAND_DRAFT_KINDS } from '@/data/domain';
import { contrast, normalizeHex, paletteChecks, readableOn } from './color';
import {
  avoidedWordsIn,
  fontsForTone,
  presetForLook,
  profileFromAnswers,
  sentences,
  splitList,
} from './profile';

describe('colours', () => {
  it('computes WCAG contrast and readable text', () => {
    expect(Math.round(contrast('#000000', '#ffffff'))).toBe(21);
    expect(contrast('#777777', '#777777')).toBe(1);
    expect(readableOn('#1d4ed8')).toBe('#ffffff');
    expect(readableOn('#f5c400')).toBe('#000000');
    expect(normalizeHex('1D4ED8')).toBe('#1d4ed8');
    expect(normalizeHex('#12345')).toBeNull();
  });

  it('every preset palette is readable', () => {
    for (const preset of Object.values(PALETTE_PRESETS)) {
      expect(paletteChecks(preset.colors).every((check) => check.ok)).toBe(true);
    }
  });

  it('flags weak pairs', () => {
    const checks = paletteChecks({
      primary: '#ffe08a',
      secondary: '#999999',
      accent: '#ffffff',
      background: '#ffffff',
      text: '#aaaaaa',
    });
    expect(checks.find((check) => check.key === 'text')?.ok).toBe(false);
    expect(checks.find((check) => check.key === 'primary')?.ok).toBe(false);
  });
});

describe('profile without AI', () => {
  it('splits lists and sentences', () => {
    expect(splitList('Ehrlichkeit, Neugier; Leichtigkeit und Mut\n- ehrlichkeit')).toEqual([
      'Ehrlichkeit',
      'Neugier',
      'Leichtigkeit',
      'Mut',
    ]);
    expect(
      sentences('Du musst nicht alles schaffen. Fang heute an! Ok. Noch einer? Und mehr.'),
    ).toEqual(['Du musst nicht alles schaffen.', 'Fang heute an!', 'Noch einer?']);
  });

  it('maps the look and tone to palette and fonts', () => {
    expect(presetForLook('Dunkelblau mit warmem Gelb')).toBe('cobalt');
    expect(presetForLook('dunkel und edel')).toBe('night');
    expect(presetForLook('grün, natürlich')).toBe('forest');
    expect(presetForLook(undefined)).toBe('cobalt');
    expect(fontsForTone('ruhig und klassisch')).toEqual({ heading: 'didot', body: 'charter' });
    expect(fontsForTone('locker')).toEqual({ heading: 'avenir', body: 'inter' });
  });

  it('builds the profile only from what was answered', () => {
    expect(
      profileFromAnswers({
        values: 'Ehrlichkeit, Neugier',
        tone: 'Locker und direkt.',
        wordsAvoided: 'Hustle, Gamechanger',
        examples: 'Du schaffst das. Schritt für Schritt.',
      }),
    ).toEqual({
      tone: 'Locker und direkt.',
      values: ['Ehrlichkeit', 'Neugier'],
      wordsUsed: [],
      wordsAvoided: ['Hustle', 'Gamechanger'],
      examples: ['Du schaffst das.', 'Schritt für Schritt.'],
      preset: 'cobalt',
      headingFont: 'avenir',
      bodyFont: 'inter',
    });
    expect(profileFromAnswers({}).tone).toBeUndefined();
  });

  it('finds avoided words as whole words', () => {
    expect(
      avoidedWordsIn('Das ist ein echter Gamechanger! Krass.', ['gamechanger', 'krass', 'Hustle']),
    ).toEqual(['gamechanger', 'krass']);
    expect(avoidedWordsIn('Hustlerin', ['Hustle'])).toEqual([]);
  });
});

describe('templates', () => {
  const profile = {
    answers: { audience: 'Studierende mit Job. Und mehr.', different: 'Ehrlich statt Hochglanz.' },
    tone: 'locker',
    values: ['Ehrlichkeit'],
    wordsUsed: ['Hey du', 'Schritt für Schritt'],
    wordsAvoided: ['Hustle'],
    examples: ['Du musst nicht alles schaffen.', 'Bis nächste Woche!'],
  };

  it('fills what is known and leaves placeholders for the rest', () => {
    const video = buildTemplate('video', { topic: 'Lernen neben dem Job' }, profile);
    expect(video).toContain('Titel: Lernen neben dem Job');
    expect(video).toContain('Du musst nicht alles schaffen.');
    expect(video).toContain('[Punkt 2]');
    expect(video).toContain('Vermeiden: Hustle');
    const newsletter = buildTemplate('newsletter', { topic: 'Neu', cta: 'Antworte mir' }, profile);
    expect(newsletter).toContain('Hey du,');
    expect(newsletter).toContain('Antworte mir');
    const landing = buildTemplate('landing', { topic: 'Kurs' }, profile);
    expect(landing).toContain('Für wen: Studierende mit Job.');
    expect(landing).toContain('Warum ich: Ehrlich statt Hochglanz.');
  });

  it('works without a profile for every format', () => {
    const empty = { answers: {}, values: [], wordsUsed: [], wordsAvoided: [], examples: [] };
    for (const kind of BRAND_DRAFT_KINDS) {
      const text = buildTemplate(kind, { topic: 'Thema' }, empty);
      expect(text).toContain('Thema');
      expect(text).toMatch(/\[[^\]]+\]/);
    }
  });
});
