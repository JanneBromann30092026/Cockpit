import type { EncryptedPayload } from '@/core/crypto/format';

/** Technical app setting (theme, developer mode …). Never personal data. */
export interface Setting {
  key: string;
  value: unknown;
}

/** Technical key-value entry (vault parameters, failed unlock attempts). */
export interface MetaEntry {
  key: string;
  value: unknown;
}

/**
 * Stored row of an encrypted table. Only technical fields stay readable; everything
 * personal is inside the AES-GCM payload.
 */
export interface EncryptedRow {
  id: string;
  updatedAt: string;
  payload: EncryptedPayload;
}

/** Encrypted secret, e.g. the optional API key (step 3). */
export interface SecretRow {
  key: string;
  updatedAt: string;
  payload: EncryptedPayload;
}
