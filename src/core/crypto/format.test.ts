import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  kdfParamsSchema,
  MIN_PBKDF2_ITERATIONS,
  PBKDF2_ITERATIONS,
  recordAad,
  VAULT_CHECK_AAD,
} from './format';

describe('crypto format', () => {
  it('uses at least 600,000 PBKDF2 iterations', () => {
    expect(MIN_PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
    expect(PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(MIN_PBKDF2_ITERATIONS);
  });

  it('rejects weak or malformed KDF parameters', () => {
    const salt = new Uint8Array(16);
    expect(
      kdfParamsSchema.safeParse({ alg: 'PBKDF2-SHA-256', iterations: 800_000, salt }).success,
    ).toBe(true);
    expect(
      kdfParamsSchema.safeParse({ alg: 'PBKDF2-SHA-256', iterations: 100_000, salt }).success,
    ).toBe(false);
    expect(
      kdfParamsSchema.safeParse({
        alg: 'PBKDF2-SHA-256',
        iterations: 800_000,
        salt: new Uint8Array(8),
      }).success,
    ).toBe(false);
  });

  it('builds record-specific AAD', () => {
    expect(recordAad('tasks', 'abc')).toBe('cockpit:v1:tasks:abc');
    expect(VAULT_CHECK_AAD).toBe('cockpit:v1:meta:vault-check');
  });

  it('formats a hex preview', () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
    expect(bytesToHex(new Uint8Array([1, 2, 3]), 2)).toBe('0102');
  });
});
