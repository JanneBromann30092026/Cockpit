/**
 * Keeps the decrypted store in sync with changes from other tabs. liveQuery only reads
 * technical fields (id, updatedAt) – decrypting happens outside of it, because liveQuery
 * queriers must not call non-Dexie async APIs such as crypto.subtle.
 */
import { liveQuery, type Subscription } from 'dexie';
import { db, DATA_TABLES, type DataTable } from './db';
import { decryptRow } from './repositories/rows';
import { dataStore, useDataStore } from './store';
import type { EncryptedRow } from './types';

type Versions = Map<string, string>;

async function readVersions(table: DataTable): Promise<Versions> {
  const versions: Versions = new Map();
  await db
    .table<EncryptedRow, string>(table)
    .toCollection()
    .each((row) => versions.set(row.id, row.updatedAt));
  return versions;
}

/**
 * Applies one liveQuery result. The result can be older than the store (a local write
 * landed in between), so only newer versions are decrypted, and only records that were
 * seen in an earlier result and are gone now count as deleted.
 */
async function applyVersions(
  table: DataTable,
  versions: Versions,
  previous: Versions,
): Promise<void> {
  const known = useDataStore.getState()[table] as Record<string, { updatedAt: string }>;
  const changed = [...versions].filter(([id, updatedAt]) => {
    const current = known[id]?.updatedAt;
    return current === undefined || current < updatedAt;
  });
  const removed = [...previous.keys()].filter((id) => !versions.has(id) && id in known);
  if (changed.length > 0) {
    const rows = await db.table<EncryptedRow, string>(table).bulkGet(changed.map(([id]) => id));
    const records = await Promise.all(
      rows.filter((row): row is EncryptedRow => !!row).map((row) => decryptRow(table, row)),
    );
    dataStore.upsert(table, records);
  }
  dataStore.remove(table, removed);
}

/**
 * Starts observing all data tables. `onError` is called when rows can no longer be
 * decrypted (e.g. the password was changed in another tab). Returns a stop function.
 */
export function startSync(onError: (error: unknown) => void): () => void {
  const subscriptions: Subscription[] = DATA_TABLES.map((table) => {
    let previous: Versions = new Map();
    return liveQuery(() => readVersions(table)).subscribe({
      next: (versions) => {
        const seen = previous;
        previous = versions;
        applyVersions(table, versions, seen).catch(onError);
      },
      error: onError,
    });
  });
  return () => {
    for (const subscription of subscriptions) subscription.unsubscribe();
  };
}
