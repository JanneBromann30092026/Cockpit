/**
 * Prompt template of the optional question to Claude about my contracts (data, not UI
 * text). Sent are only the structured fields of the contracts – no notes, no originals,
 * no file names. Contracts are referenced as "v1", "v2" …, the answer names its sources.
 */
import { z } from 'zod';

export const CONTRACT_QUESTION_SYSTEM_PROMPT = `Du beantwortest Fragen einer Person zu ihren eigenen Verträgen.
Grundlage sind ausschließlich die mitgeschickten Vertragsangaben (JSON). Erfinde nichts und rate nicht:
Steht etwas nicht in den Angaben, sag das klar und nenne, welche Angabe fehlt.
Rechne Daten nur aus den Angaben; „heute“ steht in der Nachricht.
Antworte auf Deutsch in der Du-Form, freundlich und knapp: höchstens vier Sätze, kein Markdown,
Daten als TT.MM.JJJJ, Beträge in Euro mit Komma (z. B. 19,99 €).
Bei Fristen und Beträgen kurz auf „im Original prüfen“ hinweisen. Keine Rechts- oder Steuerberatung:
solche Punkte nur als „prüfen“ formulieren.
In "quellen" stehen die ref-Werte (z. B. "v2") aller Verträge, auf die sich die Antwort stützt – sonst eine leere Liste.`;

export interface QuestionContract {
  /** Reference in the prompt ("v1"); mapped back to the contract by the caller. */
  ref: string;
  name: string;
  kategorie: string;
  anbieter?: string;
  betrag_eur?: number;
  zahlweise?: string;
  naechste_zahlung?: string;
  laufzeit_endet?: string;
  kuendigungsfrist?: string;
  spaetestens_kuendigen_bis?: string;
  zusammenfassung: string[];
  offene_punkte: string[];
}

export interface ContractQuestionRequest {
  /** "JJJJ-MM-TT". */
  today: string;
  question: string;
  contracts: QuestionContract[];
}

export function buildContractQuestionMessage(input: ContractQuestionRequest): string {
  return JSON.stringify(
    { heute: input.today, frage: input.question, vertraege: input.contracts },
    null,
    1,
  );
}

/** Structured output: the answer and the contracts it is based on. */
export const CONTRACT_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    antwort: { type: 'string', description: 'Die Antwort, höchstens vier Sätze.' },
    quellen: {
      type: 'array',
      items: { type: 'string' },
      description: 'ref-Werte der Verträge, auf die sich die Antwort stützt.',
    },
  },
  required: ['antwort', 'quellen'],
  additionalProperties: false,
} as const;

const answerSchema = z.object({
  antwort: z.string(),
  quellen: z.array(z.string()),
});

export interface ContractAnswer {
  text: string;
  /** Refs of the contracts the answer is based on (only known ones, in order). */
  sources: string[];
}

/** Reads the structured answer; null when it is not usable. */
export function parseContractAnswer(json: string, refs: readonly string[]): ContractAnswer | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = answerSchema.safeParse(value);
  if (!parsed.success) return null;
  const text = parsed.data.antwort
    .replace(/[*_#`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  const sources = [...new Set(parsed.data.quellen.map((ref) => ref.trim()))].filter((ref) =>
    refs.includes(ref),
  );
  return { text, sources };
}
