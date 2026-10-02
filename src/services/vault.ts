/**
 * The vault: app password → key, lock and unlock, password change and reset. The key
 * itself only lives in src/services/crypto/session.ts; this store holds the visible state.
 */
import { create } from 'zustand';
import {
  CRYPTO_FORMAT_VERSION,
  PBKDF2_ITERATIONS,
  SALT_BYTES,
  VAULT_CHECK_AAD,
  VAULT_CHECK_TEXT,
  type VaultMeta,
} from '@/core/crypto/format';
import { MIN_PASSWORD_LENGTH } from '@/core/crypto/passwordStrength';
import { remainingUnlockDelayMs, unlockDelayMs, type UnlockFailures } from '@/core/lock';
import { db } from '@/data/db';
import { metaRepo } from '@/data/repositories';
import { ConcurrentChangeError, reencryptAll } from '@/data/repositories/reencrypt';
import { loadAllData } from '@/data/repositories/rows';
import { dataStore } from '@/data/store';
import { startSync } from '@/data/sync';
import { clearSessionKey, requireSessionKey, setSessionKey } from './crypto/session';
import {
  DecryptionError,
  decryptJson,
  deriveVaultKey,
  encryptJson,
  randomBytes,
} from './crypto/webCrypto';

export type VaultStatus =
  /** Reading the vault parameters. */
  | 'loading'
  /** The database could not be opened. */
  | 'unavailable'
  /** First start: no password yet. */
  | 'setup'
  | 'locked'
  /** Deriving the key and checking the password. */
  | 'verifying'
  /** Key and data are ready; the unlock animation plays. */
  | 'opening'
  | 'unlocked';

export type LockReason = 'manual' | 'inactivity' | 'background' | 'keyChanged';

interface VaultState {
  status: VaultStatus;
  /** A password exists (false on first start until the setup has finished). */
  hasVault: boolean;
  lockReason: LockReason | null;
  failures: UnlockFailures | null;
  /** Duration of the last key derivation in ms (shown in developer mode). */
  lastDerivationMs: number | null;
  iterations: number | null;
}

export const useVault = create<VaultState>(() => ({
  status: 'loading',
  hasVault: false,
  lockReason: null,
  failures: null,
  lastDerivationMs: null,
  iterations: null,
}));

export type UnlockResult =
  { ok: true } | { ok: false; reason: 'wrongPassword' | 'wait'; waitMs: number };

let stopSync: (() => void) | null = null;

async function timedDerive(password: string, salt: VaultMeta['kdf']['salt'], iterations: number) {
  const started = performance.now();
  const key = await deriveVaultKey(password, salt, iterations);
  useVault.setState({ lastDerivationMs: Math.round(performance.now() - started), iterations });
  return key;
}

async function checkKey(key: CryptoKey, vault: VaultMeta): Promise<boolean> {
  try {
    return (await decryptJson(key, vault.check, VAULT_CHECK_AAD)) === VAULT_CHECK_TEXT;
  } catch (error: unknown) {
    if (error instanceof DecryptionError) return false;
    throw error;
  }
}

async function open(key: CryptoKey): Promise<void> {
  setSessionKey(key);
  await loadAllData(key);
  stopSync?.();
  stopSync = startSync((error) => {
    console.warn('Sync stopped', error instanceof Error ? error.name : '');
    vault.lock('keyChanged');
  });
  useVault.setState({ status: 'opening', lockReason: null });
}

/** Opens the vault; if loading fails, nothing stays decrypted and the app is locked. */
async function openOrLock(key: CryptoKey, hasVault: boolean): Promise<void> {
  try {
    await open(key);
  } catch (error: unknown) {
    stopSync?.();
    stopSync = null;
    clearSessionKey();
    dataStore.clear();
    useVault.setState({ status: 'locked', hasVault });
    throw error;
  }
}

async function newVaultMeta(password: string): Promise<{ key: CryptoKey; meta: VaultMeta }> {
  const salt = randomBytes(SALT_BYTES);
  const key = await timedDerive(password, salt, PBKDF2_ITERATIONS);
  const meta: VaultMeta = {
    v: CRYPTO_FORMAT_VERSION,
    kdf: { alg: 'PBKDF2-SHA-256', iterations: PBKDF2_ITERATIONS, salt },
    check: await encryptJson(key, VAULT_CHECK_TEXT, VAULT_CHECK_AAD),
    createdAt: new Date().toISOString(),
  };
  return { key, meta };
}

