/**
 * Prompt templates of the optional AI in the life library (data, not UI text). Claude only
 * gets what the function needs – and never invents content: answers stick to the sent
 * entries, list parsing leaves unknown fields empty, key points come only from my own
 * thoughts.
 */
import { z } from 'zod';

const cleanText = (text: string) =>
  text
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// --- "Was habe ich zu X gelernt?" -----------------------------------------------------

export const LIBRARY_QUESTION_SYSTEM_PROMPT = `Du beantwortest Fragen einer Person zu dem, was sie gelesen, gehört und gesehen hat.
Grundlage sind ausschließlich die mitgeschickten Einträge ihrer Bibliothek (JSON: Titel, Typ, Autor, Datum, Themen, Kernaussagen).
Erfinde nichts und ergänze kein eigenes Wissen über die Werke: Steht etwas nicht in den Einträgen, sag das klar.
Fasse zusammen, was die Person zum gefragten Thema festgehalten hat, und verbinde Gedanken aus mehreren Einträgen, wenn sie zusammenpassen.
Antworte auf Deutsch in der Du-Form, freundlich und knapp: höchstens fünf Sätze, kein Markdown.
In "quellen" stehen die ref-Werte (z. B. "b2") aller Einträge, auf die sich die Antwort stützt – sonst eine leere Liste.`;

export interface QuestionEntry {
  /** Reference in the prompt ("b1"); mapped back to the entry by the caller. */
  ref: string;
  titel: string;
  typ: string;
  autor?: string;
  datum?: string;
  themen: string[];
  kernaussagen: string[];
}

export interface LibraryQuestionRequest {
  question: string;
  entries: QuestionEntry[];
}

export function buildLibraryQuestionMessage(input: LibraryQuestionRequest): string {
  return JSON.stringify({ frage: input.question, eintraege: input.entries }, null, 1);
}

export const LIBRARY_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    antwort: { type: 'string', description: 'Die Antwort, höchstens fünf Sätze.' },
    quellen: {
      type: 'array',
      items: { type: 'string' },
      description: 'ref-Werte der Einträge, auf die sich die Antwort stützt.',
    },
  },
  required: ['antwort', 'quellen'],
  additionalProperties: false,
} as const;

export interface LibraryAnswer {
  text: string;
  /** Refs of the entries the answer is based on (only known ones, in order). */
  sources: string[];
}

export function parseLibraryAnswer(json: string, refs: readonly string[]): LibraryAnswer | null {
  const parsed = z
    .object({ antwort: z.string(), quellen: z.array(z.string()) })
    .safeParse(safeJson(json));
  if (!parsed.success) return null;
  const text = cleanText(parsed.data.antwort);
  if (!text) return null;
  const sources = [...new Set(parsed.data.quellen.map((ref) => ref.trim()))].filter((ref) =>
    refs.includes(ref),
  );
  return { text, sources };
}

// --- List → entries ("Liste mit Claude aufbereiten") ----------------------------------

export const LIBRARY_LIST_SYSTEM_PROMPT = `Du wandelst eine frei geschriebene Liste in Einträge einer persönlichen Bibliothek um.
Jede Zeile oder jeder Aufzählungspunkt ist meist ein Werk: Buch, Artikel, Newsletter, Video oder Podcast.
Übernimm nur, was in der Liste steht. Erfinde nichts und ergänze kein Wissen von außen:
Fehlt der Autor, das Datum oder ein Link, setze null. Ein Datum nur, wenn es eindeutig dasteht (Format JJJJ-MM-TT); ein Jahr allein ist kein Datum.
Typ: "book", "article", "newsletter", "video" oder "podcast" – nur wenn die Liste es nahelegt (Überschrift, Wort, Link), sonst der mitgeschickte Standardtyp.
Themen: höchstens drei kurze deutsche Stichwörter, die in der Zeile stehen oder offensichtlich sind (z. B. #Hashtags); sonst eine leere Liste.
Überschriften, Leerzeilen und Kommentare sind keine Einträge.`;

export const LIBRARY_LIST_MAX_CHARS = 20_000;

export interface LibraryListRequest {
  text: string;
  /** Type for lines that do not say it. */
  defaultType: string;
  today: string;
}

