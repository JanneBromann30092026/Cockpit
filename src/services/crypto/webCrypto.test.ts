import { describe, expect, it } from 'vitest';
import {
  InvalidPayloadError,
  PBKDF2_ITERATIONS,
  recordAad,
  SALT_BYTES,
  UnsupportedFormatError,
  type EncryptedPayload,
} from '@/core/crypto/format';
import {
  DecryptionError,
  decryptJson,
  deriveVaultKey,
  encryptJson,
  randomBytes,
} from './webCrypto';

const salt = randomBytes(SALT_BYTES);
const keyPromise = deriveVaultKey('richtiges Passwort', salt, PBKDF2_ITERATIONS);
const aad = recordAad('tasks', 't1');
const task = { title: 'Steuererklärung abschicken', priority: 'high', tags: ['finanzen'] };

describe('web crypto', () => {
  it('round-trips JSON with a fresh 12 byte IV per encryption', async () => {
    const key = await keyPromise;
    const a = await encryptJson(key, task, aad);
    const b = await encryptJson(key, task, aad);
    expect(a.v).toBe(1);
    expect(a.iv).toHaveLength(12);
    expect(Array.from(a.iv)).not.toEqual(Array.from(b.iv));
    expect(Array.from(a.ct)).not.toEqual(Array.from(b.ct));
    expect(await decryptJson(key, a, aad)).toEqual(task);
  });

  it('never contains the plaintext', async () => {
    const key = await keyPromise;
    const { ct } = await encryptJson(key, task, aad);
    expect(new TextDecoder('latin1').decode(ct)).not.toContain('Steuer');
  });

  it('derives a non-extractable key', async () => {
    const key = await keyPromise;
    expect(key.extractable).toBe(false);
    expect(key.algorithm).toMatchObject({ name: 'AES-GCM', length: 256 });
    await expect(crypto.subtle.exportKey('raw', key)).rejects.toThrow();
  });

  it('fails with a wrong password', async () => {
    const payload = await encryptJson(await keyPromise, task, aad);
    const wrong = await deriveVaultKey('falsches Passwort', salt, PBKDF2_ITERATIONS);
    await expect(decryptJson(wrong, payload, aad)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('normalizes the password (NFC)', async () => {
    const composed = await deriveVaultKey('Bär-Größe', salt, PBKDF2_ITERATIONS);
    const decomposed = await deriveVaultKey('Bär-Größe'.normalize('NFD'), salt, PBKDF2_ITERATIONS);
    const payload = await encryptJson(composed, task, aad);
    expect(await decryptJson(decomposed, payload, aad)).toEqual(task);
  });

  it('detects a manipulated ciphertext or IV', async () => {
    const key = await keyPromise;
    const payload = await encryptJson(key, task, aad);
    const flipped = new Uint8Array(payload.ct);
    flipped[3] = (flipped[3] ?? 0) ^ 0xff;
    await expect(decryptJson(key, { ...payload, ct: flipped }, aad)).rejects.toBeInstanceOf(
      DecryptionError,
    );
    const iv = new Uint8Array(payload.iv);
    iv[0] = (iv[0] ?? 0) ^ 0x01;
    await expect(decryptJson(key, { ...payload, iv }, aad)).rejects.toBeInstanceOf(DecryptionError);
  });

  it('binds a payload to its record (AAD)', async () => {
    const key = await keyPromise;
    const payload = await encryptJson(key, task, aad);
    await expect(decryptJson(key, payload, recordAad('tasks', 't2'))).rejects.toBeInstanceOf(
      DecryptionError,
    );
    await expect(decryptJson(key, payload, recordAad('documents', 't1'))).rejects.toBeInstanceOf(
      DecryptionError,
    );
  });

  it('rejects unknown format versions and broken envelopes', async () => {
    const key = await keyPromise;
    const payload = await encryptJson(key, task, aad);
    const future = { ...payload, v: 2 } as unknown as EncryptedPayload;
    await expect(decryptJson(key, future, aad)).rejects.toBeInstanceOf(UnsupportedFormatError);
    await expect(
      decryptJson(key, { ...payload, iv: payload.iv.subarray(0, 8) }, aad),
    ).rejects.toBeInstanceOf(InvalidPayloadError);
    await expect(decryptJson(key, { v: 1 }, aad)).rejects.toBeInstanceOf(InvalidPayloadError);
    await expect(decryptJson(key, null, aad)).rejects.toBeInstanceOf(InvalidPayloadError);
  });
});
