/**
 * "Vergangenes in einem Rutsch nachtragen": a pasted or typed list becomes library
 * entries. One line per entry, e.g.
 *
 *   Bücher:
 *   - Atomic Habits – James Clear #Gewohnheiten
 *   Podcast: Hard Fork, Folge 120 | NYT
 *   https://youtu.be/abc 12.03.2026 #KI
 *
 * Recognised: section headings ("Bücher:", "Podcasts"), a type prefix ("Buch:"), links
 * (YouTube → Video, Spotify/Apple Podcasts → Podcast, Substack → Newsletter, other →
 * Artikel), dates (TT.MM.JJJJ or JJJJ-MM-TT), #Themen and "Titel – Autor". Nothing is
 * invented: what a line does not say stays empty.
 */
import { cleanTopics, fold } from './library';

/** Must match LIBRARY_TYPES in src/data/domain.ts. */
export type ListType = 'book' | 'article' | 'newsletter' | 'video' | 'podcast';

export interface ListItem {
  title: string;
  type: ListType;
  author?: string;
  link?: string;
  consumedAt?: string;
  topics: string[];
  /** The original line (shown in the preview). */
  line: string;
}

export interface ParsedList {
  items: ListItem[];
  /** Lines that contained no title (e.g. only a date). */
  skipped: number;
}

export const MAX_LIST_ITEMS = 200;

/** Type words (folded): headings, prefixes and plural forms. */
const TYPE_WORDS: Record<string, ListType> = {
  buch: 'book',
  bucher: 'book',
  book: 'book',
  books: 'book',
  hörbuch: 'book',
  horbuch: 'book',
  horbucher: 'book',
  ebook: 'book',
  artikel: 'article',
  article: 'article',
  articles: 'article',
  blog: 'article',
  blogpost: 'article',
  blogartikel: 'article',
  essay: 'article',
  newsletter: 'newsletter',
  video: 'video',
  videos: 'video',
  youtube: 'video',
  yt: 'video',
  film: 'video',
  doku: 'video',
  podcast: 'podcast',
  podcasts: 'podcast',
  folge: 'podcast',
  episode: 'podcast',
};

function typeWord(text: string): ListType | undefined {
  return TYPE_WORDS[fold(text).replace(/[^\p{L}]/gu, '')];
}

/** Type of a link by its host. */
export function typeFromLink(url: string): ListType {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'article';
  }
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com)$/.test(host)) return 'video';
  if (
    /(^|\.)(podcasts\.apple\.com|overcast\.fm|pca\.st|podcasts\.google\.com)$/.test(host) ||
    (/(^|\.)spotify\.com$/.test(host) && /\/(episode|show)\//.test(url))
  ) {
    return 'podcast';
  }
  if (/(^|\.)(substack\.com|beehiiv\.com|steadyhq\.com|buttondown\.email)$/.test(host)) {
    return 'newsletter';
  }
  return 'article';
}

function validDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1) return undefined;
  if (year < 1900 || year > 2200) return undefined;
  return date.toISOString().slice(0, 10);
}

/** Finds a date and removes it from the text. */
function takeDate(text: string): { text: string; date?: string } {
  const german = /(?:^|\s|\()(\d{1,2})\.(\d{1,2})\.(\d{4})(?=$|\s|\)|,)/.exec(text);
  if (german) {
    const date = validDate(Number(german[3]), Number(german[2]), Number(german[1]));
    if (date) return { text: text.replace(german[0], ' '), date };
  }
  const iso = /(?:^|\s|\()(\d{4})-(\d{2})-(\d{2})(?=$|\s|\)|,)/.exec(text);
  if (iso) {
    const date = validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (date) return { text: text.replace(iso[0], ' '), date };
  }
  return { text };
}

