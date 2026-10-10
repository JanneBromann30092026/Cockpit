/**
 * Prompt templates of the optional AI in the brand kit (data, not UI text): the profile
 * from the interview answers, and texts in the profile's voice. Claude gets only the
 * answers and profile parts – and invents no facts about the person.
 */
import { z } from 'zod';
import { BRAND_FONTS } from '../domain';

const cleanText = (text: string) =>
  text
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function safeJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// --- Profile from the interview ------------------------------------------------------

export const BRAND_PROFILE_SYSTEM_PROMPT = `Du erstellst aus einem Interview das Markenprofil einer Person (Creator, Studium und Job).
Grundlage sind ausschließlich ihre Antworten (JSON: Frage → Antwort). Erfinde keine Fakten über die Person.
Liefere:
- tonalitaet: zwei, drei Sätze, wie ihre Texte klingen sollen (Du-Form an die Person gerichtet).
- werte: drei bis fünf Werte, als einzelne Wörter.
- woerter_nutzen: Wörter und Wendungen, die zu ihr passen – vor allem die, die sie selbst nennt.
- woerter_nie: Wörter, die sie meiden will – vor allem die, die sie selbst nennt.
- beispielsaetze: genau drei kurze Sätze in ihrem Ton (auf Deutsch).
- palette: fünf Farben als Hex (#rrggbb) passend zu ihren Angaben zum Aussehen; text auf background mindestens 4,5:1 Kontrast. Ohne Angaben: null.
- schrift_ueberschrift / schrift_text: je ein Schlüssel aus der Liste (Systemschriften des iPad).
Fehlt etwas in den Antworten, lass die Liste leer bzw. setze null. Kein Markdown.`;

export interface BrandProfileRequest {
  /** Question → answer (only answered questions). */
  answers: { frage: string; antwort: string }[];
}

