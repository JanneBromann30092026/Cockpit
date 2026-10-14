/**
 * Spoken (or typed) commands without AI: a few fixed intents recognised by keywords –
 * plan focus blocks, add a task, open a section. Pure logic.
 */
import type { DayPart } from '../focus/plan';

export interface FocusWish {
  name: string;
  minutesPerWeek?: number;
  blockMinutes?: number;
  dayPart?: DayPart;
}

export type OpenTarget =
  | 'today'
  | 'tasks'
  | 'documents'
  | 'reviews'
  | 'dayReview'
  | 'weekReview'
  | 'library'
  | 'brand'
  | 'settings'
  | 'backup'
  | 'focus';

export type Command =
  | { kind: 'focus'; activities: FocusWish[] }
  | { kind: 'task'; title: string; due?: 'today' | 'tomorrow' | 'dayAfter'; important: boolean }
  | { kind: 'open'; target: OpenTarget }
  | { kind: 'unknown' };

/** Activities Cockpit knows by name, with sensible block lengths. */
interface KnownActivity {
  pattern: RegExp;
  name: (text: string) => string;
  blockMinutes: number;
  minutesPerWeek: number;
}

const mentionsUni = (text: string) => /\b(uni|universität|vorlesung|studium|seminar)/i.test(text);

const KNOWN: KnownActivity[] = [
  {
    pattern: /nach(arbeit|bereit)/i,
    name: (text) => (mentionsUni(text) ? 'Uni nacharbeiten' : 'Nacharbeiten'),
    blockMinutes: 90,
    minutesPerWeek: 180,
  },
  {
    pattern: /vor(arbeit|bereit)/i,
    name: (text) => (mentionsUni(text) ? 'Uni vorarbeiten' : 'Vorarbeiten'),
    blockMinutes: 90,
    minutesPerWeek: 180,
  },
  { pattern: /instagram|insta\b/i, name: () => 'Instagram', blockMinutes: 60, minutesPerWeek: 180 },
  { pattern: /youtube/i, name: () => 'YouTube', blockMinutes: 90, minutesPerWeek: 180 },
  {
    pattern: /video(s|schnitt)?\b|schneiden/i,
    name: () => 'Videos',
    blockMinutes: 90,
    minutesPerWeek: 180,
  },
  { pattern: /hausarbeit/i, name: () => 'Hausarbeit', blockMinutes: 120, minutesPerWeek: 240 },
  {
    pattern: /bachelorarbeit|masterarbeit/i,
    name: (t) => title(t.match(/\w+arbeit/i)?.[0] ?? 'Abschlussarbeit'),
    blockMinutes: 120,
    minutesPerWeek: 360,
  },
  { pattern: /\blernen\b|klausur/i, name: () => 'Lernen', blockMinutes: 90, minutesPerWeek: 240 },
  { pattern: /\blesen\b/i, name: () => 'Lesen', blockMinutes: 45, minutesPerWeek: 120 },
  { pattern: /bewerbung/i, name: () => 'Bewerbungen', blockMinutes: 60, minutesPerWeek: 120 },
];

const NUMBERS: Record<string, number> = {
  ein: 1,
  eine: 1,
  einer: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  anderthalb: 1.5,
  eineinhalb: 1.5,
};

function number(word: string): number | null {
  const normalized = word.toLowerCase().replace(',', '.');
  if (/^\d+(\.\d+)?$/.test(normalized)) return Number(normalized);
  return NUMBERS[normalized] ?? null;
}