const BULLET = /^\s*(?:[-*•–·◦]|\d{1,3}[.)]|\[[ xX]?\])\s+/u;
const QUOTES = /^[\s"'„“”»«‚‘’]+|[\s"'„“”»«‚‘’]+$/gu;
const SEPARATORS = [' – ', ' — ', ' - ', ' | ', ' von ', ' by ', '; '];

function cleanPart(text: string): string {
  return text
    .replace(QUOTES, '')
    .replace(/\s+/g, ' ')
    .replace(/[,;:]+$/, '')
    .trim();
}

/** A single line → an entry (or null when no title is left). */
export function parseLine(
  raw: string,
  sectionType: ListType | undefined,
  fallback: ListType,
): ListItem | null {
  let text = raw.replace(BULLET, '').trim();

  // "Buch: Titel" / "Podcast – Titel"
  const prefix = /^([\p{L}-]{2,12})\s*[:–—-]\s+/u.exec(text);
  const prefixType = prefix?.[1] ? typeWord(prefix[1]) : undefined;
  if (prefix && prefixType) text = text.slice(prefix[0].length);

  const urlMatch = /https?:\/\/[^\s<>"]+/i.exec(text);
  const link = urlMatch?.[0].replace(/[),.;]+$/, '');
  // A video or podcast link says more than the section heading above it.
  const fromLink = link ? typeFromLink(link) : undefined;
  const linkType = fromLink === 'article' ? undefined : fromLink;
  if (urlMatch) text = text.replace(urlMatch[0], ' ');

  const topics: string[] = [];
  text = text.replace(/(^|\s)#([\p{L}\d_-]+)/gu, (_match, space: string, topic: string) => {
    topics.push(topic);
    return space;
  });

  const dated = takeDate(text);
  text = dated.text;

  // "Titel (Autor)" – a year in brackets is no author.
  let author: string | undefined;
  const bracket = /\(([^()]{2,80})\)\s*$/.exec(text);
  if (bracket?.[1] && !/^\d{4}$/.test(bracket[1].trim())) {
    author = cleanPart(bracket[1]);
    text = text.slice(0, bracket.index);
  } else if (bracket) {
    text = text.slice(0, bracket.index);
  }

  let title = text;
  if (!author) {
    for (const separator of SEPARATORS) {
      const index = text.indexOf(separator);
      if (index > 0) {
        title = text.slice(0, index);
        author = cleanPart(text.slice(index + separator.length)) || undefined;
        break;
      }
    }
  }
  title = cleanPart(title);
  if (!title && link) title = linkTitle(link);
  if (!title || title.replace(/[^\p{L}\d]/gu, '').length === 0) return null;

  return {
    title: title.slice(0, 200),
    type: prefixType ?? linkType ?? sectionType ?? (link ? 'article' : fallback),
    ...(author ? { author: author.slice(0, 120) } : {}),
    ...(link ? { link } : {}),
    ...(dated.date ? { consumedAt: dated.date } : {}),
    topics: cleanTopics(topics),
    line: raw.trim(),
  };
}

/** Without a title, a link names itself by its host ("youtube.com"). */
function linkTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A heading line ("Bücher:", "## Podcasts") sets the type of the following lines. */
function headingType(line: string): ListType | undefined {
  const text = line.replace(/^[#\s]+/, '').trim();
  if (!/^[\p{L}\s-]{2,20}:?$/u.test(text)) return undefined;
  return typeWord(text.replace(/:$/, ''));
}

export function parseList(text: string, fallback: ListType = 'book'): ParsedList {
  const items: ListItem[] = [];
  let skipped = 0;
  let section: ListType | undefined;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const heading = headingType(raw);
    if (heading) {
      section = heading;
      continue;
    }
    const item = parseLine(raw, section, fallback);
    if (item) items.push(item);
    else skipped += 1;
    if (items.length >= MAX_LIST_ITEMS) break;
  }
  return { items, skipped };
}

/** Dates after today are typos (or plans) – they are left out. */
export function withoutFutureDate(item: ListItem, today: string): ListItem {
  if (!item.consumedAt || item.consumedAt <= today) return item;
  const rest = { ...item };
  delete rest.consumedAt;
  return rest;
}
