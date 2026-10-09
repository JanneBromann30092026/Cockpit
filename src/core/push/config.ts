/**
 * The one value the user stores as GitHub secret PUSH_CONFIG: the push subscription of this
 * iPad plus the VAPID key pair Cockpit created for it. It contains no personal data, but
 * whoever has it can send notifications to this iPad – so it only lives encrypted on the
 * device and as a GitHub secret, never in the repository or in logs.
 *
 * No imports: the sender script (scripts/push/send.ts) runs this file directly in Node.
 */

export const PUSH_CONFIG_VERSION = 1;

/** Name of the GitHub Actions secret. */
export const PUSH_SECRET_NAME = 'PUSH_CONFIG';

export interface PushConfig {
  v: typeof PUSH_CONFIG_VERSION;
  /** VAPID public key: uncompressed P-256 point, base64url (65 bytes). */
  publicKey: string;
  /** VAPID private key: P-256 scalar "d", base64url (32 bytes). */
  privateKey: string;
  subscription: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  };
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function base64UrlBytes(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const bare = value.replace(/=+$/, '');
  if (!BASE64URL.test(bare)) return null;
  // Length of the decoded data (base64url, padding ignored).
  return Math.floor((bare.length * 3) / 4);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export type PushConfigProblem = 'json' | 'version' | 'keys' | 'subscription';

/** Parses and checks the secret's value (whitespace from pasting is ignored). */
export function parsePushConfig(
  text: string,
): { ok: true; config: PushConfig } | { ok: false; problem: PushConfigProblem } {
  let value: unknown;
  try {
    value = JSON.parse(text.trim());
  } catch {
    return { ok: false, problem: 'json' };
  }
  if (typeof value !== 'object' || value === null) return { ok: false, problem: 'json' };
  const record = value as Record<string, unknown>;
  if (record.v !== PUSH_CONFIG_VERSION) return { ok: false, problem: 'version' };
  if (base64UrlBytes(record.publicKey) !== 65 || base64UrlBytes(record.privateKey) !== 32) {
    return { ok: false, problem: 'keys' };
  }
  const subscription = record.subscription as Record<string, unknown> | null | undefined;
  const keys = subscription?.keys as Record<string, unknown> | null | undefined;
  if (
    !subscription ||
    !isHttpsUrl(subscription.endpoint) ||
    !keys ||
    base64UrlBytes(keys.p256dh) !== 65 ||
    base64UrlBytes(keys.auth) !== 16
  ) {
    return { ok: false, problem: 'subscription' };
  }
  return {
    ok: true,
    config: {
      v: PUSH_CONFIG_VERSION,
      publicKey: record.publicKey as string,
      privateKey: record.privateKey as string,
      subscription: {
        endpoint: subscription.endpoint,
        keys: { p256dh: keys.p256dh as string, auth: keys.auth as string },
      },
    },
  };
}

export function serializePushConfig(config: PushConfig): string {
  return JSON.stringify(config);
}

/** Origin of the push service (Apple, Google, Mozilla …) – the only part safe to show. */
export function pushServiceName(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return '';
  }
}
