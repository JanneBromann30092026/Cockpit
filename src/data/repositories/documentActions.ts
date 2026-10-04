/**
 * Contracts and their originals. A file is encrypted with its own random key; the key is
 * stored in the contract (encrypted with the vault key). Contract and file row are always
 * written in one transaction, so neither exists without the other.
 */
import { recordAad } from '@/core/crypto/format';
import { nextTimestamp } from '@/core/time';
import { requireSessionKey } from '@/services/crypto/session';
import {
  base64ToBytes,
  bytesToBase64,
  decryptBytes,
  encryptBytes,
  importFileKey,
  newFileKeyBytes,
} from '@/services/crypto/webCrypto';
import { db } from '../db';
import { RecordNotFoundError } from '../errors';
import { LIMITS, type DocumentRecord, type FileMeta } from '../schemas';
import { dataStore } from '../store';
import { documentsRepo } from './records';
import { requireRecord, validateRecord } from './recordsRepo';
import { encryptRow } from './rows';

export type DocumentInput = Parameters<typeof documentsRepo.create>[0];
export type DocumentPatch = Partial<
  Omit<DocumentRecord, 'id' | 'createdAt' | 'updatedAt' | 'files'>
>;

/** Large enough for scanned contracts, small enough for the iPad's memory. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const FILE_TYPES = /^(application\/pdf|image\/(jpeg|png|webp|gif|heic|heif))$/;

export class FileRejectedError extends Error {
  override readonly name = 'FileRejectedError';

  constructor(readonly reason: 'tooLarge' | 'type' | 'tooMany') {
    super(`File rejected: ${reason}`);
  }
}

export interface NewFile {
  name: string;
  type: string;
  data: Uint8Array<ArrayBuffer>;
}

/** Writes the contract (and optionally one file row) in one transaction. */
async function commitDocument(
  record: DocumentRecord,
  file?: { id: string; payload: Awaited<ReturnType<typeof encryptBytes>> },
  removeFileIds: readonly string[] = [],
): Promise<void> {
  const row = await encryptRow('documents', record, requireSessionKey());
  await db.transaction('rw', [db.documents, db.files], async () => {
    if (removeFileIds.length > 0) await db.files.bulkDelete([...removeFileIds]);
    if (file) {
      await db.files.put({
        id: file.id,
        documentId: record.id,
        updatedAt: record.updatedAt,
        payload: file.payload,
      });
    }
    await db.documents.put(row);
  });
  dataStore.upsert('documents', [record]);
}

export const documentActions = {
  create(input: DocumentInput): Promise<DocumentRecord> {
    return documentsRepo.create(input);
  },

  /** Changes the fields; an empty optional value removes it. Files stay. */
  edit(id: string, patch: DocumentPatch): Promise<DocumentRecord> {
    return documentsRepo.update(id, patch);
  },

  /** Deletes the contract together with all its originals. */
  async remove(id: string): Promise<void> {
    requireRecord('documents', id);
    await db.transaction('rw', [db.documents, db.files], async () => {
      await db.files.where('documentId').equals(id).delete();
      await db.documents.delete(id);
    });
    dataStore.remove('documents', [id]);
  },

  /** Encrypts and attaches an original (PDF or photo). */
  async addFile(documentId: string, file: NewFile, now: Date = new Date()): Promise<FileMeta> {
    const current = requireRecord('documents', documentId);
    if (file.data.byteLength > MAX_FILE_BYTES) throw new FileRejectedError('tooLarge');
    if (!FILE_TYPES.test(file.type)) throw new FileRejectedError('type');
    if (current.files.length >= LIMITS.files) throw new FileRejectedError('tooMany');
    const id = crypto.randomUUID();
    const raw = newFileKeyBytes();
    const payload = await encryptBytes(await importFileKey(raw), file.data, recordAad('files', id));
    const meta: FileMeta = {
      id,
      name: file.name.trim().slice(0, LIMITS.fileName) || 'Datei',
      type: file.type,
      size: file.data.byteLength,
      addedAt: now.toISOString(),
      key: bytesToBase64(raw),
    };
    const record = validateRecord('documents', {
      ...current,
      files: [...current.files, meta],
      updatedAt: nextTimestamp(current.updatedAt),
    });
    await commitDocument(record, { id, payload });
    return meta;
  },

  /** Decrypts an original only now, when it is opened. */
  async readFile(documentId: string, fileId: string): Promise<Blob> {
    const meta = requireRecord('documents', documentId).files.find((file) => file.id === fileId);
    const row = await db.files.get(fileId);
    if (!meta || !row || row.documentId !== documentId) {
      throw new RecordNotFoundError('files', fileId);
    }
    const key = await importFileKey(base64ToBytes(meta.key));
    const data = await decryptBytes(key, row.payload, recordAad('files', fileId));
    return new Blob([data], { type: meta.type });
  },

  async removeFile(documentId: string, fileId: string): Promise<void> {
    const current = requireRecord('documents', documentId);
    if (!current.files.some((file) => file.id === fileId)) {
      throw new RecordNotFoundError('files', fileId);
    }
    const record = validateRecord('documents', {
      ...current,
      files: current.files.filter((file) => file.id !== fileId),
      updatedAt: nextTimestamp(current.updatedAt),
    });
    await commitDocument(record, undefined, [fileId]);
  },
};
