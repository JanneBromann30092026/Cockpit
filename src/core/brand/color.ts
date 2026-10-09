/** Colour maths for the design system: WCAG contrast and readable text on a colour. */

export function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match?.[1]) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** "1d4ed8", "#1D4ED8" → "#1d4ed8"; null when it is no six-digit hex colour. */
export function normalizeHex(input: string): string | null {
  const text = input.trim().replace(/^#?/, '#').toLowerCase();
  return parseHex(text) ? text : null;
}

/** Relative luminance (WCAG 2.x). */
export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Black or white – whichever reads better on the colour. */
export function readableOn(hex: string): '#000000' | '#ffffff' {
  return contrast(hex, '#000000') >= contrast(hex, '#ffffff') ? '#000000' : '#ffffff';
}

export interface PaletteColors {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
}

export type ContrastCheckKey = 'text' | 'primary' | 'onPrimary' | 'onAccent';

export interface ContrastCheck {
  key: ContrastCheckKey;
  ratio: number;
  /** Required ratio: 4.5 for body text, 3 for headings and buttons. */
  required: number;
  ok: boolean;
}

/** The pairs that matter for texts and buttons in the palette. */
export function paletteChecks(colors: PaletteColors): ContrastCheck[] {
  const pairs: [ContrastCheckKey, number, number][] = [
    ['text', contrast(colors.text, colors.background), 4.5],
    ['primary', contrast(colors.primary, colors.background), 3],
    ['onPrimary', contrast(readableOn(colors.primary), colors.primary), 4.5],
    ['onAccent', contrast(readableOn(colors.accent), colors.accent), 4.5],
  ];
  return pairs.map(([key, ratio, required]) => ({
    key,
    ratio: Math.round(ratio * 10) / 10,
    required,
    ok: ratio >= required,
  }));
}
