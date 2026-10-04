/**
 * Prompt template for reading a contract from its original (PDF or photo) with Claude
 * (data, not UI text). Only the one file and today's date are sent – no file name, no
 * other contract data. Claude fills only what the document says; everything else stays
 * null and becomes an open point. Account and ID numbers are never taken over (prompt and
 * a check on this device).
 */
import { z } from 'zod';
import { withoutSensitive, type ContractExtraction } from '@/core/documents/extract';
import { DOCUMENT_CATEGORIES, PAYMENT_INTERVALS, type DocumentCategory } from '../domain';
import { isoDate, LIMITS } from '../schemas';

export const CONTRACT_EXTRACT_SYSTEM_PROMPT = `Du liest einen Vertrag oder eine Vertragsunterlage einer Person aus (PDF oder Foto) und überträgst die Angaben in Felder.
Regeln:
- Übernimm nur, was eindeutig im Dokument steht. Erfinde nichts und rate nicht.
- Ist eine Angabe unklar, widersprüchlich oder fehlt sie: Feld auf null setzen und dazu einen kurzen offenen Punkt formulieren (z. B. „Kündigungsfrist steht nicht im Dokument“).
- Niemals übernehmen, auch nicht in Zusammenfassung oder offene Punkte: Kontonummern, IBAN, BIC, Ausweis-, Steuer-, Kunden-, Vertrags-, Versicherungsschein- oder Mitgliedsnummern, Geburtsdaten, Adressen, Unterschriften.
- name: kurzer Name nach Art des Vertrags, z. B. „Hausratversicherung“, „Handyvertrag“, „Mietvertrag Wohnung“.
- category: housing (Miete, Wohnen), insurance (Versicherungen), mobile (Handy), internet, energy (Strom, Gas, Heizung), subscription (Abos, Mitgliedschaften), mobility (Auto, Bahn, Fahrrad), finance (Kredit, Konto, Sparen), other.
- provider: Vertragspartner (Firma oder Vermieter).
- amount_eur: regelmäßiger Betrag in Euro als Zahl (z. B. 19.99); interval: Zahlweise dazu.
- due_date: nächster Zahlungs- oder Verlängerungstermin am oder nach „heute“, nur wenn er sich eindeutig aus dem Dokument ergibt.
- term_end: Ende der aktuellen Laufzeit (Mindestlaufzeit, Vertrags- oder Versicherungsjahr), nur wenn eindeutig.
- Daten im Format JJJJ-MM-TT.
- notice_period: Kündigungsfrist wörtlich wie im Dokument (z. B. „3 Monate zum Ende der Laufzeit“).
- summary: höchstens fünf kurze Stichpunkte zu den wichtigsten Inhalten (Leistungen, Laufzeit, Besonderheiten), ohne Nummern.
- open_points: höchstens fünf kurze Punkte zu dem, was unklar ist oder fehlt.
Schreibe alles auf Deutsch.`;

const nullable = (schema: Record<string, unknown>, description: string) => ({
  description,
  anyOf: [schema, { type: 'null' }],
});

/** Structured output of the extraction. */
export const CONTRACT_EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    name: nullable({ type: 'string' }, 'Kurzer Name nach Art des Vertrags.'),
    category: nullable({ type: 'string', enum: [...DOCUMENT_CATEGORIES] }, 'Kategorie.'),
    provider: nullable({ type: 'string' }, 'Vertragspartner.'),
    amount_eur: nullable({ type: 'number' }, 'Regelmäßiger Betrag in Euro.'),
    interval: nullable({ type: 'string', enum: [...PAYMENT_INTERVALS] }, 'Zahlweise.'),
    due_date: nullable({ type: 'string', format: 'date' }, 'Nächster Zahlungstermin.'),
    term_end: nullable({ type: 'string', format: 'date' }, 'Ende der aktuellen Laufzeit.'),
    notice_period: nullable({ type: 'string' }, 'Kündigungsfrist wörtlich.'),
    summary: {
      type: 'array',
      items: { type: 'string' },
      description: 'Höchstens fünf Stichpunkte.',
    },
    open_points: {
      type: 'array',
      items: { type: 'string' },
      description: 'Unklares oder Fehlendes.',
    },
  },
  required: [
    'name',
    'category',
    'provider',
    'amount_eur',
    'interval',
    'due_date',
    'term_end',
    'notice_period',
    'summary',
    'open_points',
  ],
  additionalProperties: false,
} as const;

export function buildContractExtractText(today: string): string {
  return `Heute ist der ${today}. Lies den angehängten Vertrag aus.`;
}

const rawSchema = z.object({
  name: z.string().nullable(),
  category: z.string().nullable(),
  provider: z.string().nullable(),
  amount_eur: z.number().nullable(),
  interval: z.string().nullable(),
  due_date: z.string().nullable(),
  term_end: z.string().nullable(),
  notice_period: z.string().nullable(),
  summary: z.array(z.string()),
  open_points: z.array(z.string()),
});

function text(value: string | null, max: number): string | undefined {
  const clean = value?.replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : undefined;
}

/** Open points Claude may add at once. */
const MAX_OPEN_POINTS = 10;

function list(values: string[]): string[] {
  return [
    ...new Set(
      values
        .map((value) => text(value.replace(/^\s*[-•*]\s*/, ''), LIMITS.item))
        .filter((value): value is string => value !== undefined),
    ),
  ];
}

function date(value: string | null): string | undefined {
  return value && isoDate.safeParse(value).success ? value : undefined;
}

function oneOf<T extends string>(values: readonly T[], value: string | null): T | undefined {
  return values.find((entry) => entry === value);
}

/**
 * Reads the structured answer into contract fields: unknown values, invalid dates and
 * out-of-range amounts are left out; sensitive entries are removed and counted.
 * Null when the answer is not usable.
 */
export function parseContractExtraction(json: string): ContractExtraction<DocumentCategory> | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const parsed = rawSchema.safeParse(value);
  if (!parsed.success) return null;
  const raw = parsed.data;
  const amount =
    raw.amount_eur !== null &&
    Number.isFinite(raw.amount_eur) &&
    raw.amount_eur >= 0 &&
    raw.amount_eur <= LIMITS.amount
      ? Math.round(raw.amount_eur * 100) / 100
      : undefined;
  // Sensitive entries go first, so they do not take the place of others.
  const clean = withoutSensitive({
    name: text(raw.name, LIMITS.name),
    category: oneOf(DOCUMENT_CATEGORIES, raw.category),
    provider: text(raw.provider, LIMITS.name),
    amount,
    interval: oneOf(PAYMENT_INTERVALS, raw.interval),
    dueDate: date(raw.due_date),
    termEnd: date(raw.term_end),
    noticePeriod: text(raw.notice_period, LIMITS.short),
    summary: list(raw.summary),
    openPoints: list(raw.open_points),
  });
  return {
    ...clean,
    summary: clean.summary.slice(0, LIMITS.summaryPoints),
    openPoints: clean.openPoints.slice(0, MAX_OPEN_POINTS),
  };
}
