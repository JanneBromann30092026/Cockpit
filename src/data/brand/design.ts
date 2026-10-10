/**
 * Reference data of the design system: fonts every iPad has and palette presets
 * (all text colours ≥ 4.5:1 on their background, checked in the tests).
 */
import type { BrandColorRole, BrandFont } from '../domain';

export const FONT_STACKS: Record<
  BrandFont,
  { name: string; stack: string; kind: 'sans' | 'serif' | 'mono' }
> = {
  inter: { name: 'Inter', stack: "'Inter Variable', Inter, system-ui, sans-serif", kind: 'sans' },
  system: { name: 'SF Pro', stack: '-apple-system, system-ui, sans-serif', kind: 'sans' },
  avenir: {
    name: 'Avenir Next',
    stack: "'Avenir Next', Avenir, 'Helvetica Neue', sans-serif",
    kind: 'sans',
  },
  futura: {
    name: 'Futura',
    stack: "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif",
    kind: 'sans',
  },
  gillSans: {
    name: 'Gill Sans',
    stack: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif",
    kind: 'sans',
  },
  helvetica: {
    name: 'Helvetica Neue',
    stack: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    kind: 'sans',
  },
  georgia: { name: 'Georgia', stack: 'Georgia, serif', kind: 'serif' },
  charter: {
    name: 'Charter',
    stack: "Charter, 'Bitstream Charter', Georgia, serif",
    kind: 'serif',
  },
  palatino: {
    name: 'Palatino',
    stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', serif",
    kind: 'serif',
  },
  baskerville: {
    name: 'Baskerville',
    stack: "Baskerville, 'Libre Baskerville', Georgia, serif",
    kind: 'serif',
  },
  didot: { name: 'Didot', stack: "Didot, 'Bodoni 72', 'Bodoni MT', serif", kind: 'serif' },
  menlo: { name: 'Menlo', stack: "Menlo, 'SF Mono', Consolas, monospace", kind: 'mono' },
};

export type Palette = Record<BrandColorRole, string>;

export const PALETTE_PRESETS = {
  cobalt: {
    name: 'Kobalt & Sonne',
    colors: {
      primary: '#1d4ed8',
      secondary: '#0f172a',
      accent: '#f5c400',
      background: '#f8fafc',
      text: '#0f172a',
    },
  },
  forest: {
    name: 'Wald',
    colors: {
      primary: '#166534',
      secondary: '#365314',
      accent: '#d97706',
      background: '#f7faf5',
      text: '#1a2e1a',
    },
  },
  coral: {
    name: 'Koralle',
    colors: {
      primary: '#c2410c',
      secondary: '#7c2d12',
      accent: '#0e7490',
      background: '#fff7f2',
      text: '#2b1a12',
    },
  },
  sand: {
    name: 'Sand',
    colors: {
      primary: '#8a5a2b',
      secondary: '#4b3621',
      accent: '#2f6f6a',
      background: '#faf6ef',
      text: '#2a2118',
    },
  },
  night: {
    name: 'Nacht',
    colors: {
      primary: '#8ab4ff',
      secondary: '#c7d2fe',
      accent: '#ffd23f',
      background: '#0b1020',
      text: '#e6ebf5',
    },
  },
  lavender: {
    name: 'Lavendel',
    colors: {
      primary: '#6d28d9',
      secondary: '#4c1d95',
      accent: '#db2777',
      background: '#faf7ff',
      text: '#1f1533',
    },
  },
  mono: {
    name: 'Schwarz-Weiß',
    colors: {
      primary: '#111111',
      secondary: '#4a4a4a',
      accent: '#e11d48',
      background: '#ffffff',
      text: '#111111',
    },
  },
} as const satisfies Record<string, { name: string; colors: Palette }>;

export type PalettePreset = keyof typeof PALETTE_PRESETS;