export function buildBrandProfileMessage(input: BrandProfileRequest): string {
  return JSON.stringify({ interview: input.answers, schriften: BRAND_FONTS }, null, 1);
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const stringList = { type: 'array', items: { type: 'string' } } as const;
const fontOrNull = { anyOf: [{ type: 'string', enum: [...BRAND_FONTS] }, { type: 'null' }] };

export const BRAND_PROFILE_SCHEMA = {
  type: 'object',
  properties: {
    tonalitaet: nullableString,
    werte: stringList,
    woerter_nutzen: stringList,
    woerter_nie: stringList,
    beispielsaetze: stringList,
    palette: {
      anyOf: [
        {
          type: 'object',
          properties: {
            primary: { type: 'string' },
            secondary: { type: 'string' },
            accent: { type: 'string' },
            background: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['primary', 'secondary', 'accent', 'background', 'text'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
    schrift_ueberschrift: fontOrNull,
    schrift_text: fontOrNull,
  },
  required: [
    'tonalitaet',
    'werte',
    'woerter_nutzen',
    'woerter_nie',
    'beispielsaetze',
    'palette',
    'schrift_ueberschrift',
    'schrift_text',
  ],
  additionalProperties: false,
} as const;

export interface BrandAiProfile {
  tone?: string;
  values: string[];
  wordsUsed: string[];
  wordsAvoided: string[];
  examples: string[];
  palette?: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    text: string;
  };
  headingFont?: (typeof BRAND_FONTS)[number];
  bodyFont?: (typeof BRAND_FONTS)[number];
}

const HEX = /^#[0-9a-f]{6}$/i;

const profileSchema = z.object({
  tonalitaet: z.string().nullable(),
  werte: z.array(z.string()),
  woerter_nutzen: z.array(z.string()),
  woerter_nie: z.array(z.string()),
  beispielsaetze: z.array(z.string()),
  palette: z
    .object({
      primary: z.string(),
      secondary: z.string(),
      accent: z.string(),
      background: z.string(),
      text: z.string(),
    })
    .nullable(),
  schrift_ueberschrift: z.enum(BRAND_FONTS).nullable(),
  schrift_text: z.enum(BRAND_FONTS).nullable(),
});

const list = (values: string[], max: number, length = 200) =>
  [...new Set(values.map((value) => cleanText(value).slice(0, length)).filter(Boolean))].slice(
    0,
    max,
  );

/** The profile from Claude's answer; invalid colours drop the whole palette. */
export function parseBrandProfile(json: string): BrandAiProfile | null {
  const parsed = profileSchema.safeParse(safeJson(json));
  if (!parsed.success) return null;
  const data = parsed.data;
  const tone = data.tonalitaet ? cleanText(data.tonalitaet).slice(0, 1000) : '';
  const palette =
    data.palette && Object.values(data.palette).every((hex) => HEX.test(hex.trim()))
      ? (Object.fromEntries(
          Object.entries(data.palette).map(([role, hex]) => [role, hex.trim().toLowerCase()]),
        ) as BrandAiProfile['palette'])
      : undefined;
  return {
    ...(tone ? { tone } : {}),
    values: list(data.werte, 8, 60),
    wordsUsed: list(data.woerter_nutzen, 20, 80),
    wordsAvoided: list(data.woerter_nie, 20, 80),
    examples: list(data.beispielsaetze, 3, 300),
    ...(palette ? { palette } : {}),
    ...(data.schrift_ueberschrift ? { headingFont: data.schrift_ueberschrift } : {}),
    ...(data.schrift_text ? { bodyFont: data.schrift_text } : {}),
  };
}

// --- "Damit bauen" ---------------------------------------------------------------------

export const BRAND_WRITE_SYSTEM_PROMPT = `Du schreibst Texte im Ton eines Markenprofils (Creator, Deutsch, Du-Form an die Zielgruppe).
Halte dich an Tonalität, Werte und Wörter des Profils. Benutze kein Wort aus "woerter_nie".
Erfinde keine Fakten über die Person, keine Zahlen, keine Erfolge, keine Zitate und keine Links:
Was du nicht weißt, schreibst du als Platzhalter in eckigen Klammern, z. B. [Link zum Video].
Formate:
- newsletter: Betreffzeile ("Betreff: …"), Anrede, kurzer Einstieg, Hauptteil, Call to Action, Gruß.
- landing: Überschrift, Unterzeile, Für wen, Nutzen (3 Punkte), Warum ich, Button-Text.
- instagram: Hook in der ersten Zeile, kurzer Text mit Absätzen, Call to Action, 3–5 Hashtags.
- video: YouTube-Skript mit HOOK (0–10 s), INTRO, HAUPTTEIL (nummeriert), CALL TO ACTION, OUTRO – gesprochene Sprache.
Kein Markdown (keine Sternchen, keine Rauten außer bei Hashtags).`;

export interface BrandWriteRequest {
  kind: 'newsletter' | 'landing' | 'instagram' | 'video';
  topic: string;
  details?: string;
  cta?: string;
  profile: {
    wer?: string;
    zielgruppe?: string;
    versprechen?: string;
    anders?: string;
    tonalitaet?: string;
    werte: string[];
    woerter_nutzen: string[];
    woerter_nie: string[];
    beispielsaetze: string[];
  };
}

export function buildBrandWriteMessage(input: BrandWriteRequest): string {
  return JSON.stringify(
    {
      format: input.kind,
      thema: input.topic,
      ...(input.details ? { details: input.details } : {}),
      ...(input.cta ? { call_to_action: input.cta } : {}),
      profil: input.profile,
    },
    null,
    1,
  );
}

export const BRAND_WRITE_SCHEMA = {
  type: 'object',
  properties: {
    text: { type: 'string', description: 'Der fertige Text, Zeilenumbrüche erlaubt.' },
  },
  required: ['text'],
  additionalProperties: false,
} as const;

/** The written text; asterisks are removed, line breaks kept. */
export function parseBrandWrite(json: string): string | null {
  const parsed = z.object({ text: z.string() }).safeParse(safeJson(json));
  if (!parsed.success) return null;
  const text = parsed.data.text
    .replace(/\*\*?|__/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text ? text.slice(0, 20_000) : null;
}
