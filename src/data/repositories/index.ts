import {
  brandInputSchema,
  documentInputSchema,
  libraryInputSchema,
  reviewInputSchema,
  taskInputSchema,
} from '../schemas';
import { createRecordRepo } from './recordsRepo';

export { metaRepo, VaultExistsError } from './metaRepo';
export { settingsRepo } from './settingsRepo';

export const tasksRepo = createRecordRepo('tasks', taskInputSchema);
export const documentsRepo = createRecordRepo('documents', documentInputSchema);
export const reviewsRepo = createRecordRepo('reviews', reviewInputSchema);
export const libraryRepo = createRecordRepo('library', libraryInputSchema);
export const brandRepo = createRecordRepo('brand', brandInputSchema);
