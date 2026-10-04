/**
 * zod schemas of the decrypted records. Everything here is personal data and is only
 * ever stored encrypted (src/data/repositories/rows.ts). The fields follow CLAUDE.md
 * ("Vision"); the feature steps refine them. Payloads are encrypted JSON, so new optional
 * fields need no database migration.
 */
import { z } from 'zod';
import {
  DOCUMENT_AI_FIELDS,
  DOCUMENT_CATEGORIES,
  LIBRARY_TYPES,
  NOTICE_UNITS,
  PAYMENT_INTERVALS,
  PRIORITIES,
  REVIEW_KINDS,
  TASK_STATUSES,
} from './domain';

export const LIMITS = {
  settingKey: 100,
  title: 200,
  name: 120,
  short: 200,
  item: 500,
  items: 20,
  topic: 40,
  topics: 30,
  url: 2_000,
  text: 5_000,
  notes: 20_000,
  /** Contract summary: at most five bullet points (CLAUDE.md). */
  summaryPoints: 5,
  /** Weekly review: exactly three concrete changes. */
  weeklyChanges: 3,
  amount: 1_000_000,
  fileName: 200,
  /** Attached originals per contract. */
  files: 20,
  noticeAmount: 36,
} as const;

// --- Building blocks --------------------------------------------------------

const id = z.uuid();
const timestamp = z.iso.datetime();

/** Calendar date "JJJJ-MM-TT" (local time, no time zone). */
export const isoDate = z.iso.date();

/** Trimmed string; empty strings become undefined (field removed). */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : undefined));

const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Trimmed, non-empty, unique entries. */
const textList = (maxItem: number, maxItems: number) =>
  z
    .array(z.string().trim().min(1).max(maxItem))
    .max(maxItems)
    .transform((values) => [...new Set(values)]);

/** Technical fields of every record; `demo` marks invented developer data. */
const base = {
  id,
  createdAt: timestamp,
  updatedAt: timestamp,
  demo: z.boolean().default(false),
};

// --- Settings ----------------------------------------------------------------

export const settingKeySchema = requiredText(LIMITS.settingKey);

// --- Tasks (step 5) ----------------------------------------------------------

export const taskFields = {
  title: requiredText(LIMITS.title),
  status: z.enum(TASK_STATUSES).default('open'),
  dueDate: isoDate.optional(),
  priority: z.enum(PRIORITIES).default('medium'),
  notes: optionalText(LIMITS.text),
  completedAt: timestamp.optional(),
};
export const taskSchema = z.object({ ...base, ...taskFields });
export type Task = z.output<typeof taskSchema>;
export const taskInputSchema = z.object(taskFields);

// --- Contracts & documents (step 6) -------------------------------------------

/**
 * An attached original (PDF or photo). The content is stored in the `files` table,
 * encrypted with its own random key; the key lives here, inside the encrypted contract,
 * so a password change only re-encrypts the contracts, never the (large) files.
 */
export const fileMetaSchema = z.object({
  id,
  name: requiredText(LIMITS.fileName),
  type: z.string().trim().max(100),
  size: z.int().min(0),
  addedAt: timestamp,
  /** AES-256 key of the content, base64. */
  key: z.base64(),
});
export type FileMeta = z.output<typeof fileMetaSchema>;

/** A notice period that can be calculated with ("3 Monate"). */
export const noticeSchema = z.object({
  amount: z.int().min(1).max(LIMITS.noticeAmount),
  unit: z.enum(NOTICE_UNITS),
});
export type Notice = z.output<typeof noticeSchema>;