function title(text: string): string {
  const trimmed = text.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** "3 Stunden", "zwei Stunden", "90 Minuten" in a clause → minutes. */
function durationIn(clause: string): number | null {
  const match = clause.match(/(\d+(?:[.,]\d+)?|[a-zäöü]+)\s*(stunden?|std\.?|h\b|minuten|min\b)/i);
  if (!match?.[1] || !match[2]) return null;
  const value = number(match[1]);
  if (value === null) return null;
  return /^min/i.test(match[2]) ? value : value * 60;
}

function dayPartIn(clause: string): DayPart | undefined {
  if (/morgens|vormittag|früh/i.test(clause)) return 'morning';
  if (/nachmittag|mittags/i.test(clause)) return 'afternoon';
  if (/abends|abend\b/i.test(clause)) return 'evening';
  return undefined;
}

/** Something that is already in the calendar ("Sport ist schon eingetragen"). */
const ALREADY = /\b(schon|bereits)\b.*\b(eingetragen|drin|im kalender|steht|geplant)/i;

const STOP_WORDS =
  /\b(ich|hätte|gern|gerne|möchte|will|brauche|noch|auch|bitte|mehr|etwas|die|der|das|den|dem|meine?n?|mir|von|zeit|fürs?|zum|zur|aufbringe|verbringe|investiere|habe)\b/gi;

/** Clauses of a sentence: split at full stops, commas and "und"/"aber"/"sowie". */
function clauses(text: string): string[] {
  return text
    .split(/[.;!?]|,|\bund\b|\baber\b|\bsowie\b/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Activities named in a focus request; things already in the calendar are left out. */
export function focusWishes(text: string): FocusWish[] {
  const wishes: FocusWish[] = [];
  const add = (wish: FocusWish) => {
    const key = wish.name.toLowerCase();
    const existing = wishes.find((entry) => entry.name.toLowerCase() === key);
    if (existing) {
      existing.minutesPerWeek ??= wish.minutesPerWeek;
      existing.dayPart ??= wish.dayPart;
      return;
    }
    wishes.push(wish);
  };
  const parts = clauses(text);
  parts.forEach((clause, index) => {
    // "Sport, der ist schon eingetragen": the remark may follow in the next clause.
    const next = parts[index + 1] ?? '';
    if (ALREADY.test(clause) || (ALREADY.test(next) && !/fokus/i.test(clause))) return;
    const minutes = durationIn(clause) ?? undefined;
    const dayPart = dayPartIn(clause);
    const known = KNOWN.find((entry) => entry.pattern.test(clause));
    if (known) {
      add({
        name: known.name(text),
        minutesPerWeek: minutes ?? known.minutesPerWeek,
        blockMinutes: known.blockMinutes,
        dayPart,
      });
      return;
    }
    // "Zeit für Steuern" – an activity Cockpit does not know by name.
    const free = clause.match(/zeit\s+(?:fürs?|zum|zur)\s+(.+)/i)?.[1];
    if (!free) return;
    const name = free.replace(STOP_WORDS, ' ').replace(/\s+/g, ' ').trim();
    if (name.length < 3 || /fokus/i.test(name)) return;
    add({ name: title(name), minutesPerWeek: minutes ?? 120, blockMinutes: 60, dayPart });
  });
  return wishes;
}

const OPEN_TARGETS: [RegExp, OpenTarget][] = [
  [/tages-?review/i, 'dayReview'],
  [/wochen-?review/i, 'weekReview'],
  [/review/i, 'reviews'],
  [/backup|sicherung/i, 'backup'],
  [/aufgaben/i, 'tasks'],
  [/vertr(ag|äge)|dokument/i, 'documents'],
  [/bibliothek/i, 'library'],
  [/marke|brand|markenprofil/i, 'brand'],
  [/einstellung/i, 'settings'],
  [/fokus/i, 'focus'],
  [/heute|tagesüberblick/i, 'today'],
];

function cleanTask(text: string): { title: string; due?: 'today' | 'tomorrow' | 'dayAfter' } {
  let due: 'today' | 'tomorrow' | 'dayAfter' | undefined;
  if (/\bübermorgen\b/i.test(text)) due = 'dayAfter';
  else if (/\bmorgen\b/i.test(text)) due = 'tomorrow';
  else if (/\bheute\b/i.test(text)) due = 'today';
  const cleaned = text
    .replace(/\b(bis\s+)?(übermorgen|morgen|heute)\b/gi, ' ')
    .replace(/\b(wichtig|dringend)\b/gi, ' ')
    .replace(/\b(daran|bitte)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,:.-]+|[\s,:.-]+$/g, '');
  return { title: title(cleaned), due };
}

export function parseCommand(input: string): Command {
  const text = input.trim();
  if (!text) return { kind: 'unknown' };

  const task =
    text.match(/^(?:neue\s+)?(?:aufgabe|to-?do)\s*:?\s+(.+)$/i)?.[1] ??
    text.match(/^erinnere?\s+mich\s+(?:daran,?\s+)?(.+)$/i)?.[1] ??
    text.match(/^ich\s+muss\s+(.+)$/i)?.[1];
  if (task) {
    const { title: name, due } = cleanTask(task);
    if (name.length >= 2) {
      return { kind: 'task', title: name, due, important: /\b(wichtig|dringend)\b/i.test(text) };
    }
  }

  if (/fokus|zeit\s*bl(o|ö)ck|bl(o|ö)cke\s+(einplanen|planen|eintragen)|einplanen/i.test(text)) {
    const opening = /^(öffne|zeig)/i.test(text) && !/für|fürs/i.test(text);
    if (!opening) return { kind: 'focus', activities: focusWishes(text) };
  }

  if (
    /^(öffne|zeig(e)?|geh(e)?\s+zu|zu\s+den?|starte?)\b/i.test(text) ||
    text.split(/\s+/).length <= 3
  ) {
    const target = OPEN_TARGETS.find(([pattern]) => pattern.test(text));
    if (target) return { kind: 'open', target: target[1] };
  }

  return { kind: 'unknown' };
}
