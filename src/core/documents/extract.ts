/**
 * Contract fields read by Claude from an original: guard against account and ID numbers,
 * which fields to take over by default, and the change to the contract. Nothing is taken
 * over without the user's tap; Claude's summary points are marked "(Claude)".
 */
import { parseNotice, type Notice, type PaymentInterval } from './contracts';

export const EXTRACT_FIELDS = [
  'name',
  'category',
  'provider',
  'amount',
  'interval',
  'dueDate',
  'termEnd',
  'noticePeriod',
] as const;
export type ExtractField = (typeof EXTRACT_FIELDS)[number];

/** What Claude read; missing fields stay undefined (never guessed). */
export interface ContractExtraction<Category extends string = string> {
  name?: string;
  category?: Category;
  provider?: string;
  amount?: number;
  interval?: PaymentInterval;
  dueDate?: string;
  termEnd?: string;
  noticePeriod?: string;
  summary: string[];
  openPoints: string[];
  /** Entries left out because they looked like account or ID numbers. */
  removed: number;
}

/** The contract fields an extraction compares with and changes. */
export interface ExtractTarget<Category extends string = string> {
  name: string;
  category: Category;
  provider?: string;
  amount?: number;
  interval?: PaymentInterval;
  dueDate?: string;
  termEnd?: string;
  noticePeriod?: string;
  notice?: Notice;
  summary: string[];
  openPoints: string[];
  aiFields: ExtractField[];
}

export const AI_MARK = '(Claude)';
const SUMMARY_MAX = 5;

const SENSITIVE: RegExp[] = [
  // IBAN (DE89 3704 0044 0532 0130 00 and the like).
  /\b[a-z]{2}\d{2}(?:\s?[a-z0-9]{4}){3,7}(?:\s?[a-z0-9]{1,3})?\b/i,
  // Eight or more digits in a row (account, policy, customer or tax numbers).
  /\d(?:[\s/-]?\d){7,}/,
  // A number after a number keyword ("Versicherungsnummer: VS-123").
  /(iban|bic|konto|kunden|vertrags|versicherungs(schein)?|policen|mitglieds|ausweis|steuer|personal|sozialversicherungs|renten)[-\s]?(nummer|nr\.?|id|identifikationsnummer)\b/i,
  // A date of birth.
  /geb(urtsdatum|oren|\.)/i,
];

/** True when a text looks like it contains an account, ID or tax number. */
export function looksSensitive(text: string): boolean {
  return SENSITIVE.some((pattern) => pattern.test(text));
}

/** Leaves out sensitive texts and counts them. */
export function withoutSensitive<T extends Partial<ContractExtraction>>(
  extraction: T,
): T & { removed: number } {
  let removed = 0;
  const keep = (text: string | undefined): string | undefined => {
    if (text === undefined || !looksSensitive(text)) return text;
    removed += 1;
    return undefined;
  };
  const list = (items: string[] | undefined) =>
    (items ?? []).filter((item) => {
      if (!looksSensitive(item)) return true;
      removed += 1;
      return false;
    });
  return {
    ...extraction,
    name: keep(extraction.name),
    provider: keep(extraction.provider),
    noticePeriod: keep(extraction.noticePeriod),
    summary: list(extraction.summary),
    openPoints: list(extraction.openPoints),
    removed,
  };
}

/** Fields whose proposal differs from the contract (only these are offered). */
export function changedFields(
  target: ExtractTarget,
  extraction: ContractExtraction,
): ExtractField[] {
  return EXTRACT_FIELDS.filter((field) => {
    const value = extraction[field];
    return value !== undefined && value !== target[field];
  });
}

/**
 * Taken over by default: fields that are still empty ("Sonstiges" counts as empty) and the
 * name when it is only the file name of the original. Filled fields are only offered.
 */
export function defaultFields(
  target: ExtractTarget,
  extraction: ContractExtraction,
  placeholderName?: string,
): ExtractField[] {
  return changedFields(target, extraction).filter((field) => {
    if (field === 'name') return placeholderName !== undefined && target.name === placeholderName;
    if (field === 'category') return target.category === 'other';
    return target[field] === undefined;
  });
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export interface ExtractChoice {
  fields: readonly ExtractField[];
  /** Replace the summary with Claude's points (marked "(Claude)"). */
  summary: boolean;
  /** Add Claude's open points. */
  openPoints: boolean;
}

/** The change to the contract for the chosen fields. */
export function extractionPatch<Category extends string>(
  target: ExtractTarget<Category>,
  extraction: ContractExtraction<Category>,
  choice: ExtractChoice,
): Partial<ExtractTarget<Category>> {
  const patch: Partial<ExtractTarget<Category>> = {};
  for (const field of choice.fields) {
    const value = extraction[field];
    if (value !== undefined) Object.assign(patch, { [field]: value });
  }
  if (choice.fields.includes('noticePeriod') && extraction.noticePeriod) {
    patch.notice = parseNotice(extraction.noticePeriod) ?? undefined;
  }
  if (choice.summary && extraction.summary.length > 0) {
    patch.summary = extraction.summary
      .slice(0, SUMMARY_MAX)
      .map((point) => (point.endsWith(AI_MARK) ? point : `${point} ${AI_MARK}`));
  }
  if (choice.openPoints && extraction.openPoints.length > 0) {
    patch.openPoints = unique([...target.openPoints, ...extraction.openPoints]);
  }
  const marked = choice.fields.filter((field) => extraction[field] !== undefined);
  if (marked.length > 0) patch.aiFields = unique([...target.aiFields, ...marked]);
  return patch;
}

/** Fields the user changed by hand lose their "Claude" mark. */
export function remainingAiFields(
  before: ExtractTarget,
  after: Partial<ExtractTarget>,
): ExtractField[] {
  return before.aiFields.filter((field) => !(field in after) || after[field] === before[field]);
}

/** A contract name from the file name of its original ("Police_Hausrat-2026.pdf"). */
export function nameFromFileName(fileName: string, fallback: string, max = 120): string {
  const name = fileName
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
  return name || fallback;
}
