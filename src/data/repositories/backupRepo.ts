/**
 * Backup data access: the encrypted rows as stored (export) and writing restored records
 * (import, re-encrypted with the current key). Secrets are never part of it.
 */
import type { BackupFile, BackupTable, StoredFileRow, StoredRow } from '@/core/backup/format';
import { BACKUP_TABLES } from '@/core/backup/format';
import type { VaultMeta } from '@/core/crypto/format';
import { db, type DataTable } from '../db';
import { useDataStore, type DataRecords } from '../store';
import type { FileRow } from '../types';
import { metaRepo } from './metaRepo';
import { commit, decryptRow, type PendingDelete, type PendingWrite } from './rows';

export type RestoreMode = 'merge' | 'replace';

export interface RestoreResult {
  /** Records written per table. */
  restored: Record<BackupTable, number>;
  /** Records skipped because the device has the same or a newer version. */
  kept: number;
  /** Rows of the backup that could not be decrypted or validated. */
  unreadable: number;
  files: number;
}

export class NoVaultError extends Error {
  override readonly name = 'NoVaultError';
}

export const backupRepo = {
  async exportRows(): Promise<{
    vault: VaultMeta;
    tables: Record<BackupTable, StoredRow[]>;
    files: StoredFileRow[];
  }> {
    const vault = await metaRepo.getVault();
    if (!vault) throw new NoVaultError('No vault');
    const entries = await Promise.all(
      BACKUP_TABLES.map(
        async (table) => [table, await db.table<StoredRow, string>(table).toArray()] as const,
      ),
    );
    const files = await db.files.toArray();
    return {
      vault,
      tables: Object.fromEntries(entries) as Record<BackupTable, StoredRow[]>,
      files,
    };
  },

  /** True when there is anything worth backing up. */
  hasData(): boolean {
    const state = useDataStore.getState();
    return BACKUP_TABLES.some((table) => Object.keys(state[table]).length > 0);
  },

  /**
   * Decrypts the backup with its key and writes the records with the current key.
   * merge: per id the newer version wins; replace: everything current is deleted first.
   */
  async restore(
    backup: BackupFile,
    backupKey: CryptoKey,
    mode: RestoreMode,
  ): Promise<RestoreResult> {
    const state = useDataStore.getState();
    const restored = Object.fromEntries(BACKUP_TABLES.map((table) => [table, 0])) as Record<
      BackupTable,
      number
    >;
    let kept = 0;
    let unreadable = 0;
    const writes: PendingWrite[] = [];
    const documentIds = new Set<string>();

    for (const table of BACKUP_TABLES) {
      for (const row of backup.tables[table]) {
        let record: DataRecords[DataTable];
        try {
          record = await decryptRow(table, row, backupKey);
        } catch {
          unreadable += 1;
          continue;
        }
        const current = (state[table] as Record<string, { updatedAt: string }>)[record.id];
        if (mode === 'merge' && current && current.updatedAt >= record.updatedAt) {
          kept += 1;
          continue;
        }
        writes.push({ table, record });
        restored[table] += 1;
        if (table === 'documents') documentIds.add(record.id);
      }
    }

    const deletes: PendingDelete[] =
      mode === 'replace'
        ? BACKUP_TABLES.map((table) => ({ table, ids: Object.keys(state[table]) }))
        : [];
    // Originals stay encrypted with their own keys (kept in the restored contracts).
    const files: FileRow[] = backup.files
      .filter((row) => documentIds.has(row.documentId))
      .map((row) => ({ ...row }));
    await commit(writes, deletes, async () => {
      if (mode === 'replace') await db.files.clear();
      if (files.length > 0) await db.files.bulkPut(files);
    });
    return { restored, kept, unreadable, files: files.length };
  },
};