/** Too short for a new password (the form shows the reason before submitting). */
export class WeakPasswordError extends Error {
  override readonly name = 'WeakPasswordError';
}

export const vault = {
  /** Called once the database is open: setup or lock screen. */
  async init(databaseOk: boolean): Promise<void> {
    if (!databaseOk) {
      useVault.setState({ status: 'unavailable' });
      return;
    }
    const [meta, failures] = await Promise.all([metaRepo.getVault(), metaRepo.getUnlockFailures()]);
    useVault.setState({
      status: meta ? 'locked' : 'setup',
      hasVault: !!meta,
      failures,
      iterations: meta?.kdf.iterations ?? null,
    });
  },

  /** First start: creates salt, key and check value, then opens the (empty) vault. */
  async setup(password: string): Promise<void> {
    if (Array.from(password).length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
    useVault.setState({ status: 'verifying' });
    let key: CryptoKey;
    try {
      const created = await newVaultMeta(password);
      await metaRepo.createVault(created.meta, __APP_VERSION__);
      key = created.key;
    } catch (error: unknown) {
      useVault.setState({ status: 'setup' });
      throw error;
    }
    // The vault exists from here on: a failure while opening leaves it locked.
    await openOrLock(key, true);
  },

  async unlock(password: string): Promise<UnlockResult> {
    const failures = await metaRepo.getUnlockFailures();
    const waitMs = remainingUnlockDelayMs(failures, Date.now());
    if (waitMs > 0) {
      useVault.setState({ failures });
      return { ok: false, reason: 'wait', waitMs };
    }
    const meta = await metaRepo.getVault();
    if (!meta) {
      useVault.setState({ status: 'setup', hasVault: false });
      return { ok: false, reason: 'wrongPassword', waitMs: 0 };
    }
    useVault.setState({ status: 'verifying' });
    let key: CryptoKey;
    try {
      key = await timedDerive(password, meta.kdf.salt, meta.kdf.iterations);
      if (!(await checkKey(key, meta))) {
        const next = await metaRepo.recordUnlockFailure(Date.now());
        useVault.setState({ status: 'locked', failures: next });
        return { ok: false, reason: 'wrongPassword', waitMs: unlockDelayMs(next.count) };
      }
      await metaRepo.clearUnlockFailures();
    } catch (error: unknown) {
      useVault.setState({ status: 'locked' });
      throw error;
    }
    useVault.setState({ failures: null });
    await openOrLock(key, true);
    return { ok: true };
  },

  /** End of the unlock animation: the app becomes visible. */
  finishOpening(): void {
    if (useVault.getState().status === 'opening') {
      useVault.setState({ status: 'unlocked', hasVault: true });
    }
  },

  /** Drops the key and every decrypted record. */
  lock(reason: LockReason = 'manual'): void {
    const { status } = useVault.getState();
    if (status !== 'unlocked' && status !== 'opening') return;
    stopSync?.();
    stopSync = null;
    clearSessionKey();
    dataStore.clear();
    useVault.setState({ status: 'locked', lockReason: reason });
  },

  /**
   * Checks the current password, derives a new key with a new salt and re-encrypts all
   * data in one transaction. Returns false if the current password is wrong.
   */
  async changePassword(current: string, next: string): Promise<boolean> {
    if (Array.from(next).length < MIN_PASSWORD_LENGTH) throw new WeakPasswordError();
    const meta = await metaRepo.getVault();
    if (!meta) return false;
    const oldKey = await deriveVaultKey(current, meta.kdf.salt, meta.kdf.iterations);
    if (!(await checkKey(oldKey, meta))) return false;
    const sessionKey = requireSessionKey();
    const { key, meta: fresh } = await newVaultMeta(next);
    const updated: VaultMeta = {
      ...fresh,
      createdAt: meta.createdAt,
      passwordChangedAt: new Date().toISOString(),
    };
    for (let attempt = 1; ; attempt += 1) {
      try {
        await reencryptAll(sessionKey, key, updated);
        break;
      } catch (error: unknown) {
        if (!(error instanceof ConcurrentChangeError) || attempt >= 3) throw error;
      }
    }
    setSessionKey(key);
    useVault.setState({ iterations: updated.kdf.iterations });
    return true;
  },

  /** Deletes the whole database (password, data, settings). The UI reloads afterwards. */
  async resetAll(): Promise<void> {
    stopSync?.();
    stopSync = null;
    clearSessionKey();
    dataStore.clear();
    await db.delete();
    useVault.setState({ status: 'setup', hasVault: false, failures: null, lockReason: null });
  },
};
