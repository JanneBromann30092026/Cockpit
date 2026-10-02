import { Dexie, type EntityTable } from 'dexie';
import type { Setting } from './types';

/** Own name: Kompass and Synapse run on the same origin (GitHub Pages) with their own DBs. */
export const DB_NAME = 'cockpit';

export class CockpitDb extends Dexie {
  settings!: EntityTable<Setting, 'key'>;

  constructor(name = DB_NAME) {
    super(name);

    /*
     * Migrations: never change an existing version. Every schema change is a new
     * `this.version(n + 1).stores({...changed tables only}).upgrade(tx => ...)`.
     * Only indexed fields are listed; all other fields are stored anyway.
     */

    // Step 1: technical settings only (theme, motion, sidebar, developer mode). Unencrypted
    // on purpose: they contain no personal data and are needed before the app is unlocked.
    this.version(1).stores({
      settings: 'key',
    });
  }
}

export const db = new CockpitDb();

export type DbOpenErrorReason = 'unavailable' | 'quota' | 'version' | 'unknown';

export type DbOpenResult = { ok: true } | { ok: false; reason: DbOpenErrorReason };

function errorNames(error: unknown): string[] {
  const names: string[] = [];
  let current: unknown = error;
  // Dexie wraps the native error (e.g. OpenFailedError → inner QuotaExceededError).
  for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
    names.push(current.name);
    current = (current as Error & { inner?: unknown }).inner;
  }
  return names;
}

export function classifyOpenError(error: unknown): DbOpenErrorReason {
  const names = errorNames(error);
  if (names.includes('QuotaExceededError')) return 'quota';
  if (names.includes('VersionError')) return 'version';
  if (
    names.includes('MissingAPIError') ||
    names.includes('InvalidStateError') ||
    names.includes('SecurityError') ||
    names.includes('UnknownError')
  ) {
    // No IndexedDB (private mode, disabled storage) or the browser refused access.
    return 'unavailable';
  }
  return 'unknown';
}

/** Opens the database once at startup. Never throws; the UI shows the reason on failure. */
export async function openDatabase(database: CockpitDb = db): Promise<DbOpenResult> {
  try {
    await database.open();
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, reason: classifyOpenError(error) };
  }
}
