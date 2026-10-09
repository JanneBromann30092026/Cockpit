import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { PREVIEW_URL } from './ipad.ts';
import { openApp, reloadAndUnlock, storageDump } from './vault.ts';

// The new headless Chromium shows notifications; the headless shell always denies them.
test.use({ channel: 'chromium' });

const ORIGIN = new URL(PREVIEW_URL).origin;
const ENDPOINT = 'https://web.push.apple.com/QFake-e2e-subscription';

interface PushMock {
  /** Answer of Notification.requestPermission (default: granted by the context). */
  permission?: NotificationPermission;
  /** Remove push support (Safari tab on the iPad). */
  missing?: boolean;
}

/**
 * Chromium in tests has no push service, so pushManager.subscribe is faked. The fake
 * subscription survives reloads (sessionStorage), like a real one.
 */
async function mockPush(context: BrowserContext, mock: PushMock = {}) {
  await context.addInitScript((config: PushMock) => {
    const scope = window as unknown as Record<string, unknown>;
    if (config.missing) {
      delete scope.PushManager;
      Object.defineProperty(navigator, 'standalone', { value: false, configurable: true });
      return;
    }
    if (config.permission) {
      let permission: NotificationPermission = 'default';
      Object.defineProperty(Notification, 'permission', { get: () => permission });
      Notification.requestPermission = () => {
        permission = config.permission ?? 'default';
        return Promise.resolve(permission);
      };
    }
    const KEY = 'e2e-push';
    const P256DH = `B${'A'.repeat(86)}`;
    const AUTH = 'A'.repeat(22);
    const make = (endpoint: string) => ({
      endpoint,
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: P256DH, auth: AUTH } }),
      unsubscribe: () => {
        sessionStorage.removeItem(KEY);
        return Promise.resolve(true);
      },
    });
    PushManager.prototype.subscribe = function (options?: PushSubscriptionOptionsInit) {
      const key = new Uint8Array(options?.applicationServerKey as ArrayBuffer);
      const count = Number(sessionStorage.getItem(`${KEY}-count`) ?? '0') + 1;
      sessionStorage.setItem(`${KEY}-count`, String(count));
      const endpoint = `https://web.push.apple.com/QFake-e2e-subscription${count > 1 ? `-${count}` : ''}`;
      sessionStorage.setItem(KEY, endpoint);
      sessionStorage.setItem(`${KEY}-server-key`, btoa(String.fromCharCode(...key)));
      return Promise.resolve(make(endpoint) as unknown as PushSubscription);
    };
    PushManager.prototype.getSubscription = function () {
      const endpoint = sessionStorage.getItem(KEY);
      return Promise.resolve(endpoint ? (make(endpoint) as unknown as PushSubscription) : null);
    };
  }, mock);
}

const section = (page: Page) => page.getByTestId('settings-push');
const status = (page: Page) => section(page).getByTestId('push-status');

async function openSettings(page: Page) {
  await openApp(page, '/settings');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}

/** Copies the key via the button and reads it from the clipboard. */
async function copiedKey(page: Page) {
  await section(page).getByTestId('push-copy-key').click();
  await expect(page.getByText('Schlüssel kopiert')).toBeVisible();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  return JSON.parse(text) as {
    v: number;
    publicKey: string;
    privateKey: string;
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  };
}

/** Delivers a push to Cockpit's service worker like the push service would. */
async function deliverPush(page: Page, data: string) {
  const cdp = await page.context().newCDPSession(page);
  const registrations: { registrationId: string; scopeURL: string }[] = [];
  cdp.on('ServiceWorker.workerRegistrationUpdated', (event) => {
    registrations.push(...event.registrations);
  });
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => registrations.some((r) => r.scopeURL.endsWith('/Cockpit/'))).toBe(true);
  const registration = registrations.find((r) => r.scopeURL.endsWith('/Cockpit/'));
  await cdp.send('ServiceWorker.deliverPushMessage', {
    origin: ORIGIN,
    registrationId: registration?.registrationId ?? '',
    data,
  });
  await cdp.detach();
}

