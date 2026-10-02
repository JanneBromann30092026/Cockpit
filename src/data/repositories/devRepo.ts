/** Developer tools: look at what is really stored (counts, ciphertext preview). */
import { bytesToHex } from '@/core/crypto/format';
import { db, DATA_TABLES, type DataTable } from '../db';

export interface RawPreview {
  id: string;
  updatedAt: string;
  iv: string;
  ciphertext: string;
  bytes: number;
}

export const devRepo = {
  async counts(): Promise<Record<DataTable, number>> {
    const entries = await Promise.all(
      DATA_TABLES.map(async (table) => [table, await db.table(table).count()] as const),
    );
    return Object.fromEntries(entries) as Record<DataTable, number>;
  },

  /** The stored row of the newest record of a table, as it lies in IndexedDB. */
  async newestRow(table: DataTable): Promise<RawPreview | null> {
    const row = await db[table].orderBy('updatedAt').last();
    if (!row) return null;
    return {
      id: row.id,
      updatedAt: row.updatedAt,
      iv: bytesToHex(row.payload.iv),
      ciphertext: bytesToHex(row.payload.ct, 24),
      bytes: row.payload.ct.length,
    };
  },
};
