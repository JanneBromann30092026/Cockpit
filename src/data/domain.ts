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

export const REVIEW_KINDS = ['daily', 'weekly'] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

/** Types of entries in the life library. */
export const LIBRARY_TYPES = ['book', 'article', 'newsletter', 'video', 'podcast'] as const;
export type LibraryType = (typeof LIBRARY_TYPES)[number];
