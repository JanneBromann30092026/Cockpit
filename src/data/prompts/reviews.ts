/**
 * Prompt templates of the optional AI evaluation of the daily and weekly review (data, not
 * UI text). Sent is only what the review is about: the day's events (time and title), task
 * titles with priority, the user's note and points – for the week the daily reviews and
 * task counts. Structured output; every point is later marked "(Claude)".
 */
import { z } from 'zod';
import { LIMITS } from '../schemas';

export const DAY_REVIEW_SYSTEM_PROMPT = `Du hilfst einer Person bei ihrem Tages-Review am Abend.
Grundlage sind ausschließlich die Angaben in der Nachricht: Termine, erledigte und offene Aufgaben, ihre Notiz und die bisherigen Punkte.
Schreibe je Abschnitt zwei bis drei konkrete, kurze Punkte auf Deutsch (je höchstens ein Satz, ohne Aufzählungszeichen):
- gut_gelaufen: was heute gut lief,
- nicht_gut: was nicht gut lief,
- besser_machen: was sie morgen konkret anders macht.
Erfinde nichts und rate nicht. Offene Aufgaben werden nicht verschoben und es werden keine neuen Termine geplant – nenne sie unter besser_machen (z. B. „Offen: Steuererklärung abschicken“).
Wiederhole keine bisherigen Punkte; ergänze nur, was fehlt. Hat ein Abschnitt schon drei Punkte, gib dort eine leere Liste zurück.
Keine Diagnosen und keine Rechts-, Steuer- oder Gesundheitsberatung.`;

export const WEEK_REVIEW_SYSTEM_PROMPT = `Du hilfst einer Person bei ihrem Wochen-Review am Sonntag.
Grundlage sind ausschließlich die Angaben in der Nachricht: ihre Tages-Reviews der Woche, die Zahl erledigter Aufgaben, offene Aufgaben und die bisherigen Punkte.
Schreibe auf Deutsch:
- muster: zwei bis drei Muster, die sich in der Woche wiederholen,
- bremsen: zwei bis drei größte Bremsen,
- aenderungen: genau drei konkrete Änderungen für die nächste Woche, jede als kleine, prüfbare Aufgabe (eine klare Handlung, höchstens 80 Zeichen), die am Montag beginnen kann.
Erfinde nichts. Gibt es nur wenige Tages-Reviews, sag das in muster als einen Punkt (z. B. „Nur zwei Tages-Reviews – die Muster sind noch unsicher“).
Wiederhole keine bisherigen Punkte. Keine Diagnosen und keine Rechts-, Steuer- oder Gesundheitsberatung.`;

export interface ReviewTaskLine {
  titel: string;
  prioritaet: 'hoch' | 'mittel' | 'niedrig';
  ueberfaellig_seit_tagen?: number;
}

export interface DayReviewRequest {
  /** e.g. "Montag, 5. Oktober 2026". */
  date: string;
  /** null: the calendar is not available. */
  events: { zeit: string; titel: string }[] | null;
  done: ReviewTaskLine[];
  open: ReviewTaskLine[];
  note?: string;
  current: { wentWell: string[]; notWell: string[]; improve: string[] };
}

export interface WeekReviewDay {
  datum: string;
  gut_gelaufen: string[];
  nicht_gut: string[];
  besser_machen: string[];
  notiz?: string;
}

export interface WeekReviewRequest {
  /** e.g. "Mo., 28.09. – So., 04.10.2026". */
  week: string;
  days: WeekReviewDay[];
  doneCount: number;
  open: ReviewTaskLine[];
  current: { patterns: string[]; brakes: string[]; changes: string[] };
}

export function buildDayReviewMessage(input: DayReviewRequest): string {
  return JSON.stringify(
    {
      tag: input.date,
      termine: input.events ?? 'nicht verfügbar',
      erledigte_aufgaben: input.done,
      offene_faellige_aufgaben: input.open,
      meine_notiz: input.note ?? '',
      bisherige_punkte: {
        gut_gelaufen: input.current.wentWell,
        nicht_gut: input.current.notWell,
        besser_machen: input.current.improve,
      },
    },
    null,
    1,
  );
}

export function buildWeekReviewMessage(input: WeekReviewRequest): string {
  return JSON.stringify(
    {
      woche: input.week,
      tages_reviews: input.days,
      erledigte_aufgaben_anzahl: input.doneCount,
      offene_faellige_aufgaben: input.open,
      bisherige_punkte: {
        muster: input.current.patterns,
        bremsen: input.current.brakes,
        aenderungen: input.current.changes,
      },
    },
    null,
    1,
  );
}

const list = (description: string) => ({
  type: 'array',
  items: { type: 'string' },
  description,
});

export const DAY_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    gut_gelaufen: list('Was gut lief, zwei bis drei Punkte.'),
    nicht_gut: list('Was nicht gut lief, zwei bis drei Punkte.'),
    besser_machen: list('Was morgen besser wird, zwei bis drei Punkte.'),
  },
  required: ['gut_gelaufen', 'nicht_gut', 'besser_machen'],
  additionalProperties: false,
} as const;

export const WEEK_REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    muster: list('Muster der Woche, zwei bis drei Punkte.'),
    bremsen: list('Größte Bremsen, zwei bis drei Punkte.'),
    aenderungen: list('Genau drei konkrete Änderungen für die nächste Woche.'),
  },
  required: ['muster', 'bremsen', 'aenderungen'],
  additionalProperties: false,
} as const;

/** Points per section Claude may add (the editors ask for two to three). */
const MAX_POINTS = 3;
/** Changes become task titles. */
const MAX_CHANGE_LENGTH = LIMITS.title;

function points(values: string[], max: number, maxLength: number = LIMITS.item): string[] {
  return [
    ...new Set(
      values
        .map((value) =>
          value
            .replace(/^\s*(\d+[.)]|[-•*])\s*/, '')
            .replace(/[*_#`]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maxLength)
            .trim(),
        )
        .filter(Boolean),
    ),
  ].slice(0, max);
}

function parseJson(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

const daySchema = z.object({
  gut_gelaufen: z.array(z.string()),
  nicht_gut: z.array(z.string()),
  besser_machen: z.array(z.string()),
});

const weekSchema = z.object({
  muster: z.array(z.string()),
  bremsen: z.array(z.string()),
  aenderungen: z.array(z.string()),
});

export interface DayReviewPoints {
  wentWell: string[];
  notWell: string[];
  improve: string[];
}

export interface WeekReviewPoints {
  patterns: string[];
  brakes: string[];
  changes: string[];
}

/** Reads Claude's points; null when the answer is not usable or empty. */
export function parseDayReview(json: string): DayReviewPoints | null {
  const parsed = daySchema.safeParse(parseJson(json));
  if (!parsed.success) return null;
  const result = {
    wentWell: points(parsed.data.gut_gelaufen, MAX_POINTS),
    notWell: points(parsed.data.nicht_gut, MAX_POINTS),
    improve: points(parsed.data.besser_machen, MAX_POINTS),
  };
  return Object.values(result).some((section) => section.length > 0) ? result : null;
}

export function parseWeekReview(json: string): WeekReviewPoints | null {
  const parsed = weekSchema.safeParse(parseJson(json));
  if (!parsed.success) return null;
  const result = {
    patterns: points(parsed.data.muster, MAX_POINTS),
    brakes: points(parsed.data.bremsen, MAX_POINTS),
    changes: points(parsed.data.aenderungen, LIMITS.weeklyChanges, MAX_CHANGE_LENGTH),
  };
  return Object.values(result).some((section) => section.length > 0) ? result : null;
}