export function buildLibraryListMessage(input: LibraryListRequest): string {
  return JSON.stringify(
    {
      heute: input.today,
      standardtyp: input.defaultType,
      liste: input.text.slice(0, LIBRARY_LIST_MAX_CHARS),
    },
    null,
    1,
  );
}

const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;

export const LIBRARY_LIST_SCHEMA = {
  type: 'object',
  properties: {
    eintraege: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titel: { type: 'string' },
          typ: { type: 'string', enum: ['book', 'article', 'newsletter', 'video', 'podcast'] },
          autor: nullableString,
          link: nullableString,
          datum: nullableString,
          themen: { type: 'array', items: { type: 'string' } },
        },
        required: ['titel', 'typ', 'autor', 'link', 'datum', 'themen'],
        additionalProperties: false,
      },
    },
  },
  required: ['eintraege'],
  additionalProperties: false,
} as const;

export interface ParsedListEntry {
  title: string;
  type: 'book' | 'article' | 'newsletter' | 'video' | 'podcast';
  author?: string;
  link?: string;
  consumedAt?: string;
  topics: string[];
}

const listSchema = z.object({
  eintraege: z.array(
    z.object({
      titel: z.string(),
      typ: z.enum(['book', 'article', 'newsletter', 'video', 'podcast']),
      autor: z.string().nullable(),
      link: z.string().nullable(),
      datum: z.string().nullable(),
      themen: z.array(z.string()),
    }),
  ),
});

function validLink(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function validDate(value: string | null, today: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return undefined;
  return value <= today ? value : undefined;
}

/** Entries from Claude's answer; invalid links and dates are left out. */
export function parseLibraryList(json: string, today: string): ParsedListEntry[] | null {
  const parsed = listSchema.safeParse(safeJson(json));
  if (!parsed.success) return null;
  return parsed.data.eintraege.flatMap((entry) => {
    const title = cleanText(entry.titel).slice(0, 200);
    if (!title) return [];
    const author = entry.autor ? cleanText(entry.autor).slice(0, 120) : '';
    const link = validLink(entry.link);
    const consumedAt = validDate(entry.datum, today);
    return [
      {
        title,
        type: entry.typ,
        ...(author ? { author } : {}),
        ...(link ? { link } : {}),
        ...(consumedAt ? { consumedAt } : {}),
        topics: entry.themen
          .map((topic) => cleanText(topic))
          .filter(Boolean)
          .slice(0, 3),
      },
    ];
  });
}

// --- Key points from my thoughts -----------------------------------------------------

export const LIBRARY_KEY_POINTS_SYSTEM_PROMPT = `Du formulierst Kernaussagen für einen Eintrag in einer persönlichen Bibliothek.
Grundlage sind ausschließlich die Notizen der Person ("gedanken"). Ergänze kein Wissen über das Werk und erfinde nichts.
Schreibe höchstens fünf Kernaussagen, je ein kurzer, eigenständiger deutscher Satz ohne Markdown.
Enthalten die Notizen keine Aussagen zum Inhalt, gib eine leere Liste zurück.`;

export interface LibraryKeyPointsRequest {
  title: string;
  type: string;
  author?: string;
  thoughts: string;
}

export function buildLibraryKeyPointsMessage(input: LibraryKeyPointsRequest): string {
  return JSON.stringify(
    { titel: input.title, typ: input.type, autor: input.author, gedanken: input.thoughts },
    null,
    1,
  );
}

export const LIBRARY_KEY_POINTS_SCHEMA = {
  type: 'object',
  properties: {
    kernaussagen: { type: 'array', items: { type: 'string' } },
  },
  required: ['kernaussagen'],
  additionalProperties: false,
} as const;

export const MAX_KEY_POINTS_FROM_AI = 5;

export function parseLibraryKeyPoints(json: string): string[] | null {
  const parsed = z.object({ kernaussagen: z.array(z.string()) }).safeParse(safeJson(json));
  if (!parsed.success) return null;
  return parsed.data.kernaussagen
    .map((point) => cleanText(point).slice(0, 500))
    .filter(Boolean)
    .slice(0, MAX_KEY_POINTS_FROM_AI);
}

function safeJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}
