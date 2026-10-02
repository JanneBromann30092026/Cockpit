/**
 * Web Crypto primitives (no third-party crypto): PBKDF2-SHA-256 → AES-GCM-256 with a
 * non-extractable key, a fresh random IV per encryption and AAD binding each payload to
 * its record.
 */
import {
  CRYPTO_FORMAT_VERSION,
  IV_BYTES,
  KEY_BITS,
  parseEncryptedPayload,
  type Bytes,
  type EncryptedPayload,
} from '@/core/crypto/format';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Wrong key, tampered ciphertext or a payload bound to another record. */
export class DecryptionError extends Error {
  override readonly name = 'DecryptionError';
}

export function randomBytes(length: number): Bytes {
  return crypto.getRandomValues(new Uint8Array(length));
}

function utf8(text: string): Bytes {
  return encoder.encode(text);
}

/**
 * Derives the vault key. The key is not extractable: it can encrypt and decrypt, but its
 * bytes can never be read back (not even by the app itself).
 */
export async function deriveVaultKey(
  password: string,
  salt: Bytes,
  iterations: number,
): Promise<CryptoKey> {
  // The same password typed on different keyboards must give the same key.
  const material = await crypto.subtle.importKey(
    'raw',
    utf8(password.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: KEY_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(
  key: CryptoKey,
  value: unknown,
  aad: string,
): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    key,
    utf8(JSON.stringify(value)),
  );
  return { v: CRYPTO_FORMAT_VERSION, iv, ct: new Uint8Array(ciphertext) };
}

/** Decrypts and parses a stored payload. Throws DecryptionError, never returns garbage. */
export async function decryptJson(key: CryptoKey, payload: unknown, aad: string): Promise<unknown> {
  const { iv, ct } = parseEncryptedPayload(payload);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, additionalData: utf8(aad) },
      key,
      ct,
    );
  } catch {
    throw new DecryptionError('Decryption failed (wrong key or modified data)');
  }
  return JSON.parse(decoder.decode(plaintext)) as unknown;
}
