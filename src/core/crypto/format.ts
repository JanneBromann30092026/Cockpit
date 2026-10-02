/**
 * Versioned formats of the encryption layer (pure, no Web Crypto calls). The actual
 * cryptography lives in src/services/crypto.
 */
import { z } from 'zod';

export const CRYPTO_FORMAT_VERSION = 1;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const KEY_BITS = 256;
/** AES-GCM appends a 16 byte authentication tag to every ciphertext. */
export const GCM_TAG_BYTES = 16;

/**
 * PBKDF2-SHA-256 iterations for new vaults (and after a password change). Measured in the
 * cloud Chromium (Xeon 2.1 GHz): 600,000 ≈ 105 ms, 800,000 ≈ 140 ms, 1,000,000 ≈ 175 ms.
 * 800,000 leaves room for slower iPads while staying well under ~1 s for unlocking.
 */
export const PBKDF2_ITERATIONS = 800_000;
/** Lower bound (OWASP 2023 for PBKDF2-HMAC-SHA-256); stored parameters below are rejected. */
export const MIN_PBKDF2_ITERATIONS = 600_000;
export const MAX_PBKDF2_ITERATIONS = 10_000_000;

/** Byte array backed by a plain ArrayBuffer (what Web Crypto accepts). */
export type Bytes = Uint8Array<ArrayBuffer>;

const bytes = (check: (length: number) => boolean) =>
  z.custom<Bytes>((value) => value instanceof Uint8Array && check(value.length));

/** Ciphertext of one record: format version, fresh 12 byte IV, ciphertext + GCM tag. */
export interface EncryptedPayload {
  v: typeof CRYPTO_FORMAT_VERSION;
  iv: Bytes;
  ct: Bytes;
}

export const encryptedPayloadSchema = z.object({
  v: z.literal(CRYPTO_FORMAT_VERSION),
  iv: bytes((length) => length === IV_BYTES),
  ct: bytes((length) => length >= GCM_TAG_BYTES),
});

export const kdfParamsSchema = z.object({
  alg: z.literal('PBKDF2-SHA-256'),
  iterations: z.int().min(MIN_PBKDF2_ITERATIONS).max(MAX_PBKDF2_ITERATIONS),
  salt: bytes((length) => length === SALT_BYTES),
});
export type KdfParams = z.output<typeof kdfParamsSchema>;

/** Stored in meta under "vault": everything needed to verify a password, nothing secret. */
export const vaultMetaSchema = z.object({
  v: z.literal(CRYPTO_FORMAT_VERSION),
  kdf: kdfParamsSchema,
  /** VAULT_CHECK_TEXT encrypted with the derived key: decrypts only with the right password. */
  check: encryptedPayloadSchema,
  createdAt: z.iso.datetime(),
  passwordChangedAt: z.iso.datetime().optional(),
});
export type VaultMeta = z.output<typeof vaultMetaSchema>;

export const VAULT_CHECK_TEXT = 'cockpit-vault-check';

/**
 * Additional authenticated data: binds a ciphertext to its table and record, so a payload
 * copied into another record (or table) fails to decrypt.
 */
export function recordAad(table: string, id: string): string {
  return `cockpit:v${CRYPTO_FORMAT_VERSION}:${table}:${id}`;
}

export const VAULT_CHECK_AAD = recordAad('meta', 'vault-check');

/** The stored payload uses a format version this app does not know (e.g. from a newer app). */
export class UnsupportedFormatError extends Error {
  override readonly name = 'UnsupportedFormatError';
}

/** The stored payload is not a valid envelope (missing fields, wrong IV length …). */
export class InvalidPayloadError extends Error {
  override readonly name = 'InvalidPayloadError';
}

/** Validates an envelope read from storage; throws a typed error instead of decrypting garbage. */
export function parseEncryptedPayload(value: unknown): EncryptedPayload {
  if (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    value.v !== CRYPTO_FORMAT_VERSION
  ) {
    throw new UnsupportedFormatError(`Unsupported payload version: ${String(value.v)}`);
  }
  const result = encryptedPayloadSchema.safeParse(value);
  if (!result.success) throw new InvalidPayloadError('Invalid encrypted payload');
  return result.data;
}

/** Short hex preview of bytes (developer tools, never for secrets). */
export function bytesToHex(data: Uint8Array, maxBytes = data.length): string {
  return Array.from(data.subarray(0, maxBytes), (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}
