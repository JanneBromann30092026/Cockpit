/**
 * Keys of the enumerations of the data model (English, stable in storage). German labels
 * and further reference data follow with the feature steps (src/data, src/i18n/de.ts).
 */

/** Task status. */
export const TASK_STATUSES = ['open', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PRIORITIES = ['high', 'medium', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

/** Categories of my own contracts and documents (refined in step 6). */
export const DOCUMENT_CATEGORIES = [
  'housing',
  'insurance',
  'mobile',
  'internet',
  'energy',
  'subscription',
  'mobility',
  'finance',
  'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

/** How often a contract amount is paid. */
export const PAYMENT_INTERVALS = ['monthly', 'quarterly', 'halfYearly', 'yearly', 'once'] as const;
export type PaymentInterval = (typeof PAYMENT_INTERVALS)[number];

/** Units of a computable notice period. */
export const NOTICE_UNITS = ['days', 'weeks', 'months'] as const;
export type NoticeUnit = (typeof NOTICE_UNITS)[number];

/** Contract fields Claude can read from an original (marked "Claude" until edited). */
export const DOCUMENT_AI_FIELDS = [
  'name',
  'category',
  'provider',
  'amount',
  'interval',
  'dueDate',
  'termEnd',
  'noticePeriod',
] as const;
export type DocumentAiField = (typeof DOCUMENT_AI_FIELDS)[number];

export const REVIEW_KINDS = ['daily', 'weekly'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/** Types of entries in the life library. */
export const LIBRARY_TYPES = ['book', 'article', 'newsletter', 'video', 'podcast'] as const;
export type LibraryType = (typeof LIBRARY_TYPES)[number];

/** Brand kit (step 10): colour roles of the palette. */
export const BRAND_COLOR_ROLES = ['primary', 'secondary', 'accent', 'background', 'text'] as const;
export type BrandColorRole = (typeof BRAND_COLOR_ROLES)[number];

/** Fonts every iPad has (preview works without loading web fonts). */
export const BRAND_FONTS = [
  'inter',
  'system',
  'avenir',
  'futura',
  'gillSans',
  'helvetica',
  'georgia',
  'charter',
  'palatino',
  'baskerville',
  'didot',
  'menlo',
] as const;
export type BrandFont = (typeof BRAND_FONTS)[number];

export const BRAND_RADII = ['sharp', 'soft', 'round'] as const;
export type BrandRadius = (typeof BRAND_RADII)[number];

/** What "Damit bauen" writes. */
export const BRAND_DRAFT_KINDS = ['newsletter', 'landing', 'instagram', 'video'] as const;
export type BrandDraftKind = (typeof BRAND_DRAFT_KINDS)[number];

/** Profile parts Claude phrased (marked "(Claude)" until edited). */
export const BRAND_AI_FIELDS = [
  'tone',
  'values',
  'wordsUsed',
  'wordsAvoided',
  'examples',
  'design',
] as const;
export type BrandAiField = (typeof BRAND_AI_FIELDS)[number];
