/**
 * Cockpit's service worker (vite-plugin-pwa, strategy injectManifest): offline precache as
 * before (generateSW until step 8) plus push notifications. Relative imports only – this
 * file is bundled on its own.
 */
import { setCacheNameDetails } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import {
  LAST_PUSH_CACHE,
  LAST_PUSH_KEY,
  NAVIGATE_MESSAGE,
  REMINDER_PATHS,
  isReminderPath,
  parsePushPayload,
  type LastPush,
} from './core/push/reminders';
import { pushTexts } from './i18n/push';

declare const self: ServiceWorkerGlobalScope;

// Own cache names: Kompass and Synapse run on the same origin (GitHub Pages).
setCacheNameDetails({ prefix: 'cockpit' });

// The app asks before activating an update (UpdatePrompt, registerType "prompt").
self.addEventListener('message', (event) => {
  if ((event.data as { type?: unknown } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(`${import.meta.env.BASE_URL}index.html`)),
);

// --- Push -----------------------------------------------------------------------------

interface NotificationData {
  path: string;
}

async function rememberPush(entry: LastPush): Promise<void> {
  try {
    const cache = await caches.open(LAST_PUSH_CACHE);
    await cache.put(
      new URL(LAST_PUSH_KEY, self.registration.scope).href,
      new Response(JSON.stringify(entry), { headers: { 'Content-Type': 'application/json' } }),
    );
  } catch {
    // Only used for the check in the settings; the notification matters more.
  }
}

self.addEventListener('push', (event) => {
  let text: string | null;
  try {
    text = event.data?.text() ?? null;
  } catch {
    text = null;
  }
  const reminder = parsePushPayload(text);
  // iPadOS requires a visible notification for every push; unknown content shows a generic one.
  const { title, body } = reminder ? pushTexts.reminders[reminder] : pushTexts.fallback;
  const data: NotificationData = { path: reminder ? REMINDER_PATHS[reminder] : '/today' };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        tag: reminder ?? 'cockpit',
        icon: `${import.meta.env.BASE_URL}icons/pwa-192x192.png`,
        data,
      }),
      rememberPush({ reminder, at: new Date().toISOString() }),
    ]),
  );
});

async function openPath(path: string): Promise<void> {
  const scope = self.registration.scope;
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const app = windows.find((client) => client.url.startsWith(scope));
  if (app) {
    // The app navigates itself (also behind the lock screen: after unlocking, the page is open).
    app.postMessage({ type: NAVIGATE_MESSAGE, path });
    await app.focus().catch(() => undefined);
    return;
  }
  await self.clients.openWindow(`${scope}#${path}`);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data as Partial<NotificationData> | null)?.path;
  event.waitUntil(openPath(isReminderPath(path) ? path : '/today'));
});
