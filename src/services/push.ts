/**
 * Web Push on this device: permission, subscription and the VAPID key pair. Cockpit creates
 * the key pair itself (Web Crypto, P-256) and keeps subscription + keys encrypted in the
 * secrets table; the user copies them once as GitHub secret PUSH_CONFIG, from where the
 * sender (GitHub Actions) sends general reminders. On the iPad, push only works in the
 * home-screen app (iPadOS 16.4+) and only after a tap.
 */
import {
  PUSH_CONFIG_VERSION,
  parsePushConfig,
  serializePushConfig,
  type PushConfig,
} from '@/core/push/config';
import {
  LAST_PUSH_CACHE,
  LAST_PUSH_KEY,
  parseLastPush,
  type LastPush,
} from '@/core/push/reminders';
import { secretsRepo } from '@/data/repositories';
import { pushTexts } from '@/i18n/push';
import { createVapidKeys, fromBase64Url, type VapidKeys } from './crypto/vapid';
import { isStandalone } from './displayMode';

/** Where the user stores the secret and starts a test (public repository of Cockpit). */
export const GITHUB_REPOSITORY_URL = 'https://github.com/JanneBromann30092026/Cockpit';
export const GITHUB_NEW_SECRET_URL = `${GITHUB_REPOSITORY_URL}/settings/secrets/actions/new`;
export const GITHUB_PUSH_WORKFLOW_URL = `${GITHUB_REPOSITORY_URL}/actions/workflows/push.yml`;

/** Name of the push configuration in the encrypted secrets table. */
export const PUSH_SECRET = 'pushConfig';

const SERVICE_WORKER_TIMEOUT_MS = 10_000;

export type PushSupport = 'supported' | 'homeScreenOnly' | 'unsupported';

export function pushSupport(): PushSupport {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
    return 'supported';
  }
  // iPadOS offers push only to home-screen apps; Safari tabs have no PushManager.
  return 'standalone' in navigator && !isStandalone() ? 'homeScreenOnly' : 'unsupported';
}

export function notificationPermission(): NotificationPermission | null {
  return 'Notification' in window ? Notification.permission : null;
}

export type PushErrorCode = 'UNSUPPORTED' | 'DENIED' | 'NO_SERVICE_WORKER' | 'SUBSCRIBE_FAILED';

export class PushError extends Error {
  constructor(readonly code: PushErrorCode) {
    super(code);
    this.name = 'PushError';
  }
}

async function serviceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  const timeout = new Promise<never>((_resolve, reject) =>
    setTimeout(() => reject(new PushError('NO_SERVICE_WORKER')), SERVICE_WORKER_TIMEOUT_MS),
  );
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

/**
 * Asks for permission (call directly from a tap: iPadOS only asks then), subscribes with a
 * new key pair and stores everything encrypted. An existing subscription is replaced, so
 * the GitHub secret has to be updated afterwards.
 */
export async function setupPush(): Promise<PushConfig> {
  if (pushSupport() !== 'supported') throw new PushError('UNSUPPORTED');
  // First call without awaiting anything before it: the permission prompt needs the tap.
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('DENIED');
  const registration = await serviceWorker();
  try {
    await (await registration.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // A stale subscription that cannot be removed is replaced anyway.
  }
  let keys: VapidKeys;
  try {
    keys = await createVapidKeys();
  } catch {
    throw new PushError('SUBSCRIBE_FAILED');
  }
  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(keys.publicKey),
    });
  } catch {
    throw new PushError('SUBSCRIBE_FAILED');
  }
  const json = subscription.toJSON();
  const parsed = parsePushConfig(
    serializePushConfig({
      v: PUSH_CONFIG_VERSION,
      ...keys,
      subscription: {
        endpoint: json.endpoint ?? subscription.endpoint,
        keys: {
          p256dh: (json.keys?.p256dh ?? '').replace(/=+$/, ''),
          auth: (json.keys?.auth ?? '').replace(/=+$/, ''),
        },
      },
    }),
  );
  if (!parsed.ok) {
    await subscription.unsubscribe().catch(() => undefined);
    throw new PushError('SUBSCRIBE_FAILED');
  }
  await secretsRepo.set(PUSH_SECRET, serializePushConfig(parsed.config));
  return parsed.config;
}

/** The stored configuration (decrypted, needs the unlocked app) – only for copying. */
export async function readPushConfig(): Promise<PushConfig | null> {
  const value = await secretsRepo.getForInternalUse(PUSH_SECRET);
  if (!value) return null;
  const parsed = parsePushConfig(value);
  return parsed.ok ? parsed.config : null;
}

/**
 * Whether the stored subscription is still the one of this device. iPadOS can drop it
 * (e.g. after removing the home-screen app); then a new setup is needed.
 */
export async function subscriptionMatches(config: PushConfig): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const current = await registration?.pushManager.getSubscription();
    return current?.endpoint === config.subscription.endpoint;
  } catch {
    return false;
  }
}

/** Unsubscribes this device and deletes the stored keys. */
export async function disablePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    await (await registration?.pushManager.getSubscription())?.unsubscribe();
  } finally {
    await secretsRepo.remove(PUSH_SECRET);
  }
}

export function observePushSetup(listener: (stored: boolean) => void): () => void {
  return secretsRepo.observeHas(PUSH_SECRET, listener);
}

function lastPushUrl(): string {
  return new URL(LAST_PUSH_KEY, new URL(import.meta.env.BASE_URL, window.location.origin)).href;
}

/** The last push the service worker received (kind and time, nothing else). */
export async function readLastPush(): Promise<LastPush | null> {
  if (!('caches' in window)) return null;
  try {
    const response = await (await caches.open(LAST_PUSH_CACHE)).match(lastPushUrl());
    return response ? parseLastPush(await response.json()) : null;
  } catch {
    return null;
  }
}

/** Shows a notification right away – checks permission and display, not the push path. */
export async function showLocalTestNotification(): Promise<void> {
  if (notificationPermission() !== 'granted') throw new PushError('DENIED');
  const registration = await serviceWorker();
  const { title, body } = pushTexts.reminders.test;
  await registration.showNotification(title, {
    body,
    tag: 'test',
    icon: `${import.meta.env.BASE_URL}icons/pwa-192x192.png`,
    data: { path: '/settings' },
  });
}
