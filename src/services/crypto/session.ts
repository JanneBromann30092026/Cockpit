/**
 * The vault key of the current session. It lives only in this module's memory (never in
 * a store, never persisted) and is dropped when the app locks.
 */
let sessionKey: CryptoKey | null = null;

/** Thrown when encrypted data is accessed while the app is locked. */
export class VaultLockedError extends Error {
  override readonly name = 'VaultLockedError';
  constructor() {
    super('The vault is locked');
  }
}

export function setSessionKey(key: CryptoKey): void {
  sessionKey = key;
}

export function clearSessionKey(): void {
  sessionKey = null;
}

export function hasSessionKey(): boolean {
  return sessionKey !== null;
}

export function requireSessionKey(): CryptoKey {
  if (!sessionKey) throw new VaultLockedError();
  return sessionKey;
}
