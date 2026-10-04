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

/** Encrypts raw bytes (file contents) – same envelope and AAD binding as encryptJson. */
export async function encryptBytes(
  key: CryptoKey,
  data: Uint8Array<ArrayBuffer>,
  aad: string,
): Promise<EncryptedPayload> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8(aad) },
    key,
    data,
  );
  return { v: CRYPTO_FORMAT_VERSION, iv, ct: new Uint8Array(ciphertext) };
}

export async function decryptBytes(
  key: CryptoKey,
  payload: unknown,
  aad: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const { iv, ct } = parseEncryptedPayload(payload);
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: utf8(aad) }, key, ct),
    );
  } catch {
    throw new DecryptionError('Decryption failed (wrong key or modified data)');
  }
}

/**
 * A fresh random key for one file. Its bytes are stored inside the encrypted contract
 * (envelope encryption), so a password change never has to re-encrypt large files.
 */
export function newFileKeyBytes(): Bytes {
  return randomBytes(KEY_BITS / 8);
}

export function importFileKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: KEY_BITS }, false, [
    'encrypt',
    'decrypt',
  ]);
}

export function bytesToBase64(data: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < data.length; index += chunk) {
    binary += String.fromCharCode(...data.subarray(index, index + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) data[index] = binary.charCodeAt(index);
  return data;
}