export const documentFields = {
  name: requiredText(LIMITS.name),
  category: z.enum(DOCUMENT_CATEGORIES).default('other'),
  provider: optionalText(LIMITS.name),
  /** Next payment or renewal date. */
  dueDate: isoDate.optional(),
  /** Amount in euros. */
  amount: z.number().min(0).max(LIMITS.amount).optional(),
  interval: z.enum(PAYMENT_INTERVALS).optional(),
  /** End of the current term (renews or ends then); the notice period counts back from it. */
  termEnd: isoDate.optional(),
  /** Notice period as written in the contract. */
  noticePeriod: optionalText(LIMITS.short),
  /** The same period as numbers, when it can be calculated. */
  notice: noticeSchema.optional(),
  summary: textList(LIMITS.item, LIMITS.summaryPoints).default([]),
  /** Unknown facts ("offene Punkte") instead of invented values. */
  openPoints: textList(LIMITS.item, LIMITS.items).default([]),
  notes: optionalText(LIMITS.notes),
  files: z.array(fileMetaSchema).max(LIMITS.files).default([]),
  /** Fields Claude read from an original and nobody changed since ("im Original prüfen"). */
  aiFields: z
    .array(z.enum(DOCUMENT_AI_FIELDS))
    .default([])
    .transform((values) => [...new Set(values)]),
};
export const documentSchema = z.object({ ...base, ...documentFields });
export type DocumentRecord = z.output<typeof documentSchema>;
export const documentInputSchema = z.object(documentFields);

// --- Reviews (step 7) ---------------------------------------------------------

const points = textList(LIMITS.item, LIMITS.items).default([]);

export const reviewFields = {
  kind: z.enum(REVIEW_KINDS),
  /** Day of the review (weekly: the Sunday). */
  date: isoDate,
  wentWell: points,
  notWell: points,
  improve: points,
  note: optionalText(LIMITS.notes),
  /** Weekly review: patterns, biggest brakes and exactly three concrete changes. */
  patterns: points,
  brakes: points,
  changes: textList(LIMITS.item, LIMITS.weeklyChanges).default([]),
  /** When the review was finished (a started review is a draft). */
  doneAt: timestamp.optional(),
  /** Weekly review: the tasks created from the three changes (same order). */
  changeTaskIds: z.array(id).max(LIMITS.weeklyChanges).default([]),
};
export const reviewSchema = z.object({ ...base, ...reviewFields });
export type Review = z.output<typeof reviewSchema>;
export const reviewInputSchema = z.object(reviewFields);

// --- Life library (step 9) -----------------------------------------------------

const keyPoint = z.object({
  text: requiredText(LIMITS.item),
  /** Phrased by the optional AI; shown with "(Claude)". */
  byClaude: z.boolean().default(false),
});

export const libraryFields = {
  title: requiredText(LIMITS.title),
  type: z.enum(LIBRARY_TYPES),
  /** Author or source. */
  author: optionalText(LIMITS.name),
  link: optionalText(LIMITS.url).refine((value) => !value || z.url().safeParse(value).success),
  consumedAt: isoDate.optional(),
  topics: textList(LIMITS.topic, LIMITS.topics).default([]),
  keyPoints: z.array(keyPoint).max(LIMITS.items).default([]),
  thoughts: optionalText(LIMITS.notes),
};
export const libraryEntrySchema = z.object({ ...base, ...libraryFields });
export type LibraryEntry = z.output<typeof libraryEntrySchema>;
export const libraryInputSchema = z.object(libraryFields);

// --- Brand profile (step 10) ---------------------------------------------------

export const brandFields = {
  /** Interview answers by question key (questions live in src/data with step 10). */
  answers: z.record(z.string().max(LIMITS.topic), z.string().max(LIMITS.text)).default({}),
  tone: optionalText(LIMITS.text),
  values: points,
  wordsUsed: points,
  wordsAvoided: points,
  examples: points,
};
export const brandProfileSchema = z.object({ ...base, ...brandFields });
export type BrandProfile = z.output<typeof brandProfileSchema>;
export const brandInputSchema = z.object(brandFields);

// --- Secrets (step 3) ----------------------------------------------------------

export const secretValueSchema = z.string().min(1).max(LIMITS.text);