function notifications(page: Page) {
  return page.evaluate(async () =>
    (await (await navigator.serviceWorker.ready).getNotifications()).map((notification) => ({
      title: notification.title,
      body: notification.body,
      tag: notification.tag,
      data: notification.data as unknown,
    })),
  );
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['notifications', 'clipboard-read', 'clipboard-write'], {
    origin: ORIGIN,
  });
});

test('set up: permission, own key pair, encrypted storage, steps for GitHub', async ({
  page,
  context,
}) => {
  await mockPush(context);
  await openSettings(page);
  await expect(status(page)).toHaveText('Aus');
  await expect(section(page).getByTestId('push-reminders')).toContainText('täglich gegen 21:30');
  await section(page).getByTestId('push-setup').click();
  await expect(status(page)).toHaveText('Eingerichtet');
  await expect(section(page).getByTestId('push-service')).toHaveText('web.push.apple.com');
  await expect(section(page).getByTestId('push-secret-name')).toHaveText('PUSH_CONFIG');
  await expect(section(page).getByTestId('push-open-secret')).toHaveAttribute(
    'href',
    'https://github.com/JanneBromann30092026/Cockpit/settings/secrets/actions/new',
  );
  await expect(section(page).getByTestId('push-open-workflow')).toHaveAttribute(
    'href',
    'https://github.com/JanneBromann30092026/Cockpit/actions/workflows/push.yml',
  );
  // The key is not shown, only copied.
  await expect(section(page).getByTestId('push-key')).toHaveCount(0);

  const key = await copiedKey(page);
  expect(key.v).toBe(1);
  expect(key.subscription.endpoint).toBe(ENDPOINT);
  expect(key.privateKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
  // The subscription was created with Cockpit's own public key.
  const serverKey = await page.evaluate(() => sessionStorage.getItem('e2e-push-server-key'));
  expect(Buffer.from(serverKey ?? '', 'base64').toString('base64url')).toBe(key.publicKey);

  // Stored encrypted only.
  const dump = await storageDump(page);
  expect(dump.indexedDb).not.toContain(key.privateKey);
  expect(dump.indexedDb).not.toContain('QFake-e2e-subscription');
  expect(dump.localStorage).not.toContain(key.privateKey);

  // Survives a reload (and the lock).
  await reloadAndUnlock(page);
  await expect(status(page)).toHaveText('Eingerichtet');
  expect((await copiedKey(page)).privateKey).toBe(key.privateKey);
});

test('a push shows a general notification; a tap opens the matching page', async ({
  page,
  context,
}) => {
  await mockPush(context);
  await openSettings(page);
  await section(page).getByTestId('push-setup').click();
  await expect(status(page)).toHaveText('Eingerichtet');
  await expect(section(page).getByTestId('push-last')).toHaveText('Noch keine');

  await deliverPush(page, JSON.stringify({ v: 1, reminder: 'dayReview' }));
  await expect
    .poll(() => notifications(page))
    .toEqual([
      {
        title: 'Zeit für deinen Tages-Review',
        body: 'Was lief gut, was nicht – und was machst du morgen besser?',
        tag: 'dayReview',
        data: { path: '/reviews/day/today' },
      },
    ]);
  // The settings show when the last one arrived.
  await page.goto('./#/today');
  await expect(page.getByRole('heading', { level: 1, name: 'Heute' })).toBeVisible();
  await page.goto('./#/settings');
  await expect(section(page).getByTestId('push-last')).toContainText('Tages-Review');

  // Tap (the service worker's own click handler): the open app switches to the review.
  const worker = context.serviceWorkers().find((sw) => sw.url().includes('/Cockpit/sw.js'));
  expect(worker).toBeDefined();
  await worker?.evaluate(async () => {
    // Service worker scope, typed by hand (the e2e project has no WebWorker types).
    const scope = self as unknown as {
      registration: ServiceWorkerRegistration;
      dispatchEvent: (event: Event) => boolean;
      NotificationEvent: new (type: string, init: { notification: Notification }) => Event;
    };
    const [notification] = await scope.registration.getNotifications({ tag: 'dayReview' });
    if (!notification) throw new Error('no notification');
    try {
      scope.dispatchEvent(new scope.NotificationEvent('notificationclick', { notification }));
    } catch {
      // waitUntil rejects synthetic events; the handler has already run.
    }
  });
  await expect(page).toHaveURL(/#\/reviews\/day\/\d{4}-\d{2}-\d{2}$/);
  await expect.poll(() => notifications(page)).toEqual([]);
});

test('unknown push content still shows a general notification', async ({ page, context }) => {
  await mockPush(context);
  await openSettings(page);
  await deliverPush(page, 'irgendwas');
  await expect
    .poll(() => notifications(page))
    .toEqual([
      {
        title: 'Cockpit',
        body: 'Tippe, um Cockpit zu öffnen.',
        tag: 'cockpit',
        data: { path: '/today' },
      },
    ]);
});

test('a lost subscription asks to set up again; renewing creates new keys', async ({
  page,
  context,
}) => {
  await mockPush(context);
  await openSettings(page);
  await section(page).getByTestId('push-setup').click();
  await expect(status(page)).toHaveText('Eingerichtet');
  const first = await copiedKey(page);

  // iPadOS dropped the subscription (e.g. app removed and added again).
  await page.evaluate(() => sessionStorage.removeItem('e2e-push'));
  await reloadAndUnlock(page);
  await expect(status(page)).toHaveText('Neu einrichten');
  await expect(section(page).getByTestId('push-changed')).toBeVisible();
  await section(page).getByTestId('push-renew').click();
  await expect(status(page)).toHaveText('Eingerichtet');
  const second = await copiedKey(page);
  expect(second.publicKey).not.toBe(first.publicKey);
  expect(second.subscription.endpoint).toBe(`${ENDPOINT}-2`);

  // Renewing while everything is fine asks first.
  await section(page).getByTestId('push-renew').click();
  await expect(page.getByRole('alertdialog')).toContainText(
    'Secret PUSH_CONFIG bei GitHub ersetzen',
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click();
});

test('switching off removes subscription and keys', async ({ page, context }) => {
  await mockPush(context);
  await openSettings(page);
  await section(page).getByTestId('push-setup').click();
  await expect(status(page)).toHaveText('Eingerichtet');
  await section(page).getByTestId('push-disable').click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Ausschalten' }).click();
  await expect(status(page)).toHaveText('Aus');
  await expect(section(page).getByTestId('push-setup')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('e2e-push'))).toBeNull();
  const secrets = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open('cockpit');
      request.onsuccess = () => resolve(request.result);
    });
    const keys = await new Promise<IDBValidKey[]>((resolve) => {
      const request = db.transaction('secrets').objectStore('secrets').getAllKeys();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return keys;
  });
  expect(secrets).not.toContain('pushConfig');
});

test('denied permission explains where to allow it', async ({ page, context }) => {
  await mockPush(context, { permission: 'denied' });
  await openSettings(page);
  await section(page).getByTestId('push-setup').click();
  await expect(section(page).getByTestId('push-error')).toContainText('iPad-Einstellungen');
  await expect(status(page)).toHaveText('Nicht erlaubt');
  await expect(section(page).getByTestId('push-denied')).toBeVisible();
});

test('in a Safari tab push needs the home-screen app', async ({ page, context }) => {
  await mockPush(context, { missing: true });
  await openSettings(page);
  await expect(status(page)).toHaveText('Nur Homescreen-App');
  await expect(section(page).getByTestId('push-unsupported')).toContainText('Zum Home-Bildschirm');
  await expect(section(page).getByTestId('push-setup')).toHaveCount(0);
});
