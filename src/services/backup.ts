/**
 * Encrypted backups: create the file (rows as stored, nothing decrypted), read a file and
 * restore it with the password it was made with.
 */
import { localIsoDate } from '@/core/dates';
import {
  backupFileName,
  parseBackup,
  serializeBackup,
  type BackupFile,
} from '@/core/backup/format';
import { VAULT_CHECK_AAD, VAULT_CHECK_TEXT } from '@/core/crypto/format';
import { backupRepo, type RestoreMode, type RestoreResult } from '@/data/repositories';
import { decryptJson, deriveVaultKey } from './crypto/webCrypto';

export interface CreatedBackup {
  file: File;
  rows: number;
  files: number;
}

export async function createBackup(now: Date = new Date()): Promise<CreatedBackup> {
  const data = await backupRepo.exportRows();
  const text = serializeBackup({
    vault: data.vault,
    appVersion: __APP_VERSION__,
    createdAt: now.toISOString(),
    tables: data.tables,
    files: data.files,
  });
  return {
    file: new File([text], backupFileName(localIsoDate(now)), { type: 'application/json' }),
    rows: Object.values(data.tables).reduce((sum, rows) => sum + rows.length, 0),
    files: data.files.length,
  };
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  return parseBackup(await file.text());
}

export class WrongBackupPasswordError extends Error {
  override readonly name = 'WrongBackupPasswordError';
}

/** Restores with the password the backup was made with (may differ from today's). */
export async function restoreBackup(
  backup: BackupFile,
  password: string,
  mode: RestoreMode,
): Promise<RestoreResult> {
  const key = await deriveVaultKey(password, backup.kdf.salt, backup.kdf.iterations);
  let ok: boolean;
  try {
    ok = (await decryptJson(key, backup.check, VAULT_CHECK_AAD)) === VAULT_CHECK_TEXT;
  } catch {
    ok = false;
  }
  if (!ok) throw new WrongBackupPasswordError('Wrong password');
  return backupRepo.restore(backup, key, mode);
}
