/**
 * Encryption of data rows: the decrypted record becomes an AES-GCM payload bound to its
 * table and id; only id and updatedAt stay readable.
 */
import type { z } from 'zod';
import { recordAad } from '@/core/crypto/format';
import { decryptJson, encryptJson } from '@/services/crypto/webCrypto';
import { requireSessionKey } from '@/services/crypto/session';
import { db, DATA_TABLES, type DataTable } from '../db';
import {
  brandProfileSchema,
  documentSchema,
  libraryEntrySchema,
  reviewSchema,
  taskSchema,
} from '../schemas';
import { dataStore, type DataMaps, type DataRecords } from '../store';
import type { EncryptedRow } from '../types';

const SCHEMAS: { [T in DataTable]: z.ZodType<DataRecords[T]> } = {
  tasks: taskSchema,
  documents: documentSchema,
  reviews: reviewSchema,
  library: libraryEntrySchema,
  brand: brandProfileSchema,
};

export function recordSchema<T extends DataTable>(table: T): z.ZodType<DataRecords[T]> {
  return SCHEMAS[table];
}

export async function encryptRow<T extends DataTable>(
  table: T,
  record: DataRecords[T],
  key: CryptoKey = requireSessionKey(),
): Promise<EncryptedRow> {
  const payload = await encryptJson(key, record, recordAad(table, record.id));
  return { id: record.id, updatedAt: record.updatedAt, payload };
}

/** Decrypts and validates a row. Throws DecryptionError / a zod error on damaged data. */
export async function decryptRow<T extends DataTable>(
  table: T,
  row: EncryptedRow,
  key: CryptoKey = requireSessionKey(),
): Promise<DataRecords[T]> {
  const value = await decryptJson(key, row.payload, recordAad(table, row.id));
  return SCHEMAS[table].parse(value);
}

export interface PendingWrite {
  table: DataTable;
  record: DataRecords[DataTable];
}

export interface PendingDelete {
  table: DataTable;
  ids: string[];
}

/**
 * Encrypts first (Web Crypto must not run inside an IndexedDB transaction), then writes
 * everything in one transaction and finally updates the in-memory store.
 */
export async function commit(
  writes: PendingWrite[],
  deletes: PendingDelete[] = [],
  /** Changes to the `files` table that belong to the same transaction. */
  files?: () => Promise<unknown>,
): Promise<void> {
  const key = requireSessionKey();
  const rows = await Promise.all(
    writes.map(async ({ table, record }) => ({ table, row: await encryptRow(table, record, key) })),
  );
  const byTable = new Map<DataTable, { rows: EncryptedRow[]; records: DataRecords[DataTable][] }>();
  rows.forEach(({ table, row }, index) => {
    const group = byTable.get(table) ?? { rows: [], records: [] };
    group.rows.push(row);
    group.records.push(writes[index]!.record);
    byTable.set(table, group);
  });
  const tables = [...new Set([...byTable.keys(), ...deletes.map((d) => d.table)])];
  if (tables.length === 0 && !files) return;
  await db.transaction(
    'rw',
    [...tables.map((table) => db.table(table)), ...(files ? [db.files] : [])],
    async () => {
      for (const { table, ids } of deletes) await db.table(table).bulkDelete(ids);
      for (const [table, group] of byTable) await db.table(table).bulkPut(group.rows);
      if (files) await files();
    },
  );
  for (const { table, ids } of deletes) dataStore.remove(table, ids);
  for (const [table, group] of byTable) dataStore.upsert(table, group.records);
}

/** Decrypts every data table into the store (after unlocking). */
export async function loadAllData(key: CryptoKey = requireSessionKey()): Promise<void> {
  let unreadable = 0;
  const entries = await Promise.all(
    DATA_TABLES.map(async (table) => {
      const rows = await db.table<EncryptedRow, string>(table).toArray();
      const map: Record<string, DataRecords[DataTable]> = {};
      await Promise.all(
        rows.map(async (row) => {
          try {
            map[row.id] = await decryptRow(table, row, key);
          } catch (error: unknown) {
            unreadable += 1;
            console.warn(`Unreadable row in ${table}`, error instanceof Error ? error.name : '');
          }
        }),
      );
      return [table, map] as const;
    }),
  );
  dataStore.replaceAll(Object.fromEntries(entries) as unknown as DataMaps, unreadable);
}
