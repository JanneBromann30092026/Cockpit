/**
 * The backup file: the encrypted rows exactly as stored, plus the vault parameters
 * (salt, iterations, check value) needed to derive the key with the password. Without
 * the password nothing is readable – the file reveals only ids, dates and how many rows
 * there are. No secrets (API key, push subscription): they never leave the device.
 */
import { z } from 'zod';
import {
  CRYPTO_FORMAT_VERSION,
  GCM_TAG_BYTES,
  IV_BYTES,
  MAX_PBKDF2_ITERATIONS,
  MIN_PBKDF2_ITERATIONS,
  SALT_BYTES,
  type Bytes,
  type EncryptedPayload,
  type VaultMeta,
} from '../crypto/format';

export const BACKUP_FORMAT = 'cockpit-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_TABLES = ['tasks', 'documents', 'reviews', 'library', 'brand'] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

export function toBase64(data: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < data.length; index += chunk) {
    binary += String.fromCharCode(...data.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Bytes {
  const binary = atob(value);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
  return data;
}

const base64 = (check: (length: number) => boolean) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/]*={0,2}$/)
    .transform((value) => fromBase64(value))
    .refine((data) => check(data.length));

const payloadSchema = z.object({
  v: z.literal(CRYPTO_FORMAT_VERSION),
  iv: base64((length) => length === IV_BYTES),
  ct: base64((length) => length >= GCM_TAG_BYTES),
});

const rowSchema = z.object({
  id: z.string().min(1).max(100),
  updatedAt: z.iso.datetime(),
  payload: payloadSchema,
});

const fileRowSchema = rowSchema.extend({ documentId: z.string().min(1).max(100) });

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  v: z.literal(BACKUP_VERSION),
  createdAt: z.iso.datetime(),
  appVersion: z.string().max(40),
  kdf: z.object({
    alg: z.literal('PBKDF2-SHA-256'),
    iterations: z.int().min(MIN_PBKDF2_ITERATIONS).max(MAX_PBKDF2_ITERATIONS),
    salt: base64((length) => length === SALT_BYTES),
  }),
  check: payloadSchema,
  tables: z.object(
    Object.fromEntries(
      BACKUP_TABLES.map((table) => [table, z.array(rowSchema).default([])]),
    ) as Record<BackupTable, z.ZodDefault<z.ZodArray<typeof rowSchema>>>,
  ),
  files: z.array(fileRowSchema).default([]),
});
export type BackupFile = z.output<typeof backupFileSchema>;

export interface StoredRow {
  id: string;
  updatedAt: string;
  payload: EncryptedPayload;
}

export interface StoredFileRow extends StoredRow {
  documentId: string;
}

const encodePayload = (payload: EncryptedPayload) => ({
  v: payload.v,
  iv: toBase64(payload.iv),
  ct: toBase64(payload.ct),
});

const encodeRow = (row: StoredRow) => ({
  id: row.id,
  updatedAt: row.updatedAt,
  payload: encodePayload(row.payload),
});

/** Serialises the encrypted rows (they are never decrypted for the backup). */
export function serializeBackup(input: {
  vault: VaultMeta;
  appVersion: string;
  createdAt: string;
  tables: Record<BackupTable, readonly StoredRow[]>;
  files: readonly StoredFileRow[];
}): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    v: BACKUP_VERSION,
    createdAt: input.createdAt,
    appVersion: input.appVersion,
    kdf: {
      alg: input.vault.kdf.alg,
      iterations: input.vault.kdf.iterations,
      salt: toBase64(input.vault.kdf.salt),
    },
    check: encodePayload(input.vault.check),
    tables: Object.fromEntries(
      BACKUP_TABLES.map((table) => [table, input.tables[table].map(encodeRow)]),
    ),
    files: input.files.map((row) => ({ ...encodeRow(row), documentId: row.documentId })),
  });
}

export type BackupProblem = 'notBackup' | 'version' | 'damaged';

export class BackupFormatError extends Error {
  override readonly name = 'BackupFormatError';
  constructor(readonly problem: BackupProblem) {
    super(problem);
  }
}

export function parseBackup(text: string): BackupFile {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupFormatError('notBackup');
  }
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record !== 'object' || record.format !== BACKUP_FORMAT) {
    throw new BackupFormatError('notBackup');
  }
  if (record.v !== BACKUP_VERSION) throw new BackupFormatError('version');
  const parsed = backupFileSchema.safeParse(value);
  if (!parsed.success) throw new BackupFormatError('damaged');
  return parsed.data;
}

/** "Cockpit-Backup-2026-10-09.json" */
export function backupFileName(localDate: string): string {
  return `Cockpit-Backup-${localDate}.json`;
}

export const BACKUP_REMINDER_DAYS = [0, 7, 14, 30] as const;
export type BackupReminderDays = (typeof BACKUP_REMINDER_DAYS)[number];

/** Whether to remind of a backup: there is data and the last one is older than `days`. */
export function backupDue(input: {
  lastBackupAt: string;
  days: BackupReminderDays;
  hasData: boolean;
  now: Date;
}): boolean {
  if (input.days === 0 || !input.hasData) return false;
  if (!input.lastBackupAt) return true;
  const age = input.now.getTime() - Date.parse(input.lastBackupAt);
  return Number.isNaN(age) || age >= input.days * 86_400_000;
}
