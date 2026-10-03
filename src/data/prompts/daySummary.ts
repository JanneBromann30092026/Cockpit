/**
 * Prompt template of the optional AI day overview (data, not UI text). Only what the
 * overview needs is sent: today's events, due tasks (title, priority, overdue),
 * sender/subject/snippet of mails from people, subjects of updates and the number of
 * newsletters.
 */

export const DAY_SUMMARY_SYSTEM_PROMPT = `Du hilfst einer Person, ihren Tag zu überblicken.
Schreibe genau drei kurze Sätze auf Deutsch in der Du-Form:
1. Was heute das Wichtigste ist.
2. Wo es zeitlich eng wird (oder dass genug Luft ist).
3. Was im Postfach und auf der Aufgabenliste wartet.
Verwende nur die Angaben aus der Nachricht. Erfinde keine Termine, Namen, Fristen oder Inhalte.
Wenn eine Angabe fehlt, lass sie weg. Keine Aufzählungszeichen, keine Überschriften, kein Markdown.`;

export interface DaySummaryEvent {
  time: string;
  title: string;
  location?: string;
}

export interface DaySummaryMail {
  from: string;
  subject: string;
  snippet?: string;
  question?: boolean;
  deadline?: boolean;
}

export interface DaySummaryTask {
  title: string;
  priority: 'hoch' | 'mittel' | 'niedrig';
  /** Days overdue (0 = due today). */
  overdueDays: number;
}

export interface DaySummaryRequest {
  /** e.g. "Montag, 5. Oktober 2026, 09:12 Uhr". */
  now: string;
  /** null: calendar not available. */
  events: DaySummaryEvent[] | null;
  /** null: Gmail not available. */
  mails: {
    important: DaySummaryMail[];
    people: DaySummaryMail[];
    updates: DaySummaryMail[];
    newsletters: number;
  } | null;
  /** Open tasks due today or earlier. */
  tasks: DaySummaryTask[];
}

/** The user message: compact, structured and without anything the overview does not need. */
export function buildDaySummaryMessage(input: DaySummaryRequest): string {
  return JSON.stringify(
    {
      jetzt: input.now,
      termine: input.events ?? 'nicht verfügbar',
      mails: input.mails
        ? {
            wichtig_von_personen: input.mails.important,
            von_personen: input.mails.people,
            updates: input.mails.updates,
            anzahl_newsletter_und_werbung: input.mails.newsletters,
          }
        : 'nicht verfügbar',
      faellige_aufgaben: input.tasks.map((task) => ({
        titel: task.title,
        prioritaet: task.priority,
        ...(task.overdueDays > 0 ? { ueberfaellig_seit_tagen: task.overdueDays } : {}),
      })),
    },
    null,
    1,
  );
}

/** Splits the answer into at most three sentences; markdown remnants are removed. */
export function parseDaySummary(text: string): string[] {
  const clean = text
    .replace(/[*_#>`]/g, '')
    .replace(/^\s*(\d+[.)]|[-•])\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) ?? [clean];
  return sentences
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 3);
}
