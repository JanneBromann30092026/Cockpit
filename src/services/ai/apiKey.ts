import { secretsRepo } from '@/data/repositories';
import { API_KEY_PREFIX, API_KEY_SECRET } from './config';

const KEY_PATTERN = /^sk-ant-[A-Za-z0-9_-]{16,}$/;

export type ApiKeyCheck = 'ok' | 'empty' | 'format';

/** Removes whitespace that sneaks in when pasting (line breaks, spaces). */
export function normalizeApiKey(raw: string): string {
  return raw.replace(/\s+/g, '');
}

export function checkApiKey(raw: string): ApiKeyCheck {
  const key = normalizeApiKey(raw);
  if (!key) return 'empty';
  return key.startsWith(API_KEY_PREFIX) && KEY_PATTERN.test(key) ? 'ok' : 'format';
}

/**
 * Stores the key encrypted in the secrets table. It is never logged, exported or shown
 * again; the UI can only ask whether one is set.
 */
export async function saveApiKey(raw: string): Promise<ApiKeyCheck> {
  const check = checkApiKey(raw);
  if (check !== 'ok') return check;
  await secretsRepo.set(API_KEY_SECRET, normalizeApiKey(raw));
  return 'ok';
}

export async function removeApiKey(): Promise<void> {
  await secretsRepo.remove(API_KEY_SECRET);
}

export function hasApiKey(): Promise<boolean> {
  return secretsRepo.has(API_KEY_SECRET);
}

/** Calls `listener` with whether a key is stored, now and after every change (also other tabs). */
export function observeApiKey(listener: (stored: boolean) => void): () => void {
  return secretsRepo.observeHas(API_KEY_SECRET, listener);
}
