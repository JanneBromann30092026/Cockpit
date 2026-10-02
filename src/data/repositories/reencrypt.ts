/**
 * Password change: every encrypted row is re-encrypted with the new key and written in
 * ONE transaction together with the new vault parameters – all or nothing.
 */
import type { VaultMeta } from '@/core/crypto/format';
import { recordAad } from '@/core/crypto/format';
import { decryptJson, encryptJson } from '@/services/crypto/webCrypto';
import { db, DATA_TABLES } from '../db';
import type { EncryptedRow, SecretRow } from '../types';
import { META_KEYS } from './metaRepo';

type AnyRow = EncryptedRow | SecretRow;

/** All encrypted tables with their primary key field. */
const ENCRYPTED_TABLES: { name: string; key: 'id' | 'key' }[] = [
  ...DATA_TABLES.map((name) => ({ name, key: 'id' as const })),
  { name: 'secrets', key: 'key' },
];

/** Another tab wrote while the rows were re-encrypted; the caller retries. */
export class ConcurrentChangeError extends Error {
  override readonly name = 'ConcurrentChangeError';
}

function primaryKey(row: AnyRow, key: 'id' | 'key'): string {
  return key === 'id' ? (row as { id: string }).id : (row as { key: string }).key;
}

/** Same IV = same ciphertext (every write uses a fresh IV). */
function sameIv(a: AnyRow, b: AnyRow): boolean {
  const x = a.payload.iv;
  const y = b.payload.iv;
  return x.length === y.length && x.every((byte, index) => byte === y[index]);
}

export async function reencryptAll(
  oldKey: CryptoKey,
  newKey: CryptoKey,
  vault: VaultMeta,
): Promise<number> {
  // 1. Read and re-encrypt outside the transaction (Web Crypto would end it early).
  const snapshot = await Promise.all(
    ENCRYPTED_TABLES.map(async ({ name, key }) => {
      const rows = await db.table<AnyRow, string>(name).toArray();
      const rewritten = await Promise.all(
        rows.map(async (row) => {
          const aad = recordAad(name, primaryKey(row, key));
          const value = await decryptJson(oldKey, row.payload, aad);
          return { ...row, payload: await encryptJson(newKey, value, aad) };
        }),
      );
      return { name, key, rows, rewritten };
    }),
  );

  // 2. Verify nothing changed meanwhile and write everything at once.
  await db.transaction(
    'rw',
    [db.meta, ...ENCRYPTED_TABLES.map(({ name }) => db.table(name))],
    async () => {
      for (const { name, key, rows, rewritten } of snapshot) {
        const table = db.table<AnyRow, string>(name);
        const current = await table.toArray();
        const before = new Map(rows.map((row) => [primaryKey(row, key), row]));
        if (current.length !== rows.length) throw new ConcurrentChangeError(name);
        for (const row of current) {
          const old = before.get(primaryKey(row, key));
          if (!old || !sameIv(old, row)) throw new ConcurrentChangeError(name);
        }
        await table.bulkPut(rewritten);
      }
      await db.meta.put({ key: META_KEYS.vault, value: vault });
    },
  );
  return snapshot.reduce((sum, { rows }) => sum + rows.length, 0);
}
