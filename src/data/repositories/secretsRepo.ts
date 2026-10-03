/**
 * Encrypted secrets (e.g. the optional Anthropic API key). Values are never kept in the
 * data store, never logged and never exported; callers can only check whether one exists.
 */
import { liveQuery } from 'dexie';
import { recordAad } from '@/core/crypto/format';
import { nextTimestamp } from '@/core/time';
import { requireSessionKey } from '@/services/crypto/session';
import { decryptJson, encryptJson } from '@/services/crypto/webCrypto';
import { db } from '../db';
import { parseOrThrow } from '../errors';
import { secretValueSchema, settingKeySchema } from '../schemas';

const aad = (key: string) => recordAad('secrets', key);

export const secretsRepo = {
  async set(key: string, value: string): Promise<void> {
    const name = parseOrThrow(settingKeySchema, key);
    const secret = parseOrThrow(secretValueSchema, value);
    const previous = await db.secrets.get(name);
    // Encrypt first: Web Crypto must not run inside an IndexedDB transaction.
    const payload = await encryptJson(requireSessionKey(), secret, aad(name));
    await db.secrets.put({ key: name, updatedAt: nextTimestamp(previous?.updatedAt), payload });
  },

  async has(key: string): Promise<boolean> {
    return (await db.secrets.get(key)) !== undefined;
  },

  /** Decrypted value for the service that needs it (never for display). */
  async getForInternalUse(key: string): Promise<string | null> {
    const row = await db.secrets.get(key);
    if (!row) return null;
    const value = await decryptJson(requireSessionKey(), row.payload, aad(key));
    return secretValueSchema.parse(value);
  },

  async remove(key: string): Promise<void> {
    await db.secrets.delete(key);
  },

  /** Reports whether the secret exists, now and after every change (only reads the key). */
  observeHas(key: string, listener: (exists: boolean) => void): () => void {
    const subscription = liveQuery(async () => (await db.secrets.get(key)) !== undefined).subscribe(
      {
        next: listener,
        error: () => listener(false),
      },
    );
    return () => subscription.unsubscribe();
  },
};
